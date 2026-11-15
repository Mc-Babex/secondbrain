import { zonedToDate } from '../lib/planning'
import { toIso, zonedParts } from '../lib/time'
import type { CalendarEvent } from './types'

type Fields = Record<string, unknown>

function asFields(value: unknown): Fields | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Fields)
    : null
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function eventTime(value: unknown): { time: string; allDay: boolean } {
  const fields = asFields(value)
  if (!fields) return { time: '', allDay: false }
  if (typeof fields.dateTime === 'string') return { time: fields.dateTime, allDay: false }
  return typeof fields.date === 'string'
    ? { time: fields.date, allDay: true }
    : { time: '', allDay: false }
}

function isDeclinedByMe(attendees: unknown): boolean {
  return (
    Array.isArray(attendees) &&
    attendees.some((a: unknown) => {
      const fields = asFields(a)
      return fields !== null && fields.self === true && fields.responseStatus === 'declined'
    })
  )
}

function hasOtherAttendees(attendees: unknown): boolean {
  return (
    Array.isArray(attendees) &&
    attendees.some((a: unknown) => {
      const fields = asFields(a)
      return fields !== null && fields.self !== true && fields.resource !== true
    })
  )
}

/** Ereignisarten, die Google selbst verwaltet (nur lesen). */
const READ_ONLY_TYPES = ['birthday', 'fromGmail', 'outOfOffice', 'focusTime', 'workingLocation']

function stringLines(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const lines = value.filter((line): line is string => typeof line === 'string')
  return lines.length > 0 ? lines : undefined
}

/** Prüft ein Google-Termin-Objekt an der Grenze; `null` bei fehlender ID oder abgesagtem Termin. */
export function parseEvent(raw: unknown): CalendarEvent | null {
  const fields = asFields(raw)
  if (!fields || typeof fields.id !== 'string' || fields.status === 'cancelled') return null
  const from = eventTime(fields.start)
  const to = eventTime(fields.end).time
  const organizer = asFields(fields.organizer)
  const organizerSelf = organizer === null || organizer.self === true
  const event: CalendarEvent = {
    id: fields.id,
    title: text(fields.summary) ?? '',
    start: from.time,
    end: to,
    allDay: from.allDay,
    organizerSelf,
    hasGuests: hasOtherAttendees(fields.attendees),
    editable: organizerSelf && !READ_ONLY_TYPES.includes(text(fields.eventType) ?? ''),
  }
  if (from.allDay) {
    event.startDate = from.time
    event.endDate = to
  }
  if (fields.transparency === 'transparent') event.transparent = true
  if (isDeclinedByMe(fields.attendees)) event.declined = true
  const location = text(fields.location)
  if (location !== undefined) event.location = location
  const description = text(fields.description)
  if (description !== undefined) event.description = description
  const recurringEventId = text(fields.recurringEventId)
  if (recurringEventId) event.recurringEventId = recurringEventId
  const recurrence = stringLines(fields.recurrence)
  if (recurrence) event.recurrence = recurrence
  return event
}

const MARK_LINE = /^Erstellt mit SecondBrain(?: \([^)\n]*\))?\s*$/
const ITEM_LINE = /^Eintrag: \S+\s*$/

export interface SplitDescription {
  /** Der Text des Nutzers ohne Markierung. */
  note: string
  /** Die SecondBrain-Markierung (eine oder zwei Zeilen) oder `null`. */
  marker: string | null
}

const HTML_HINT = /<br\s*\/?>|&nbsp;|<\/?(?:p|div)[\s>/]/i

/** HTML-Beschreibung (von Google-Oberflächen) als Text mit Zeilenumbrüchen. */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div)>/gi, '\n')
    .replace(/<(?:p|div)(?:\s[^>]*)?>/gi, '')
    .replace(/&nbsp;/gi, ' ')
}

const isBlank = (line: string): boolean => line.trim() === ''

/**
 * Trennt eine Termin-Beschreibung in Notiz und SecondBrain-Markierung
 * („Erstellt mit SecondBrain“, auch „… (Claude-Lauf)“, optional gefolgt von „Eintrag: <id>“; auch in
 * HTML-Form). Ohne Markierung bleibt die Beschreibung wortgetreu; sonst wird nur das Trennzeichen
 * (Leerzeilen) zwischen Notiz und Markierung entfernt.
 */
export function splitDescription(description: string | undefined): SplitDescription {
  const original = description ?? ''
  const text = (HTML_HINT.test(original) ? htmlToText(original) : original).replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const at = lines.findIndex((line) => MARK_LINE.test(line))
  if (at < 0) return { note: original, marker: null }
  const length = at + 1 < lines.length && ITEM_LINE.test(lines[at + 1]) ? 2 : 1
  const marker = lines
    .slice(at, at + length)
    .map((line) => line.trimEnd())
    .join('\n')
  const before = lines.slice(0, at)
  const after = lines.slice(at + length)
  while (before.length > 0 && isBlank(before[before.length - 1])) before.pop()
  // Nach der Markierung zählt nur der Trenner direkt dahinter; ein HTML-Absatzende hinterlässt eine leere Zeile.
  while (after.length > 0 && isBlank(after[0])) after.shift()
  while (after.length > 0 && isBlank(after[after.length - 1])) after.pop()
  return { note: [...before, ...after].join('\n'), marker }
}

/** Setzt Notiz und Markierung wieder zusammen; ohne Markierung bleibt die Notiz unverändert. */
export function joinDescription(note: string, marker: string | null): string {
  if (!marker) return note
  const trimmed = note.trim()
  return trimmed ? `${trimmed}\n\n${marker}` : marker
}

/**
 * Start und Ende der **Serie** aus einem geänderten Vorkommen: das Datum des Serienbeginns bleibt,
 * Uhrzeit (Berliner Wanduhrzeit, sommerzeitfest) und Dauer stammen vom Vorkommen.
 */
export function seriesTimesFromOccurrence(
  seriesStart: string,
  occurrenceStart: string,
  occurrenceEnd: string,
): { start: string; end: string } {
  const day = zonedParts(new Date(seriesStart))
  const time = zonedParts(new Date(occurrenceStart))
  const start = zonedToDate(day.year, day.month, day.day, time.hour, time.minute)
  const durationMs = new Date(occurrenceEnd).getTime() - new Date(occurrenceStart).getTime()
  return { start: toIso(start), end: toIso(new Date(start.getTime() + durationMs)) }
}
