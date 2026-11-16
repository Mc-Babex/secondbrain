import { pathToFileURL } from 'node:url'
import { toIso } from '../../src/lib/time'
import { isObj } from '../../src/data/types'
import { buildApply, type LastRun } from './apply'
import { dataFormatBlock, deleteFile, readDataRepo, readRepoFile, writeJsonFile } from './dataRepo'
import { validateEventIdsFile, validatePlanFile, type EventIdsFile, type PlanFile } from './files'
import { dataDirOrResult, nowFromArgs, printResult, type LaufOptions, type LaufResult } from './git'
import { isTimestamp } from './validate'

const START_PATH = '.lauf/start.json'
const PLAN_PATH = '.lauf/plan.json'
const EVENT_IDS_PATH = '.lauf/termin-ids.json'

type Loaded<T> = { ok: true; value: T } | { ok: false; errors: string[] }

async function load<T>(
  dir: string,
  path: string,
  check: (data: unknown) => string[],
  ifMissing?: T,
): Promise<Loaded<T>> {
  const file = await readRepoFile(dir, path)
  if (!file) {
    if (ifMissing !== undefined) return { ok: true, value: ifMissing }
    return { ok: false, errors: [`${path} fehlt.`] }
  }
  if (file.parseError !== undefined) {
    return { ok: false, errors: [`${path} ist kein gültiges JSON: ${file.parseError}`] }
  }
  const problems = check(file.data)
  if (problems.length > 0) return { ok: false, errors: problems.map((m) => `${path}: ${m}`) }
  return { ok: true, value: file.data as T }
}

const checkStart = (data: unknown): string[] =>
  isObj(data) && isTimestamp(data.startedAt)
    ? []
    : ['Feld "startedAt" fehlt oder ist kein Zeitstempel mit Offset.']

function summary(lastRun: LastRun, written: number): string[] {
  const lines = [
    `ANGEWENDET: ${lastRun.processed} einsortiert, ${lastRun.skipped.length} übersprungen, ${lastRun.errors.length} Fehler, ${lastRun.projectIds?.length ?? 0} Projekte angelegt`,
  ]
  if (written === 0) lines.push('Nichts geschrieben.')
  for (const s of lastRun.skipped) lines.push(`Übersprungen ${s.inboxId}: ${s.message}`)
  for (const e of lastRun.errors)
    lines.push(`Fehler${e.inboxId ? ` ${e.inboxId}` : ''}: ${e.message}`)
  return lines
}

/** `lauf:anwenden`: Exit 0 = geschrieben, 1 = Fehler (nichts geschrieben), 2 = Datenordner fehlt. */
export async function runAnwenden(options: LaufOptions): Promise<LaufResult> {
  const dir = dataDirOrResult(options)
  if (typeof dir !== 'string') return dir
  const now = nowFromArgs(options.argv)
  if (typeof now === 'string') return { exitCode: 1, lines: [now] }
  const blocked = await dataFormatBlock(dir)
  if (blocked) return blocked

  const start = await load<{ startedAt: string }>(dir, START_PATH, checkStart)
  const plan = await load<PlanFile>(dir, PLAN_PATH, validatePlanFile)
  if (!start.ok || !plan.ok) {
    return {
      exitCode: 1,
      lines: [start, plan].flatMap((l) => (l.ok ? [] : l.errors)),
    }
  }
  const noEvents: EventIdsFile | undefined =
    plan.value.events.length === 0 ? { created: [], failed: [] } : undefined
  const eventIds = await load<EventIdsFile>(dir, EVENT_IDS_PATH, validateEventIdsFile, noEvents)
  if (!eventIds.ok) return { exitCode: 1, lines: eventIds.errors }

  const result = buildApply({
    now: toIso(now),
    startedAt: start.value.startedAt,
    plan: plan.value,
    eventIds: eventIds.value,
    repo: await readDataRepo(dir),
  })
  if (!result.ok) {
    return {
      exitCode: 1,
      lines: ['Nichts geschrieben – Prüfung fehlgeschlagen:', ...result.errors],
    }
  }
  for (const write of result.writes) await writeJsonFile(dir, write.path, write.data)
  for (const path of result.deletes) await deleteFile(dir, path)
  return {
    exitCode: 0,
    lines: summary(result.lastRun, result.writes.length),
  }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  printResult(await runAnwenden({ argv: process.argv.slice(2), env: process.env }))
}
