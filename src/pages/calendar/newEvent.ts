import { DAY_MINUTES } from '../../lib/calendarView'
import { zonedParts } from '../../lib/time'
import { blankForm, type EventForm } from './eventForm'
import { minutesLabel } from './dayLabels'

const QUARTER = 15
const LAST_QUARTER = DAY_MINUTES - QUARTER

const pad = (n: number): string => String(n).padStart(2, '0')

/** Tag `YYYY-MM-DD` (Berlin) eines Zeitpunkts. */
export function dayOfDate(date: Date): string {
  const p = zonedParts(date)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/**
 * Vorgabe für „+“: heute die nächste volle Viertelstunde ab jetzt (spätestens 23:45),
 * an einem anderen Tag der Beginn des Planungsfensters.
 */
export function plusDraft(day: string, now: Date, planningStartMin: number): EventForm {
  if (day !== dayOfDate(now)) return blankForm(day, minutesLabel(planningStartMin))
  const p = zonedParts(now)
  const minutes = Math.ceil((p.hour * 60 + p.minute) / QUARTER) * QUARTER
  return blankForm(day, minutesLabel(Math.min(minutes, LAST_QUARTER)))
}

/** Beginn (Minuten ab 0 Uhr) der Viertelstunde, abgerundet, an der Stelle `fraction` (0–1) des Tages. */
export function quarterStartMin(fraction: number): number {
  const minutes = Math.floor((fraction * DAY_MINUTES) / QUARTER) * QUARTER
  return Math.min(Math.max(minutes, 0), LAST_QUARTER)
}

/** Vorgabe für langes Drücken/Ziehen auf freie Zeit: Beginn `startMin` (Minuten ab 0 Uhr) am Tag `day`. */
export function holdDraftAt(day: string, startMin: number): EventForm {
  return blankForm(day, minutesLabel(startMin))
}
