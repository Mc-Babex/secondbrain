import type { CalendarEvent } from '../google/types'
import { zonedToDate } from './planning'
import { TIME_ZONE, toIso, zonedParts } from './time'

/** Minuten eines Tages. */
export const DAY_MINUTES = 24 * 60

export type ViewMode = 'tag' | 'woche'

export interface ViewRange {
  /** Kalendertage `YYYY-MM-DD`. */
  days: string[]
  timeMin: string
  timeMax: string
}

export interface LaidOutEvent {
  event: CalendarEvent
  startMin: number
  endMin: number
  column: number
  columns: number
}

const MIN_DURATION_MIN = 15
const DAY_MIN = 24 * 60

const pad = (n: number): string => String(n).padStart(2, '0')

interface DayParts {
  year: number
  month: number
  day: number
}

function parseDay(day: string): DayParts {
  const [year, month, d] = day.split('-').map(Number)
  return { year, month, day: d }
}

/** Kalendertag plus Tage (UTC-Rechnung, daher unabhängig von der Zeitumstellung). */
function addDays(parts: DayParts, delta: number): DayParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + delta))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

function formatDay(parts: DayParts): string {
  return `${String(parts.year).padStart(4, '0')}-${pad(parts.month)}-${pad(parts.day)}`
}

function dayStart(parts: DayParts): Date {
  return zonedToDate(parts.year, parts.month, parts.day, 0, 0)
}

export function viewRange(anchor: Date, mode: ViewMode): ViewRange {
  const p = zonedParts(anchor)
  let first: DayParts = { year: p.year, month: p.month, day: p.day }
  let count = 1
  if (mode === 'woche') {
    const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()
    first = addDays(first, -((weekday + 6) % 7))
    count = 7
  }
  const days = Array.from({ length: count }, (_, i) => formatDay(addDays(first, i)))
  return {
    days,
    timeMin: toIso(dayStart(first)),
    timeMax: toIso(dayStart(addDays(first, count))),
  }
}

/** Neuer Anker ± 1 Tag bzw. ± 7 Tage (kalendertreu, mittags, damit die Zeitumstellung nicht stört). */
export function shiftAnchor(anchor: Date, mode: ViewMode, step: -1 | 1): Date {
  const p = zonedParts(anchor)
  return zonedToDate(p.year, p.month, p.day + step * (mode === 'woche' ? 7 : 1), 12, 0)
}

function format(day: string, options: Intl.DateTimeFormatOptions): string {
  const { year, month, day: d } = parseDay(day)
  return new Intl.DateTimeFormat('de-DE', { timeZone: TIME_ZONE, ...options }).format(
    zonedToDate(year, month, d, 12, 0),
  )
}

export function rangeLabel(range: ViewRange, mode: ViewMode): string {
  const first = range.days[0]
  if (mode === 'tag') {
    return format(first, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }
  const last = range.days[range.days.length - 1]
  const a = parseDay(first)
  const b = parseDay(last)
  if (a.year === b.year && a.month === b.month) {
    return `${a.day}.–${format(last, { day: 'numeric', month: 'long', year: 'numeric' })}`
  }
  if (a.year === b.year) {
    return `${format(first, { day: 'numeric', month: 'long' })} – ${format(last, { day: 'numeric', month: 'long', year: 'numeric' })}`
  }
  const full: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
  return `${format(first, full)} – ${format(last, full)}`
}

/** Minuten (Wanduhr) eines Zeitpunkts innerhalb des Tages, außerhalb auf 0 bzw. 1440 begrenzt. */
function minutesOnDay(date: Date, start: Date, end: Date): number {
  if (date <= start) return 0
  if (date >= end) return DAY_MIN
  const p = zonedParts(date)
  return p.hour * 60 + p.minute
}

interface Placed {
  event: CalendarEvent
  startMin: number
  endMin: number
}

function placeOnDay(events: CalendarEvent[], day: string): Placed[] {
  const parts = parseDay(day)
  const start = dayStart(parts)
  const end = dayStart(addDays(parts, 1))
  const placed: Placed[] = []
  for (const event of events) {
    if (event.allDay) continue
    const s = new Date(event.start)
    const e = new Date(event.end)
    if (Number.isNaN(s.getTime())) continue
    const finish = Number.isNaN(e.getTime()) ? s : e
    const inside =
      finish.getTime() > s.getTime() ? finish > start && s < end : s >= start && s < end
    if (!inside) continue
    const startMin = minutesOnDay(s, start, end)
    const endMin = Math.min(
      DAY_MIN,
      Math.max(minutesOnDay(finish, start, end), startMin + MIN_DURATION_MIN),
    )
    placed.push({ event, startMin, endMin })
  }
  return placed.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
}

/** Zeitgebundene Termine eines Tages; Überlappende bekommen nebeneinanderliegende Spalten. */
export function layoutDay(events: CalendarEvent[], day: string): LaidOutEvent[] {
  const result: LaidOutEvent[] = []
  let group: { placed: Placed; column: number }[] = []
  let columnEnds: number[] = []
  let groupEnd = 0

  const flush = (): void => {
    for (const item of group) {
      result.push({ ...item.placed, column: item.column, columns: columnEnds.length })
    }
    group = []
    columnEnds = []
  }

  for (const placed of placeOnDay(events, day)) {
    if (group.length > 0 && placed.startMin >= groupEnd) flush()
    let column = columnEnds.findIndex((end) => end <= placed.startMin)
    if (column === -1) column = columnEnds.length
    columnEnds[column] = placed.endMin
    groupEnd = group.length === 0 ? placed.endMin : Math.max(groupEnd, placed.endMin)
    group.push({ placed, column })
  }
  flush()
  return result
}

/** Ganztägige Termine, die den Tag abdecken (Ende exklusiv laut Google). */
export function allDayEvents(events: CalendarEvent[], day: string): CalendarEvent[] {
  return events.filter(
    (event) =>
      event.allDay &&
      event.start <= day &&
      (event.end > event.start ? day < event.end : day === event.start),
  )
}

/** Minuten seit Tagesbeginn oder `null`, wenn `now` nicht an `day` liegt. */
export function nowMinutes(now: Date, day: string): number | null {
  const p = zonedParts(now)
  if (formatDay(p) !== day) return null
  return p.hour * 60 + p.minute
}
