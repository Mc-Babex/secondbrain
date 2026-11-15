import { pathToFileURL } from 'node:url'
import { dataFormatBlock, readRepoFile, writeJsonFile } from './dataRepo'
import {
  abortRebase,
  dataDirOrResult,
  dirtyFiles,
  git,
  gitText,
  printResult,
  stagePaths,
  withoutGit,
  type GitRunner,
  type LaufOptions,
  type LaufResult,
} from './git'
import { validateLastRunFile } from './validate'

const LAST_RUN_PATH = 'runs/last.json'
const MAX_PUSH_ATTEMPTS = 3
const MAX_REBASE_STEPS = 50

interface RunCounts {
  processed: number
  skipped: number
  errors: number
}

export function commitMessage(counts: RunCounts | null): string {
  if (!counts) return 'Lauf: Änderungen'
  const parts = [`${counts.processed} einsortiert`]
  if (counts.skipped > 0) parts.push(`${counts.skipped} übersprungen`)
  if (counts.errors > 0) parts.push(`${counts.errors} Fehler`)
  return `Lauf: ${parts.join(', ')}`
}

async function readCounts(dir: string): Promise<RunCounts | null> {
  const file = await readRepoFile(dir, LAST_RUN_PATH)
  if (!file || file.parseError !== undefined || validateLastRunFile(file.data).length > 0) {
    return null
  }
  const run = file.data as { processed: number; skipped: unknown[]; errors: unknown[] }
  return { processed: run.processed, skipped: run.skipped.length, errors: run.errors.length }
}

async function unmergedPaths(run: GitRunner, dir: string): Promise<string[]> {
  const result = await run(dir, ['diff', '--name-only', '--diff-filter=U', '-z'])
  return result.code === 0 ? result.stdout.split('\0').filter((p) => p !== '') : []
}

/** Im Rebase ist „ours“ der Upstream: dessen Fassung gewinnt; vom Upstream gelöscht ⇒ löschen. */
async function keepUpstream(run: GitRunner, dir: string, path: string): Promise<void> {
  const stages = await run(dir, ['ls-files', '-u', '-z', '--', path])
  const upstreamHasFile = /\s2\t/.test(stages.stdout)
  if (upstreamHasFile) {
    await run(dir, ['checkout', '--ours', '--', path])
    await run(dir, ['add', '--', path])
  } else {
    await run(dir, ['rm', '-f', '--', path])
  }
}

interface PullOutcome {
  ok: boolean
  conflicts: string[]
  output: string
}

/** `git pull --rebase`; Dateikonflikte werden zugunsten des Repos (Upstream) aufgelöst. */
async function pullRebase(run: GitRunner, dir: string): Promise<PullOutcome> {
  let result = await run(dir, ['pull', '--rebase'])
  const conflicts: string[] = []
  for (let step = 0; result.code !== 0 && step < MAX_REBASE_STEPS; step++) {
    const paths = await unmergedPaths(run, dir)
    if (paths.length === 0) break
    for (const path of paths) {
      await keepUpstream(run, dir, path)
      if (!conflicts.includes(path)) conflicts.push(path)
    }
    const nothingStaged = (await run(dir, ['diff', '--cached', '--quiet'])).code === 0
    result = await run(dir, ['rebase', nothingStaged ? '--skip' : '--continue'])
  }
  if (result.code !== 0) await abortRebase(run, dir)
  return { ok: result.code === 0, conflicts, output: gitText(result) }
}

/** Vermerkt Konflikte in `runs/last.json` und schiebt sie als eigenen Commit nach. */
async function noteConflicts(run: GitRunner, dir: string, paths: string[]): Promise<string | null> {
  const file = await readRepoFile(dir, LAST_RUN_PATH)
  if (!file || file.parseError !== undefined || validateLastRunFile(file.data).length > 0) {
    return `Konflikte nicht in ${LAST_RUN_PATH} vermerkt (Datei fehlt oder ist ungültig): ${paths.join(', ')}`
  }
  const lastRun = file.data as { errors: unknown[] }
  const notes = paths.map((p) => ({
    inboxId: null,
    message: `Konflikt: ${p} – Fassung aus der App behalten`,
  }))
  await writeJsonFile(dir, LAST_RUN_PATH, { ...lastRun, errors: [...lastRun.errors, ...notes] })
  const add = await run(dir, ['add', '--', LAST_RUN_PATH])
  const commit = add.code === 0 ? await run(dir, ['commit', '-m', 'Lauf: Konflikte vermerkt']) : add
  return commit.code === 0 ? null : `Konflikte nicht vermerkt: ${gitText(commit)}`
}

/** `lauf:abschluss`: Exit 0 = gepusht oder nichts zu tun, 1 = Git-Fehler (Commit bleibt lokal). */
export async function runAbschluss(options: LaufOptions): Promise<LaufResult> {
  const dir = dataDirOrResult(options)
  if (typeof dir !== 'string') return dir
  const blocked = await dataFormatBlock(dir)
  if (blocked) return blocked
  if (withoutGit(options.argv)) return { exitCode: 0, lines: ['GIT ÜBERSPRUNGEN (--ohne-git)'] }
  const run = options.runGit ?? git

  const dirty = await dirtyFiles(run, dir)
  if (!Array.isArray(dirty))
    return { exitCode: 1, lines: ['git status fehlgeschlagen:', gitText(dirty)] }
  if (dirty.length === 0) return { exitCode: 0, lines: ['NICHTS ZU COMMITTEN'] }

  const add = await stagePaths(run, dir, dirty)
  if (add.code !== 0) return { exitCode: 1, lines: ['git add fehlgeschlagen:', gitText(add)] }
  const commit = await run(dir, ['commit', '-m', commitMessage(await readCounts(dir))])
  if (commit.code !== 0) {
    return { exitCode: 1, lines: ['git commit fehlgeschlagen:', gitText(commit)] }
  }

  const notes: string[] = []
  const noted = new Set<string>()
  let lastOutput = ''
  for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt++) {
    const push = await run(dir, ['push'])
    if (push.code === 0) {
      const head = await run(dir, ['rev-parse', '--short', 'HEAD'])
      return { exitCode: 0, lines: [...notes, `GEPUSHT ${head.stdout.trim()}`] }
    }
    lastOutput = gitText(push)
    if (attempt === MAX_PUSH_ATTEMPTS) break
    const pull = await pullRebase(run, dir)
    if (!pull.ok) lastOutput = pull.output
    const fresh = pull.conflicts.filter((p) => !noted.has(p))
    if (pull.ok && fresh.length > 0) {
      fresh.forEach((p) => noted.add(p))
      const problem = await noteConflicts(run, dir, fresh)
      if (problem) notes.push(problem)
      else notes.push(...fresh.map((p) => `Konflikt: ${p} – Fassung aus der App behalten`))
    }
  }
  return {
    exitCode: 1,
    lines: [
      ...notes,
      `Push nach ${MAX_PUSH_ATTEMPTS} Versuchen fehlgeschlagen. Der Commit bleibt lokal; der nächste lauf:start pusht ihn.`,
      lastOutput,
    ],
  }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  printResult(await runAbschluss({ argv: process.argv.slice(2), env: process.env }))
}
