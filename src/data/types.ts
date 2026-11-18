// Datenformen laut docs/SPEC.md §3 – einzige Quelle für Typen und Type Guards.

import { isGtdStatus, migrateItem } from '../lib/gtdMigration'

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

/** Gespeicherter GTD-Status einer Aufgabe (SPEC §3.3); „Termin“ wird nie gespeichert. */
export type GtdStatus = 'naechster-schritt' | 'warten' | 'irgendwann'
export type ProjectStatus = 'aktiv' | 'erledigt'
export type SeriesState = 'aktiv' | 'pausiert' | 'beendet'

/** „Warte auf“-Angaben (SPEC §3.3); Datumsangaben als `YYYY-MM-DD`. */
export interface Waiting {
  person: string
  since: string
  followUpOn: string | null
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
  /** GTD-Felder (SPEC §3.3, Phase 9): nur Aufgaben, alle optional. */
  gtd?: GtdStatus
  dueDate?: string | null
  waiting?: Waiting | null
  projectId?: string | null
  projectOrder?: number
  seriesId?: string
  seriesNumber?: number
  archivedWithProject?: boolean
  /** `2` = von einer App ab Phase 9 geschrieben. */
  v?: number
}

/** Schritt-Serie eines Projekts (SPEC §3.12). Datumsangaben als `YYYY-MM-DD`. */
export interface StepSeries {
  id: string
  titlePattern: string
  every: number
  weekday: number
  startDate: string
  endDate: string | null
  count: number | null
  dueWeekday: number | null
  durationMin: number | null
  state: SeriesState
  /** Ausgefallene Stichtage (sortiert, ohne Doppelte); fehlt ⇒ `[]`. */
  skippedDates: string[]
  lastNumber: number
  lastDate: string | null
}

/** Serien-Objekt, das dieses Format nicht kennt (z. B. von einer neueren App): bleibt beim Schreiben erhalten. */
export type UnknownSeries = Record<string, unknown>

/** Eintrag in `Project.series`: gültige Serie oder ein unbekanntes Objekt. Für Logik `validSeries` nutzen. */
export type SeriesEntry = StepSeries | UnknownSeries

/** `projects/<id>.json` (SPEC §3.12). */
export interface Project {
  id: string
  title: string
  notes: string
  categoryId: string
  status: ProjectStatus
  series: SeriesEntry[]
  createdAt: string
  updatedAt: string
  completedAt: string | null
  v?: number
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
const GTD_KEYS = [
  'gtd',
  'dueDate',
  'waiting',
  'projectId',
  'projectOrder',
  'seriesId',
  'seriesNumber',
  'archivedWithProject',
  'v',
] as const
type GtdKey = (typeof GTD_KEYS)[number]

type RequiredItemKey = 'id' | 'type' | 'title' | 'categoryId' | 'status' | 'createdAt' | 'updatedAt'

/** Die neuen Felder sind ungeprüft (`unknown`): ungültige Werte gelten beim Normalisieren als „fehlt“. */
export type RawItem = Pick<Item, RequiredItemKey> &
  Partial<Omit<Item, GtdKey>> &
  Partial<Record<GtdKey, unknown>>
export type RawProject = Pick<
  Project,
  'id' | 'title' | 'categoryId' | 'status' | 'createdAt' | 'updatedAt'
> &
  Partial<Omit<Project, 'series' | 'v'>> & { series?: unknown; v?: unknown }
export type RawSuggestion = Pick<Suggestion, 'id' | 'kind' | 'proposedItem'> & Partial<Suggestion>

const ITEM_TYPES: readonly string[] = ['aufgabe', 'notiz', 'termin']
const ITEM_STATUS: readonly string[] = ['offen', 'erledigt']
const SOURCES: readonly string[] = ['sprache', 'text']
const SUGGESTION_KINDS: readonly string[] = ['neue-aufgabe']
const CATEGORY_KINDS: readonly string[] = ['normal', 'einkauf', 'archiv']
const PROJECT_STATUS: readonly string[] = ['aktiv', 'erledigt']
const SERIES_STATES: readonly string[] = ['aktiv', 'pausiert', 'beendet']

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

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** `YYYY-MM-DD` mit gültigem Kalendertag. */
export function isDateString(v: unknown): v is string {
  if (!isStr(v)) return false
  const m = DATE_RE.exec(v)
  if (!m) return false
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
}

const isDateOrNull = (v: unknown): v is string | null => v === null || isDateString(v)

function isWaiting(v: unknown): v is Waiting {
  return (
    isObj(v) && isStr(v.person) && isDateString(v.since) && absentOr(v.followUpOn, isDateOrNull)
  )
}

/** Datumsteil (`YYYY-MM-DD`) eines ISO-Zeitstempels; leer, wenn er nicht so beginnt. */
function datePart(iso: string): string {
  const day = iso.slice(0, 10)
  return isDateString(day) ? day : ''
}

/** Prüft die neuen GTD-Felder einzeln; nur gültige Werte werden übernommen (Rest = „fehlt“). */
function validGtdFields(raw: RawItem): Partial<Pick<Item, GtdKey>> {
  const out: Partial<Pick<Item, GtdKey>> = {}
  if (isGtdStatus(raw.gtd)) out.gtd = raw.gtd
  if (isDateOrNull(raw.dueDate)) out.dueDate = raw.dueDate
  if (raw.waiting === null) out.waiting = null
  else if (isWaiting(raw.waiting)) {
    out.waiting = { ...raw.waiting, followUpOn: raw.waiting.followUpOn ?? null }
  }
  if (isStrOrNull(raw.projectId)) out.projectId = raw.projectId
  if (isNum(raw.projectOrder)) out.projectOrder = raw.projectOrder
  if (isStr(raw.seriesId)) out.seriesId = raw.seriesId
  if (isNum(raw.seriesNumber)) out.seriesNumber = raw.seriesNumber
  if (typeof raw.archivedWithProject === 'boolean')
    out.archivedWithProject = raw.archivedWithProject
  if (isNum(raw.v)) out.v = raw.v
  return out
}

/**
 * Ergänzt Standardwerte für fehlende optionale Felder; unbekannte Felder bleiben erhalten.
 * Ungültige neue GTD-Felder gelten als „fehlt“ (das Rohfeld im Speicher bleibt unverändert);
 * offene Aufgaben ohne gültigen Status werden migriert (SPEC §3.13).
 */
export function normalizeItem(raw: RawItem): Item {
  const rest: Record<string, unknown> = { ...raw }
  for (const key of GTD_KEYS) delete rest[key]
  const base: Item = {
    ...(rest as Pick<RawItem, RequiredItemKey>),
    ...validGtdFields(raw),
    notes: raw.notes ?? '',
    important: raw.important ?? false,
    durationMin: raw.durationMin ?? null,
    schedule: raw.schedule ?? null,
    originalCategoryId: raw.originalCategoryId ?? null,
    completedAt: raw.completedAt ?? null,
  }
  const item = migrateItem(base)
  if (item.type === 'aufgabe' && item.gtd === 'warten' && !item.waiting) {
    return { ...item, waiting: { person: '', since: datePart(item.updatedAt), followUpOn: null } }
  }
  return item
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

export function isStepSeries(v: unknown): v is StepSeries {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.titlePattern) &&
    isNum(v.every) &&
    isNum(v.weekday) &&
    isDateString(v.startDate) &&
    absentOr(v.endDate, isDateOrNull) &&
    absentOr(v.count, isNumOrNull) &&
    absentOr(v.dueWeekday, isNumOrNull) &&
    absentOr(v.durationMin, isNumOrNull) &&
    absentOr(v.state, (x) => oneOf(SERIES_STATES, x)) &&
    absentOr(v.skippedDates, Array.isArray) &&
    absentOr(v.lastNumber, isNum) &&
    absentOr(v.lastDate, isDateOrNull)
  )
}

/** Gültige Serie mit Standardwerten für fehlende Felder; unbekannte Felder bleiben erhalten. */
function normalizeSeries(raw: StepSeries): StepSeries {
  return {
    ...raw,
    endDate: raw.endDate ?? null,
    count: raw.count ?? null,
    dueWeekday: raw.dueWeekday ?? null,
    durationMin: raw.durationMin ?? null,
    state: raw.state ?? 'aktiv',
    skippedDates: [...new Set((raw.skippedDates ?? []).filter(isDateString))].sort(),
    lastNumber: raw.lastNumber ?? 0,
    lastDate: raw.lastDate ?? null,
  }
}

export function isProject(v: unknown): v is RawProject {
  return (
    isObj(v) &&
    isStr(v.id) &&
    isStr(v.title) &&
    isStr(v.categoryId) &&
    oneOf(PROJECT_STATUS, v.status) &&
    isStr(v.createdAt) &&
    isStr(v.updatedAt) &&
    absentOr(v.notes, isStr) &&
    absentOr(v.completedAt, isStrOrNull) &&
    absentOr(v.series, Array.isArray)
  )
}

/** Nur die gültigen Serien (für Anzeige und Logik); die übrigen Einträge bleiben in `project.series`. */
export function validSeries(project: Pick<Project, 'series'>): StepSeries[] {
  return project.series.filter(isStepSeries)
}

/**
 * Ergänzt Standardwerte; gültige Serien werden normalisiert, unbekannte Serien-Objekte bleiben
 * unverändert in `series` erhalten (kein Datenverlust beim Schreiben). Unbekannte Felder bleiben erhalten.
 */
export function normalizeProject(raw: RawProject): Project {
  const { v, series, ...rest } = raw
  return {
    ...rest,
    notes: raw.notes ?? '',
    completedAt: raw.completedAt ?? null,
    series: Array.isArray(series)
      ? series.flatMap((entry): SeriesEntry[] =>
          isStepSeries(entry) ? [normalizeSeries(entry)] : isObj(entry) ? [entry] : [],
        )
      : [],
    ...(isNum(v) ? { v } : {}),
  }
}
