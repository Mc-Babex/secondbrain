// Datenformen laut docs/SPEC.md §3 – einzige Quelle für Typen und Type Guards.

export type ItemType = 'aufgabe' | 'notiz' | 'termin'
export type ItemStatus = 'offen' | 'erledigt'
export type InboxSource = 'sprache' | 'text'
export type SuggestionKind = 'neue-aufgabe'
export type CategoryKind = 'normal' | 'einkauf' | 'archiv'

export interface SortError {
  message: string
  at: string
}

export interface InboxEntry {
  id: string
  text: string
  createdAt: string
  source: InboxSource
  sortError?: SortError
}

export interface RunMessage {
  inboxId: string | null
  message: string
}

/** Protokoll des letzten Claude-Laufs (`runs/last.json`, SPEC §3.8); die App liest es nur. */
export interface LastRun {
  startedAt: string
  finishedAt: string
  processed: number
  itemIds: string[]
  skipped: RunMessage[]
  errors: RunMessage[]
}

export type StartedStatus = 'gestartet' | 'unklar' | 'abgelehnt'

/** Sperre gegen doppelte Läufe (`runs/started.json`, SPEC §3.10); die App liest sie nur. */
export interface StartedRun {
  requestId: string
  startedAt: string
  status: StartedStatus
}

export type TriggerResult =
  'gestartet' | 'nichts' | 'laeuft' | 'abgelehnt' | 'unklar' | 'fehler' | 'nicht-eingerichtet'

/** Antwort der Action auf die letzte Anfrage (`runs/trigger.json`, SPEC §3.10). */
export interface TriggerAnswer {
  requestId: string
  at: string
  result: TriggerResult
  message?: string
  retryAfter?: string
}

export interface Schedule {
  start: string
  durationMin: number
  calendarEventId?: string | null
}

export interface Item {
  id: string
  type: ItemType
  title: string
  notes: string
  categoryId: string
  status: ItemStatus
  important: boolean
  durationMin: number | null
  schedule: Schedule | null
  originalCategoryId: string | null
  checked?: boolean
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type ProposedItem = Partial<Omit<Item, 'id'>> & Pick<Item, 'type' | 'title' | 'categoryId'>

export interface Suggestion {
  id: string
  kind: SuggestionKind
  text: string
  proposedItem: ProposedItem
  reason: string
  createdAt: string
}

export interface Category {
  id: string
  name: string
  kind: CategoryKind
  order: number
  description: string
}

export interface CategoriesFile {
  categories: Category[]
}

export interface Settings {
  planningWindow: { start: string; end: string }
  /** `null` = keine Pause; fehlt das Feld, gilt 12:00–13:00 (SPEC §3.6). */
  pause?: { start: string; end: string } | null
  timezone: string
  /** `false` = ohne Claude-Lauf; fehlt das Feld (oder hat es einen anderen Typ), gilt `true` (SPEC §3.6). */
  autoSort?: boolean
}

/** Automatisches Sortieren eingeschaltet: alles außer ausdrücklich `false`. */
export function isAutoSortEnabled(settings: Pick<Settings, 'autoSort'>): boolean {
  return settings.autoSort !== false
}

/** Gelesene Formen: nur die Pflichtfelder sind garantiert, der Rest ist optional. */
export type RawInboxEntry = Pick<InboxEntry, 'id' | 'text' | 'createdAt'> &
  Partial<Pick<InboxEntry, 'source'>> & { sortError?: unknown }
export type RawItem = Pick<
  Item,
  'id' | 'type' | 'title' | 'categoryId' | 'status' | 'createdAt' | 'updatedAt'
> &
  Partial<Item>
export type RawSuggestion = Pick<Suggestion, 'id' | 'kind' | 'proposedItem'> & Partial<Suggestion>

const ITEM_TYPES: readonly string[] = ['aufgabe', 'notiz', 'termin']
const ITEM_STATUS: readonly string[] = ['offen', 'erledigt']
const SOURCES: readonly string[] = ['sprache', 'text']
const SUGGESTION_KINDS: readonly string[] = ['neue-aufgabe']
const CATEGORY_KINDS: readonly string[] = ['normal', 'einkauf', 'archiv']

type Obj = Record<string, unknown>

export function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStrOrNull = (v: unknown): v is string | null => v === null || isStr(v)
const isNumOrNull = (v: unknown): v is number | null => v === null || isNum(v)
const oneOf = (list: readonly string[], v: unknown): boolean => isStr(v) && list.includes(v)
const absentOr = (v: unknown, check: (x: unknown) => boolean): boolean =>
  v === undefined || check(v)

export function isInboxEntry(v: unknown): v is RawInboxEntry {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.text) &&
    isStr(v.createdAt) &&
    absentOr(v.source, (s) => oneOf(SOURCES, s))
  )
}

function isSortError(v: unknown): v is SortError {
  return isObj(v) && isStr(v.message) && isStr(v.at)
}

export function normalizeInboxEntry(raw: RawInboxEntry): InboxEntry {
  // Ungültiges `sortError` wird nicht angezeigt; das Rohfeld bleibt im lokalen Speicher unverändert.
  const { sortError, ...rest } = raw
  return {
    ...rest,
    source: raw.source ?? 'text',
    ...(isSortError(sortError) ? { sortError } : {}),
  }
}

function isSchedule(v: unknown): v is Schedule {
  return (
    isObj(v) && isStr(v.start) && isNum(v.durationMin) && absentOr(v.calendarEventId, isStrOrNull)
  )
}

function hasValidOptionalItemFields(v: Obj): boolean {
  return (
    absentOr(v.notes, isStr) &&
    absentOr(v.important, (x) => typeof x === 'boolean') &&
    absentOr(v.durationMin, isNumOrNull) &&
    absentOr(v.schedule, (x) => x === null || isSchedule(x)) &&
    absentOr(v.originalCategoryId, isStrOrNull) &&
    absentOr(v.checked, (x) => typeof x === 'boolean') &&
    absentOr(v.completedAt, isStrOrNull)
  )
}

export function isItem(v: unknown): v is RawItem {
  return (
    isObj(v) &&
    isStr(v.id) &&
    oneOf(ITEM_TYPES, v.type) &&
    isStr(v.title) &&
    isStr(v.categoryId) &&
    oneOf(ITEM_STATUS, v.status) &&
    isStr(v.createdAt) &&
    isStr(v.updatedAt) &&
    hasValidOptionalItemFields(v)
  )
}

/** Ergänzt Standardwerte für fehlende optionale Felder; unbekannte Felder bleiben erhalten. */
export function normalizeItem(raw: RawItem): Item {
  return {
    ...raw,
    notes: raw.notes ?? '',
    important: raw.important ?? false,
    durationMin: raw.durationMin ?? null,
    schedule: raw.schedule ?? null,
    originalCategoryId: raw.originalCategoryId ?? null,
    completedAt: raw.completedAt ?? null,
  }
}

function isProposedItem(v: unknown): v is ProposedItem {
  return (
    isObj(v) &&
    oneOf(ITEM_TYPES, v.type) &&
    isStr(v.title) &&
    isStr(v.categoryId) &&
    hasValidOptionalItemFields(v) &&
    absentOr(v.status, (s) => oneOf(ITEM_STATUS, s))
  )
}

export function isSuggestion(v: unknown): v is RawSuggestion {
  return (
    isObj(v) &&
    isStr(v.id) &&
    oneOf(SUGGESTION_KINDS, v.kind) &&
    isProposedItem(v.proposedItem) &&
    absentOr(v.text, isStr) &&
    absentOr(v.reason, isStr) &&
    absentOr(v.createdAt, isStr)
  )
}

export function normalizeSuggestion(raw: RawSuggestion): Suggestion {
  return {
    ...raw,
    text: raw.text ?? '',
    reason: raw.reason ?? '',
    createdAt: raw.createdAt ?? '',
  }
}

export function isCategory(v: unknown): v is Category {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.name) &&
    oneOf(CATEGORY_KINDS, v.kind) &&
    isNum(v.order) &&
    isStr(v.description)
  )
}

export function isCategoriesFile(v: unknown): v is CategoriesFile {
  return isObj(v) && Array.isArray(v.categories) && v.categories.every(isCategory)
}

export function isSettings(v: unknown): v is Settings {
  return (
    isObj(v) &&
    isObj(v.planningWindow) &&
    isStr(v.planningWindow.start) &&
    isStr(v.planningWindow.end) &&
    (v.pause === undefined || v.pause === null || isObj(v.pause)) &&
    isStr(v.timezone)
  )
}

const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)

function toRunMessages(v: unknown): RunMessage[] {
  if (!Array.isArray(v)) return []
  const messages: RunMessage[] = []
  for (const entry of v) {
    if (!isObj(entry) || !isStr(entry.message)) continue
    messages.push({ inboxId: isStr(entry.inboxId) ? entry.inboxId : null, message: entry.message })
  }
  return messages
}

/** Liest `runs/last.json` tolerant: Pflicht ist ein gültiges `finishedAt`; Rest bekommt Standardwerte. */
export function parseLastRun(v: unknown): LastRun | null {
  if (!isObj(v) || !isStr(v.finishedAt) || Number.isNaN(Date.parse(v.finishedAt))) return null
  const itemIds = isStrArray(v.itemIds) ? v.itemIds : []
  return {
    startedAt: isStr(v.startedAt) ? v.startedAt : v.finishedAt,
    finishedAt: v.finishedAt,
    processed: isNum(v.processed) ? v.processed : itemIds.length,
    itemIds,
    skipped: toRunMessages(v.skipped),
    errors: toRunMessages(v.errors),
  }
}
