// GitHub Action im Daten-Repo (SPEC §8.1): Arbeit und Sperre prüfen, Sperre schreiben, Routine genau einmal starten.
// Läuft im Daten-Repo aus dem Code-Checkout `.secondbrain-code/` (Node >= 22.18 führt die Datei direkt aus):
// nur `node:`-Importe und die Formatprüfung `src/lib/dataFormat.ts` (relativer Pfad, nur erasable TypeScript).
import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_FORMAT_PATH, dataFormatProblem } from '../../src/lib/dataFormat.ts'

export type TriggerResult =
  'gestartet' | 'nichts' | 'laeuft' | 'abgelehnt' | 'unklar' | 'fehler' | 'nicht-eingerichtet'
type StartedStatus = 'gestartet' | 'unklar' | 'abgelehnt'

export const REQUEST_ID_PATTERN = /^\d{8}-\d{6}-[a-z0-9]{4}$/
const LOCK_MS = 20 * 60 * 1000
const FETCH_TIMEOUT_MS = 30_000
const MAX_PUSH_ATTEMPTS = 3
const BOT_NAME = 'github-actions[bot]'
const BOT_EMAIL = '41898283+github-actions[bot]@users.noreply.github.com'

type JsonObject = Record<string, unknown>
const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** ISO 8601 in Europe/Berlin mit Offset (die VM läuft in UTC). */
export function berlinTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  }).formatToParts(date)
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? ''
  const offset = get('timeZoneName').replace('GMT', '')
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}${offset === '' ? '+00:00' : offset}`
}

async function readJsonFiles(dir: string): Promise<unknown[]> {
  let names: string[]
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith('.json'))
  } catch {
    return []
  }
  const result: unknown[] = []
  for (const name of names) {
    try {
      result.push(JSON.parse(await readFile(join(dir, name), 'utf-8')) as unknown)
    } catch {
      // unlesbare Dateien zählen nicht
    }
  }
  return result
}

/** SPEC §6.3/§8.2 (Phase 9): nur Inbox-Einträge ohne `sortError` sind Arbeit. */
export async function hasWork(dir: string): Promise<boolean> {
  const inbox = await readJsonFiles(join(dir, 'inbox'))
  return inbox.some((entry) => isObject(entry) && !('sortError' in entry))
}

function timeOf(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

/** SPEC 3.10: aktiv ⇔ gestartet/unklar, < 20 Min. alt und kein neueres `finishedAt`. Ungültig ⇒ keine Sperre. */
export function lockActive(started: unknown, lastRun: unknown, now: Date): boolean {
  if (!isObject(started)) return false
  if (started.status !== 'gestartet' && started.status !== 'unklar') return false
  const startedAt = timeOf(started.startedAt)
  if (startedAt === null) return false
  if (now.getTime() >= startedAt + LOCK_MS) return false
  const finishedAt = isObject(lastRun) ? timeOf(lastRun.finishedAt) : null
  return finishedAt === null || finishedAt <= startedAt
}

export type GitRunner = (args: string[], cwd: string) => Promise<string>

export const defaultGit: GitRunner = (args, cwd) =>
  new Promise((resolvePromise, reject) => {
    execFile('git', args, { cwd, windowsHide: true }, (error, stdout) => {
      // Keine Git-Ausgabe in die Fehlermeldung übernehmen (könnte URLs enthalten).
      if (error) reject(new Error(`git ${args[0] ?? ''} fehlgeschlagen`))
      else resolvePromise(stdout.trim())
    })
  })

export interface RunOptions {
  dir: string
  requestId: string | undefined
  fireUrl: string | undefined
  fireToken: string | undefined
  fetch?: typeof fetch
  now?: () => Date
  git?: GitRunner
  log?: (message: string) => void
}

export interface RunOutcome {
  result: TriggerResult | 'ungueltig'
  exitCode: number
}

interface TriggerFile {
  requestId: string
  at: string
  result: TriggerResult
  message: string
  retryAfter?: string
}

const json = (data: unknown): string => `${JSON.stringify(data, null, 2)}\n`

async function readOptionalJson(path: string, log: (m: string) => void): Promise<unknown> {
  let text: string
  try {
    text = await readFile(path, 'utf-8')
  } catch {
    return undefined
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    log(`Hinweis: ${path} ist kein gültiges JSON und wird ignoriert.`)
    return undefined
  }
}

/** Inhalt von `secondbrain.json`: `undefined` = Datei fehlt, `null` = nicht lesbar (ungültig). */
async function readFormatFile(dir: string): Promise<unknown> {
  let text: string
  try {
    text = await readFile(join(dir, DATA_FORMAT_PATH), 'utf-8')
  } catch {
    return undefined
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/** Commit + Push auf `main`; bei Ablehnung `pull --rebase` und erneut (höchstens 3 Versuche). */
async function commitAndPush(
  git: GitRunner,
  dir: string,
  paths: string[],
  message: string,
): Promise<boolean> {
  try {
    await git(['add', '--', ...paths], dir)
    await git(
      ['-c', `user.name=${BOT_NAME}`, '-c', `user.email=${BOT_EMAIL}`, 'commit', '-m', message],
      dir,
    )
  } catch {
    return false
  }
  for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt++) {
    try {
      await git(['push', 'origin', 'HEAD:main'], dir)
      return true
    } catch {
      if (attempt === MAX_PUSH_ATTEMPTS) break
      try {
        await git(['pull', '--rebase', 'origin', 'main'], dir)
      } catch {
        await git(['rebase', '--abort'], dir).catch(() => undefined)
      }
    }
  }
  return false
}

/** Verwirft den lokalen Sperren-Commit; true nur, wenn HEAD danach wieder `origin/main` entspricht. */
async function dropFailedCommit(git: GitRunner, dir: string): Promise<boolean> {
  await git(['fetch', 'origin', 'main'], dir).catch(() => undefined)
  await git(['reset', '--hard', 'origin/main'], dir).catch(() => undefined)
  try {
    return (
      (await git(['rev-parse', 'HEAD'], dir)) === (await git(['rev-parse', 'origin/main'], dir))
    )
  } catch {
    return false
  }
}

interface Rejection {
  message: string
  retryAfterSeconds: number | null
}

async function describeRejection(response: Response): Promise<Rejection> {
  let message = `HTTP ${response.status}`
  try {
    const body = (await response.json()) as unknown
    const type = isObject(body) && isObject(body.error) ? body.error.type : undefined
    if (typeof type === 'string' && /^[a-z_]{1,64}$/.test(type)) message += ` (${type})`
  } catch {
    // Antwort nicht lesbar: nur der Status
  }
  const header = response.headers.get('retry-after')
  const seconds = response.status === 429 && header !== null && /^\d+$/.test(header.trim())
  return { message, retryAfterSeconds: seconds ? Number(header?.trim()) : null }
}

export async function run(options: RunOptions): Promise<RunOutcome> {
  const { dir } = options
  const git = options.git ?? defaultGit
  const now = options.now ?? (() => new Date())
  const doFetch = options.fetch ?? fetch
  const log = options.log ?? ((message: string) => console.log(message))

  const requestId = options.requestId ?? ''
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    log('Fehler: REQUEST_ID fehlt oder hat ein ungültiges Format.')
    return { result: 'ungueltig', exitCode: 1 }
  }

  const startedPath = join(dir, 'runs', 'started.json')
  const triggerPath = join(dir, 'runs', 'trigger.json')

  let startedWritten = false
  const finish = async (
    result: TriggerResult,
    message: string,
    extra: { retryAfter?: string; startedStatus?: StartedStatus; startedAt?: string } = {},
  ): Promise<RunOutcome> => {
    const paths = ['runs/trigger.json']
    const trigger: TriggerFile = { requestId, at: berlinTimestamp(now()), result, message }
    if (extra.retryAfter !== undefined) trigger.retryAfter = extra.retryAfter
    await mkdir(join(dir, 'runs'), { recursive: true })
    if (extra.startedStatus !== undefined && startedWritten) {
      const started = { requestId, startedAt: extra.startedAt, status: extra.startedStatus }
      await writeFile(startedPath, json(started), 'utf-8')
      paths.push('runs/started.json')
    }
    await writeFile(triggerPath, json(trigger), 'utf-8')
    const pushed = await commitAndPush(git, dir, paths, `Sortieren: ${result}`)
    log(`Ergebnis: ${result}${message === '' ? '' : ` (${message})`}`)
    if (!pushed) {
      log('Fehler: trigger.json konnte nicht gepusht werden.')
      return { result, exitCode: 1 }
    }
    return { result, exitCode: 0 }
  }

  const { fireUrl, fireToken } = options
  if (!fireUrl || !fireToken) {
    return finish('nicht-eingerichtet', 'Secrets fehlen')
  }

  const formatProblem = dataFormatProblem(await readFormatFile(dir))
  if (formatProblem !== null) return finish('fehler', formatProblem)

  if (!(await hasWork(dir))) return finish('nichts', '')

  const started = await readOptionalJson(startedPath, log)
  const lastRun = await readOptionalJson(join(dir, 'runs', 'last.json'), log)
  if (lockActive(started, lastRun, now())) {
    return finish('laeuft', 'Sortierung läuft bereits.')
  }

  const startedAt = berlinTimestamp(now())
  await mkdir(join(dir, 'runs'), { recursive: true })
  await writeFile(
    startedPath,
    json({ requestId, startedAt, status: 'gestartet' satisfies StartedStatus }),
    'utf-8',
  )
  const locked = await commitAndPush(git, dir, ['runs/started.json'], 'Sortieren: Lauf gestartet')
  if (!locked) {
    if (!(await dropFailedCommit(git, dir))) {
      log(
        'Fehler: Der lokale Stand konnte nicht bereinigt werden; trigger.json wird nicht geschrieben.',
      )
      return { result: 'fehler', exitCode: 1 }
    }
    return finish('fehler', 'Sperre konnte nicht geschrieben werden')
  }
  startedWritten = true

  let response: Response
  try {
    response = await doFetch(fireUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${fireToken}`,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    return finish('unklar', 'Netzfehler oder Zeitüberschreitung', {
      startedStatus: 'unklar',
      startedAt,
    })
  }

  if (response.ok) return finish('gestartet', '')

  const rejection = await describeRejection(response)
  const retryAfter =
    rejection.retryAfterSeconds === null
      ? undefined
      : berlinTimestamp(new Date(now().getTime() + rejection.retryAfterSeconds * 1000))
  return finish('abgelehnt', rejection.message, {
    startedStatus: 'abgelehnt',
    startedAt,
    ...(retryAfter === undefined ? {} : { retryAfter }),
  })
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(
      'Aufruf: node sortieren.ts im Daten-Repo. Umgebung: REQUEST_ID, ROUTINE_FIRE_URL, ROUTINE_FIRE_TOKEN.',
    )
    return
  }
  const outcome = await run({
    dir: process.cwd(),
    requestId: process.env.REQUEST_ID,
    fireUrl: process.env.ROUTINE_FIRE_URL,
    fireToken: process.env.ROUTINE_FIRE_TOKEN,
  })
  process.exitCode = outcome.exitCode
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('Fehler: unerwarteter Abbruch.')
    process.exitCode = 1
  })
}
