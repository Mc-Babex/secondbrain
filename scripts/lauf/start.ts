import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  isItem,
  isObj,
  normalizeItem,
  type Category,
  type Item,
  type Settings,
} from '../../src/data/types'
import { TIME_ZONE, toIso, zonedParts } from '../../src/lib/time'
import { effectivePause, zonedToDate } from '../../src/lib/planning'
import {
  abortRebase,
  dataDirOrResult,
  dirtyFiles,
  git,
  gitText,
  nowFromArgs,
  printResult,
  stagePaths,
  withoutGit,
  type GitRunner,
  type LaufOptions,
  type LaufResult,
} from './git'
import {
  dataFormatBlock,
  readCategories,
  readDataRepo,
  readSettings,
  writeJsonFile,
} from './dataRepo'
import { hasSortWork } from '../../src/lib/sortWork'
import { maxBlockMin, phaseEItems, type PhaseEItem } from './plan'
import { validateDataRepo, validateInboxFields, type RepoFile } from './validate'

export const EXIT_INVALID_LEFTOVERS = 3
export const LAUF_DIR = '.lauf'
const GITIGNORE_LINE = '.lauf/'
const LOOKAHEAD_DAYS = 14
/** Höchstzahl Inbox-Einträge pro Lauf (SPEC §8.1); der Rest bleibt unverändert für den nächsten Lauf. */
export const MAX_INBOX_PER_RUN = 29

const weekdayFormat = new Intl.DateTimeFormat('de-DE', { timeZone: TIME_ZONE, weekday: 'long' })
const pad = (n: number): string => String(n).padStart(2, '0')

export interface InboxContextEntry {
  id: string
  createdAt: string
  text: string
}

/** Inbox-Einträge ohne `sortError`, nach `createdAt` sortiert; ungültige Dateien werden gemeldet. */
export function openInbox(files: readonly RepoFile[]): {
  entries: InboxContextEntry[]
  ignored: string[]
} {
  const entries: InboxContextEntry[] = []
  const ignored: string[] = []
  for (const file of files) {
    const data = file.data
    if (file.parseError !== undefined || validateInboxFields(data).length > 0) {
      ignored.push(file.path)
    } else if (isObj(data) && data.sortError === undefined) {
      entries.push({
        id: String(data.id),
        createdAt: String(data.createdAt),
        text: String(data.text),
      })
    }
  }
  entries.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  return { entries, ignored }
}

/** `Mittwoch, 21.10.2026, 14:05 (2026-10-21T14:05:00+02:00)`. */
export function formatNow(now: Date): string {
  const p = zonedParts(now)
  const date = `${pad(p.day)}.${pad(p.month)}.${p.year}`
  return `${weekdayFormat.format(now)}, ${date}, ${pad(p.hour)}:${pad(p.minute)} (${toIso(now)})`
}

/** Abrufzeitraum: heute 00:00 bis heute + 14 Tage 23:59 (Ortszeit). */
export function eventRange(now: Date): { from: string; to: string } {
  const p = zonedParts(now)
  return {
    from: toIso(zonedToDate(p.year, p.month, p.day, 0, 0)),
    to: toIso(zonedToDate(p.year, p.month, p.day + LOOKAHEAD_DAYS, 23, 59)),
  }
}

export interface ContextInput {
  now: Date
  settings: Settings
  categories: readonly Category[]
  inbox: readonly InboxContextEntry[]
  /** Anzahl offener Einträge, die diesen Lauf nicht mehr bekommen. */
  remaining?: number
  /** Vorhandene wichtige Aufgaben ohne Termin (SPEC §8.4 e). */
  toSchedule?: readonly PhaseEItem[]
  ignored?: readonly string[]
}

function pauseLine(settings: Settings): string {
  const pause = effectivePause(settings)
  return pause ? `Pause: ${pause.start}–${pause.end}` : 'Pause: keine'
}

/** Kontext für Claude (stdout), SPEC §8.2. */
export function buildContext({
  now,
  settings,
  categories,
  inbox,
  remaining = 0,
  toSchedule = [],
  ignored = [],
}: ContextInput): string[] {
  const range = eventRange(now)
  const lines = [
    `ARBEIT ${inbox.length}`,
    `Jetzt: ${formatNow(now)}`,
    `Planungsfenster: ${settings.planningWindow.start}–${settings.planningWindow.end}`,
    pauseLine(settings),
    'Ablagen (id | Name | Art | Beschreibung):',
  ]
  for (const c of [...categories].sort((a, b) => a.order - b.order)) {
    lines.push(`- ${c.id} | ${c.name} | ${c.kind} | ${c.description}`)
  }
  lines.push(`Termine abrufen von ${range.from} bis ${range.to}`)
  lines.push(inbox.length === 0 ? 'Eingangskorb: leer' : 'Eingangskorb:')
  for (const entry of inbox) {
    lines.push(`--- ${entry.id} | ${entry.createdAt}`, entry.text)
  }
  if (remaining > 0) {
    const noun = remaining === 1 ? 'weiterer Eintrag bleibt' : 'weitere Einträge bleiben'
    lines.push(`Hinweis: ${remaining} ${noun} für den nächsten Lauf.`)
  }
  if (toSchedule.length > 0) {
    lines.push('Einzuplanende Aufgaben (id | Titel | Dauer; keine Entscheidung nötig):')
    for (const { item, durationMin } of toSchedule) {
      lines.push(`- ${item.id} | ${item.title} | ${durationMin} Min.`)
    }
  }
  for (const path of ignored) lines.push(`Hinweis: ${path} ist ungültig und wird ignoriert.`)
  return lines
}

type GitStepResult = LaufResult | null

const gitFailure = (what: string, output: string): LaufResult => ({
  exitCode: 1,
  lines: [`${what} fehlgeschlagen:`, output],
})

async function pushIfAhead(run: GitRunner, dir: string): Promise<GitStepResult> {
  const ahead = await run(dir, ['rev-list', '--count', '@{u}..HEAD'])
  if (ahead.code !== 0) return gitFailure('Prüfung auf ungepushte Commits', gitText(ahead))
  if (Number(ahead.stdout.trim()) === 0) return null
  const push = await run(dir, ['push'])
  return push.code === 0 ? null : gitFailure('git push', gitText(push))
}

async function commitAll(
  run: GitRunner,
  dir: string,
  paths: readonly string[],
  message: string,
): Promise<GitStepResult> {
  const add = await stagePaths(run, dir, paths)
  if (add.code !== 0) return gitFailure('git add', gitText(add))
  const commit = await run(dir, ['commit', '-m', message])
  return commit.code === 0 ? null : gitFailure('git commit', gitText(commit))
}

/** Schritte 1–3: Reste committen, pull, ggf. pushen, `.gitignore`. */
async function prepareGit(run: GitRunner, dir: string): Promise<GitStepResult> {
  const dirty = await dirtyFiles(run, dir)
  if (!Array.isArray(dirty)) return gitFailure('git status', gitText(dirty))
  if (dirty.length > 0) {
    const errors = validateDataRepo(await readDataRepo(dir))
    if (errors.length > 0) {
      return {
        exitCode: EXIT_INVALID_LEFTOVERS,
        lines: [
          'Ungesicherte, ungültige Änderungen im Datenordner (Reste eines abgebrochenen Laufs). Nichts wurde angefasst:',
          ...errors.map((e) => `${e.path}: ${e.message}`),
        ],
      }
    }
    const committed = await commitAll(run, dir, dirty, 'Lauf: Reste eines abgebrochenen Laufs')
    if (committed) return committed
  }

  const upstream = await run(dir, ['rev-parse', '--abbrev-ref', '@{u}'])
  if (upstream.code !== 0) {
    return {
      exitCode: 1,
      lines: [
        'Der Daten-Branch hat kein Remote-Gegenstück (upstream). Einmalig im Datenordner einrichten, z. B. `git push -u origin main`.',
      ],
    }
  }
  const pull = await run(dir, ['pull', '--rebase'])
  if (pull.code !== 0) {
    await abortRebase(run, dir)
    return gitFailure('git pull --rebase', gitText(pull))
  }
  const pushed = await pushIfAhead(run, dir)
  if (pushed) return pushed

  const ignorePath = join(dir, '.gitignore')
  const current = await readFile(ignorePath, 'utf-8').catch(() => '')
  if (!current.split(/\r?\n/).some((line) => line.trim() === GITIGNORE_LINE)) {
    const separator = current === '' || current.endsWith('\n') ? '' : '\n'
    await writeFile(ignorePath, `${current}${separator}${GITIGNORE_LINE}\n`, 'utf-8')
    const committed = await commitAll(run, dir, ['.gitignore'], 'Lauf: .lauf/ ignorieren')
    if (committed) return committed
    const push = await run(dir, ['push'])
    if (push.code !== 0) return gitFailure('git push', gitText(push))
  }
  return null
}

/** `lauf:start`: Exit 0 = `LEER` oder Kontext, 1 = Git-/Lesefehler, 2 = Datenordner fehlt, 3 = ungültige Reste. */
export async function runStart(options: LaufOptions): Promise<LaufResult> {
  const dir = dataDirOrResult(options)
  if (typeof dir !== 'string') return dir
  const now = nowFromArgs(options.argv)
  if (typeof now === 'string') return { exitCode: 1, lines: [now] }

  const blockedBefore = await dataFormatBlock(dir)
  if (blockedBefore) return blockedBefore

  if (!withoutGit(options.argv)) {
    const failed = await prepareGit(options.runGit ?? git, dir)
    if (failed) return failed
    // `git pull` kann ein neueres Format gebracht haben; vor dem Schreiben von `.lauf/` erneut prüfen.
    const blockedAfter = await dataFormatBlock(dir)
    if (blockedAfter) return blockedAfter
  }

  await rm(join(dir, LAUF_DIR), { recursive: true, force: true })
  await mkdir(join(dir, LAUF_DIR), { recursive: true })

  const repo = await readDataRepo(dir)
  const { entries: openEntries, ignored } = openInbox(repo.inbox)
  const entries = openEntries.slice(0, MAX_INBOX_PER_RUN)
  await writeJsonFile(dir, `${LAUF_DIR}/start.json`, {
    startedAt: toIso(now),
    inboxIds: entries.map((e) => e.id),
  })
  const items: Item[] = repo.items.flatMap((f) => (isItem(f.data) ? [normalizeItem(f.data)] : []))
  if (!hasSortWork(openEntries, items)) return { exitCode: 0, lines: ['LEER'] }

  try {
    const categories = (await readCategories(dir)).categories
    const settings = await readSettings(dir)
    return {
      exitCode: 0,
      lines: buildContext({
        now,
        settings,
        categories,
        inbox: entries,
        remaining: openEntries.length - entries.length,
        toSchedule: phaseEItems(items, maxBlockMin(settings.planningWindow)),
        ignored,
      }),
    }
  } catch (error) {
    return { exitCode: 1, lines: [error instanceof Error ? error.message : String(error)] }
  }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  printResult(await runStart({ argv: process.argv.slice(2), env: process.env }))
}
