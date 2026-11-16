import { categoryIdFromName } from '../lib/categoryId'
import { berlinDate, projectSteps } from '../lib/gtd'
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
  type Settings,
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

export function updateItem(id: string, patch: Partial<Omit<Item, 'id'>>): Promise<Item> {
  return modifyItem(
    id,
    (current) => ({ ...current, ...patch, id, updatedAt: nowIso() }),
    Object.keys(patch),
  )
}

export async function deleteItem(id: string): Promise<void> {
  await deleteFileLocal(itemPath(id))
  notifyChange()
}

export async function fileInboxEntry(
  id: string,
  fields: { type: ItemType; title: string; categoryId: string; notes?: string },
): Promise<Item> {
  const entry = await readInbox(id)
  const item = buildItem({
    ...fields,
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
