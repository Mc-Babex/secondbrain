// Prüft Claudes Entscheidungen und berechnet die fertigen Einträge samt Zeiten (SPEC §8.3–8.4).
import type { Category, Item, Settings } from '../../src/data/types'
import { categoryIdFromName } from '../../src/lib/categoryId'
import { effectivePause, timeToMinutes } from '../../src/lib/planning'
import {
  dayStartFrom,
  findSlot,
  localToDate,
  nextQuarter,
  type Interval,
} from '../../src/lib/slots'
import { isPhaseEItem } from '../../src/lib/sortWork'
import { findSameArticle, normalizeArticle } from '../../src/lib/shopping'
import { toIso, zonedParts } from '../../src/lib/time'
import {
  isDecisionsFile,
  isEventsFile,
  NEW_CATEGORY_REF,
  validateDecisionsFile,
  validateEventsFile,
  type CalendarEvent,
  type Decision,
  type DecisionItem,
  type PlanDuplicate,
  type PlanEntry,
  type PlanEvent,
  type PlanExisting,
  type PlanFile,
} from './files'

export interface PlanInboxEntry {
  id: string
  createdAt: string
  sortError?: unknown
}

export interface BuildPlanInput {
  now: Date
  inbox: readonly PlanInboxEntry[]
  decisions: unknown
  events: unknown
  categories: readonly Category[]
  settings: Settings
  existingItemIds: Iterable<string>
  /** Inbox-Einträge, die dieser Lauf nicht bekommen hat (Obergrenze); Entscheidungen dazu sind ein Fehler. */
  notSelected?: ReadonlySet<string>
  /** Vorhandene Einträge (für die Dublettenprüfung der Einkaufsliste); Standard: keine. */
  existingItems?: readonly Item[]
  newId: (now: Date) => string
}

export type BuildPlanResult = { ok: true; plan: PlanFile } | { ok: false; errors: string[] }

type Phase = 'a' | 'b' | 'c' | 'd' | null

interface WorkItem {
  entry: WorkEntry
  source: DecisionItem
  id: string
  category: Category
  durationMin: number | null
  phase: Phase
  start: Date | null
}

interface WorkEntry {
  inbox: PlanInboxEntry
  decision: Decision
  newCategory: Category | null
  items: WorkItem[]
  duplicates: PlanDuplicate[]
}

const QUARTER_MIN = 15
const MINUTE_MS = 60_000
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const ID_ATTEMPTS = 100

const DEFAULT_EXISTING_MIN = 30

const pad = (n: number): string => String(n).padStart(2, '0')

export function formatDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  return `${weekday} ${pad(day)}.${pad(month)}.`
}

function berlinDate(date: Date): string {
  const p = zonedParts(date)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

function parseEventTime(value: string): Date {
  if (/([+-]\d{2}:\d{2}|Z)$/.test(value)) return new Date(value)
  return localToDate(value.slice(0, 10), value.slice(11, 16))
}

/** Belegte Zeiträume: keine ganztägigen, „freien“ oder abgesagten Termine. */
function busyIntervals(events: readonly CalendarEvent[]): Interval[] {
  const busy: Interval[] = []
  for (const e of events) {
    if (e.allDay || e.transparent || e.declined) continue
    if (e.start === undefined || e.end === undefined) continue
    busy.push({ start: parseEventTime(e.start), end: parseEventTime(e.end) })
  }
  return busy
}

/** Längster Block im Planungsfenster, in ganzen Viertelstunden. */
export function maxBlockMin(window: Settings['planningWindow']): number {
  return (
    Math.floor((timeToMinutes(window.end) - timeToMinutes(window.start)) / QUARTER_MIN) *
    QUARTER_MIN
  )
}

export interface PhaseEItem {
  item: Item
  durationMin: number
}

/** Einzuplanende vorhandene Aufgaben (8.4 e): 15-Min.-Aufgaben zuerst, dann nach `createdAt`. */
export function phaseEItems(items: readonly Item[], maxMin: number): PhaseEItem[] {
  const clamp = (min: number): number => Math.min(Math.max(min, QUARTER_MIN), maxMin)
  return items
    .filter(isPhaseEItem)
    .map((item) => ({
      item,
      durationMin: clamp(
        item.durationMin === null
          ? DEFAULT_EXISTING_MIN
          : Math.round(item.durationMin / QUARTER_MIN) * QUARTER_MIN,
      ),
    }))
    .sort(
      (a, b) =>
        Number(b.durationMin === QUARTER_MIN) - Number(a.durationMin === QUARTER_MIN) ||
        Date.parse(a.item.createdAt) - Date.parse(b.item.createdAt) ||
        a.item.id.localeCompare(b.item.id),
    )
}

function normalizeDuration(item: DecisionItem, maxMin: number): number | null {
  const clamp = (min: number): number => Math.min(Math.max(min, QUARTER_MIN), maxMin)
  if (item.durationMin !== null) {
    return clamp(Math.round(item.durationMin / QUARTER_MIN) * QUARTER_MIN)
  }
  if (item.when?.time) return clamp(60)
  if (item.when) return clamp(90)
  if (item.important) return clamp(30)
  return null
}

function phaseOf(item: DecisionItem, durationMin: number | null): Phase {
  if (item.when?.time) return 'a'
  if (item.when) return 'b'
  if (item.important) return durationMin === QUARTER_MIN ? 'c' : 'd'
  return null
}

const byCreatedAt = (a: PlanInboxEntry, b: PlanInboxEntry): number =>
  Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id)

/** Meldungen zu Inbox, Entscheidungen und Ablagen; die Ergebnisse stecken in `entries`. */
function matchDecisions(
  inbox: readonly PlanInboxEntry[],
  decisions: readonly Decision[],
  errors: string[],
  notSelected: ReadonlySet<string>,
): { inbox: PlanInboxEntry; decision: Decision }[] {
  const inboxById = new Map(inbox.map((e) => [e.id, e]))
  const decisionById = new Map<string, Decision>()
  for (const d of decisions) {
    const entry = inboxById.get(d.inboxId)
    if (decisionById.has(d.inboxId)) {
      errors.push(`Entscheidung ${d.inboxId}: Für diesen Eintrag gibt es mehrere Entscheidungen.`)
    } else if (notSelected.has(d.inboxId)) {
      errors.push(
        `Entscheidung ${d.inboxId}: Dieser Eintrag gehört nicht zu diesem Lauf und kommt beim nächsten dran.`,
      )
    } else if (!entry) {
      errors.push(`Entscheidung ${d.inboxId}: Diesen Eintrag gibt es im Eingangskorb nicht.`)
    } else if (entry.sortError !== undefined) {
      errors.push(
        `Entscheidung ${d.inboxId}: Der Eintrag hat einen sortError und darf nicht entschieden werden.`,
      )
    } else {
      decisionById.set(d.inboxId, d)
    }
  }
  const matched: { inbox: PlanInboxEntry; decision: Decision }[] = []
  for (const entry of [...inbox].sort(byCreatedAt)) {
    if (entry.sortError !== undefined) continue
    const decision = decisionById.get(entry.id)
    if (decision) matched.push({ inbox: entry, decision })
    else errors.push(`Eintrag ${entry.id}: Für diesen Eintrag fehlt eine Entscheidung.`)
  }
  return matched
}

/** Legt neue Ablagen an bzw. findet gleichnamige; prüft die Ablage jedes Eintrags. */
function resolveCategories(
  matched: { inbox: PlanInboxEntry; decision: Decision }[],
  categories: readonly Category[],
  errors: string[],
): { created: Category[]; byEntry: Map<string, Category[]> } {
  const all: Category[] = [...categories]
  const created: Category[] = []
  const byEntry = new Map<string, Category[]>()
  for (const { inbox, decision } of matched) {
    const label = `Entscheidung ${inbox.id}`
    let fresh: Category | null = null
    const request = decision.newCategory
    if (request) {
      if (!decision.items.some((i) => i.categoryId === NEW_CATEGORY_REF)) {
        errors.push(`${label}: newCategory ist gesetzt, aber kein Eintrag nutzt categoryId "@neu".`)
      }
      const name = request.name.trim().toLowerCase()
      fresh = all.find((c) => c.name.trim().toLowerCase() === name) ?? null
      if (!fresh) {
        fresh = {
          id: categoryIdFromName(
            request.name,
            all.map((c) => c.id),
          ),
          name: request.name.trim(),
          kind: 'normal',
          order: Math.max(0, ...all.map((c) => c.order)) + 1,
          description: request.description,
        }
        all.push(fresh)
        created.push(fresh)
      }
    }
    const resolved: Category[] = []
    for (const item of decision.items) {
      const category =
        item.categoryId === NEW_CATEGORY_REF ? fresh : all.find((c) => c.id === item.categoryId)
      if (!category) {
        errors.push(`${label}: Ablage „${item.categoryId}“ gibt es nicht.`)
        continue
      }
      if (category.kind === 'archiv') {
        errors.push(`${label}: Die Ablage „${category.name}“ ist das Archiv und nicht erlaubt.`)
      } else if (category.kind === 'einkauf' && item.type !== 'notiz') {
        errors.push(
          `${label}: In der Ablage „${category.name}“ sind nur Notizen erlaubt, „${item.title}“ ist ${item.type}.`,
        )
      }
      resolved.push(category)
    }
    byEntry.set(inbox.id, resolved)
  }
  return { created, byEntry }
}

function buildItem(work: WorkItem, now: Date): Item {
  const { source, category } = work
  return {
    id: work.id,
    type: source.type,
    title: source.title,
    notes: source.notes,
    categoryId: category.id,
    status: 'offen',
    important: source.important,
    durationMin: work.durationMin,
    schedule:
      work.start && work.durationMin !== null
        ? { start: toIso(work.start), durationMin: work.durationMin }
        : null,
    originalCategoryId: null,
    ...(category.kind === 'einkauf' ? { checked: false } : {}),
    createdAt: work.entry.inbox.createdAt,
    updatedAt: toIso(now),
    completedAt: null,
  }
}

const endOf = (start: Date, durationMin: number): Date =>
  new Date(start.getTime() + durationMin * MINUTE_MS)

/**
 * Prüft die Entscheidungen und berechnet Ablagen, Einträge und Termine.
 * Bei einem Prüffehler wird nichts geplant (`ok: false`, Meldungen auf Deutsch).
 */
export function buildPlan(input: BuildPlanInput): BuildPlanResult {
  const { now, settings } = input
  const messages = [
    ...validateDecisionsFile(input.decisions).map((m) => `entscheidungen.json: ${m}`),
    ...validateEventsFile(input.events).map((m) => `termine.json: ${m}`),
  ]
  if (messages.length > 0 || !isDecisionsFile(input.decisions) || !isEventsFile(input.events)) {
    return { ok: false, errors: messages }
  }

  const errors: string[] = []
  const matched = matchDecisions(
    input.inbox,
    input.decisions.decisions,
    errors,
    input.notSelected ?? new Set(),
  )
  const { created, byEntry } = resolveCategories(matched, input.categories, errors)

  const window = settings.planningWindow
  const maxMin = maxBlockMin(window)

  const usedIds = new Set(input.existingItemIds)
  const existingItems = input.existingItems ?? []
  const seenArticles = new Set<string>()
  const entries: WorkEntry[] = []
  for (const { inbox, decision } of matched) {
    const categories = byEntry.get(inbox.id) ?? []
    const entry: WorkEntry = { inbox, decision, newCategory: null, items: [], duplicates: [] }
    let kept = 0
    decision.items.forEach((source, index) => {
      const target = categories[index]
      if (target?.kind === 'einkauf') {
        const key = `${target.id}|${normalizeArticle(source.title)}`
        const existing = findSameArticle(existingItems, source.title, target.id)
        if (existing || seenArticles.has(key)) {
          entry.duplicates.push({
            inboxId: inbox.id,
            title: source.title,
            existingItemId: existing?.id ?? null,
          })
          return
        }
        seenArticles.add(key)
      }
      let id = inbox.id
      if (kept++ === 0) {
        if (usedIds.has(id))
          errors.push(`Entscheidung ${id}: Ein Eintrag mit dieser ID gibt es schon.`)
      } else {
        id = input.newId(now)
        for (let i = 0; usedIds.has(id) && i < ID_ATTEMPTS; i++) id = input.newId(now)
        if (usedIds.has(id))
          errors.push(`Entscheidung ${inbox.id}: Keine freie Eintrags-ID gefunden.`)
      }
      usedIds.add(id)
      const category = categories[index]
      if (!category) return
      const durationMin = normalizeDuration(source, maxMin)
      entry.items.push({
        entry,
        source,
        id,
        category,
        durationMin,
        phase: phaseOf(source, durationMin),
        start: null,
      })
    })
    entries.push(entry)
  }

  if (errors.length > 0) return { ok: false, errors }

  const calendarBusy = busyIntervals(input.events.events)
  return { ok: true, plan: schedule(entries, created, input, calendarBusy) }
}

function schedule(
  entries: WorkEntry[],
  created: Category[],
  input: BuildPlanInput,
  calendarBusy: readonly Interval[],
): PlanFile {
  const { now, settings } = input
  const window = settings.planningWindow
  const pause = effectivePause(settings)
  const failed = new Map<string, string>()
  const reserved = new Map<string, Interval[]>()
  const planErrors: PlanFile['errors'] = []

  const busy = (): Interval[] => [...calendarBusy, ...[...reserved.values()].flat()]
  const fail = (entry: WorkEntry, message: string): void => {
    if (!failed.has(entry.inbox.id)) failed.set(entry.inbox.id, message)
    reserved.delete(entry.inbox.id)
  }
  const reserve = (work: WorkItem, start: Date): void => {
    work.start = start
    const list = reserved.get(work.entry.inbox.id) ?? []
    list.push({ start, end: endOf(start, work.durationMin ?? QUARTER_MIN) })
    reserved.set(work.entry.inbox.id, list)
  }
  const itemsOf = (phase: Phase): WorkItem[] =>
    entries.flatMap((e) => e.items).filter((w) => w.phase === phase)

  // a) Datum + Uhrzeit: genau dort; Vergangenheit ⇒ sortError (gibt die Zeiten des Eintrags frei).
  const timed = itemsOf('a')
  for (const work of timed) {
    const when = work.source.when
    if (!when?.time) continue
    if (localToDate(when.date, when.time) < now) {
      fail(
        work.entry,
        `Der Zeitpunkt ${formatDay(when.date)}, ${when.time} liegt in der Vergangenheit.`,
      )
    }
  }
  for (const work of timed) {
    const when = work.source.when
    if (!when?.time || failed.has(work.entry.inbox.id)) continue
    reserve(work, localToDate(when.date, when.time))
  }

  // b) Datum ohne Uhrzeit: erster freier Block an genau diesem Tag.
  const today = berlinDate(now)
  for (const work of itemsOf('b')) {
    const when = work.source.when
    if (!when || failed.has(work.entry.inbox.id)) continue
    const duration = work.durationMin ?? QUARTER_MIN
    if (when.date < today) {
      fail(work.entry, `Der Tag ${formatDay(when.date)} liegt in der Vergangenheit.`)
      continue
    }
    const from = when.date === today ? nextQuarter(now) : localToDate(when.date, window.start)
    const slot = findSlot({
      busy: busy(),
      window,
      pause,
      from,
      durationMin: duration,
      sameDayOnly: true,
    })
    if (slot) reserve(work, slot)
    else {
      fail(
        work.entry,
        `Am ${formatDay(when.date)} ist im Planungsfenster kein freier ${duration}-Min-Block.`,
      )
    }
  }

  // c) wichtig, 15 Min., und d) wichtig, sonst: beide ab Tagesanfang, nie am laufenden Tag; c zuerst.
  const dayStart = dayStartFrom(now, window)
  for (const phase of ['c', 'd'] as const) {
    for (const work of itemsOf(phase)) {
      if (failed.has(work.entry.inbox.id)) continue
      const slot = findSlot({
        busy: busy(),
        window,
        pause,
        from: dayStart,
        durationMin: work.durationMin ?? QUARTER_MIN,
      })
      if (slot) reserve(work, slot)
      else {
        planErrors.push({
          inboxId: work.entry.inbox.id,
          message: `Für „${work.source.title}“ ist in den nächsten 14 Tagen kein freier Slot im Planungsfenster; der Eintrag bleibt ohne Termin.`,
        })
      }
    }
  }

  // e) vorhandene wichtige Aufgaben ohne Termin: nach den neuen Einträgen, ebenfalls ab Tagesanfang.
  const existing: PlanExisting[] = []
  for (const { item, durationMin } of phaseEItems(input.existingItems ?? [], maxBlockMin(window))) {
    const slot = findSlot({ busy: busy(), window, pause, from: dayStart, durationMin })
    if (slot) {
      reserved.set(item.id, [{ start: slot, end: endOf(slot, durationMin) }])
      existing.push({ itemId: item.id, title: item.title, start: toIso(slot), durationMin })
    } else {
      planErrors.push({
        inboxId: null,
        message: `Für „${item.title}“ ist in den nächsten 14 Tagen kein freier Slot im Planungsfenster; die Aufgabe bleibt ohne Termin.`,
      })
    }
  }
  return assemble(entries, created, failed, planErrors, existing, now)
}

function assemble(
  entries: WorkEntry[],
  created: Category[],
  failed: ReadonlyMap<string, string>,
  planErrors: PlanFile['errors'],
  existing: readonly PlanExisting[],
  now: Date,
): PlanFile {
  const announced = new Set<string>()
  const planEntries: PlanEntry[] = []
  const events: PlanEvent[] = []
  for (const entry of entries) {
    const id = entry.inbox.id
    const message = failed.get(id)
    if (message !== undefined) {
      planEntries.push({ inboxId: id, result: 'sortError', message, newCategory: null, items: [] })
      continue
    }
    const newCategory =
      created.find(
        (c) => !announced.has(c.id) && entry.items.some((w) => w.category.id === c.id),
      ) ?? null
    if (newCategory) announced.add(newCategory.id)
    planEntries.push({
      inboxId: id,
      result: 'ok',
      message: null,
      newCategory,
      items: entry.items.map((w) => buildItem(w, now)),
    })
    for (const work of entry.items) {
      if (!work.start || work.durationMin === null) continue
      events.push({
        itemId: work.id,
        title: work.source.title,
        start: toIso(work.start),
        end: toIso(endOf(work.start, work.durationMin)),
        description: `Erstellt mit SecondBrain (Claude-Lauf)\nEintrag: ${work.id}`,
      })
    }
  }
  for (const e of existing) {
    events.push({
      itemId: e.itemId,
      title: e.title,
      start: e.start,
      end: toIso(new Date(Date.parse(e.start) + e.durationMin * MINUTE_MS)),
      description: `Erstellt mit SecondBrain (Claude-Lauf)
Eintrag: ${e.itemId}`,
    })
  }
  return {
    now: toIso(now),
    entries: planEntries,
    events,
    errors: planErrors,
    duplicates: entries.flatMap((e) => e.duplicates),
    ...(existing.length > 0 ? { existing: [...existing] } : {}),
  }
}
