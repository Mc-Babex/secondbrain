import { categoryIdFromName } from '../lib/categoryId'
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
  isSuggestion,
  normalizeInboxEntry,
  normalizeItem,
  normalizeSuggestion,
  parseLastRun,
  type Category,
  type InboxEntry,
  type InboxSource,
  type Item,
  type ItemType,
  type LastRun,
  type Settings,
  type Suggestion,
} from './types'

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

const byId = <T extends { id: string }>(a: T, b: T): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0

export async function listInbox(): Promise<InboxEntry[]> {
  return (await listValid('inbox/', isInboxEntry)).map(normalizeInboxEntry).sort(byId)
}

export async function listItems(): Promise<Item[]> {
  return (await listValid('items/', isItem)).map(normalizeItem).sort(byId)
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
    writes.push({
      path: itemPath(item.id),
      op: 'put',
      data: {
        ...item,
        categoryId: item.categoryId === id ? targetId : item.categoryId,
        originalCategoryId: item.originalCategoryId === id ? targetId : item.originalCategoryId,
        updatedAt: now,
      },
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
    ...partial,
  }
}

export async function createItem(partial: NewItem): Promise<Item> {
  const item = buildItem(partial)
  await putFileLocal(itemPath(item.id), item)
  notifyChange()
  return item
}

async function modifyItem(id: string, change: (item: Item) => Item): Promise<Item> {
  const data = await updateFileLocal(itemPath(id), (current) => change(parseItem(current, id)))
  notifyChange()
  return data as Item
}

export function updateItem(id: string, patch: Partial<Omit<Item, 'id'>>): Promise<Item> {
  return modifyItem(id, (current) => ({ ...current, ...patch, id, updatedAt: nowIso() }))
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

export async function completeItem(
  id: string,
  options: { clearSchedule?: boolean } = {},
): Promise<Item> {
  const archive = (await getCategories()).find((c) => c.kind === 'archiv')
  return modifyItem(id, (current) => {
    const now = nowIso()
    return {
      ...current,
      status: 'erledigt',
      completedAt: now,
      originalCategoryId:
        archive && current.categoryId === archive.id
          ? current.originalCategoryId
          : current.categoryId,
      categoryId: archive?.id ?? 'erledigt',
      ...(options.clearSchedule ? { schedule: null } : {}),
      updatedAt: now,
    }
  })
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
        return {
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
      })
      moved += 1
    } catch (error) {
      if (!(error instanceof NotDue)) throw error
    }
  }
  if (moved > 0) notifyChange()
  return moved
}

export async function restoreItem(id: string): Promise<Item> {
  const categories = await getCategories()
  return modifyItem(id, (current) => {
    // Ein vergangener Termin verliert sein `schedule` (bleibt in Google), sonst würde er sofort
    // wieder verschoben.
    const clearSchedule = hasEnded(current, new Date())
    const target =
      categories.find((c) => c.id === current.originalCategoryId && c.kind !== 'archiv') ??
      categories.find((c) => c.id === 'privat' && c.kind === 'normal') ??
      categories.find((c) => c.kind === 'normal')
    return {
      ...current,
      status: 'offen',
      completedAt: null,
      categoryId: target?.id ?? current.originalCategoryId ?? current.categoryId,
      originalCategoryId: null,
      ...(clearSchedule ? { schedule: null } : {}),
      updatedAt: nowIso(),
    }
  })
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
