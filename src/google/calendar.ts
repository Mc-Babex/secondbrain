import { TIME_ZONE, toIso } from '../lib/time'
import { discardToken, getAccessToken, getAccountName, setAccountName } from './auth'
import { isEmail } from './email'
import { parseEvent } from './events'
import {
  GoogleError,
  type CalendarEvent,
  type CalendarEventChanges,
  type EventTiming,
  type NewCalendarEvent,
  type NewEvent,
  type SendUpdates,
} from './types'

const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary'

function timePart(date: Date): { dateTime: string; timeZone: string } {
  return { dateTime: toIso(date), timeZone: TIME_ZONE }
}

function timeBody(start: string, durationMin: number) {
  const begin = new Date(start)
  const end = new Date(begin.getTime() + durationMin * 60_000)
  return { start: timePart(begin), end: timePart(end) }
}

function errorFor(status: number): GoogleError {
  if (status === 401) return new GoogleError('unauthorized')
  if (status === 404 || status === 410) return new GoogleError('notFound')
  if (status === 429) return new GoogleError('rateLimit')
  return new GoogleError('server')
}

async function send(url: string, method: string, body: unknown, token: string): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  try {
    return await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new GoogleError('offline')
  }
}

/** Anfrage mit Bearer-Token; bei 401 Token verwerfen (neue Anfrage erst beim nächsten Klick). */
async function request(
  path: string,
  method: string,
  body?: unknown,
  interactive = true,
): Promise<Response> {
  const url = `${BASE}${path}`
  const response = await send(url, method, body, await getAccessToken({ interactive }))
  if (response.status === 401) {
    discardToken()
    throw new GoogleError('unauthorized')
  }
  return response
}

async function json(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) throw errorFor(response.status)
  try {
    const data: unknown = await response.json()
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      return data as Record<string, unknown>
    }
  } catch {
    // Unlesbare Antwort wird unten als Serverfehler gemeldet.
  }
  throw new GoogleError('server')
}

/** Merkt das Konto für den Anmeldehinweis; ein vorhandenes Konto wird nur mit `overwrite` ersetzt. */
function rememberAccount(email: unknown, overwrite: boolean): void {
  if (!isEmail(email)) return
  const current = getAccountName()
  if (current === email || (current && !overwrite)) return
  setAccountName(email)
}

function personEmail(value: unknown): unknown {
  return typeof value === 'object' && value !== null ? (value as { email?: unknown }).email : null
}

function rememberEventOwner(data: Record<string, unknown>): void {
  rememberAccount(personEmail(data.organizer) ?? personEmail(data.creator), false)
}

export async function createEvent(
  event: NewEvent,
  options: { interactive: boolean } = { interactive: true },
): Promise<string> {
  const data = await json(
    await request(
      '/events',
      'POST',
      {
        summary: event.title,
        description: 'Erstellt mit SecondBrain',
        ...timeBody(event.start, event.durationMin),
        extendedProperties: { private: { secondbrainId: event.itemId } },
      },
      options.interactive,
    ),
  )
  if (typeof data.id !== 'string') throw new GoogleError('server')
  rememberEventOwner(data)
  return data.id
}

export async function updateEventTime(
  eventId: string,
  start: string,
  durationMin: number,
): Promise<void> {
  const data = await json(
    await request(`/events/${encodeURIComponent(eventId)}`, 'PATCH', timeBody(start, durationMin)),
  )
  rememberEventOwner(data)
}

/**
 * 404/410 gelten als Erfolg (Termin ist bereits weg). `interactive: false` erneuert das Token nur still
 * (kein Popup ohne Nutzeraktion).
 */
export async function deleteEvent(
  eventId: string,
  options: { interactive: boolean } = { interactive: true },
): Promise<void> {
  const response = await request(
    `/events/${encodeURIComponent(eventId)}`,
    'DELETE',
    undefined,
    options.interactive,
  )
  if (response.ok || response.status === 404 || response.status === 410) return
  throw errorFor(response.status)
}

/** `interactive: false` erneuert das Token nur still (kein Popup ohne Nutzeraktion). */
export async function listEvents(
  timeMin: string,
  timeMax: string,
  options: { interactive: boolean } = { interactive: true },
): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = []
  let pageToken: string | undefined
  do {
    const query = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      timeZone: TIME_ZONE,
      maxResults: '250',
    })
    if (pageToken) query.set('pageToken', pageToken)
    const data = await json(
      await request(`/events?${query.toString()}`, 'GET', undefined, options.interactive),
    )
    if (!pageToken) rememberAccount(data.summary, true)
    const items = Array.isArray(data.items) ? (data.items as unknown[]) : []
    events.push(...items.flatMap((raw) => parseEvent(raw) ?? []))
    pageToken = typeof data.nextPageToken === 'string' ? data.nextPageToken : undefined
  } while (pageToken)
  return events
}

/** Name des primären Kalenders (dient als Kontoanzeige). */
export async function getCalendarName(): Promise<string> {
  const data = await json(await request('/events?maxResults=1', 'GET'))
  return typeof data.summary === 'string' ? data.summary : 'Google Kalender'
}

interface WriteOptions {
  sendUpdates: SendUpdates
  interactive?: boolean
}

function eventPath(eventId: string, sendUpdates?: SendUpdates): string {
  const base = `/events/${encodeURIComponent(eventId)}`
  return sendUpdates ? `${base}?sendUpdates=${sendUpdates}` : base
}

function timingBody(timing: EventTiming, switching: boolean) {
  if (timing.allDay) {
    const clear = switching ? { dateTime: null } : {}
    return {
      start: { date: timing.startDate, ...clear },
      end: { date: timing.endDate, ...clear },
    }
  }
  const body = timeBody(timing.start, timing.durationMin)
  if (!switching) return body
  return { start: { ...body.start, date: null }, end: { ...body.end, date: null } }
}

async function eventFrom(response: Response): Promise<CalendarEvent> {
  const data = await json(response)
  const event = parseEvent(data)
  if (!event) throw new GoogleError(data.status === 'cancelled' ? 'notFound' : 'server')
  rememberEventOwner(data)
  return event
}

/** Liest einen Termin (Vorkommen oder Serie). */
export async function getEvent(
  eventId: string,
  options: { interactive?: boolean } = {},
): Promise<CalendarEvent> {
  return eventFrom(await request(eventPath(eventId), 'GET', undefined, options.interactive ?? true))
}

/** Liest die Serie (mit `recurrence`) zu einer Serien-ID. */
export async function getSeries(
  recurringEventId: string,
  options: { interactive?: boolean } = {},
): Promise<CalendarEvent> {
  return getEvent(recurringEventId, options)
}

/** Legt einen Termin an (ohne SecondBrain-Eintrag); gibt den angelegten Termin zurück. */
export async function createCalendarEvent(
  input: NewCalendarEvent,
  options: WriteOptions,
): Promise<CalendarEvent> {
  const body: Record<string, unknown> = { summary: input.title, ...timingBody(input.timing, false) }
  if (input.location) body.location = input.location
  if (input.description) body.description = input.description
  if (input.recurrence && input.recurrence.length > 0) body.recurrence = input.recurrence
  return eventFrom(
    await request(
      `/events?sendUpdates=${options.sendUpdates}`,
      'POST',
      body,
      options.interactive ?? true,
    ),
  )
}

/**
 * Ändert nur die übergebenen Felder (PATCH). Beim Wechsel zwischen ganztägig und mit Uhrzeit
 * wird das jeweils andere Feld (`date` bzw. `dateTime`) ausdrücklich geleert.
 */
export async function patchCalendarEvent(
  eventId: string,
  changes: CalendarEventChanges,
  options: WriteOptions,
): Promise<CalendarEvent> {
  const body: Record<string, unknown> = {}
  if (changes.title !== undefined) body.summary = changes.title
  if (changes.location !== undefined) body.location = changes.location
  if (changes.description !== undefined) body.description = changes.description
  if (changes.recurrence !== undefined) body.recurrence = changes.recurrence
  if (changes.timing) {
    const switching = changes.wasAllDay === undefined || changes.wasAllDay !== changes.timing.allDay
    Object.assign(body, timingBody(changes.timing, switching))
  }
  return eventFrom(
    await request(
      eventPath(eventId, options.sendUpdates),
      'PATCH',
      body,
      options.interactive ?? true,
    ),
  )
}

/**
 * Löscht einen Termin (Vorkommen oder Serie); 404/410 ⇒ `notFound`. Der Aufrufer behandelt `notFound`
 * als „schon weg“ (Erfolg), anders als `deleteEvent`, das das selbst tut.
 */
export async function deleteCalendarEvent(eventId: string, options: WriteOptions): Promise<void> {
  const response = await request(
    eventPath(eventId, options.sendUpdates),
    'DELETE',
    undefined,
    options.interactive ?? true,
  )
  if (!response.ok) throw errorFor(response.status)
}
