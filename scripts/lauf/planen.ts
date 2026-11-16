import { pathToFileURL } from 'node:url'
import { toIso } from '../../src/lib/time'
import { DataDirError, resolveDataDir } from './dataDir'
import {
  deleteFile,
  readCategories,
  readDataRepo,
  readRepoFile,
  readSettings,
  writeJsonFile,
} from './dataRepo'
import { validatePlanFile, type PlanFile } from './files'
import { buildPlan, formatDay, type PlanInboxEntry } from './plan'
import { newId } from '../../src/data/ids'
import {
  isItem,
  isObj,
  isProject,
  normalizeItem,
  normalizeProject,
  type Category,
  type Item,
  type Settings,
} from '../../src/data/types'
import { isId, isTimestamp, validateInboxFields, validateSettingsFile } from './validate'

export interface PlanenResult {
  exitCode: number
  lines: string[]
}

export interface PlanenOptions {
  argv: readonly string[]
  env: Readonly<Record<string, string | undefined>>
  codeRoot?: string
}

const DECISIONS_PATH = '.lauf/entscheidungen.json'
const EVENTS_PATH = '.lauf/termine.json'
const PLAN_PATH = '.lauf/plan.json'
const START_PATH = '.lauf/start.json'
const TYPE_LABELS: Readonly<Record<string, string>> = {
  aufgabe: 'Aufgabe',
  notiz: 'Notiz',
  termin: 'Termin',
}

function nowFromArgs(argv: readonly string[]): Date | string {
  const index = argv.indexOf('--jetzt')
  if (index < 0) return new Date()
  const value = argv[index + 1]
  if (!isTimestamp(value)) {
    return '--jetzt erwartet einen Zeitstempel mit Offset, z. B. 2026-10-21T14:05:00+02:00.'
  }
  return new Date(value)
}

type Loaded = { ok: true; data: unknown } | { ok: false; message: string }

async function loadJson(dataDir: string, path: string): Promise<Loaded> {
  const file = await readRepoFile(dataDir, path)
  if (!file) return { ok: false, message: `${path} fehlt.` }
  if (file.parseError !== undefined) {
    return { ok: false, message: `${path} ist kein gültiges JSON: ${file.parseError}` }
  }
  return { ok: true, data: file.data }
}

/** IDs der von `lauf:start` ausgewählten Inbox-Einträge; `null`, wenn start.json sie nicht nennt. */
async function selectedInboxIds(dataDir: string): Promise<Set<string> | null> {
  const file = await readRepoFile(dataDir, START_PATH)
  const ids = isObj(file?.data) ? file.data.inboxIds : undefined
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) return null
  return new Set(ids)
}

function scheduleText(item: Item): string {
  if (!item.schedule) return 'ohne Termin'
  const start = item.schedule.start
  const end = toIso(new Date(Date.parse(start) + item.schedule.durationMin * 60_000))
  return `${formatDay(start.slice(0, 10))} ${start.slice(11, 16)}–${end.slice(11, 16)}`
}

function overview(plan: PlanFile, categories: readonly Category[]): string[] {
  const names = new Map(categories.map((c) => [c.id, c.name]))
  for (const entry of plan.entries) {
    if (entry.newCategory) names.set(entry.newCategory.id, entry.newCategory.name)
  }
  const lines: string[] = []
  for (const entry of plan.entries) {
    if (entry.result === 'sortError') {
      lines.push(`${entry.inboxId}  bleibt im Eingangskorb (sortError): ${entry.message ?? ''}`)
    }
    if (entry.newProject) {
      lines.push(`${entry.inboxId}  Neues Projekt „${entry.newProject.title}“`)
    }
    for (const item of entry.items) {
      const type = TYPE_LABELS[item.type] ?? item.type
      const where = names.get(item.categoryId) ?? item.categoryId
      lines.push(`${entry.inboxId}  ${type} „${item.title}“ → ${where} · ${scheduleText(item)}`)
    }
  }
  for (const d of plan.duplicates ?? []) {
    lines.push(`${d.inboxId}  Schon auf der Einkaufsliste: ${d.title}`)
  }
  for (const e of plan.errors) {
    lines.push(e.inboxId === null ? `Hinweis: ${e.message}` : `Hinweis ${e.inboxId}: ${e.message}`)
  }
  lines.push(`ANZULEGENDE TERMINE: ${plan.events.length}`)
  return lines
}

/** `lauf:planen`: Exit 0 = plan.json geschrieben, 1 = Fehler (altes plan.json gelöscht), 2 = Datenordner fehlt. */
export async function runPlanen(options: PlanenOptions): Promise<PlanenResult> {
  let dataDir: string
  try {
    dataDir = resolveDataDir(options)
  } catch (error) {
    if (error instanceof DataDirError) return { exitCode: error.exitCode, lines: [error.message] }
    throw error
  }
  await deleteFile(dataDir, PLAN_PATH)
  const failure = (lines: string[]): PlanenResult => ({ exitCode: 1, lines })

  const now = nowFromArgs(options.argv)
  if (typeof now === 'string') return failure([now])
  const decisions = await loadJson(dataDir, DECISIONS_PATH)
  const events = await loadJson(dataDir, EVENTS_PATH)
  if (!decisions.ok || !events.ok) {
    return failure([decisions, events].flatMap((l) => (l.ok ? [] : [l.message])))
  }

  const repo = await readDataRepo(dataDir)
  const inboxErrors: string[] = []
  const inbox: PlanInboxEntry[] = []
  for (const file of repo.inbox) {
    const problems = validateInboxFields(file.data)
    if (file.parseError !== undefined) inboxErrors.push(`${file.path}: Kein gültiges JSON.`)
    else if (problems.length > 0) inboxErrors.push(...problems.map((m) => `${file.path}: ${m}`))
    else if (isObj(file.data) && isId(file.data.id) && typeof file.data.createdAt === 'string') {
      inbox.push({
        id: file.data.id,
        createdAt: file.data.createdAt,
        sortError: file.data.sortError,
      })
    }
  }
  if (inboxErrors.length > 0) return failure(inboxErrors)
  const selected = await selectedInboxIds(dataDir)
  const notSelected = new Set(
    selected ? inbox.filter((e) => !selected.has(e.id)).map((e) => e.id) : [],
  )

  let categories: Category[]
  try {
    categories = (await readCategories(dataDir)).categories
  } catch (error) {
    return failure([error instanceof Error ? error.message : String(error)])
  }
  let settings: Settings
  try {
    settings = await readSettings(dataDir)
  } catch (error) {
    return failure([error instanceof Error ? error.message : String(error)])
  }
  const settingsProblems = validateSettingsFile(settings)
  if (settingsProblems.length > 0)
    return failure(settingsProblems.map((m) => `settings.json: ${m}`))

  const existingItemIds = repo.items.map(
    (f) =>
      f.path
        .split('/')
        .pop()
        ?.replace(/\.json$/, '') ?? '',
  )
  const result = buildPlan({
    now,
    inbox: inbox.filter((e) => !notSelected.has(e.id)),
    notSelected,
    decisions: decisions.data,
    events: events.data,
    categories,
    settings,
    existingItemIds,
    existingItems: repo.items.flatMap((f) => (isItem(f.data) ? [normalizeItem(f.data)] : [])),
    projects: repo.projects.flatMap((f) => (isProject(f.data) ? [normalizeProject(f.data)] : [])),
    newId,
  })
  if (!result.ok) return failure(result.errors)

  const problems = validatePlanFile(result.plan)
  if (problems.length > 0) return failure(problems.map((m) => `plan.json: ${m}`))
  await writeJsonFile(dataDir, PLAN_PATH, result.plan)
  return { exitCode: 0, lines: overview(result.plan, categories) }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  const result = await runPlanen({ argv: process.argv.slice(2), env: process.env })
  for (const line of result.lines) {
    if (result.exitCode === 0) console.log(line)
    else console.error(line)
  }
  process.exitCode = result.exitCode
}
