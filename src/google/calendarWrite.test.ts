import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SECRET = 'ya29.GEHEIMES-TOKEN-xyz'

const authMocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  discardToken: vi.fn(),
  getAccountName: vi.fn(),
  setAccountName: vi.fn(),
}))
vi.mock('./auth', () => authMocks)

import {
  createCalendarEvent,
  deleteCalendarEvent,
  getEvent,
  getSeries,
  patchCalendarEvent,
} from './calendar'

const fetchMock = vi.fn()
const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary'
const OK = { id: 'ev1', summary: 'x', start: { date: '2026-10-20' }, end: { date: '2026-10-21' } }
const NONE = { sendUpdates: 'none' } as const

function reply(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status })
}

function lastCall(): { url: string; init: RequestInit; body: unknown } {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit]
  return { url, init, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined }
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

describe('createCalendarEvent', () => {
  it('POST mit Zeit, Ort, Notiz, Wiederholung und ausdrücklichem sendUpdates', async () => {
    fetchMock.mockResolvedValue(reply(200, { ...OK, id: 'neu' }))
    const event = await createCalendarEvent(
      {
        title: 'Runde',
        timing: { allDay: false, start: '2026-10-20T09:00:00+02:00', durationMin: 30 },
        location: 'Büro',
        description: 'Notiz',
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
      },
      NONE,
    )
    expect(event.id).toBe('neu')
    const { url, init, body } = lastCall()
    expect(url).toBe(`${BASE}/events?sendUpdates=none`)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`)
    expect(body).toEqual({
      summary: 'Runde',
      start: { dateTime: '2026-10-20T09:00:00+02:00', timeZone: 'Europe/Berlin' },
      end: { dateTime: '2026-10-20T09:30:00+02:00', timeZone: 'Europe/Berlin' },
      location: 'Büro',
      description: 'Notiz',
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
    })
  })

  it('ganztägig mit date und sendUpdates=all, ohne leere Felder', async () => {
    fetchMock.mockResolvedValue(reply(200, OK))
    await createCalendarEvent(
      { title: 'Urlaub', timing: { allDay: true, startDate: '2026-10-20', endDate: '2026-10-22' } },
      { sendUpdates: 'all' },
    )
    const { url, body } = lastCall()
    expect(url).toBe(`${BASE}/events?sendUpdates=all`)
    expect(body).toEqual({
      summary: 'Urlaub',
      start: { date: '2026-10-20' },
      end: { date: '2026-10-22' },
    })
  })

  it('unlesbare Antwort ergibt server', async () => {
    fetchMock.mockResolvedValue(reply(200, { summary: 'ohne id' }))
    await expect(
      createCalendarEvent(
        { title: 'x', timing: { allDay: true, startDate: 'a', endDate: 'b' } },
        NONE,
      ),
    ).rejects.toMatchObject({ kind: 'server' })
  })
})

describe('patchCalendarEvent', () => {
  it('sendet nur geänderte Felder', async () => {
    fetchMock.mockResolvedValue(reply(200, OK))
    await patchCalendarEvent('ev1', { title: 'Neu' }, NONE)
    const { url, init, body } = lastCall()
    expect(url).toBe(`${BASE}/events/ev1?sendUpdates=none`)
    expect(init.method).toBe('PATCH')
    expect(body).toEqual({ summary: 'Neu' })
  })

  it('Ort und Notiz leeren, Wiederholung ersetzen', async () => {
    fetchMock.mockResolvedValue(reply(200, OK))
    await patchCalendarEvent(
      'ev1',
      { location: '', description: '', recurrence: [] },
      { sendUpdates: 'all' },
    )
    expect(lastCall().body).toEqual({ location: '', description: '', recurrence: [] })
    expect(lastCall().url).toContain('sendUpdates=all')
  })

  it('Wechsel ganztägig zu mit Uhrzeit leert date', async () => {
    fetchMock.mockResolvedValue(reply(200, OK))
    await patchCalendarEvent(
      'ev1',
      { timing: { allDay: false, start: '2026-10-20T09:00:00+02:00', durationMin: 60 } },
      NONE,
    )
    expect(lastCall().body).toEqual({
      start: { dateTime: '2026-10-20T09:00:00+02:00', timeZone: 'Europe/Berlin', date: null },
      end: { dateTime: '2026-10-20T10:00:00+02:00', timeZone: 'Europe/Berlin', date: null },
    })
  })

  it('Wechsel mit Uhrzeit zu ganztägig leert dateTime', async () => {
    fetchMock.mockResolvedValue(reply(200, OK))
    await patchCalendarEvent(
      'ev1',
      { timing: { allDay: true, startDate: '2026-10-20', endDate: '2026-10-21' } },
      NONE,
    )
    expect(lastCall().body).toEqual({
      start: { date: '2026-10-20', dateTime: null },
      end: { date: '2026-10-21', dateTime: null },
    })
  })

  it('wasAllDay: date/dateTime werden nur bei echtem Wechsel geleert', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(reply(200, OK)))
    await patchCalendarEvent(
      'ev1',
      {
        wasAllDay: false,
        timing: { allDay: false, start: '2026-10-20T09:00:00+02:00', durationMin: 60 },
      },
      NONE,
    )
    expect(lastCall().body).toEqual({
      start: { dateTime: '2026-10-20T09:00:00+02:00', timeZone: 'Europe/Berlin' },
      end: { dateTime: '2026-10-20T10:00:00+02:00', timeZone: 'Europe/Berlin' },
    })
    await patchCalendarEvent(
      'ev1',
      { wasAllDay: true, timing: { allDay: true, startDate: '2026-10-20', endDate: '2026-10-21' } },
      NONE,
    )
    expect(lastCall().body).toEqual({ start: { date: '2026-10-20' }, end: { date: '2026-10-21' } })
  })

  it('404/410 notFound, 429 rateLimit, offline offline', async () => {
    fetchMock.mockResolvedValueOnce(reply(404))
    await expect(patchCalendarEvent('e', { title: 'x' }, NONE)).rejects.toMatchObject({
      kind: 'notFound',
    })
    fetchMock.mockResolvedValueOnce(reply(410))
    await expect(patchCalendarEvent('e', { title: 'x' }, NONE)).rejects.toMatchObject({
      kind: 'notFound',
    })
    fetchMock.mockResolvedValueOnce(reply(429))
    await expect(patchCalendarEvent('e', { title: 'x' }, NONE)).rejects.toMatchObject({
      kind: 'rateLimit',
    })
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(patchCalendarEvent('e', { title: 'x' }, NONE)).rejects.toMatchObject({
      kind: 'offline',
    })
  })

  it('401 verwirft das Token; kein Token in der Fehlermeldung', async () => {
    fetchMock.mockResolvedValue(reply(401))
    const error = await patchCalendarEvent('e', { title: 'x' }, NONE).catch((e: Error) => e)
    expect(authMocks.discardToken).toHaveBeenCalled()
    expect((error as Error).message).not.toContain(SECRET)
  })

  it('interactive: false wird an die Token-Anfrage weitergereicht', async () => {
    fetchMock.mockResolvedValue(reply(200, OK))
    await patchCalendarEvent('e', { title: 'x' }, { sendUpdates: 'none', interactive: false })
    expect(authMocks.getAccessToken).toHaveBeenCalledWith({ interactive: false })
  })
})

describe('deleteCalendarEvent', () => {
  it('DELETE mit sendUpdates und ID eines Vorkommens', async () => {
    fetchMock.mockResolvedValue(reply(204))
    await deleteCalendarEvent('serie1_20261020T120000Z', { sendUpdates: 'all' })
    const { url, init } = lastCall()
    expect(url).toBe(`${BASE}/events/serie1_20261020T120000Z?sendUpdates=all`)
    expect(init.method).toBe('DELETE')
  })

  it('404/410 notFound, offline offline', async () => {
    fetchMock.mockResolvedValueOnce(reply(404))
    await expect(deleteCalendarEvent('e', NONE)).rejects.toMatchObject({ kind: 'notFound' })
    fetchMock.mockResolvedValueOnce(reply(410))
    await expect(deleteCalendarEvent('e', NONE)).rejects.toMatchObject({ kind: 'notFound' })
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    await expect(deleteCalendarEvent('e', NONE)).rejects.toMatchObject({ kind: 'offline' })
  })
})

describe('getEvent / getSeries', () => {
  it('GET liest Vorkommen und Serie', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(200, { ...OK, id: 's_20261020T120000Z', recurringEventId: 's' }),
    )
    expect((await getEvent('s_20261020T120000Z')).recurringEventId).toBe('s')
    expect(lastCall().url).toBe(`${BASE}/events/s_20261020T120000Z`)
    expect(lastCall().init.method).toBe('GET')

    fetchMock.mockResolvedValueOnce(
      reply(200, { ...OK, id: 's', recurrence: ['RRULE:FREQ=DAILY'] }),
    )
    expect((await getSeries('s')).recurrence).toEqual(['RRULE:FREQ=DAILY'])
  })

  it('404 und abgesagter Termin ergeben notFound', async () => {
    fetchMock.mockResolvedValueOnce(reply(404))
    await expect(getEvent('x')).rejects.toMatchObject({ kind: 'notFound' })
    fetchMock.mockResolvedValueOnce(reply(200, { ...OK, status: 'cancelled' }))
    await expect(getEvent('x')).rejects.toMatchObject({ kind: 'notFound' })
  })
})
