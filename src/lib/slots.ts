import type { CalendarEvent } from '../google/types'
import { pauseForDuration, timeToMinutes, zonedToDate, type PlanningWindow } from './planning'
import { zonedParts } from './time'

export interface Interval {
  start: Date
  end: Date
}

const QUARTER_MIN = 15
const MINUTE_MS = 60_000

/** Berliner Wanduhrzeit (`YYYY-MM-DD`, `HH:MM`) als Zeitpunkt; sommerzeitfest. */
export function localToDate(date: string, time: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  return zonedToDate(year, month, day, hour, minute)
}

/** Nächste volle Viertelstunde; liegt `now` genau auf einer, ist es diese. */
export function nextQuarter(now: Date): Date {
  const quarterMs = QUARTER_MIN * MINUTE_MS
  return new Date(Math.ceil(now.getTime() / quarterMs) * quarterMs)
}

/** Beginn des Planungsfensters heute, falls es noch nicht begonnen hat, sonst morgen. */
export function dayStartFrom(now: Date, planningWindow: PlanningWindow): Date {
  const p = zonedParts(now)
  const startMin = timeToMinutes(planningWindow.start)
  const todayStart = zonedToDate(p.year, p.month, p.day, 0, startMin)
  if (now.getTime() < todayStart.getTime()) return todayStart
  return zonedToDate(p.year, p.month, p.day + 1, 0, startMin)
}

export interface FindSlotOptions {
  busy: readonly Interval[]
  window: PlanningWindow
  /** Pause im Planungsfenster: Der Block läuft nie hinein (außer bei Überlänge, SPEC §8.4). */
  pause?: PlanningWindow | null
  from: Date
  durationMin: number
  horizonDays?: number
  sameDayOnly?: boolean
}

const ceilToQuarter = (minutes: number): number => Math.ceil(minutes / QUARTER_MIN) * QUARTER_MIN

/**
 * Erster freier Start auf einer Viertelstunde ab `from`: Der Block liegt vollständig im
 * Planungsfenster seines Tages und überschneidet keinen belegten Zeitraum (Berühren ist frei).
 * Gesucht wird ab dem Kalendertag von `from` über `horizonDays` Tage (alle Wochentage).
 */
export function findSlot({
  busy,
  window: planningWindow,
  pause = null,
  from,
  durationMin,
  horizonDays = 14,
  sameDayOnly = false,
}: FindSlotOptions): Date | null {
  const p = zonedParts(from)
  const windowStart = ceilToQuarter(timeToMinutes(planningWindow.start))
  const windowEnd = timeToMinutes(planningWindow.end)
  const fromMinutes = ceilToQuarter(p.hour * 60 + p.minute + (p.second > 0 ? 1 : 0))
  const days = sameDayOnly ? 1 : horizonDays
  const activePause = pauseForDuration(planningWindow, pause, durationMin)
  const pauseStart = activePause ? timeToMinutes(activePause.start) : 0
  const pauseEnd = activePause ? timeToMinutes(activePause.end) : 0

  for (let day = 0; day < days; day++) {
    const first = day === 0 ? Math.max(windowStart, fromMinutes) : windowStart
    for (let minutes = first; minutes + durationMin <= windowEnd; minutes += QUARTER_MIN) {
      if (activePause && minutes < pauseEnd && minutes + durationMin > pauseStart) continue
      const start = zonedToDate(p.year, p.month, p.day + day, 0, minutes)
      const end = new Date(start.getTime() + durationMin * MINUTE_MS)
      const overlaps = busy.some((b) => start < b.end && end > b.start)
      if (!overlaps) return start
    }
  }
  return null
}

/** Parst Termin-Zeiten mit Offset; Zeiten ohne Offset gelten als Berliner Wanduhrzeit. */
function parseEventTime(value: string): Date {
  if (/([+-]\d{2}:\d{2}|Z)$/.test(value)) return new Date(value)
  return localToDate(value.slice(0, 10), value.slice(11, 16))
}

/**
 * Belegte Zeiträume aus Kalenderterminen: keine ganztägigen, „freien“ oder abgelehnten Termine;
 * `ignoreEventId` (der eigene alte Termin) zählt nicht als belegt.
 */
export function busyFromEvents(
  events: readonly CalendarEvent[],
  ignoreEventId?: string | null,
): Interval[] {
  const busy: Interval[] = []
  for (const e of events) {
    if (e.allDay || e.transparent || e.declined || e.id === ignoreEventId) continue
    const start = parseEventTime(e.start)
    const end = parseEventTime(e.end)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue
    busy.push({ start, end })
  }
  return busy
}

/**
 * Erster freier Slot ab dem Tagesanfang (Beginn des nächsten Planungsfensters, das noch nicht
 * begonnen hat), 14 Tage lang; `null`, wenn nichts frei ist.
 */
export function nextFreeSlotFromDayStart(options: {
  now: Date
  window: PlanningWindow
  pause?: PlanningWindow | null
  busy: readonly Interval[]
  durationMin: number
}): Date | null {
  const { now, window: planningWindow, pause, busy, durationMin } = options
  const from = dayStartFrom(now, planningWindow)
  return findSlot({ busy, window: planningWindow, pause, from, durationMin })
}
