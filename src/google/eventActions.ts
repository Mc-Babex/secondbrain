import { deleteItem, updateItem } from '../data/repository'
import type { Item } from '../data/types'
import { rruleLinesFor, type Recurrence } from '../lib/recurrence'
import { wasConnected } from './auth'
import { createCalendarEvent, deleteCalendarEvent, patchCalendarEvent } from './calendar'
import { daysBetween, shiftDay } from './days'
import { joinDescription, seriesTimesFromOccurrence, splitDescription } from './events'
import { assertNotSeries } from './seriesGuard'
import {
  GoogleError,
  googleErrorMessage,
  type CalendarEvent,
  type CalendarEventChanges,
  type EventTiming,
  type SendUpdates,
} from './types'

/** Eingaben des Termin-Dialogs; `location` und `note` sind getrimmt bzw. wie eingegeben. */
export interface EventFormValues {
  title: string
  timing: EventTiming
  location: string
  /** Notiz ohne SecondBrain-Markierung (siehe `splitDescription`). */
  note: string
  /** Wiederholung laut Dialog; fehlt sie, bleibt die Wiederholung unverändert. */
  recurrence?: Recurrence
}

/** Gilt eine Änderung/Löschung nur für das Vorkommen oder für die ganze Serie? */
export type SeriesScope = 'occurrence' | 'series'

function sameTiming(event: CalendarEvent, timing: EventTiming): boolean {
  if (event.allDay || timing.allDay) {
    return (
      event.allDay &&
      timing.allDay &&
      event.start === timing.startDate &&
      event.end === timing.endDate
    )
  }
  const durationMin = (Date.parse(event.end) - Date.parse(event.start)) / 60_000
  return Date.parse(event.start) === Date.parse(timing.start) && durationMin === timing.durationMin
}

/** Der Eintrag gehört direkt zu diesem Termin (nicht nur zur Serie). */
export function isLinkedDirectly(event: CalendarEvent, item: Item | null): item is Item {
  return item !== null && item.schedule?.calendarEventId === event.id
}

/** Der Eintrag hängt an der Serie, zu der dieses Vorkommen gehört. */
export function isLinkedToSeries(event: CalendarEvent, item: Item | null): item is Item {
  return (
    item !== null &&
    event.recurringEventId !== undefined &&
    item.schedule?.calendarEventId === event.recurringEventId
  )
}

/**
 * Betrifft eine Aktion mit diesem Umfang den Eintrag? Ein einzelnes Vorkommen lässt einen Eintrag, der an der
 * Serie hängt, in Ruhe.
 */
export function affectsItem(
  event: CalendarEvent,
  item: Item | null,
  scope: SeriesScope,
): item is Item {
  if (scope === 'series') return isLinkedDirectly(event, item) || isLinkedToSeries(event, item)
  return isLinkedDirectly(event, item)
}

const sameLines = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((line, i) => line === b[i])

function timingStart(timing: EventTiming): string {
  return timing.allDay ? timing.startDate : timing.start
}

/** Zeitangabe der Serie zu einer geänderten Zeit eines Vorkommens: Seriendatum bleibt (SPEC §6.7). */
export function seriesTiming(series: CalendarEvent, timing: EventTiming): EventTiming {
  if (timing.allDay) {
    const startDate = series.allDay ? series.start : series.start.slice(0, 10)
    return {
      allDay: true,
      startDate,
      endDate: shiftDay(startDate, daysBetween(timing.startDate, timing.endDate)),
    }
  }
  const end = new Date(Date.parse(timing.start) + timing.durationMin * 60_000).toISOString()
  const times = seriesTimesFromOccurrence(series.start, timing.start, end)
  return { allDay: false, start: times.start, durationMin: timing.durationMin }
}

function currentTiming(event: CalendarEvent): EventTiming {
  if (event.allDay) return { allDay: true, startDate: event.start, endDate: event.end }
  const durationMin = Math.round((Date.parse(event.end) - Date.parse(event.start)) / 60_000)
  return { allDay: false, start: event.start, durationMin }
}

/** Trägt eine geänderte Wiederholung ein; Termine mit Uhrzeit schicken dazu die Zeit (mit Zeitzone) mit. */
function addRecurrenceChange(
  changes: CalendarEventChanges,
  event: CalendarEvent,
  recurrence: Recurrence,
  ruleStart: string,
): void {
  const lines = rruleLinesFor(recurrence, ruleStart, event.recurrence)
  if (sameLines(lines, event.recurrence ?? [])) return
  changes.recurrence = lines
  if (!changes.timing && !event.allDay) {
    changes.timing = currentTiming(event)
    changes.wasAllDay = false
  }
}

/**
 * Änderungen für die Serie: Felder, die im Dialog gegenüber dem Vorkommen geändert wurden, gelten für die Serie;
 * die Zeit über die Serienzeit-Berechnung (Seriendatum bleibt), die Wiederholung gegenüber den Serienzeilen.
 */
export function buildSeriesChanges(
  series: CalendarEvent,
  occurrenceChanges: CalendarEventChanges | null,
  recurrence: Recurrence | undefined,
): CalendarEventChanges | null {
  const changes: CalendarEventChanges = {}
  if (occurrenceChanges?.title !== undefined) changes.title = occurrenceChanges.title
  if (occurrenceChanges?.location !== undefined) changes.location = occurrenceChanges.location
  if (occurrenceChanges?.description !== undefined) {
    changes.description = occurrenceChanges.description
  }
  if (occurrenceChanges?.timing) {
    const timing = seriesTiming(series, occurrenceChanges.timing)
    if (!sameTiming(series, timing)) {
      changes.timing = timing
      changes.wasAllDay = series.allDay
    }
  }
  if (recurrence) addRecurrenceChange(changes, series, recurrence, series.start)
  return Object.keys(changes).length > 0 ? changes : null
}

/** Nur die geänderten Felder; `null`, wenn nichts geändert wurde. */
export function buildChanges(
  event: CalendarEvent,
  values: EventFormValues,
): CalendarEventChanges | null {
  const changes: CalendarEventChanges = {}
  if (values.title !== event.title.trim()) changes.title = values.title
  if (!sameTiming(event, values.timing)) {
    changes.timing = values.timing
    changes.wasAllDay = event.allDay
  }
  if (values.location !== (event.location ?? '').trim()) changes.location = values.location
  const { note, marker } = splitDescription(event.description)
  if (values.note !== note) changes.description = joinDescription(values.note, marker)
  if (values.recurrence && event.recurringEventId === undefined) {
    // Der Regelbeginn ist der (ggf. neue) Beginn des Termins.
    addRecurrenceChange(changes, event, values.recurrence, timingStart(values.timing))
  }
  return Object.keys(changes).length > 0 ? changes : null
}

async function updateLinkedItem(item: Item, changes: CalendarEventChanges): Promise<void> {
  const patch: Parameters<typeof updateItem>[1] = {}
  if (changes.title !== undefined) patch.title = changes.title
  const timing = changes.timing
  if (timing && !timing.allDay && item.schedule) {
    patch.schedule = { ...item.schedule, start: timing.start, durationMin: timing.durationMin }
    patch.durationMin = timing.durationMin
  }
  if (Object.keys(patch).length > 0) await updateItem(item.id, patch)
}

/**
 * Speichert die geänderten Felder (PATCH) und übernimmt Titel/Zeit in den verknüpften Eintrag.
 * Bei einem Serien-Vorkommen gilt `scope`: `occurrence` (Standard) ändert nur das Vorkommen (Wiederholung und
 * Serien-Eintrag bleiben unberührt), `series` die Serie (`series` = die geladene Serie).
 * Ohne Änderung passiert nichts. Google-Fehler werden weitergereicht (nichts lokal geändert).
 */
export async function saveEvent(
  event: CalendarEvent,
  values: EventFormValues,
  options: {
    sendUpdates: SendUpdates
    item: Item | null
    scope?: SeriesScope
    series?: CalendarEvent | null
  },
): Promise<void> {
  const { item, sendUpdates } = options
  const own = buildChanges(event, values)
  if (event.recurringEventId !== undefined && options.scope === 'series') {
    const { series } = options
    if (!series) throw new Error('Serie nicht geladen')
    const changes = buildSeriesChanges(series, own, values.recurrence)
    if (!changes) return
    await patchCalendarEvent(series.id, changes, { sendUpdates })
    if (affectsItem(event, item, 'series')) await updateLinkedItem(item, changes)
    return
  }
  if (!own) return
  await patchCalendarEvent(event.id, own, { sendUpdates })
  if (affectsItem(event, item, 'occurrence')) await updateLinkedItem(item, own)
}

/**
 * Verschiebt einen Termin oder ändert seine Dauer (Ziehen im Kalender, SPEC §6.2). Ändert nur die Zeit, bei einem
 * Serien-Vorkommen immer nur dieses Vorkommen; ein direkt verknüpfter Eintrag übernimmt Start und Dauer.
 */
export async function moveEvent(
  event: CalendarEvent,
  place: { start: string; durationMin: number },
  options: { sendUpdates: SendUpdates; item: Item | null },
): Promise<void> {
  await saveEvent(
    event,
    {
      title: event.title.trim(),
      timing: { allDay: false, ...place },
      location: (event.location ?? '').trim(),
      note: splitDescription(event.description).note,
    },
    { ...options, scope: 'occurrence' },
  )
}

/** Legt einen reinen Google-Termin an (ohne SecondBrain-Eintrag, ohne Gäste-Benachrichtigung). */
export async function createEvent(values: EventFormValues): Promise<void> {
  const recurrence = values.recurrence
    ? rruleLinesFor(values.recurrence, timingStart(values.timing), undefined)
    : []
  await createCalendarEvent(
    {
      title: values.title,
      timing: values.timing,
      ...(values.location ? { location: values.location } : {}),
      ...(values.note.trim() ? { description: values.note } : {}),
      ...(recurrence.length > 0 ? { recurrence } : {}),
    },
    { sendUpdates: 'none' },
  )
}

/**
 * Löscht den Termin (404/410 ⇒ „schon weg“ = Erfolg). Bei `scope: 'series'` wird die Serie gelöscht, sonst nur
 * das Vorkommen. Ein betroffener Eintrag bekommt `schedule: null` oder wird mit gelöscht (`deleteLinkedItem`);
 * ein Serien-Eintrag bleibt beim Löschen eines einzelnen Vorkommens unverändert.
 */
export async function deleteEventAndLink(
  event: CalendarEvent,
  options: {
    sendUpdates: SendUpdates
    item: Item | null
    deleteLinkedItem: boolean
    scope?: SeriesScope
  },
): Promise<void> {
  const scope = options.scope ?? 'occurrence'
  const target = scope === 'series' ? (event.recurringEventId ?? event.id) : event.id
  try {
    await deleteCalendarEvent(target, { sendUpdates: options.sendUpdates })
  } catch (error) {
    if (!(error instanceof GoogleError) || error.kind !== 'notFound') throw error
  }
  const { item } = options
  if (!affectsItem(event, item, scope)) return
  if (options.deleteLinkedItem) await deleteItem(item.id)
  else await updateItem(item.id, { schedule: null })
}

/**
 * Titeländerung eines Eintrags mit Termin (SPEC §6.6): ändert den Google-Titel ohne Anmeldefenster.
 * Gibt einen Hinweis zurück, wenn das nicht geklappt hat (der Eintrag wird trotzdem gespeichert).
 * Hängt der Eintrag an einer Serie, bleibt der Termintitel unverändert (Hinweis „Serientermin“).
 */
export async function renameLinkedEvent(item: Item, title: string): Promise<string | null> {
  const eventId = item.schedule?.calendarEventId
  if (!eventId) return null
  if (!wasConnected()) return 'Google nicht verbunden.'
  try {
    await assertNotSeries(eventId, { interactive: false })
    await patchCalendarEvent(eventId, { title }, { sendUpdates: 'none', interactive: false })
    return null
  } catch (error) {
    return googleErrorMessage(error)
  }
}
