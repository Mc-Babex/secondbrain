// Reine Logik von `lauf:anwenden`: aus plan.json + Termin-IDs den neuen Stand des Daten-Repos bauen.
import { defaultCategories } from '../../src/data/defaults'
import { isItem, isObj, normalizeItem, type Item } from '../../src/data/types'
import type { EventIdsFile, PlanEntry, PlanExisting, PlanFile } from './files'
import { isPhaseEItem } from '../../src/lib/sortWork'
import {
  validateDataRepo,
  validateLastRunFile,
  type DataRepoFiles,
  type RepoFile,
  type ValidationError,
} from './validate'

export interface LastRun {
  startedAt: string
  finishedAt: string
  processed: number
  itemIds: string[]
  skipped: { inboxId: string; message: string }[]
  errors: { inboxId: string | null; message: string }[]
}

export interface ApplyInput {
  /** Zeitpunkt (ISO mit Offset) für `finishedAt` und `sortError.at`. */
  now: string
  startedAt: string
  plan: PlanFile
  eventIds: EventIdsFile
  repo: DataRepoFiles
}

export interface FileWrite {
  path: string
  data: unknown
}

export type ApplyResult =
  | {
      ok: true
      writes: FileWrite[]
      deletes: string[]
      lastRun: LastRun
      scheduledExisting: number
    }
  | { ok: false; errors: string[] }

const CATEGORIES_PATH = 'categories.json'
const LAST_RUN_PATH = 'runs/last.json'
const inboxPath = (id: string): string => `inbox/${id}.json`
const itemPath = (id: string): string => `items/${id}.json`

type ErrorList = LastRun['errors']

/** Ablagen-Datei als Objekt; `undefined`, wenn vorhanden aber unbrauchbar. */
function baseCategories(file: RepoFile | null): Record<string, unknown> | undefined {
  if (!file) return { ...defaultCategories() }
  if (file.parseError !== undefined || !isObj(file.data) || !Array.isArray(file.data.categories)) {
    return undefined
  }
  return { ...file.data }
}

function categoryIds(base: Record<string, unknown>): Set<string> {
  const list = Array.isArray(base.categories) ? (base.categories as unknown[]) : []
  return new Set(list.flatMap((c) => (isObj(c) && typeof c.id === 'string' ? [c.id] : [])))
}

function withEventId(item: Item, eventId: string): Item {
  return item.schedule
    ? { ...item, schedule: { ...item.schedule, calendarEventId: eventId } }
    : item
}

interface Collected {
  writes: Map<string, unknown>
  deletes: string[]
  processed: number
  scheduledExisting: number
  existingProblems: number
  itemIds: string[]
  skipped: LastRun['skipped']
  eventErrors: ErrorList
  protectErrors: ErrorList
}

interface Context {
  input: ApplyInput
  out: Collected
  categories: Record<string, unknown> | undefined
  categoriesChanged: boolean
  inbox: Map<string, RepoFile>
  existingItems: Set<string>
  itemFiles: Map<string, RepoFile>
}

function createdEventsOf(entry: PlanEntry, ctx: Context): string[] {
  const ids = new Set(entry.items.map((i) => i.id))
  return ctx.input.eventIds.created.filter((c) => ids.has(c.itemId)).map((c) => c.eventId)
}

/** Schutz: Eintrag nicht mehr vorhanden oder Item schon da ⇒ auslassen. */
function protectionProblem(entry: PlanEntry, ctx: Context): string | null {
  const file = ctx.inbox.get(entry.inboxId)
  if (!file || file.parseError !== undefined || !isObj(file.data)) {
    return `Eintrag ${entry.inboxId} ist nicht mehr im Eingangskorb (in der App einsortiert oder gelöscht) und wurde ausgelassen.`
  }
  const clash = entry.items.find((i) => ctx.existingItems.has(i.id))
  if (clash)
    return `Eintrag ${entry.inboxId} wurde ausgelassen: items/${clash.id}.json gibt es schon.`
  if (entry.result === 'ok' && entry.newCategory && !ctx.categories) {
    return `Eintrag ${entry.inboxId} wurde ausgelassen: categories.json ist ungültig, die neue Ablage kann nicht angelegt werden.`
  }
  return null
}

function applyOk(entry: PlanEntry, ctx: Context): void {
  const { out, input } = ctx
  if (entry.newCategory && ctx.categories) {
    if (!categoryIds(ctx.categories).has(entry.newCategory.id)) {
      const list = Array.isArray(ctx.categories.categories) ? ctx.categories.categories : []
      ctx.categories = { ...ctx.categories, categories: [...list, entry.newCategory] }
      ctx.categoriesChanged = true
    }
  }
  for (const item of entry.items) {
    let written = item
    if (item.schedule) {
      const failed = input.eventIds.failed.find((f) => f.itemId === item.id)
      const created = input.eventIds.created.find((c) => c.itemId === item.id)
      if (failed || !created) {
        const reason = failed ? failed.message : 'Es wurde keine Termin-ID gemeldet.'
        out.eventErrors.push({
          inboxId: entry.inboxId,
          message: `Kalendertermin für „${item.title}“ konnte nicht angelegt werden: ${reason}`,
        })
        written = { ...item, schedule: null }
      } else {
        written = withEventId(item, created.eventId)
      }
    }
    out.writes.set(itemPath(item.id), written)
    out.itemIds.push(item.id)
  }
  out.deletes.push(inboxPath(entry.inboxId))
  out.processed++
}

/** Vorhandene Aufgabe (8.4 e): nur `schedule` + `updatedAt` ergänzen; geänderte Aufgaben bleiben unangetastet. */
function applyExisting(plan: PlanExisting, ctx: Context): void {
  const { out, input } = ctx
  const created = input.eventIds.created.find((c) => c.itemId === plan.itemId)
  const failed = input.eventIds.failed.find((f) => f.itemId === plan.itemId)
  const orphan = created
    ? ` Der angelegte Kalendertermin (ID ${created.eventId}) ist verwaist.`
    : ''
  const fail = (message: string): void => {
    out.protectErrors.push({ inboxId: null, message })
    out.existingProblems++
  }

  const file = ctx.itemFiles.get(plan.itemId)
  const data = file?.data
  if (!file || file.parseError !== undefined || !isObj(data) || !isItem(data)) {
    return fail(`Aufgabe „${plan.title}“ gibt es nicht mehr und wurde nicht eingeplant.${orphan}`)
  }
  if (!isPhaseEItem(normalizeItem(data))) {
    return fail(
      `Aufgabe „${plan.title}“ wurde inzwischen geändert (erledigt, eingeplant oder nicht mehr wichtig) und blieb unverändert.${orphan}`,
    )
  }
  if (failed || !created) {
    const reason = failed ? failed.message : 'Es wurde keine Termin-ID gemeldet.'
    return fail(`Kalendertermin für „${plan.title}“ konnte nicht angelegt werden: ${reason}`)
  }
  out.writes.set(itemPath(plan.itemId), {
    ...data,
    schedule: {
      start: plan.start,
      durationMin: plan.durationMin,
      calendarEventId: created.eventId,
    },
    updatedAt: input.now,
  })
  out.itemIds.push(plan.itemId)
  out.scheduledExisting++
}

function applySortError(entry: PlanEntry, ctx: Context): void {
  const file = ctx.inbox.get(entry.inboxId)
  const message = entry.message ?? 'Unbekannter Fehler.'
  const data = isObj(file?.data) ? file.data : {}
  ctx.out.writes.set(inboxPath(entry.inboxId), {
    ...data,
    sortError: { message, at: ctx.input.now },
  })
  ctx.out.skipped.push({ inboxId: entry.inboxId, message })
}

function toRepoFile(path: string, data: unknown): RepoFile {
  return { path, data }
}

/** Gesamtstand nach dem Lauf (im Speicher) für die Prüfung. */
function projected(
  repo: DataRepoFiles,
  writes: ReadonlyMap<string, unknown>,
  deletes: readonly string[],
): DataRepoFiles {
  const fold = (files: RepoFile[], folder: string): RepoFile[] => {
    const byPath = new Map(files.map((f) => [f.path, f]))
    for (const path of deletes) byPath.delete(path)
    for (const [path, data] of writes) {
      if (path.startsWith(`${folder}/`)) byPath.set(path, toRepoFile(path, data))
    }
    return [...byPath.values()]
  }
  const single = (path: string, current: RepoFile | null): RepoFile | null =>
    writes.has(path) ? toRepoFile(path, writes.get(path)) : current
  return {
    inbox: fold(repo.inbox, 'inbox'),
    items: fold(repo.items, 'items'),
    suggestions: repo.suggestions,
    categories: single(CATEGORIES_PATH, repo.categories),
    settings: repo.settings,
    lastRun: single(LAST_RUN_PATH, repo.lastRun),
  }
}

const format = (e: ValidationError): string => `${e.path}: ${e.message}`

/** Baut Schreib- und Löschliste samt Protokoll; prüft den Gesamtstand streng (SPEC §8.2 Schritt 6). */
export function buildApply(input: ApplyInput): ApplyResult {
  const out: Collected = {
    writes: new Map(),
    deletes: [],
    processed: 0,
    scheduledExisting: 0,
    existingProblems: 0,
    itemIds: [],
    skipped: [],
    eventErrors: [],
    protectErrors: [],
  }
  const ctx: Context = {
    input,
    out,
    categories: baseCategories(input.repo.categories),
    categoriesChanged: false,
    inbox: new Map(
      input.repo.inbox.map((f) => [f.path.slice('inbox/'.length, -'.json'.length), f]),
    ),
    existingItems: new Set(
      input.repo.items.map((f) => f.path.slice('items/'.length, -'.json'.length)),
    ),
    itemFiles: new Map(
      input.repo.items.map((f) => [f.path.slice('items/'.length, -'.json'.length), f]),
    ),
  }

  for (const entry of input.plan.entries) {
    const problem = protectionProblem(entry, ctx)
    if (problem) {
      const events = createdEventsOf(entry, ctx)
      const hint =
        events.length > 0 ? ` Bereits angelegte Kalendertermine (IDs): ${events.join(', ')}.` : ''
      out.protectErrors.push({ inboxId: entry.inboxId, message: `${problem}${hint}` })
    } else if (entry.result === 'ok') applyOk(entry, ctx)
    else applySortError(entry, ctx)
  }
  for (const existing of input.plan.existing ?? []) applyExisting(existing, ctx)
  if (ctx.categoriesChanged) out.writes.set(CATEGORIES_PATH, ctx.categories)

  const existingNotes =
    out.existingProblems + input.plan.errors.filter((e) => e.inboxId === null).length
  const writesRun = out.processed + out.skipped.length + out.scheduledExisting + existingNotes > 0
  const writtenPaths = new Set([...out.writes.keys(), ...(writesRun ? [LAST_RUN_PATH] : [])])
  const after = validateDataRepo(projected(input.repo, out.writes, out.deletes))
  const own = after.filter((e) => writtenPaths.has(e.path) && e.path !== LAST_RUN_PATH)
  if (own.length > 0) return { ok: false, errors: own.map(format) }
  const existing: ErrorList = after
    .filter((e) => !writtenPaths.has(e.path))
    .map((e) => ({ inboxId: null, message: `Vorhandener Fehler: ${format(e)}` }))

  const lastRun: LastRun = {
    startedAt: input.startedAt,
    finishedAt: input.now,
    processed: out.processed,
    itemIds: out.itemIds,
    skipped: out.skipped,
    errors: [...input.plan.errors, ...out.eventErrors, ...out.protectErrors, ...existing],
  }
  const problems = validateLastRunFile(lastRun)
  if (problems.length > 0)
    return { ok: false, errors: problems.map((m) => `${LAST_RUN_PATH}: ${m}`) }

  const writes = [...out.writes].map(([path, data]) => ({ path, data }))
  if (writesRun) writes.push({ path: LAST_RUN_PATH, data: lastRun })
  return {
    ok: true,
    writes,
    deletes: out.deletes,
    lastRun,
    scheduledExisting: out.scheduledExisting,
  }
}
