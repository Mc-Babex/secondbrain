import { shiftDay } from '../../google/days'
import type { EventFormValues } from '../../google/eventActions'
import { splitDescription } from '../../google/events'
import type { CalendarEvent } from '../../google/types'
import { timeToMinutes, zonedToDate } from '../../lib/planning'
import { fromRRule, NO_RECURRENCE, type Recurrence } from '../../lib/recurrence'
import { toIso, zonedParts } from '../../lib/time'

/** Eingabestand des Termin-Dialogs (Texte so, wie die Felder sie halten). */
export interface EventForm {
  title: string
  allDay: boolean
  /** `YYYY-MM-DD`; bei ganztägig der erste Tag. */
  date: string
  /** Nur ganztägig: letzter Tag (einschließlich). */
  endDate: string
  /** `HH:MM` */
  time: string
  /** Minuten; ≤ 0 bedeutet „Ende nicht nach Beginn“. */
  duration: number
  /** `HH:MM`, aus Beginn und Dauer abgeleitet bzw. vom Nutzer gesetzt. */
  endTime: string
  location: string
  note: string
  /** Wiederholung (bei einem Vorkommen die der Serie). */
  recurrence: Recurrence
}

export const DEFAULT_START = '09:00'
export const DEFAULT_DURATION = 60
export const END_BEFORE_START = 'Das Ende muss nach dem Beginn liegen.'
export const ALL_DAY_END_BEFORE_START = 'Das Ende darf nicht vor dem Beginn liegen.'
export const REPEAT_END_BEFORE_START = 'Die Wiederholung darf nicht vor dem Beginn enden.'
export const REPEAT_COUNT_INVALID = 'Bitte eine Anzahl von mindestens 1 Termin angeben.'

const pad = (n: number): string => String(n).padStart(2, '0')
const clock = (minutes: number): string => {
  const wrapped = ((minutes % 1440) + 1440) % 1440
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`
}
const TIME = /^\d{2}:\d{2}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

export const endTimeFor = (time: string, duration: number): string =>
  clock(timeToMinutes(time) + duration)

/** Dauer aus Beginn und Ende am selben Tag (Ende ≤ Beginn ⇒ Wert ≤ 0). */
export const durationBetween = (time: string, endTime: string): number =>
  timeToMinutes(endTime) - timeToMinutes(time)

function dayOf(date: Date): string {
  const p = zonedParts(date)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** Leeres Formular für einen neuen Termin am Tag `date` (`YYYY-MM-DD`) ab `time` (`HH:MM`), 60 Min. */
export function blankForm(date: string, time: string): EventForm {
  return {
    title: '',
    allDay: false,
    date,
    endDate: date,
    time,
    duration: DEFAULT_DURATION,
    endTime: endTimeFor(time, DEFAULT_DURATION),
    location: '',
    note: '',
    recurrence: NO_RECURRENCE,
  }
}

/** Formular zum Termin (die Wiederholung stammt aus `event.recurrence`, also bei der Serie selbst). */
export function formFromEvent(event: CalendarEvent): EventForm {
  const base = {
    title: event.title,
    location: event.location ?? '',
    note: splitDescription(event.description).note,
    recurrence: fromRRule(event.recurrence, event.start),
  }
  if (event.allDay) {
    return {
      ...base,
      allDay: true,
      date: event.start,
      endDate: shiftDay(event.end, -1) < event.start ? event.start : shiftDay(event.end, -1),
      time: DEFAULT_START,
      duration: DEFAULT_DURATION,
      endTime: endTimeFor(DEFAULT_START, DEFAULT_DURATION),
    }
  }
  const start = new Date(event.start)
  const p = zonedParts(start)
  const time = `${pad(p.hour)}:${pad(p.minute)}`
  const duration = Math.round((Date.parse(event.end) - start.getTime()) / 60_000)
  return {
    ...base,
    allDay: false,
    date: dayOf(start),
    endDate: dayOf(start),
    time,
    duration,
    endTime: endTimeFor(time, duration),
  }
}

/** Fehlermeldung für die Eingaben oder `null`, wenn sie gespeichert werden können. */
export function validateForm(form: EventForm): string | null {
  if (form.title.trim() === '') return 'Bitte einen Titel angeben.'
  if (!DAY.test(form.date)) return 'Bitte ein Datum angeben.'
  if (form.allDay) {
    if (!DAY.test(form.endDate)) return 'Bitte ein Enddatum angeben.'
    return form.endDate < form.date ? ALL_DAY_END_BEFORE_START : recurrenceProblem(form)
  }
  if (!TIME.test(form.time) || !TIME.test(form.endTime)) return 'Bitte Beginn und Ende angeben.'
  if (form.duration <= 0) return END_BEFORE_START
  return recurrenceProblem(form)
}

function recurrenceProblem(form: EventForm): string | null {
  const { recurrence } = form
  if (recurrence.freq === 'custom' || recurrence.freq === 'none') return null
  const { end } = recurrence
  if (end.type === 'until') {
    if (!DAY.test(end.date)) return 'Bitte ein Enddatum für die Wiederholung angeben.'
    return end.date < form.date ? REPEAT_END_BEFORE_START : null
  }
  if (end.type === 'count' && !(Number.isInteger(end.count) && end.count >= 1)) {
    return REPEAT_COUNT_INVALID
  }
  return null
}

/** Werte für `saveEvent`; nur nach erfolgreicher `validateForm` aufrufen. */
export function valuesFromForm(form: EventForm): EventFormValues {
  const base = {
    title: form.title.trim(),
    location: form.location.trim(),
    note: form.note,
    recurrence: form.recurrence,
  }
  if (form.allDay) {
    return {
      ...base,
      timing: { allDay: true, startDate: form.date, endDate: shiftDay(form.endDate, 1) },
    }
  }
  const [year, month, day] = form.date.split('-').map(Number)
  const start = zonedToDate(year, month, day, 0, timeToMinutes(form.time))
  return { ...base, timing: { allDay: false, start: toIso(start), durationMin: form.duration } }
}
