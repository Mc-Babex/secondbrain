import { categoryIdFromName } from '../lib/categoryId'
import { berlinDate, projectSteps } from '../lib/gtd'
import {
  addDays,
  instanceDate,
  instanceSkips,
  nextSkipDate,
  pausedOccurrences,
  recomputeOpenInstances,
  withSkippedDate,
  withoutSkippedDate,
  type RecomputePlan,
} from '../lib/series'
import { findSameArticle } from '../lib/shopping'
import { appointmentEnd, hasEnded, selectPastAppointments } from '../lib/pastAppointments'
import { nowIso, toIso } from '../lib/time'
import { markSeeded, touchSeeded } from './categoriesOrigin'
import { forgetDeletedCategory, rememberDeletedCategory } from './categoryTombstones'
import { defaultCategories, defaultSettings } from './defaults'
import { newId } from './ids'
import {
  commitLocal,
  deleteFileLocal,
  getFile,
  listFiles,
  putFileLocal,
  updateFileLocal,
  type LocalWrite,
} from './localStore'
import {
  isCategory,
  isDateString,
  isInboxEntry,
  isItem,
  isObj,
  isProject,
  isSuggestion,
  normalizeInboxEntry,
  normalizeItem,
  normalizeProject,
  isStepSeries,
  normalizeSuggestion,
  parseLastRun,
  type Category,
  type GtdStatus,
  type InboxEntry,
  type InboxSource,
  type Item,
  type ItemType,
  type LastRun,
  type Project,
  type Schedule,
  type Settings,
  type StepSeries,
  type Suggestion,
  type Waiting,
} from './types'

/** Formatmarke für Dateien, die eine App ab Phase 9 geschrieben hat (SPEC §3.3). */
const FORMAT_V = 2

// --- Änderungs-Ereignis ----------------------------------------------------

const listeners = new Set<() => void>()

/** Abonniert das `"change"`-Ereignis; liefert die Abmelde-Funktion. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Löst `"change"` aus (auch vom Sync nach Remote-Änderungen aufzurufen). */
export function notifyChange(): void {
  for (const listener of [...listeners]) listener()
}

// --- Ungültige Dateien -----------------------------------------------------

const invalidPaths = new Set<string>()

function markInvalid(path: string): void {
  if (!invalidPaths.has(path)) {
    invalidPaths.add(path)
    console.warn(`Ungültige Datei im lokalen Speicher: ${path}`)
  }
}

/** Pfade lokal vorhandener Dateien, die nicht dem Datenformat entsprechen (für die UI-Anzeige). */
export function listInvalidPaths(): string[] {
  return [...invalidPaths].sort()
}

// --- Pfade und Lesen -------------------------------------------------------

const CATEGORIES_PATH = 'categories.json'
const SETTINGS_PATH = 'settings.json'
const LAST_RUN_PATH = 'runs/last.json'
const inboxPath = (id: string): string => `inbox/${id}.json`
const itemPath = (id: string): string => `items/${id}.json`
const suggestionPath = (id: string): string => `suggestions/${id}.json`
const projectPath = (id: string): string => `projects/${id}.json`

async function listValid<T>(prefix: string, guard: (v: unknown) => v is T): Promise<T[]> {
  const files = await listFiles(prefix)
  for (const path of [...invalidPaths]) if (path.startsWith(prefix)) invalidPaths.delete(path)
  const valid: T[] = []
  for (const file of files) {
    if (guard(file.data)) valid.push(file.data)
    else markInvalid(file.path)
  }
  return valid
}

/** Neue Item-Felder, deren ungültiger Rohwert beim Schreiben erhalten bleibt (`v` setzt jede Schreibaktion). */
const GTD_RAW_KEYS = [
  'gtd',
  'dueDate',
  'waiting',
  'projectId',
  'projectOrder',
  'seriesId',
  'seriesNumber',
  'archivedWithProject',
] as const

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * Die normalisierte Sicht behandelt ungültige Werte neuer Felder als „fehlt“. Beim Schreiben bleibt
 * der Rohwert eines solchen Feldes trotzdem erhalten, solange die Aktion das Feld nicht ändert und es
 * nicht in `explicit` (ausdrücklich gesetzte Felder) steht. Gilt auch für ein nur abgeleitetes Feld
 * (Migration): ein vorhandener ungültiger Rohwert wird nicht überschrieben.
 */
function keepInvalidRaw(
  raw: unknown,
  before: Item,
  after: Item,
  explicit: readonly string[] = [],
): Item {
  if (!isObj(raw)) return after
  const kept: Record<string, unknown> = {}
  for (const key of GTD_RAW_KEYS) {
    const rawValue = raw[key]
    if (rawValue === undefined || explicit.includes(key)) continue
    if (sameValue(rawValue, before[key]) || !sameValue(before[key], after[key])) continue
    kept[key] = rawValue
  }
  return { ...after, ...kept }
}

/** Wie `keepInvalidRaw`, liest den Rohwert aber aus dem lokalen Speicher (für Sammelschreibungen). */
async function withRaw(before: Item, after: Item, explicit?: readonly string[]): Promise<Item> {
  return keepInvalidRaw((await getFile(itemPath(before.id)))?.data, before, after, explicit)
}

const byId = <T extends { id: string }>(a: T, b: T): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0

export async function listInbox(): Promise<InboxEntry[]> {
  return (await listValid('inbox/', isInboxEntry)).map(normalizeInboxEntry).sort(byId)
}

export async function listItems(): Promise<Item[]> {
  return (await listValid('items/', isItem)).map(normalizeItem).sort(byId)
}

export async function listProjects(): Promise<Project[]> {
  return (await listValid('projects/', isProject)).map(normalizeProject).sort(byId)
}

export async function listSuggestions(): Promise<Suggestion[]> {
  return (await listValid('suggestions/', isSuggestion)).map(normalizeSuggestion).sort(byId)
}

async function readInbox(id: string): Promise<InboxEntry> {
  const data = (await getFile(inboxPath(id)))?.data
  if (!isInboxEntry(data)) throw new Error(`Eingangskorb-Eintrag ${id} nicht gefunden`)
  return normalizeInboxEntry(data)
}

async function readSuggestion(id: string): Promise<Suggestion> {
  const data = (await getFile(suggestionPath(id)))?.data
  if (!isSuggestion(data)) throw new Error(`Vorschlag ${id} nicht gefunden`)
  return normalizeSuggestion(data)
}

function parseProject(current: unknown, id: string): Project {
  if (!isProject(current)) throw new Error(`Projekt ${id} nicht gefunden`)
  return normalizeProject(current)
}

function parseItem(current: unknown, id: string): Item {
  if (!isItem(current)) throw new Error(`Eintrag ${id} nicht gefunden`)
  return normalizeItem(current)
}

// --- Ablagen und Einstellungen ---------------------------------------------

export async function getCategories(): Promise<Category[]> {
  const data = (await getFile(CATEGORIES_PATH))?.data
  if (data === undefined) return defaultCategories().categories
  if (!isObj(data) || !Array.isArray(data.categories)) {
    markInvalid(CATEGORIES_PATH)
    throw new Error('categories.json ist ungültig')
  }
  const valid = data.categories.filter(isCategory)
  if (valid.length !== data.categories.length) markInvalid(CATEGORIES_PATH)
  else invalidPaths.delete(CATEGORIES_PATH)
  if (valid.length === 0) throw new Error('categories.json enthält keine gültige Ablage')
  return valid
}

export async function saveCategories(list: Category[]): Promise<void> {
  await updateFileLocal(CATEGORIES_PATH, (current) => ({
    ...(isObj(current) ? current : {}),
    categories: list,
  }))
  notifyChange()
}

type RawObj = Record<string, unknown>

/** Fehlt lokal noch jede `categories.json`, entsteht sie aus Standardwerten – das wird lokal vermerkt. */
async function noteSeedOrigin(): Promise<void> {
  if ((await getFile(CATEGORIES_PATH)) === undefined) await markSeeded()
}

/** Rohe Ablagen-Datei (mit unbekannten Feldern); fehlt sie lokal, gelten die Standard-Ablagen. */
function readCategoriesFile(current: unknown): { file: RawObj; list: unknown[] } {
  const file: RawObj =
    current === undefined ? { ...defaultCategories() } : isObj(current) ? current : {}
  if (!Array.isArray(file.categories)) throw new Error('categories.json ist ungültig')
  return { file, list: file.categories }
}

function cleanCategoryName(name: string, list: readonly unknown[], ownId?: string): string {
  const trimmed = name.trim()
  if (trimmed === '') throw new Error('Der Name darf nicht leer sein.')
  const key = trimmed.toLowerCase()
  const taken = list.some(
    (c) => isCategory(c) && c.id !== ownId && c.name.trim().toLowerCase() === key,
  )
  if (taken) throw new Error('Eine Ablage mit diesem Namen gibt es schon.')
  return trimmed
}

export async function createCategory(name: string, description: string): Promise<Category> {
  let created: Category | undefined
  await noteSeedOrigin()
  await updateFileLocal(CATEGORIES_PATH, (current) => {
    const { file, list } = readCategoriesFile(current)
    const valid = list.filter(isCategory)
    const ids = list.flatMap((c) => (isObj(c) && typeof c.id === 'string' ? [c.id] : []))
    created = {
      id: categoryIdFromName(cleanCategoryName(name, list), ids),
      name: cleanCategoryName(name, list),
      kind: 'normal',
      order: valid.reduce((max, c) => Math.max(max, c.order), 0) + 1,
      description,
    }
    return { ...file, categories: [...list, created] }
  })
  if (!created) throw new Error('Ablage konnte nicht angelegt werden.')
  await touchSeeded(created.id)
  await forgetDeletedCategory(created.id)
  notifyChange()
  return created
}

export async function updateCategory(
  id: string,
  fields: { name: string; description: string },
): Promise<Category> {
  let updated: Category | undefined
  await noteSeedOrigin()
  await updateFileLocal(CATEGORIES_PATH, (current) => {
    const { file, list } = readCategoriesFile(current)
    const index = list.findIndex((c) => isCategory(c) && c.id === id)
    const old = list[index]
    if (!isCategory(old)) throw new Error('Ablage nicht gefunden.')
    updated = {
      ...old,
      name: cleanCategoryName(fields.name, list, id),
      description: fields.description,
    }
    return { ...file, categories: list.map((c, i) => (i === index ? updated : c)) }
  })
  if (!updated) throw new Error('Ablage nicht gefunden.')
  await touchSeeded(id)
  notifyChange()
  return updated
}

/** Anzahl der Einträge, die beim Löschen der Ablage verschoben würden. */
export async function deletePreview(id: string): Promise<number> {
  return (await listItems()).filter((i) => i.categoryId === id || i.originalCategoryId === id)
    .length
}

/** Löscht eine normale Ablage; ihre Einträge wandern atomar in die normale Ablage `targetId`. */
export async function deleteCategory(id: string, targetId: string): Promise<void> {
  const categories = await getCategories()
  const category = categories.find((c) => c.id === id)
  if (!category) throw new Error('Ablage nicht gefunden.')
  if (category.kind !== 'normal') {
    throw new Error('Die Einkaufsliste und das Archiv lassen sich nicht löschen.')
  }
  const target = categories.find((c) => c.id === targetId)
  if (targetId === id || target?.kind !== 'normal') {
    throw new Error('Bitte eine andere normale Ablage als Ziel wählen.')
  }
  await noteSeedOrigin()
  const { file, list } = readCategoriesFile((await getFile(CATEGORIES_PATH))?.data)
  const now = nowIso()
  const writes: LocalWrite[] = []
  for (const item of await listItems()) {
    if (item.categoryId !== id && item.originalCategoryId !== id) continue
    const moved: Item = {
      ...item,
      categoryId: item.categoryId === id ? targetId : item.categoryId,
      originalCategoryId: item.originalCategoryId === id ? targetId : item.originalCategoryId,
      updatedAt: now,
    }
    writes.push({
      path: itemPath(item.id),
      op: 'put',
      data: { ...(await withRaw(item, moved)), v: FORMAT_V },
    })
  }
  for (const project of await listProjects()) {
    if (project.categoryId !== id) continue
    writes.push({
      path: projectPath(project.id),
      op: 'put',
      data: { ...project, categoryId: targetId, updatedAt: now, v: FORMAT_V },
    })
  }
  writes.push({
    path: CATEGORIES_PATH,
    op: 'put',
    data: { ...file, categories: list.filter((c) => !(isObj(c) && c.id === id)) },
  })
  // Die Einträge werden vor dem Commit gelesen (commitLocal kennt keine Lese-Transaktion); ein
  // dazwischen geänderter Eintrag der Ablage bliebe als Rest bestehen. Der Tombstone steht vor
  // dem Commit, damit ein Sync dazwischen die Ablage nicht wiederbelebt; scheitert der Commit,
  // wird er zurückgenommen.
  await rememberDeletedCategory(id)
  try {
    await commitLocal(writes)
  } catch (error) {
    await forgetDeletedCategory(id)
    throw error
  }
  notifyChange()
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback
}

export async function getSettings(): Promise<Settings> {
  const data = (await getFile(SETTINGS_PATH))?.data
  const defaults = defaultSettings()
  if (data === undefined) return defaults
  if (!isObj(data)) {
    markInvalid(SETTINGS_PATH)
    throw new Error('settings.json ist ungültig')
  }
  const window = isObj(data.planningWindow) ? data.planningWindow : {}
  return {
    ...data,
    planningWindow: {
      ...window,
      start: str(window.start, defaults.planningWindow.start),
      end: str(window.end, defaults.planningWindow.end),
    },
    timezone: str(data.timezone, defaults.timezone),
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await updateFileLocal(SETTINGS_PATH, (current) => {
    const base = isObj(current) ? current : {}
    const window = isObj(base.planningWindow) ? base.planningWindow : {}
    return {
      ...base,
      ...settings,
      planningWindow: { ...window, ...settings.planningWindow },
    }
  })
  notifyChange()
}

/**
 * Setzt nur `autoSort`; alle übrigen (auch unbekannte) Felder einer vorhandenen settings.json bleiben
 * erhalten. Fehlt die Datei, entsteht eine gültige mit den Standardwerten.
 */
export async function saveAutoSort(autoSort: boolean): Promise<void> {
  await updateFileLocal(SETTINGS_PATH, (current) => ({
    ...defaultSettings(),
    ...(isObj(current) ? current : {}),
    autoSort,
  }))
  notifyChange()
}

// --- Protokoll des letzten Laufs ---------------------------------------------

/** `runs/last.json`; fehlt die Datei oder ist sie ungültig, gibt es (für die App) keinen Lauf. */
export async function getLastRun(): Promise<LastRun | null> {
  return parseLastRun((await getFile(LAST_RUN_PATH))?.data)
}

// --- Eingangskorb ----------------------------------------------------------

export async function addInboxEntry(text: string, source: InboxSource): Promise<InboxEntry> {
  const trimmed = text.trim()
  if (trimmed === '') throw new Error('Der Text darf nicht leer sein')
  const entry: InboxEntry = { id: newId(), text: trimmed, createdAt: nowIso(), source }
  await putFileLocal(inboxPath(entry.id), entry)
  notifyChange()
  return entry
}

export async function deleteInboxEntry(id: string): Promise<void> {
  await deleteFileLocal(inboxPath(id))
  notifyChange()
}

// --- Einträge --------------------------------------------------------------

export type NewItem = Pick<Item, 'type' | 'title' | 'categoryId'> &
  Partial<Omit<Item, 'type' | 'title' | 'categoryId'>>

function buildItem(partial: NewItem): Item {
  const now = nowIso()
  return {
    id: newId(),
    notes: '',
    status: 'offen',
    important: false,
    durationMin: null,
    schedule: null,
    originalCategoryId: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    ...(partial.type === 'aufgabe' ? { gtd: 'naechster-schritt' as const } : {}),
    ...partial,
    v: FORMAT_V,
  }
}

export async function createItem(partial: NewItem): Promise<Item> {
  const item = buildItem(partial)
  await putFileLocal(itemPath(item.id), item)
  notifyChange()
  return item
}

async function modifyItem(
  id: string,
  change: (item: Item) => Item,
  explicit?: readonly string[],
): Promise<Item> {
  const data = await updateFileLocal(itemPath(id), (current) => {
    const before = parseItem(current, id)
    return { ...keepInvalidRaw(current, before, change(before), explicit), v: FORMAT_V }
  })
  notifyChange()
  return data as Item
}

/** Felder mit dem Wert `undefined` im Patch werden aus dem Eintrag entfernt. */
export function updateItem(id: string, patch: Partial<Omit<Item, 'id'>>): Promise<Item> {
  return modifyItem(
    id,
    (current) => {
      const next: Item = { ...current, ...patch, id, updatedAt: nowIso() }
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete (next as unknown as Record<string, unknown>)[key]
      }
      return next
    },
    Object.keys(patch),
  )
}

export async function deleteItem(id: string): Promise<void> {
  await deleteFileLocal(itemPath(id))
  notifyChange()
}

/** Reihenfolge für einen neu zugeordneten Schritt: hinter allen vorhandenen Schritten des Projekts. */
function nextProjectOrder(projectId: string, items: readonly Item[]): number {
  return (
    projectSteps(projectId, items).reduce((max, s) => Math.max(max, s.projectOrder ?? 0), 0) + 1
  )
}

/** GTD-Felder, die „In Ablage“ gleich mit anlegen kann (`projectOrder` wird hinten angehängt). */
export type FileInboxGtd = Partial<
  Pick<Item, 'gtd' | 'important' | 'dueDate' | 'durationMin' | 'waiting' | 'projectId'>
>

/** Legt einen Eingangskorb-Eintrag als Eintrag ab: Item schreiben und Eintrag löschen in einem Commit. */
export async function fileInboxEntry(
  id: string,
  fields: {
    type: ItemType
    title: string
    categoryId: string
    notes?: string
  } & FileInboxGtd,
): Promise<Item> {
  const entry = await readInbox(id)
  const { projectId, ...rest } = fields
  const projectFields =
    typeof projectId === 'string'
      ? {
          projectId,
          projectOrder: nextProjectOrder(projectId, await listItems()),
        }
      : {}
  const item = buildItem({
    ...rest,
    ...projectFields,
    notes: fields.notes ?? '',
    id,
    createdAt: entry.createdAt,
    updatedAt: nowIso(),
  })
  await commitLocal([
    { path: itemPath(id), op: 'put', data: item },
    { path: inboxPath(id), op: 'delete' },
  ])
  notifyChange()
  return item
}

/**
 * Legt eine Aufgabe mit Termin an (`schedule` inkl. `calendarEventId`), optional als Schritt eines Projekts
 * (hinten angehängt). Lokal + Outbox, ohne Netz.
 */
export async function createScheduledTask(fields: {
  title: string
  notes: string
  categoryId: string
  schedule: Schedule
  projectId?: string | null
}): Promise<Item> {
  const { projectId, ...rest } = fields
  const projectFields =
    typeof projectId === 'string'
      ? { projectId, projectOrder: nextProjectOrder(projectId, await listItems()) }
      : {}
  return createItem({ ...rest, type: 'aufgabe', gtd: 'naechster-schritt', ...projectFields })
}

/**
 * Ordnet einen Eintrag einem Projekt zu (`projectOrder` hinten angehängt) oder löst ihn (`null`:
 * `projectId` = `null`, `projectOrder` entfällt). Dasselbe Projekt lässt die Reihenfolge unverändert.
 */
export async function assignItemToProject(id: string, projectId: string | null): Promise<Item> {
  const items = projectId === null ? [] : await listItems()
  return modifyItem(
    id,
    (current) => {
      if (projectId === null) {
        const detached: Item = { ...current, projectId: null, updatedAt: nowIso() }
        delete detached.projectOrder
        return detached
      }
      if (current.projectId === projectId) return current
      return {
        ...current,
        projectId,
        projectOrder: nextProjectOrder(projectId, items),
        updatedAt: nowIso(),
      }
    },
    ['projectId', 'projectOrder'],
  )
}

/** Wie ✓ Erledigt: Eintrag ins Archiv, ursprüngliche Ablage merken. */
function archivedItem(current: Item, archiveId: string | undefined, now: string): Item {
  return {
    ...current,
    status: 'erledigt',
    completedAt: now,
    originalCategoryId:
      archiveId !== undefined && current.categoryId === archiveId
        ? current.originalCategoryId
        : current.categoryId,
    categoryId: archiveId ?? 'erledigt',
    updatedAt: now,
  }
}

export async function completeItem(
  id: string,
  options: { clearSchedule?: boolean } = {},
): Promise<Item> {
  const archive = (await getCategories()).find((c) => c.kind === 'archiv')
  return modifyItem(id, (current) => ({
    ...archivedItem(current, archive?.id, nowIso()),
    ...(options.clearSchedule ? { schedule: null } : {}),
  }))
}

/** Steuerung: bricht `updateFileLocal` ab (nichts wird geschrieben), wenn der Eintrag inzwischen nicht mehr fällig ist. */
class NotDue extends Error {}

/**
 * Verschiebt vergangene offene Termine nach „Erledigt“ (SPEC §6.4): wie `completeItem`, aber
 * `completedAt` = Ende des Termins. Je Eintrag eine atomare lokale Änderung samt Outbox; der
 * Zustand wird in der Transaktion erneut geprüft. Kein Google-Aufruf. Liefert die Anzahl.
 */
export async function archivePastAppointments(now: Date = new Date()): Promise<number> {
  const due = selectPastAppointments(await listItems(), now)
  if (due.length === 0) return 0
  const archive = (await getCategories()).find((c) => c.kind === 'archiv')
  let moved = 0
  for (const { id } of due) {
    try {
      await updateFileLocal(itemPath(id), (raw) => {
        const current = parseItem(raw, id)
        const end = appointmentEnd(current)
        if (!end || !selectPastAppointments([current], now).length) throw new NotDue()
        const archived: Item = {
          ...current,
          status: 'erledigt',
          completedAt: toIso(end),
          originalCategoryId:
            archive && current.categoryId === archive.id
              ? current.originalCategoryId
              : current.categoryId,
          categoryId: archive?.id ?? 'erledigt',
          updatedAt: nowIso(),
        }
        return { ...keepInvalidRaw(raw, current, archived), v: FORMAT_V }
      })
      moved += 1
    } catch (error) {
      if (!(error instanceof NotDue)) throw error
    }
  }
  if (moved > 0) notifyChange()
  return moved
}

/** Gegenstück zu `archivedItem`: zurück in die ursprüngliche Ablage (sonst Privat), wieder offen. */
function restoredItem(current: Item, categories: readonly Category[], now: string): Item {
  // Ein vergangener Termin verliert sein `schedule` (bleibt in Google), sonst würde er sofort
  // wieder verschoben.
  const clearSchedule = hasEnded(current, new Date())
  const target =
    categories.find((c) => c.id === current.originalCategoryId && c.kind !== 'archiv') ??
    categories.find((c) => c.id === 'privat' && c.kind === 'normal') ??
    categories.find((c) => c.kind === 'normal')
  const restored: Item = {
    ...current,
    status: 'offen',
    completedAt: null,
    categoryId: target?.id ?? current.originalCategoryId ?? current.categoryId,
    originalCategoryId: null,
    ...(clearSchedule ? { schedule: null } : {}),
    updatedAt: now,
  }
  delete restored.archivedWithProject
  return restored
}

/**
 * Stellt einen Eintrag wieder her. Gehört er als Schritt zu einem abgeschlossenen Projekt, wird
 * auch das Projekt wieder aktiv (SPEC §6.4 Erledigt).
 */
export async function restoreItem(id: string): Promise<Item> {
  const categories = await getCategories()
  const stored = parseItem((await getFile(itemPath(id)))?.data, id)
  const project =
    typeof stored.projectId === 'string'
      ? (await listProjects()).find((p) => p.id === stored.projectId && p.status === 'erledigt')
      : undefined
  if (!project) {
    return modifyItem(id, (current) => restoredItem(current, categories, nowIso()), [
      'archivedWithProject',
    ])
  }
  const now = nowIso()
  const item: Item = {
    ...(await withRaw(stored, restoredItem(stored, categories, now), ['archivedWithProject'])),
    v: FORMAT_V,
  }
  await commitLocal([
    { path: itemPath(id), op: 'put', data: item },
    {
      path: projectPath(project.id),
      op: 'put',
      data: { ...project, status: 'aktiv', completedAt: null, updatedAt: now, v: FORMAT_V },
    },
  ])
  notifyChange()
  return item
}

// --- GTD-Status ------------------------------------------------------------

/**
 * Setzt den GTD-Status einer Aufgabe. „warten“ ohne Angabe: `since` = heute, `person` = "" (eine
 * vorhandene Angabe bleibt); jeder andere Status setzt `waiting` auf `null`.
 */
export function setGtdStatus(
  id: string,
  gtd: GtdStatus,
  waiting?: Partial<Waiting>,
): Promise<Item> {
  return modifyItem(
    id,
    (current) => {
      if (current.type !== 'aufgabe') throw new Error('Nur Aufgaben haben einen Status.')
      if (gtd !== 'warten') return { ...current, gtd, waiting: null, updatedAt: nowIso() }
      const base = current.gtd === 'warten' ? current.waiting : null
      return {
        ...current,
        gtd,
        waiting: {
          ...base,
          person: waiting?.person ?? base?.person ?? '',
          since: waiting?.since ?? base?.since ?? berlinDate(new Date()),
          followUpOn:
            waiting?.followUpOn !== undefined ? waiting.followUpOn : (base?.followUpOn ?? null),
        },
        updatedAt: nowIso(),
      }
    },
    ['gtd', 'waiting'],
  )
}

/** „Antwort erhalten“: erledigen (archivieren) oder zum nächsten Schritt machen. */
export function answerReceived(
  id: string,
  outcome: 'erledigt' | 'naechster-schritt',
): Promise<Item> {
  return outcome === 'erledigt' ? completeItem(id) : setGtdStatus(id, 'naechster-schritt')
}

/** „Aktivieren“ einer Irgendwann-Aufgabe. */
export function activateItem(id: string): Promise<Item> {
  return setGtdStatus(id, 'naechster-schritt')
}

// --- Projekte --------------------------------------------------------------

export interface NewProject {
  title: string
  categoryId: string
  notes?: string
}

export async function createProject(fields: NewProject): Promise<Project> {
  const title = fields.title.trim()
  if (title === '') throw new Error('Der Titel darf nicht leer sein.')
  const category = (await getCategories()).find((c) => c.id === fields.categoryId)
  if (category?.kind !== 'normal') throw new Error('Ein Projekt gehört in eine normale Ablage.')
  const now = nowIso()
  const project: Project = {
    id: newId(),
    title,
    notes: fields.notes ?? '',
    categoryId: category.id,
    status: 'aktiv',
    series: [],
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    v: FORMAT_V,
  }
  await putFileLocal(projectPath(project.id), project)
  notifyChange()
  return project
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<Project, 'title' | 'notes' | 'categoryId' | 'series'>>,
): Promise<Project> {
  if (patch.title !== undefined && patch.title.trim() === '') {
    throw new Error('Der Titel darf nicht leer sein.')
  }
  const project = parseProject((await getFile(projectPath(id)))?.data, id)
  const moves = patch.categoryId !== undefined && patch.categoryId !== project.categoryId
  if (moves) {
    const target = (await getCategories()).find((c) => c.id === patch.categoryId)
    if (target?.kind !== 'normal') throw new Error('Ein Projekt gehört in eine normale Ablage.')
  }
  const now = nowIso()
  const updated: Project = {
    ...project,
    ...patch,
    ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
    updatedAt: now,
    v: FORMAT_V,
  }
  if (!moves) {
    const data = await updateFileLocal(projectPath(id), (current) => ({
      ...parseProject(current, id),
      ...patch,
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      updatedAt: now,
      v: FORMAT_V,
    }))
    notifyChange()
    return data as Project
  }
  // Neue Ablage: offene Schritte wandern mit, bei erledigten folgt `originalCategoryId`.
  const writes: LocalWrite[] = []
  for (const step of projectSteps(id, await listItems())) {
    const moved: Item =
      step.status === 'offen'
        ? { ...step, categoryId: updated.categoryId, updatedAt: now }
        : step.originalCategoryId === project.categoryId
          ? { ...step, originalCategoryId: updated.categoryId, updatedAt: now }
          : step
    if (moved === step) continue
    writes.push({
      path: itemPath(step.id),
      op: 'put',
      data: { ...(await withRaw(step, moved)), v: FORMAT_V },
    })
  }
  await commitLocal([...writes, { path: projectPath(id), op: 'put', data: updated }])
  notifyChange()
  return updated
}

// --- Schritt-Serien (SPEC §3.12) -------------------------------------------

export type SeriesFields = Pick<
  StepSeries,
  | 'titlePattern'
  | 'every'
  | 'weekday'
  | 'startDate'
  | 'endDate'
  | 'count'
  | 'dueWeekday'
  | 'durationMin'
>

const isWeekday = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 7

const SERIES_ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** `s` + 6 zufällige Zeichen (a–z, 0–9), damit zwei Geräte nicht dieselbe ID vergeben. */
function newSeriesId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return `s${Array.from(bytes, (b) => SERIES_ID_CHARS[b % SERIES_ID_CHARS.length]).join('')}`
}

function checkSeriesFields(fields: Partial<SeriesFields>): void {
  if (fields.titlePattern !== undefined && fields.titlePattern.trim() === '') {
    throw new Error('Das Titelmuster darf nicht leer sein.')
  }
  if (fields.every !== undefined && (!Number.isInteger(fields.every) || fields.every < 1)) {
    throw new Error('Der Rhythmus muss mindestens jede Woche sein.')
  }
  if (fields.weekday !== undefined && !isWeekday(fields.weekday)) {
    throw new Error('Ungültiger Wochentag.')
  }
  if (fields.dueWeekday != null && !isWeekday(fields.dueWeekday)) {
    throw new Error('Ungültiger Fälligkeits-Wochentag.')
  }
  if (fields.startDate !== undefined && !isDateString(fields.startDate)) {
    throw new Error('Ungültiges Startdatum (erwartet JJJJ-MM-TT).')
  }
  if (fields.endDate != null && !isDateString(fields.endDate)) {
    throw new Error('Ungültiges Enddatum (erwartet JJJJ-MM-TT).')
  }
  if (fields.endDate != null && fields.count != null) {
    throw new Error('Ende entweder per Datum oder per Anzahl festlegen.')
  }
}

/** Ändert die Serien eines Projekts atomar anhand der aktuellen Projektdatei; unbekannte Serien bleiben unverändert. */
async function modifyProjectSeries(
  projectId: string,
  change: (series: Project['series']) => Project['series'],
): Promise<Project> {
  const data = await updateFileLocal(projectPath(projectId), (current) => {
    const project = parseProject(current, projectId)
    return { ...project, series: change(project.series), updatedAt: nowIso(), v: FORMAT_V }
  })
  notifyChange()
  return data as Project
}

function changeSeries(
  projectId: string,
  seriesId: string,
  change: (series: StepSeries) => StepSeries,
): Promise<Project> {
  return modifyProjectSeries(projectId, (list) => {
    if (!list.some((s) => isStepSeries(s) && s.id === seriesId)) {
      throw new Error(`Serie ${seriesId} nicht gefunden`)
    }
    return list.map((s) => (isStepSeries(s) && s.id === seriesId ? change(s) : s))
  })
}

/** Legt eine aktive Serie an (`lastNumber` 0, `lastDate` `null`); die Instanzen entstehen beim nächsten Sync. */
export async function addSeries(projectId: string, fields: SeriesFields): Promise<StepSeries> {
  checkSeriesFields(fields)
  const result: { added?: StepSeries } = {}
  await modifyProjectSeries(projectId, (list) => {
    const taken = new Set(list.map((s) => (isObj(s) ? s.id : undefined)))
    let id = newSeriesId()
    while (taken.has(id)) id = newSeriesId()
    const added: StepSeries = {
      ...fields,
      titlePattern: fields.titlePattern.trim(),
      id,
      state: 'aktiv',
      skippedDates: [],
      lastNumber: 0,
      lastDate: null,
    }
    result.added = added
    return [...list, added]
  })
  if (result.added === undefined) throw new Error('Serie konnte nicht angelegt werden.')
  return result.added
}

/** Wendet die Eingaben auf die Serie an; ein Ende per Datum ersetzt das per Anzahl und umgekehrt. */
function mergeSeries(series: StepSeries, patch: Partial<SeriesFields>): StepSeries {
  const merged = { ...series, ...patch }
  if (patch.endDate != null) merged.count = null
  if (patch.count != null) merged.endDate = null
  return {
    ...merged,
    titlePattern: merged.titlePattern.trim(),
    skippedDates: merged.skippedDates.filter((d) => d >= merged.startDate),
  }
}

/** Wirken Start, Wochentag, Rhythmus oder Fälligkeit auf bestehende Instanzen? (SPEC §3.12) */
function changesSchedule(before: StepSeries, after: StepSeries): boolean {
  return (
    before.startDate !== after.startDate ||
    before.weekday !== after.weekday ||
    before.every !== after.every ||
    before.dueWeekday !== after.dueWeekday
  )
}

/** Schreibvorgänge für eine Neuberechnung; Ablegen an einem Pfad geht vor dem Löschen desselben Pfads. */
async function recomputeWrites(plan: RecomputePlan): Promise<LocalWrite[]> {
  const writes = new Map<string, LocalWrite>()
  for (const item of plan.deleted) {
    writes.set(itemPath(item.id), { path: itemPath(item.id), op: 'delete' })
  }
  for (const { from, to } of plan.changes) {
    if (from.id !== to.id) writes.set(itemPath(from.id), { path: itemPath(from.id), op: 'delete' })
  }
  for (const { from, to } of plan.changes) {
    const data = { ...(await withRaw(from, to, ['dueDate'])), v: FORMAT_V }
    writes.set(itemPath(to.id), { path: itemPath(to.id), op: 'put', data })
  }
  return [...writes.values()]
}

function findSeries(project: Project, seriesId: string): StepSeries {
  const found = project.series.find((s): s is StepSeries => isStepSeries(s) && s.id === seriesId)
  if (found === undefined) throw new Error(`Serie ${seriesId} nicht gefunden`)
  return found
}

/** Übernimmt den Fortschritt (`lastNumber`/`lastDate`) aus der Neuberechnung (SPEC §3.12). */
function withPlanProgress(series: StepSeries, plan: RecomputePlan): StepSeries {
  return { ...series, lastNumber: plan.lastNumber, lastDate: plan.lastDate }
}

export interface SeriesUpdate {
  project: Project
  /** Gelöschte künftige Instanzen (ihre Google-Termine muss die aufrufende Schicht entfernen). */
  removed: Item[]
}

/**
 * Ändert Muster, Rhythmus, Start, Ende, Fälligkeit oder Dauer. Bei Start, Wochentag, Rhythmus oder
 * Fälligkeit werden zusätzlich die offenen Instanzen neu berechnet (SPEC §3.12) – Instanzen und
 * Projektdatei in einem lokalen Schritt.
 */
export async function updateSeriesRecomputing(
  projectId: string,
  seriesId: string,
  patch: Partial<SeriesFields>,
  today: string = berlinDate(new Date()),
): Promise<SeriesUpdate> {
  checkSeriesFields(patch)
  const project = parseProject((await getFile(projectPath(projectId)))?.data, projectId)
  const before = findSeries(project, seriesId)
  const merged = mergeSeries(before, patch)
  if (!changesSchedule(before, merged)) {
    const saved = await changeSeries(projectId, seriesId, (s) => mergeSeries(s, patch))
    return { project: saved, removed: [] }
  }
  const plan = recomputeOpenInstances(projectId, merged, await listItems(), today, {
    refreshDue: true,
  })
  const next = withPlanProgress(merged, plan)
  const updated: Project = {
    ...project,
    series: project.series.map((s) => (isStepSeries(s) && s.id === seriesId ? next : s)),
    updatedAt: nowIso(),
    v: FORMAT_V,
  }
  await commitLocal([
    ...(await recomputeWrites(plan)),
    { path: projectPath(projectId), op: 'put', data: updated },
  ])
  notifyChange()
  return { project: updated, removed: plan.deleted }
}

export function updateSeries(
  projectId: string,
  seriesId: string,
  patch: Partial<SeriesFields>,
  today?: string,
): Promise<Project> {
  checkSeriesFields(patch)
  return updateSeriesRecomputing(projectId, seriesId, patch, today).then((r) => r.project)
}

export interface SkipResult {
  item: Item
  /** Um so viele Wochen ist die Instanz nach hinten gerückt (`every`). */
  weeks: number
  removed: Item[]
}

/** Offene Serien-Instanz samt Projekt und laufender Serie; sonst verständlicher Fehler. */
async function loadOpenInstance(
  itemId: string,
): Promise<{ item: Item; date: string; project: Project; series: StepSeries }> {
  const item = parseItem((await getFile(itemPath(itemId)))?.data, itemId)
  const date = instanceDate(item.id)
  if (
    item.status !== 'offen' ||
    typeof item.projectId !== 'string' ||
    typeof item.seriesId !== 'string' ||
    date === null
  ) {
    throw new Error('Dieser Schritt gehört zu keiner laufenden Serie.')
  }
  const project = parseProject((await getFile(projectPath(item.projectId)))?.data, item.projectId)
  const series = findSeries(project, item.seriesId)
  if (series.state === 'beendet') throw new Error('Die Serie ist beendet.')
  return { item, date, project, series }
}

/**
 * „Fällt aus“ an einer offenen Serien-Instanz (SPEC §3.12): der nächste noch nicht ausgefallene Stichtag
 * kommt in `skippedDates`, `dueDate` rückt um `every` Wochen, folgende offene Instanzen rücken nach.
 */
export async function skipSeriesInstance(
  itemId: string,
  today: string = berlinDate(new Date()),
): Promise<SkipResult> {
  const { item, date, project, series } = await loadOpenInstance(itemId)
  const skipped: StepSeries = {
    ...series,
    skippedDates: withSkippedDate(series.skippedDates, nextSkipDate(series, date)),
  }
  const plan = recomputeOpenInstances(project.id, skipped, await listItems(), today, {
    refreshDue: false,
    exceptId: item.id,
  })
  const now = nowIso()
  const moved: Item = {
    ...item,
    ...(item.dueDate ? { dueDate: addDays(item.dueDate, 7 * series.every) } : {}),
    updatedAt: now,
  }
  const updated: Project = {
    ...project,
    series: project.series.map((s) =>
      isStepSeries(s) && s.id === series.id ? withPlanProgress(skipped, plan) : s,
    ),
    updatedAt: now,
    v: FORMAT_V,
  }
  await commitLocal([
    ...(await recomputeWrites(plan)),
    {
      path: itemPath(item.id),
      op: 'put',
      data: { ...(await withRaw(item, moved, ['dueDate'])), v: FORMAT_V },
    },
    { path: projectPath(project.id), op: 'put', data: updated },
  ])
  notifyChange()
  return { item: moved, weeks: series.every, removed: plan.deleted }
}

/**
 * Nimmt den letzten Ausfall einer offenen Serien-Instanz zurück (SPEC §3.12): er verlässt `skippedDates`,
 * `dueDate` rückt um `every` Wochen zurück (nur wenn gesetzt), folgende offene Instanzen rücken nach.
 */
export async function unskipSeriesInstance(
  itemId: string,
  today: string = berlinDate(new Date()),
): Promise<SkipResult> {
  const { item, project, series } = await loadOpenInstance(itemId)
  const last = instanceSkips(series, item.seriesNumber ?? 0).at(-1)
  if (last === undefined) throw new Error('Dieses Blatt hat keinen Ausfall.')
  const restored: StepSeries = {
    ...series,
    skippedDates: withoutSkippedDate(series.skippedDates, last),
  }
  const plan = recomputeOpenInstances(project.id, restored, await listItems(), today, {
    refreshDue: false,
    exceptId: item.id,
  })
  const now = nowIso()
  const moved: Item = {
    ...item,
    ...(item.dueDate ? { dueDate: addDays(item.dueDate, -7 * series.every) } : {}),
    updatedAt: now,
  }
  const updated: Project = {
    ...project,
    series: project.series.map((s) =>
      isStepSeries(s) && s.id === series.id ? withPlanProgress(restored, plan) : s,
    ),
    updatedAt: now,
    v: FORMAT_V,
  }
  await commitLocal([
    ...(await recomputeWrites(plan)),
    {
      path: itemPath(item.id),
      op: 'put',
      data: { ...(await withRaw(item, moved, ['dueDate'])), v: FORMAT_V },
    },
    { path: projectPath(project.id), op: 'put', data: updated },
  ])
  notifyChange()
  return { item: moved, weeks: series.every, removed: plan.deleted }
}

/** Trägt einen künftigen Stichtag (nach `lastDate`) als Ausfall ein. */
export function addSkippedDate(
  projectId: string,
  seriesId: string,
  date: string,
): Promise<Project> {
  return changeSeries(projectId, seriesId, (s) => {
    if (!isDateString(date) || (s.lastDate !== null && date <= s.lastDate)) {
      throw new Error('Nur künftige Stichtage können ausfallen.')
    }
    return { ...s, skippedDates: withSkippedDate(s.skippedDates, date) }
  })
}

/** Entfernt einen eingetragenen Ausfall, solange sein Stichtag nach `lastDate` liegt. */
export function removeSkippedDate(
  projectId: string,
  seriesId: string,
  date: string,
): Promise<Project> {
  return changeSeries(projectId, seriesId, (s) => {
    if (s.lastDate !== null && date <= s.lastDate) {
      throw new Error('Dieser Stichtag liegt nicht mehr in der Zukunft.')
    }
    return { ...s, skippedDates: withoutSkippedDate(s.skippedDates, date) }
  })
}

export function pauseSeries(projectId: string, seriesId: string): Promise<Project> {
  return changeSeries(projectId, seriesId, (s) =>
    s.state === 'aktiv' ? { ...s, state: 'pausiert' } : s,
  )
}

/**
 * Setzt eine pausierte Serie fort: die Stichtage von `lastDate` (exklusiv) bis gestern fallen als Ausfall
 * weg, `lastDate` rückt auf den letzten davon; `lastNumber` bleibt (SPEC §3.12).
 */
export function resumeSeries(
  projectId: string,
  seriesId: string,
  today: string = berlinDate(new Date()),
): Promise<Project> {
  const yesterday = addDays(today, -1)
  return changeSeries(projectId, seriesId, (s) => {
    if (s.state !== 'pausiert') return s
    const paused = pausedOccurrences(s, yesterday)
    return {
      ...s,
      state: 'aktiv',
      skippedDates: [...new Set([...s.skippedDates, ...paused])].sort(),
      lastDate: paused.length === 0 ? s.lastDate : paused[paused.length - 1],
    }
  })
}

export function endSeries(projectId: string, seriesId: string): Promise<Project> {
  return changeSeries(projectId, seriesId, (s) => ({ ...s, state: 'beendet' }))
}

/** Löscht das Serienobjekt; angelegte Instanzen bleiben unverändert (SPEC §3.12). */
export function deleteSeries(projectId: string, seriesId: string): Promise<Project> {
  return modifyProjectSeries(projectId, (list) => {
    if (!list.some((s) => isStepSeries(s) && s.id === seriesId)) {
      throw new Error(`Serie ${seriesId} nicht gefunden`)
    }
    return list.filter((s) => !(isStepSeries(s) && s.id === seriesId))
  })
}

/** Löscht ein Projekt, aber nur ohne Schritte (auch ohne erledigte); sonst erst abschließen. */
export async function deleteProject(id: string): Promise<void> {
  if ((await listItems()).some((i) => i.projectId === id)) {
    throw new Error('Das Projekt hat noch Schritte. Bitte zuerst abschließen.')
  }
  await deleteFileLocal(projectPath(id))
  notifyChange()
}

/** Schließt ein Projekt ab: offene Schritte werden archiviert (`archivedWithProject`), Serien beendet. */
export async function completeProject(id: string): Promise<Project> {
  const project = parseProject((await getFile(projectPath(id)))?.data, id)
  if (project.status === 'erledigt') return project
  const archive = (await getCategories()).find((c) => c.kind === 'archiv')
  const now = nowIso()
  const writes: LocalWrite[] = []
  for (const step of projectSteps(id, await listItems())) {
    if (step.status !== 'offen') continue
    const archived: Item = { ...archivedItem(step, archive?.id, now), archivedWithProject: true }
    writes.push({
      path: itemPath(step.id),
      op: 'put',
      data: { ...(await withRaw(step, archived, ['archivedWithProject'])), v: FORMAT_V },
    })
  }
  const done: Project = {
    ...project,
    status: 'erledigt',
    completedAt: now,
    series: project.series.map((s) => (isStepSeries(s) ? { ...s, state: 'beendet' as const } : s)),
    updatedAt: now,
    v: FORMAT_V,
  }
  await commitLocal([...writes, { path: projectPath(id), op: 'put', data: done }])
  notifyChange()
  return done
}

/** Stellt ein abgeschlossenes Projekt samt der mit ihm archivierten Schritte wieder her. */
export async function restoreProject(id: string): Promise<Project> {
  const project = parseProject((await getFile(projectPath(id)))?.data, id)
  if (project.status === 'aktiv') return project
  const categories = await getCategories()
  const now = nowIso()
  const writes: LocalWrite[] = []
  for (const step of projectSteps(id, await listItems())) {
    if (step.status !== 'erledigt' || step.archivedWithProject !== true) continue
    const restored = restoredItem(step, categories, now)
    writes.push({
      path: itemPath(step.id),
      op: 'put',
      data: { ...(await withRaw(step, restored, ['archivedWithProject'])), v: FORMAT_V },
    })
  }
  const active: Project = {
    ...project,
    status: 'aktiv',
    completedAt: null,
    updatedAt: now,
    v: FORMAT_V,
  }
  await commitLocal([...writes, { path: projectPath(id), op: 'put', data: active }])
  notifyChange()
  return active
}

/** Hängt einen Schritt hinten an (`projectOrder` = größtes + 1), Status „Nächster Schritt“. */
export async function addProjectStep(
  projectId: string,
  fields: { title: string; durationMin?: number | null; notes?: string },
): Promise<Item> {
  const title = fields.title.trim()
  if (title === '') throw new Error('Der Titel darf nicht leer sein.')
  const project = parseProject((await getFile(projectPath(projectId)))?.data, projectId)
  const steps = projectSteps(projectId, await listItems())
  const order = steps.reduce((max, s) => Math.max(max, s.projectOrder ?? 0), 0) + 1
  return createItem({
    type: 'aufgabe',
    title,
    notes: fields.notes ?? '',
    durationMin: fields.durationMin ?? null,
    categoryId: project.categoryId,
    gtd: 'naechster-schritt',
    projectId,
    projectOrder: order,
  })
}

/**
 * Verschiebt einen offenen Schritt um eine Stelle (↑/↓ unter den offenen Schritten). Meist werden
 * nur die `projectOrder`-Werte der beiden Nachbarn getauscht; sind die Werte aller Schritte (auch der
 * erledigten) nicht eindeutig, werden alle Schritte neu nummeriert – es werden nur tatsächlich
 * geänderte Dateien geschrieben.
 */
export async function moveProjectStep(id: string, direction: 'up' | 'down'): Promise<void> {
  const step = parseItem((await getFile(itemPath(id)))?.data, id)
  if (typeof step.projectId !== 'string') throw new Error('Der Eintrag gehört zu keinem Projekt.')
  const all = projectSteps(step.projectId, await listItems())
  const open = all.filter((s) => s.status === 'offen')
  const from = open.findIndex((s) => s.id === id)
  const to = direction === 'up' ? from - 1 : from + 1
  if (from < 0 || to < 0 || to >= open.length) return
  const [a, b] = [open[from], open[to]]
  const orders = new Map<string, number>()
  const unique = new Set(all.map((s) => s.projectOrder))
  if (
    a.projectOrder !== undefined &&
    b.projectOrder !== undefined &&
    !unique.has(undefined) &&
    unique.size === all.length
  ) {
    orders.set(a.id, b.projectOrder)
    orders.set(b.id, a.projectOrder)
  } else {
    // Erledigte Schritte behalten ihren Platz in der Reihenfolge, nur die offenen tauschen.
    const reorderedOpen = [...open]
    reorderedOpen[from] = b
    reorderedOpen[to] = a
    let next = 0
    const reordered = all.map((s) => (s.status === 'offen' ? reorderedOpen[next++] : s))
    reordered.forEach((s, index) => {
      if (s.projectOrder !== index + 1) orders.set(s.id, index + 1)
    })
  }
  const now = nowIso()
  const writes: LocalWrite[] = []
  for (const s of all) {
    const order = orders.get(s.id)
    if (order === undefined) continue
    const moved: Item = { ...s, projectOrder: order, updatedAt: now }
    writes.push({
      path: itemPath(s.id),
      op: 'put',
      data: { ...(await withRaw(s, moved, ['projectOrder'])), v: FORMAT_V },
    })
  }
  await commitLocal(writes)
  notifyChange()
}

// --- Einkaufsliste ---------------------------------------------------------

async function shoppingCategoryId(): Promise<string> {
  const shopping = (await getCategories()).find((c) => c.kind === 'einkauf')
  if (!shopping) throw new Error('Es gibt keine Einkaufsliste.')
  return shopping.id
}

/** Legt einen Artikel an; ein gleicher Artikel (SPEC §3.9) bleibt unverändert und wird zurückgegeben. */
export async function addShoppingItem(title: string): Promise<{ item: Item; created: boolean }> {
  const trimmed = title.trim()
  if (trimmed === '') throw new Error('Der Artikel darf nicht leer sein.')
  const categoryId = await shoppingCategoryId()
  const existing = findSameArticle(await listItems(), trimmed, categoryId)
  if (existing) return { item: existing, created: false }
  const item = await createItem({ type: 'notiz', title: trimmed, categoryId, checked: false })
  return { item, created: true }
}

export function setChecked(id: string, checked: boolean): Promise<Item> {
  return updateItem(id, { checked })
}

/** Löscht alle abgehakten Artikel der Einkaufsliste atomar; liefert die Anzahl. */
export async function removeCheckedShoppingItems(): Promise<number> {
  const categoryId = await shoppingCategoryId()
  const checked = (await listItems()).filter(
    (i) => i.categoryId === categoryId && i.checked === true,
  )
  if (checked.length === 0) return 0
  await commitLocal(checked.map((i) => ({ path: itemPath(i.id), op: 'delete' as const })))
  notifyChange()
  return checked.length
}

// --- Vorschläge ------------------------------------------------------------

export async function acceptSuggestion(id: string): Promise<Item> {
  const suggestion = await readSuggestion(id)
  const item = buildItem(suggestion.proposedItem)
  await commitLocal([
    { path: itemPath(item.id), op: 'put', data: item },
    { path: suggestionPath(id), op: 'delete' },
  ])
  notifyChange()
  return item
}

export async function rejectSuggestion(id: string): Promise<void> {
  await deleteFileLocal(suggestionPath(id))
  notifyChange()
}
