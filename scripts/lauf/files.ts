// Zwischendateien in `<daten>/.lauf/` (siehe docs/tasks/18): Typen + strenge Type Guards.
// Zeiten ohne Offset gelten als Berliner Ortszeit.
import {
  isObj,
  type Category,
  type GtdStatus,
  type Item,
  type ItemType,
  type Project,
  type Waiting,
} from '../../src/data/types'
import {
  checkField,
  GTD_STATUSES,
  isDate,
  isId,
  isInt,
  isNonEmptyString,
  isOneOf,
  isTime,
  isTimestamp,
  ITEM_TYPES,
  TIMESTAMP_HINT,
  isWaiting,
  validateCategoryFields,
  validateItemFields,
  validateProjectFields,
  type Messages,
} from './validate'

/** Platzhalter für die in derselben Entscheidung neu angelegte Ablage. */
export const NEW_CATEGORY_REF = '@neu'
/** Platzhalter für das in derselben Entscheidung neu angelegte Projekt. */
export const NEW_PROJECT_REF = '@neu'

export interface DecisionWhen {
  date: string
  time: string | null
}

export interface DecisionItem {
  type: ItemType
  title: string
  notes: string
  categoryId: string
  important: boolean
  durationMin: number | null
  when: DecisionWhen | null
  /** Ausdrücklich in den Kalender einplanen (SPEC §8.3 Regel 10). Bei Aufgaben Pflicht, sonst optional. */
  plan?: boolean
  /** GTD-Felder (SPEC §3.3): nur bei `type: "aufgabe"`, dort Pflicht (`waiting` bei `warten`). */
  gtd?: GtdStatus | null
  dueDate?: string | null
  waiting?: Waiting | null
  /** Projekt-ID, `"@neu"` (mit `newProject` der Entscheidung) oder `null`. */
  projectId?: string | null
}

export interface NewProjectRequest {
  title: string
  notes: string
  /** Ablagen-ID oder `"@neu"` (mit `newCategory` der Entscheidung). */
  categoryId: string
}

export interface NewCategoryRequest {
  name: string
  description: string
}

export interface Decision {
  inboxId: string
  newCategory: NewCategoryRequest | null
  newProject?: NewProjectRequest | null
  items: DecisionItem[]
}

export interface DecisionsFile {
  decisions: Decision[]
}

export interface CalendarEvent {
  id?: string
  title: string
  start?: string
  end?: string
  allDay?: boolean
  date?: string | null
  transparent?: boolean
  declined?: boolean
  /** Serien-ID, wenn der Termin ein einzeln aufgeführtes Vorkommen einer Serie ist. */
  recurringEventId?: string
}

export interface EventsFile {
  events: CalendarEvent[]
}

export interface PlanEntry {
  inboxId: string
  result: 'ok' | 'sortError'
  message: string | null
  newCategory: Category | null
  /** Neu angelegtes Projekt dieser Entscheidung (SPEC §3.12); fehlt oder `null` = keins. */
  newProject?: Project | null
  items: Item[]
}

export interface PlanEvent {
  itemId: string
  title: string
  start: string
  end: string
  description: string
}

/** Einkaufsartikel, die nicht angelegt wurden, weil es sie schon gibt (SPEC §3.9). */
export interface PlanDuplicate {
  inboxId: string
  title: string
  /** ID des vorhandenen Artikels; `null` = kam im selben Lauf schon vor. */
  existingItemId: string | null
}

export interface PlanFile {
  now: string
  entries: PlanEntry[]
  events: PlanEvent[]
  errors: { inboxId: string | null; message: string }[]
  duplicates?: PlanDuplicate[]
}

export interface EventIdsFile {
  created: { itemId: string; eventId: string }[]
  failed: { itemId: string; message: string }[]
}

/** Zeitstempel mit Offset oder ohne (dann Berliner Ortszeit), z. B. `2026-10-22T09:00:00`. */
const LOCAL_OR_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?([+-]\d{2}:\d{2}|Z)?$/
const isLocalOrOffset = (v: unknown): boolean =>
  typeof v === 'string' && LOCAL_OR_OFFSET.test(v) && !Number.isNaN(Date.parse(v))

const isOptionalBoolean = (v: unknown): boolean => v === undefined || typeof v === 'boolean'

/** Prüft eine Liste elementweise; Fehlermeldungen erhalten das Präfix `key[i]: `. */
function checkList(
  m: Messages,
  obj: Record<string, unknown>,
  key: string,
  checkElement: (element: unknown) => Messages,
): void {
  const list = obj[key]
  if (!(key in obj)) m.push(`Feld "${key}" fehlt.`)
  else if (!Array.isArray(list)) m.push(`Feld "${key}" ist ungültig (erwartet: Liste).`)
  else {
    list.forEach((element: unknown, i) => {
      for (const msg of checkElement(element)) m.push(`${key}[${i}]: ${msg}`)
    })
  }
}

function isWhen(v: unknown): boolean {
  return v === null || (isObj(v) && isDate(v.date) && (v.time === null || isTime(v.time)))
}

const isDateOrNull = (x: unknown): boolean => x === null || isDate(x)

/** GTD-Felder einer Entscheidung: bei Aufgaben Pflicht, sonst weglassen oder `null`. */
function validateDecisionGtd(
  m: Messages,
  v: Record<string, unknown>,
  hasNewProject: boolean,
): void {
  const isTask = v.type === 'aufgabe'
  const has = (key: string): boolean => v[key] !== undefined && v[key] !== null
  const required = (key: string, ok: (x: unknown) => boolean, expected: string): void => {
    if (isTask || has(key)) checkField(m, v, key, ok, expected)
  }
  required('plan', (x) => typeof x === 'boolean', 'true oder false')
  required(
    'gtd',
    (x) => isOneOf(GTD_STATUSES, x),
    '"naechster-schritt", "warten" oder "irgendwann"',
  )
  required('dueDate', isDateOrNull, 'null oder Datum YYYY-MM-DD')
  required('projectId', (x) => x === null || isNonEmptyString(x), 'null, Projekt-ID oder "@neu"')
  if (v.gtd === 'warten') {
    checkField(
      m,
      v,
      'waiting',
      (x) => isWaiting(x) && isNonEmptyString((x as { person: unknown }).person),
      '{ person (nicht leer), since (YYYY-MM-DD), followUpOn (YYYY-MM-DD oder null) } – bei gtd "warten" Pflicht',
    )
  } else if (has('waiting')) {
    checkField(m, v, 'waiting', isWaiting, 'null oder { person, since, followUpOn }')
  }
  if (v.projectId === NEW_PROJECT_REF && !hasNewProject) {
    m.push('projectId "@neu" verlangt eine newProject in dieser Entscheidung.')
  }
}

function validateDecisionItem(
  v: unknown,
  hasNewCategory: boolean,
  hasNewProject: boolean,
): Messages {
  if (!isObj(v)) return ['Eintrag ist kein JSON-Objekt.']
  const m: Messages = []
  checkField(m, v, 'type', (x) => isOneOf(ITEM_TYPES, x), '"aufgabe", "notiz" oder "termin"')
  checkField(m, v, 'title', isNonEmptyString, 'nicht leerer Text')
  checkField(m, v, 'notes', (x) => typeof x === 'string', 'Text')
  checkField(m, v, 'categoryId', isNonEmptyString, 'Ablagen-ID oder "@neu"')
  if (v.categoryId === NEW_CATEGORY_REF && !hasNewCategory) {
    m.push('categoryId "@neu" verlangt eine newCategory in dieser Entscheidung.')
  }
  checkField(m, v, 'important', (x) => typeof x === 'boolean', 'true oder false')
  checkField(
    m,
    v,
    'durationMin',
    (x) => x === null || (isInt(x) && x >= 1),
    'null oder ganze Zahl ≥ 1',
  )
  checkField(m, v, 'when', isWhen, 'null oder { date (YYYY-MM-DD), time (HH:MM oder null) }')
  validateDecisionGtd(m, v, hasNewProject)
  return m
}

function isNewProject(x: unknown): boolean {
  return (
    isObj(x) &&
    isNonEmptyString(x.title) &&
    typeof x.notes === 'string' &&
    isNonEmptyString(x.categoryId)
  )
}

function validateDecision(v: unknown): Messages {
  if (!isObj(v)) return ['Entscheidung ist kein JSON-Objekt.']
  const m: Messages = []
  checkField(m, v, 'inboxId', isId, 'ID im Format YYYYMMDD-HHmmss-xxxx')
  checkField(
    m,
    v,
    'newCategory',
    (x) =>
      x === null || (isObj(x) && isNonEmptyString(x.name) && typeof x.description === 'string'),
    'null oder { name (nicht leer), description }',
  )
  if ('newProject' in v)
    checkField(
      m,
      v,
      'newProject',
      (x) => x === null || isNewProject(x),
      'null oder { title (nicht leer), notes (Text), categoryId (Ablagen-ID oder "@neu") }',
    )
  const hasNew = isObj(v.newCategory)
  const hasNewProject = isObj(v.newProject)
  if (isObj(v.newProject) && v.newProject.categoryId === NEW_CATEGORY_REF && !hasNew) {
    m.push('newProject.categoryId "@neu" verlangt eine newCategory in dieser Entscheidung.')
  }
  if (!('items' in v) || !Array.isArray(v.items) || v.items.length === 0) {
    m.push('Feld "items" fehlt oder ist leer (erwartet: Liste mit mindestens einem Eintrag).')
  } else {
    checkList(m, v, 'items', (e) => validateDecisionItem(e, hasNew, hasNewProject))
  }
  return m
}

/** `entscheidungen.json` (schreibt Claude). */
export function validateDecisionsFile(v: unknown): Messages {
  if (!isObj(v)) return ['Inhalt ist kein JSON-Objekt.']
  const m: Messages = []
  checkList(m, v, 'decisions', validateDecision)
  return m
}

function validateCalendarEvent(v: unknown): Messages {
  if (!isObj(v)) return ['Termin ist kein JSON-Objekt.']
  const m: Messages = []
  checkField(m, v, 'title', (x) => typeof x === 'string', 'Text')
  if (v.id !== undefined && typeof v.id !== 'string')
    m.push('Feld "id" ist ungültig (erwartet: Text).')
  if (v.recurringEventId !== undefined && typeof v.recurringEventId !== 'string')
    m.push('Feld "recurringEventId" ist ungültig (erwartet: Text).')
  for (const key of ['allDay', 'transparent', 'declined']) {
    if (!isOptionalBoolean(v[key]))
      m.push(`Feld "${key}" ist ungültig (erwartet: true oder false).`)
  }
  if (v.date !== undefined && v.date !== null && !isDate(v.date)) {
    m.push('Feld "date" ist ungültig (erwartet: YYYY-MM-DD oder null).')
  }
  if (v.allDay === true) {
    if (!isDate(v.date)) m.push('Ganztägige Termine brauchen ein Feld "date" (YYYY-MM-DD).')
  } else {
    checkField(m, v, 'start', isLocalOrOffset, 'Zeitstempel, z. B. 2026-10-22T09:00:00+02:00')
    checkField(m, v, 'end', isLocalOrOffset, 'Zeitstempel, z. B. 2026-10-22T10:30:00+02:00')
  }
  return m
}

/** `termine.json` (schreibt Claude aus dem Kalender-Connector). */
export function validateEventsFile(v: unknown): Messages {
  if (!isObj(v)) return ['Inhalt ist kein JSON-Objekt.']
  const m: Messages = []
  checkList(m, v, 'events', validateCalendarEvent)
  return m
}

function validatePlanEntry(v: unknown): Messages {
  if (!isObj(v)) return ['Eintrag ist kein JSON-Objekt.']
  const m: Messages = []
  checkField(m, v, 'inboxId', isId, 'ID im Format YYYYMMDD-HHmmss-xxxx')
  checkField(m, v, 'result', (x) => x === 'ok' || x === 'sortError', '"ok" oder "sortError"')
  checkField(m, v, 'message', (x) => x === null || typeof x === 'string', 'null oder Text')
  if (v.result === 'sortError') {
    if (!isNonEmptyString(v.message)) m.push('Bei result "sortError" ist eine message nötig.')
    if (Array.isArray(v.items) && v.items.length > 0) {
      m.push('Bei result "sortError" muss items leer sein.')
    }
  }
  checkField(
    m,
    v,
    'newCategory',
    (x) =>
      x === null || (isObj(x) && validateCategoryFields(x).length === 0 && x.kind === 'normal'),
    'null oder vollständige Ablage mit kind "normal"',
  )
  if (v.newProject !== undefined) {
    checkField(
      m,
      v,
      'newProject',
      (x) => x === null || validateProjectFields(x, null).length === 0,
      'null oder vollständiges Projekt',
    )
  }
  checkList(m, v, 'items', (item) => validateItemFields(item, null))
  return m
}

function validatePlanEvent(v: unknown): Messages {
  if (!isObj(v)) return ['Termin ist kein JSON-Objekt.']
  const m: Messages = []
  checkField(m, v, 'itemId', isId, 'ID im Format YYYYMMDD-HHmmss-xxxx')
  checkField(m, v, 'title', isNonEmptyString, 'nicht leerer Text')
  checkField(m, v, 'start', isTimestamp, TIMESTAMP_HINT)
  checkField(m, v, 'end', isTimestamp, TIMESTAMP_HINT)
  checkField(m, v, 'description', (x) => typeof x === 'string', 'Text')
  return m
}

function validateInboxMessage(v: unknown): Messages {
  if (!isObj(v)) return ['Fehler ist kein JSON-Objekt.']
  const m: Messages = []
  checkField(
    m,
    v,
    'inboxId',
    (x) => x === null || isId(x),
    'null oder ID im Format YYYYMMDD-HHmmss-xxxx',
  )
  checkField(m, v, 'message', isNonEmptyString, 'nicht leerer Text')
  return m
}

function validatePlanDuplicate(v: unknown): Messages {
  if (!isObj(v)) return ['Dublette ist kein JSON-Objekt.']
  const m: Messages = []
  checkField(m, v, 'inboxId', isId, 'ID im Format YYYYMMDD-HHmmss-xxxx')
  checkField(m, v, 'title', isNonEmptyString, 'nicht leerer Text')
  checkField(m, v, 'existingItemId', (x) => x === null || isId(x), 'null oder Eintrags-ID')
  return m
}

/** `plan.json` (schreibt das Planungsskript). */
export function validatePlanFile(v: unknown): Messages {
  if (!isObj(v)) return ['Inhalt ist kein JSON-Objekt.']
  const m: Messages = []
  checkField(m, v, 'now', isTimestamp, TIMESTAMP_HINT)
  checkList(m, v, 'entries', validatePlanEntry)
  checkList(m, v, 'events', validatePlanEvent)
  checkList(m, v, 'errors', validateInboxMessage)
  if ('duplicates' in v) checkList(m, v, 'duplicates', validatePlanDuplicate)
  return m
}

function validateCreated(v: unknown): Messages {
  if (!isObj(v)) return ['Eintrag ist kein JSON-Objekt.']
  const m: Messages = []
  checkField(m, v, 'itemId', isId, 'ID im Format YYYYMMDD-HHmmss-xxxx')
  checkField(m, v, 'eventId', isNonEmptyString, 'nicht leere Kalendertermin-ID')
  return m
}

function validateFailed(v: unknown): Messages {
  if (!isObj(v)) return ['Eintrag ist kein JSON-Objekt.']
  const m: Messages = []
  checkField(m, v, 'itemId', isId, 'ID im Format YYYYMMDD-HHmmss-xxxx')
  checkField(m, v, 'message', isNonEmptyString, 'nicht leerer Text')
  return m
}

/** `termin-ids.json` (schreibt Claude nach dem Anlegen der Kalendertermine). */
export function validateEventIdsFile(v: unknown): Messages {
  if (!isObj(v)) return ['Inhalt ist kein JSON-Objekt.']
  const m: Messages = []
  checkList(m, v, 'created', validateCreated)
  checkList(m, v, 'failed', validateFailed)
  return m
}

export const isDecisionsFile = (v: unknown): v is DecisionsFile =>
  validateDecisionsFile(v).length === 0
export const isEventsFile = (v: unknown): v is EventsFile => validateEventsFile(v).length === 0
export const isPlanFile = (v: unknown): v is PlanFile => validatePlanFile(v).length === 0
export const isEventIdsFile = (v: unknown): v is EventIdsFile =>
  validateEventIdsFile(v).length === 0
