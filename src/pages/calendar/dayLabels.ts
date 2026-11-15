import { zonedToDate } from '../../lib/planning'
import { TIME_ZONE, zonedParts } from '../../lib/time'

const WEEKDAY = new Intl.DateTimeFormat('de-DE', { timeZone: TIME_ZONE, weekday: 'short' })
const FULL = new Intl.DateTimeFormat('de-DE', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const TIME = new Intl.DateTimeFormat('de-DE', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Mittag des Kalendertags `YYYY-MM-DD` (Berlin) als Anker für die Ansicht. */
export function dayToAnchor(day: string): Date {
  const [year, month, d] = day.split('-').map(Number)
  return zonedToDate(year, month, d, 12, 0)
}

/** Kurzkopf einer Spalte, z. B. „Mo 12.". */
export function dayShortLabel(day: string): string {
  const date = dayToAnchor(day)
  return `${WEEKDAY.format(date).replace('.', '')} ${zonedParts(date).day}.`
}

/** Voller Tagesname für Screenreader, z. B. „Montag, 12. Oktober 2026". */
export function dayFullLabel(day: string): string {
  return FULL.format(dayToAnchor(day))
}

/** Uhrzeit „HH:MM" in Berlin. */
export function clockLabel(iso: string): string {
  return TIME.format(new Date(iso))
}

/** „HH:MM" aus Minuten seit Tagesbeginn. */
export function minutesLabel(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0')
  const mm = String(minutes % 60).padStart(2, '0')
  return `${hh}:${mm}`
}
