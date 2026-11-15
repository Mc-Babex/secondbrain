import { defaultCategories } from '../../src/data/defaults'
import { isObj } from '../../src/data/types'

export interface ValidationError {
  path: string
  message: string
}

/** Eine gelesene Datei des Daten-Repos; `data` ist der geparste JSON-Inhalt. */
export interface RepoFile {
  path: string
  data: unknown
  parseError?: string
}

export interface DataRepoFiles {
  inbox: RepoFile[]
  items: RepoFile[]
  suggestions: RepoFile[]
  categories: RepoFile | null
  settings: RepoFile | null
  lastRun: RepoFile | null
}

const ID_PATTERN = /^\d{8}-\d{6}-[a-z0-9]{4}$/
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}:\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export const ITEM_TYPES: readonly string[] = ['aufgabe', 'notiz', 'termin']
const ITEM_STATUS: readonly string[] = ['offen', 'erledigt']
const SOURCES: readonly string[] = ['sprache', 'text']
const CATEGORY_KINDS: readonly string[] = ['normal', 'einkauf', 'archiv']

export const isId = (v: unknown): v is string => typeof v === 'string' && ID_PATTERN.test(v)
export const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim() !== ''
const isString = (v: unknown): v is string => typeof v === 'string'
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean'
export const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
export const isOneOf = (list: readonly string[], v: unknown): boolean =>
  typeof v === 'string' && list.includes(v)

/** ISO 8601 mit Offset `±HH:MM`, z. B. `2026-10-17T09:30:00+02:00`. */
export function isTimestamp(v: unknown): v is string {
  return typeof v === 'string' && TIMESTAMP_PATTERN.test(v) && !Number.isNaN(Date.parse(v))
}

export function isTime(v: unknown): v is string {
  return typeof v === 'string' && TIME_PATTERN.test(v)
}

export function isDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v)
}

export type Messages = string[]
type Obj = Record<string, unknown>

/** Pflichtfeld: muss vorhanden und gültig sein. */
export function checkField(
  messages: Messages,
  obj: Obj,
  key: string,
  ok: (v: unknown) => boolean,
  expected: string,
): void {
  if (!(key in obj)) messages.push(`Feld "${key}" fehlt.`)
  else if (!ok(obj[key])) messages.push(`Feld "${key}" ist ungültig (erwartet: ${expected}).`)
}

function checkOptional(
  messages: Messages,
  obj: Obj,
  key: string,
  ok: (v: unknown) => boolean,
  expected: string,
): void {
  if (obj[key] !== undefined && !ok(obj[key])) {
    messages.push(`Feld "${key}" ist ungültig (erwartet: ${expected}).`)
  }
}

export const TIMESTAMP_HINT = 'Zeitstempel mit Offset, z. B. 2026-10-17T09:30:00+02:00'
const DURATION_HINT = 'null oder ganze Zahl ≥ 1'
const isDuration = (x: unknown): boolean => x === null || (isInt(x) && x >= 1)

function checkId(messages: Messages, obj: Obj): void {
  checkField(messages, obj, 'id', isId, 'ID im Format YYYYMMDD-HHmmss-xxxx')
}

function isSchedule(s: unknown): boolean {
  if (s === null) return true
  return (
    isObj(s) &&
    isTimestamp(s.start) &&
    isInt(s.durationMin) &&
    s.durationMin >= 1 &&
    (s.calendarEventId === undefined || s.calendarEventId === null || isString(s.calendarEventId))
  )
}

/** Prüft alle Felder eines Eintrags (SPEC §3.3). `categoryIds === null` überspringt die Ablagen-Prüfung. */
export function validateItemFields(v: unknown, categoryIds: ReadonlySet<string> | null): Messages {
  if (!isObj(v)) return ['Inhalt ist kein JSON-Objekt.']
  const m: Messages = []
  checkId(m, v)
  checkField(m, v, 'type', (x) => isOneOf(ITEM_TYPES, x), '"aufgabe", "notiz" oder "termin"')
  checkField(m, v, 'title', isNonEmptyString, 'nicht leerer Text')
  checkField(m, v, 'notes', isString, 'Text')
  checkField(m, v, 'categoryId', isNonEmptyString, 'Ablagen-ID')
  if (categoryIds && isNonEmptyString(v.categoryId) && !categoryIds.has(v.categoryId)) {
    m.push(`Ablage "${v.categoryId}" existiert nicht in categories.json.`)
  }
  checkField(m, v, 'status', (x) => isOneOf(ITEM_STATUS, x), '"offen" oder "erledigt"')
  if (v.type === 'notiz' && v.status === 'erledigt') {
    m.push('Notizen sind immer "offen" (status "erledigt" ist nicht erlaubt).')
  }
  checkField(m, v, 'important', isBoolean, 'true oder false')
  checkField(m, v, 'durationMin', isDuration, DURATION_HINT)
  checkField(
    m,
    v,
    'schedule',
    isSchedule,
    'null oder { start (Zeitstempel mit Offset), durationMin (ganze Zahl ≥ 1), calendarEventId? }',
  )
  checkField(m, v, 'originalCategoryId', (x) => x === null || isString(x), 'null oder Ablagen-ID')
  checkOptional(m, v, 'checked', isBoolean, 'true oder false')
  checkField(m, v, 'createdAt', isTimestamp, TIMESTAMP_HINT)
  checkField(m, v, 'updatedAt', isTimestamp, TIMESTAMP_HINT)
  checkField(
    m,
    v,
    'completedAt',
    (x) => x === null || isTimestamp(x),
    `null oder ${TIMESTAMP_HINT}`,
  )
  return m
}

export function validateInboxFields(v: unknown): Messages {
  if (!isObj(v)) return ['Inhalt ist kein JSON-Objekt.']
  const m: Messages = []
  checkId(m, v)
  checkField(m, v, 'text', isNonEmptyString, 'nicht leerer Text')
  checkField(m, v, 'createdAt', isTimestamp, TIMESTAMP_HINT)
  checkField(m, v, 'source', (x) => isOneOf(SOURCES, x), '"sprache" oder "text"')
  checkOptional(
    m,
    v,
    'sortError',
    (e) => isObj(e) && isNonEmptyString(e.message) && isTimestamp(e.at),
    '{ message (nicht leer), at (Zeitstempel mit Offset) }',
  )
  return m
}

export function validateCategoryFields(v: unknown): Messages {
  if (!isObj(v)) return ['Ablage ist kein JSON-Objekt.']
  const m: Messages = []
  checkField(m, v, 'id', isNonEmptyString, 'nicht leere ID')
  checkField(m, v, 'name', isNonEmptyString, 'nicht leerer Name')
  checkField(m, v, 'kind', (x) => isOneOf(CATEGORY_KINDS, x), '"normal", "einkauf" oder "archiv"')
  checkField(m, v, 'order', (x) => typeof x === 'number' && Number.isFinite(x), 'Zahl')
  checkField(m, v, 'description', isString, 'Text')
  return m
}

export function validateCategoriesFile(v: unknown): Messages {
  if (!isObj(v) || !Array.isArray(v.categories)) {
    return ['Feld "categories" fehlt oder ist kein Array.']
  }
  const list: unknown[] = v.categories
  const m: Messages = []
  const seen = new Set<string>()
  list.forEach((c, i) => {
    for (const msg of validateCategoryFields(c)) m.push(`categories[${i}]: ${msg}`)
    if (isObj(c) && isString(c.id)) {
      if (seen.has(c.id)) m.push(`Ablagen-ID "${c.id}" kommt mehrfach vor.`)
      seen.add(c.id)
    }
  })
  for (const kind of ['einkauf', 'archiv']) {
    const count = list.filter((c) => isObj(c) && c.kind === kind).length
    if (count !== 1) {
      m.push(`Es muss genau eine Ablage der Art "${kind}" geben (gefunden: ${count}).`)
    }
  }
  return m
}

export function validateSettingsFile(v: unknown): Messages {
  if (!isObj(v)) return ['Inhalt ist kein JSON-Objekt.']
  const m: Messages = []
  const w = v.planningWindow
  if (!isObj(w)) {
    m.push('Feld "planningWindow" fehlt oder ist kein Objekt.')
  } else {
    if (!isTime(w.start)) m.push('planningWindow.start muss das Format HH:MM haben.')
    if (!isTime(w.end)) m.push('planningWindow.end muss das Format HH:MM haben.')
    if (isTime(w.start) && isTime(w.end) && w.start >= w.end) {
      m.push('planningWindow.start muss vor planningWindow.end liegen.')
    }
  }
  checkField(m, v, 'timezone', isNonEmptyString, 'Zeitzone, z. B. Europe/Berlin')
  return m
}

function isMessageList(list: unknown, nullableInboxId: boolean): boolean {
  return (
    Array.isArray(list) &&
    list.every(
      (e: unknown) =>
        isObj(e) &&
        (nullableInboxId ? e.inboxId === null || isId(e.inboxId) : isId(e.inboxId)) &&
        isNonEmptyString(e.message),
    )
  )
}

export function validateLastRunFile(v: unknown): Messages {
  if (!isObj(v)) return ['Inhalt ist kein JSON-Objekt.']
  const m: Messages = []
  checkField(m, v, 'startedAt', isTimestamp, TIMESTAMP_HINT)
  checkField(m, v, 'finishedAt', isTimestamp, TIMESTAMP_HINT)
  checkField(m, v, 'processed', (x) => isInt(x) && x >= 0, 'ganze Zahl ≥ 0')
  checkField(m, v, 'itemIds', (x) => Array.isArray(x) && x.every(isId), 'Liste von IDs')
  checkField(m, v, 'skipped', (x) => isMessageList(x, false), 'Liste von { inboxId (ID), message }')
  checkField(
    m,
    v,
    'errors',
    (x) => isMessageList(x, true),
    'Liste von { inboxId (ID oder null), message }',
  )
  return m
}

export function validateSuggestionFields(
  v: unknown,
  categoryIds: ReadonlySet<string> | null,
): Messages {
  if (!isObj(v)) return ['Inhalt ist kein JSON-Objekt.']
  const m: Messages = []
  checkId(m, v)
  checkField(m, v, 'kind', (x) => x === 'neue-aufgabe', '"neue-aufgabe"')
  checkField(m, v, 'text', isNonEmptyString, 'nicht leerer Text')
  checkField(m, v, 'reason', isString, 'Text')
  checkField(m, v, 'createdAt', isTimestamp, TIMESTAMP_HINT)
  const p = v.proposedItem
  if (!isObj(p)) {
    m.push('Feld "proposedItem" fehlt oder ist kein Objekt.')
    return m
  }
  const sub: Messages = []
  checkField(sub, p, 'type', (x) => isOneOf(ITEM_TYPES, x), '"aufgabe", "notiz" oder "termin"')
  checkField(sub, p, 'title', isNonEmptyString, 'nicht leerer Text')
  checkField(sub, p, 'categoryId', isNonEmptyString, 'Ablagen-ID')
  if (categoryIds && isNonEmptyString(p.categoryId) && !categoryIds.has(p.categoryId)) {
    sub.push(`Ablage "${p.categoryId}" existiert nicht in categories.json.`)
  }
  checkOptional(sub, p, 'status', (x) => isOneOf(ITEM_STATUS, x), '"offen" oder "erledigt"')
  checkOptional(sub, p, 'important', isBoolean, 'true oder false')
  checkOptional(sub, p, 'durationMin', isDuration, DURATION_HINT)
  for (const msg of sub) m.push(`proposedItem: ${msg}`)
  return m
}

function checkJsonFile(file: RepoFile, errors: ValidationError[]): boolean {
  if (file.parseError !== undefined) {
    errors.push({ path: file.path, message: `Kein gültiges JSON: ${file.parseError}` })
    return false
  }
  return true
}

function checkNamedFile(
  file: RepoFile,
  check: (data: unknown) => Messages,
  errors: ValidationError[],
): void {
  const name = file.path.split('/').pop() ?? file.path
  if (!name.endsWith('.json')) {
    errors.push({ path: file.path, message: 'Nur .json-Dateien sind hier erlaubt.' })
    return
  }
  if (!checkJsonFile(file, errors)) return
  for (const message of check(file.data)) errors.push({ path: file.path, message })
  const id = name.slice(0, -'.json'.length)
  if (!isId(id)) {
    errors.push({
      path: file.path,
      message: 'Dateiname ist keine gültige ID (YYYYMMDD-HHmmss-xxxx).',
    })
  } else if (isObj(file.data) && isId(file.data.id) && file.data.id !== id) {
    errors.push({
      path: file.path,
      message: `ID "${file.data.id}" stimmt nicht mit dem Dateinamen überein.`,
    })
  }
}

function checkSingleFile(
  file: RepoFile | null,
  check: (data: unknown) => Messages,
  errors: ValidationError[],
): void {
  if (!file || !checkJsonFile(file, errors)) return
  for (const message of check(file.data)) errors.push({ path: file.path, message })
}

/** Ablagen-IDs zum Prüfen von `categoryId`; `null`, wenn categories.json selbst ungültig ist. */
function categoryIdSet(file: RepoFile | null): ReadonlySet<string> | null {
  if (!file) return new Set(defaultCategories().categories.map((c) => c.id))
  if (file.parseError !== undefined || validateCategoriesFile(file.data).length > 0) return null
  const list = (file.data as { categories: { id: string }[] }).categories
  return new Set(list.map((c) => c.id))
}

/** Strenge Prüfung des ganzen Daten-Repos (SPEC §3). Fehlende categories/settings gelten als Standard. */
export function validateDataRepo(files: DataRepoFiles): ValidationError[] {
  const errors: ValidationError[] = []
  const ids = categoryIdSet(files.categories)
  checkSingleFile(files.categories, validateCategoriesFile, errors)
  checkSingleFile(files.settings, validateSettingsFile, errors)
  checkSingleFile(files.lastRun, validateLastRunFile, errors)
  for (const f of files.inbox) checkNamedFile(f, validateInboxFields, errors)
  for (const f of files.items) checkNamedFile(f, (d) => validateItemFields(d, ids), errors)
  for (const f of files.suggestions) {
    checkNamedFile(f, (d) => validateSuggestionFields(d, ids), errors)
  }
  return errors
}
