import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GoogleError } from './types'

const SECRET = 'ya29.GEHEIMES-TOKEN-xyz'

const authMocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  discardToken: vi.fn(),
  getAccountName: vi.fn(),
  setAccountName: vi.fn(),
}))
vi.mock('./auth', () => authMocks)

import { createEvent, deleteEvent, getCalendarName, listEvents, updateEventTime } from './calendar'

const fetchMock = vi.fn()

function reply(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status })
}

beforeEach(() => {
  fetchMock.mockReset()
  authMocks.getAccessToken.mockReset().mockResolvedValue(SECRET)
  authMocks.discardToken.mockReset()
  authMocks.getAccountName.mockReset().mockReturnValue(null)
  authMocks.setAccountName.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary'
const NEW_EVENT = {
  title: 'x',
  start: '2026-10-20T09:00:00+02:00',
  durationMin: 15,
  itemId: 'i',
}

describe('google/calendar', () => {
  it('createEvent: POST mit Zeitzone, Ende = Start + Dauer und extendedProperties', async () => {
    fetchMock.mockResolvedValue(reply(200, { id: 'ev1' }))
    const id = await createEvent({
      title: 'Zahnarzt',
      start: '2026-10-20T09:30:00+02:00',
      durationMin: 45,
      itemId: 'item-1',
    })
    expect(id).toBe('ev1')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/events`)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`)
    expect(JSON.parse(init.body as string)).toEqual({
      summary: 'Zahnarzt',
      description: 'Erstellt mit SecondBrain',
      start: { dateTime: '2026-10-20T09:30:00+02:00', timeZone: 'Europe/Berlin' },
      end: { dateTime: '2026-10-20T10:15:00+02:00', timeZone: 'Europe/Berlin' },
      extendedProperties: { private: { secondbrainId: 'item-1' } },
    })
  })

  it('listEvents merkt summary, wenn es eine E-Mail ist', async () => {
    fetchMock.mockResolvedValue(reply(200, { summary: 'alex@example.com', items: [] }))
    await listEvents('a', 'b')
    expect(authMocks.setAccountName).toHaveBeenCalledWith('alex@example.com')
  })

  it('listEvents merkt nichts, wenn summary keine E-Mail ist oder fehlt', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { summary: 'Mein Kalender', items: [] }))
    await listEvents('a', 'b')
    fetchMock.mockResolvedValueOnce(reply(200, { items: [] }))
    await listEvents('a', 'b')
    expect(authMocks.setAccountName).not.toHaveBeenCalled()
  })

  it('createEvent merkt organizer.email nur ohne vorhandenes Konto', async () => {
    fetchMock.mockResolvedValue(reply(200, { id: 'ev1', organizer: { email: 'alex@example.com' } }))
    await createEvent(NEW_EVENT)
    expect(authMocks.setAccountName).toHaveBeenCalledWith('alex@example.com')

    fetchMock.mockResolvedValue(reply(200, { id: 'ev1', organizer: { email: 'alex@example.com' } }))
    authMocks.setAccountName.mockClear()
    authMocks.getAccountName.mockReturnValue('anderes@example.com')
    await createEvent(NEW_EVENT)
    expect(authMocks.setAccountName).not.toHaveBeenCalled()
  })

  it('createEvent nutzt creator.email als Fallback', async () => {
    fetchMock.mockResolvedValue(reply(200, { id: 'ev1', creator: { email: 'c@example.com' } }))
    await createEvent(NEW_EVENT)
    expect(authMocks.setAccountName).toHaveBeenCalledWith('c@example.com')
  })

  it('updateEventTime: PATCH; 404 und 410 werden zu notFound', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { id: 'ev1' }))
    await updateEventTime('ev1', '2026-10-20T09:00:00+02:00', 30)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/events/ev1`)
    expect(init.method).toBe('PATCH')
    const body = JSON.parse(init.body as string) as { end: { dateTime: string } }
    expect(body.end.dateTime).toBe('2026-10-20T09:30:00+02:00')

    for (const status of [404, 410]) {
      fetchMock.mockResolvedValueOnce(reply(status))
      await expect(updateEventTime('ev1', '2026-10-20T09:00:00+02:00', 30)).rejects.toMatchObject({
        kind: 'notFound',
      })
    }
  })

  it('deleteEvent: DELETE; 404/410 gelten als Erfolg, andere Fehler nicht', async () => {
    fetchMock.mockResolvedValueOnce(reply(204))
    await deleteEvent('ev1')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${BASE}/events/ev1`)
    expect(init.method).toBe('DELETE')
    fetchMock.mockResolvedValueOnce(reply(404))
    await deleteEvent('ev1')
    fetchMock.mockResolvedValueOnce(reply(410))
    await deleteEvent('ev1')
    fetchMock.mockResolvedValueOnce(reply(500))
    await expect(deleteEvent('ev1')).rejects.toMatchObject({ kind: 'server' })
  })

  it('listEvents: GET mit singleEvents und orderBy', async () => {
    fetchMock.mockResolvedValue(
      reply(200, {
        items: [
          { id: 'a', summary: 'Treffen', start: { dateTime: 'x' }, end: { dateTime: 'y' } },
          { nope: true },
        ],
      }),
    )
    const events = await listEvents('2026-10-20T00:00:00+02:00', '2026-10-21T00:00:00+02:00')
    expect(events).toEqual([
      {
        id: 'a',
        title: 'Treffen',
        start: 'x',
        end: 'y',
        allDay: false,
        organizerSelf: true,
        hasGuests: false,
        editable: true,
      },
    ])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const parsed = new URL(url)
    expect(parsed.pathname).toBe('/calendar/v3/calendars/primary/events')
    expect(parsed.searchParams.get('singleEvents')).toBe('true')
    expect(parsed.searchParams.get('orderBy')).toBe('startTime')
    expect(parsed.searchParams.get('timeMin')).toBe('2026-10-20T00:00:00+02:00')
    expect(init.method).toBe('GET')
  })

  it('listEvents: erkennt freie (transparente) und selbst abgelehnte Termine', async () => {
    fetchMock.mockResolvedValue(
      reply(200, {
        items: [
          {
            id: 'f',
            transparency: 'transparent',
            start: { dateTime: 's' },
            end: { dateTime: 'e' },
          },
          {
            id: 'd',
            attendees: [{ self: true, responseStatus: 'declined' }],
            start: { dateTime: 's' },
            end: { dateTime: 'e' },
          },
        ],
      }),
    )
    const events = await listEvents('2026-10-20T00:00:00+02:00', '2026-10-25T00:00:00+02:00')
    expect(events[0]).toMatchObject({ id: 'f', transparent: true })
    expect(events[1]).toMatchObject({ id: 'd', declined: true })
  })

  it('listEvents: setzt allDay, folgt nextPageToken und lässt abgesagte Termine weg', async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply(200, {
          nextPageToken: 'p2',
          items: [
            {
              id: 'a',
              summary: 'Urlaub',
              start: { date: '2026-10-20' },
              end: { date: '2026-10-22' },
            },
            { id: 'c', status: 'cancelled', start: { dateTime: 'x' }, end: { dateTime: 'y' } },
          ],
        }),
      )
      .mockResolvedValueOnce(
        reply(200, { items: [{ id: 'b', start: { dateTime: 's' }, end: { dateTime: 'e' } }] }),
      )
    const events = await listEvents('2026-10-20T00:00:00+02:00', '2026-10-25T00:00:00+02:00')
    expect(events).toEqual([
      {
        id: 'a',
        title: 'Urlaub',
        start: '2026-10-20',
        end: '2026-10-22',
        allDay: true,
        startDate: '2026-10-20',
        endDate: '2026-10-22',
        organizerSelf: true,
        hasGuests: false,
        editable: true,
      },
      {
        id: 'b',
        title: '',
        start: 's',
        end: 'e',
        allDay: false,
        organizerSelf: true,
        hasGuests: false,
        editable: true,
      },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const first = new URL((fetchMock.mock.calls[0] as [string])[0])
    const second = new URL((fetchMock.mock.calls[1] as [string])[0])
    expect(first.searchParams.get('maxResults')).toBe('250')
    expect(first.searchParams.get('pageToken')).toBeNull()
    expect(second.searchParams.get('pageToken')).toBe('p2')
  })

  it('listEvents: interactive false fordert das Token nicht interaktiv an', async () => {
    fetchMock.mockResolvedValue(reply(200, { items: [] }))
    await listEvents('a', 'b', { interactive: false })
    expect(authMocks.getAccessToken).toHaveBeenCalledWith({ interactive: false })
  })

  it('getCalendarName liest summary aus events.list?maxResults=1', async () => {
    fetchMock.mockResolvedValue(reply(200, { summary: 'alex@example.com', items: [] }))
    expect(await getCalendarName()).toBe('alex@example.com')
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(`${BASE}/events?maxResults=1`)
  })

  it('401: verwirft das Token, wirft unauthorized und fragt nicht erneut an', async () => {
    fetchMock.mockResolvedValue(reply(401))
    const error: unknown = await createEvent(NEW_EVENT).catch((e: unknown) => e)
    expect(error).toMatchObject({
      kind: 'unauthorized',
      message: 'Google-Verbindung abgelaufen – bitte erneut versuchen.',
    })
    expect(authMocks.discardToken).toHaveBeenCalledTimes(1)
    expect(authMocks.getAccessToken).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await expect(deleteEvent('ev1')).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('ordnet Netz- und Statusfehler zu, ohne das Token preiszugeben', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(getCalendarName()).rejects.toMatchObject({ kind: 'offline' })
    fetchMock.mockResolvedValueOnce(reply(429))
    await expect(getCalendarName()).rejects.toMatchObject({ kind: 'rateLimit' })
    fetchMock.mockResolvedValueOnce(reply(503))
    const error: unknown = await getCalendarName().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GoogleError)
    expect(error).toMatchObject({ kind: 'server' })
    expect((error as Error).message).not.toContain(SECRET)
  })
})
