import { vi } from 'vitest'
import { deleteItem, updateItem } from '../data/repository'
import type { Item } from '../data/types'
import { fromRRule, NO_RECURRENCE, type Recurrence } from '../lib/recurrence'
import {
  buildChanges,
  createEvent,
  deleteEventAndLink,
  renameLinkedEvent,
  saveEvent,
  type EventFormValues,
} from './eventActions'
import { shiftDay } from './days'
import { GoogleError, type CalendarEvent } from './types'

const calendar = vi.hoisted(() => ({
  patchCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  createCalendarEvent: vi.fn(),
  getEvent: vi.fn(),
}))
const auth = vi.hoisted(() => ({ wasConnected: vi.fn() }))
vi.mock('./calendar', () => calendar)
vi.mock('./auth', () => auth)
vi.mock('../data/repository', () => ({ updateItem: vi.fn(), deleteItem: vi.fn() }))

const EVENT: CalendarEvent = {
  id: 'ev1',
  title: 'Zahnarzt',
  start: '2026-10-20T14:00:00+02:00',
  end: '2026-10-20T15:00:00+02:00',
  allDay: false,
  location: 'Praxis',
}

const SAME: EventFormValues = {
  title: 'Zahnarzt',
  location: 'Praxis',
  note: '',
  timing: { allDay: false, start: '2026-10-20T14:00:00+02:00', durationMin: 60 },
}

describe('shiftDay', () => {
  it('rechnet über Monats- und Jahresgrenzen', () => {
    expect(shiftDay('2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('buildChanges', () => {
  it('liefert null ohne Änderung', () => {
    expect(buildChanges(EVENT, SAME)).toBeNull()
  })

  it('erkennt gleiche Zeit in anderer Schreibweise des Offsets', () => {
    const event = { ...EVENT, start: '2026-10-20T12:00:00Z', end: '2026-10-20T13:00:00Z' }
    expect(buildChanges(event, SAME)).toBeNull()
  })

  it('lässt unveränderte HTML-Beschreibungen unangetastet', () => {
    const event = { ...EVENT, description: '<p>Hallo</p>' }
    expect(buildChanges(event, { ...SAME, note: '<p>Hallo</p>' })).toBeNull()
  })

  it('leert Ort und Notiz mit leerem Text', () => {
    const event = { ...EVENT, description: 'Text' }
    expect(buildChanges(event, { ...SAME, location: '', note: '' })).toEqual({
      location: '',
      description: '',
    })
  })
})

describe('renameLinkedEvent', () => {
  const item = {
    schedule: { start: EVENT.start, durationMin: 60, calendarEventId: 'ev1' },
  } as Parameters<typeof renameLinkedEvent>[0]

  it('tut ohne Termin nichts', async () => {
    const none = { schedule: null } as Parameters<typeof renameLinkedEvent>[0]
    expect(await renameLinkedEvent(none, 'Neu')).toBeNull()
  })

  it('ändert den Titel still, ohne Verbindung mit Hinweis', async () => {
    auth.wasConnected.mockReturnValue(true)
    calendar.getEvent.mockResolvedValue(EVENT)
    calendar.patchCalendarEvent.mockResolvedValue(EVENT)
    expect(await renameLinkedEvent(item, 'Neu')).toBeNull()
    auth.wasConnected.mockReturnValue(false)
    expect(await renameLinkedEvent(item, 'Neu')).toBe('Google nicht verbunden.')
  })
})

describe('renameLinkedEvent – Serientermin', () => {
  const item = {
    schedule: { start: EVENT.start, durationMin: 60, calendarEventId: 'ev1' },
  } as Parameters<typeof renameLinkedEvent>[0]

  beforeEach(() => {
    auth.wasConnected.mockReturnValue(true)
    calendar.patchCalendarEvent.mockClear()
  })

  it('ändert den Termintitel einer Serie nie und weist darauf hin', async () => {
    calendar.getEvent.mockResolvedValue({ ...EVENT, recurrence: ['RRULE:FREQ=WEEKLY'] })
    expect(await renameLinkedEvent(item, 'Neu')).toBe('Serientermin – im Kalender bearbeiten.')
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
  })

  it('ändert auch den Titel eines Vorkommens nicht', async () => {
    calendar.getEvent.mockResolvedValue({ ...EVENT, recurringEventId: 'serie' })
    expect(await renameLinkedEvent(item, 'Neu')).toMatch(/^Serientermin/)
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
  })

  it('lässt den Termin bei einem Fehler der Prüfung unverändert', async () => {
    calendar.getEvent.mockRejectedValue(new GoogleError('offline'))
    expect(await renameLinkedEvent(item, 'Neu')).toMatch(/nicht erreichbar/)
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
  })
})

describe('Wiederholung bei Einzelterminen', () => {
  it('buildChanges: neue Wiederholung ⇒ recurrence plus Zeit (mit Zeitzone)', () => {
    const recurrence: Recurrence = {
      freq: 'weekly',
      weekdays: ['MO', 'WE'],
      end: { type: 'until', date: '2026-12-18' },
    }
    expect(buildChanges(EVENT, { ...SAME, recurrence })).toEqual({
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261218T225959Z'],
      timing: SAME.timing,
      wasAllDay: false,
    })
  })

  it('buildChanges: ohne Wiederholung bleibt alles unverändert', () => {
    expect(buildChanges(EVENT, { ...SAME, recurrence: NO_RECURRENCE })).toBeNull()
  })

  it('buildChanges: Wiederholung entfernen ⇒ leere Liste', () => {
    const series = { ...EVENT, recurrence: ['RRULE:FREQ=DAILY'] }
    expect(buildChanges(series, { ...SAME, recurrence: NO_RECURRENCE })).toMatchObject({
      recurrence: [],
    })
  })

  it('createEvent: gibt die RRULE an Google weiter', async () => {
    await createEvent({
      ...SAME,
      recurrence: { freq: 'biweekly', weekdays: [], end: { type: 'count', count: 6 } },
    })
    expect(calendar.createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence: ['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;COUNT=6'],
      }),
      { sendUpdates: 'none' },
    )
  })

  it('createEvent: ohne Wiederholung kein recurrence-Feld', async () => {
    calendar.createCalendarEvent.mockClear()
    await createEvent({ ...SAME, recurrence: NO_RECURRENCE })
    expect(calendar.createCalendarEvent.mock.calls[0][0]).not.toHaveProperty('recurrence')
  })
})

describe('Serien speichern und löschen', () => {
  const SERIES: CalendarEvent = {
    ...EVENT,
    id: 'serie',
    start: '2026-10-06T14:00:00+02:00',
    end: '2026-10-06T15:00:00+02:00',
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
  }
  const OCCURRENCE: CalendarEvent = { ...EVENT, id: 'serie_20261020', recurringEventId: 'serie' }
  const weekly: Recurrence = { freq: 'weekly', weekdays: [], end: { type: 'never' } }
  const later: EventFormValues = {
    ...SAME,
    recurrence: weekly,
    timing: { allDay: false, start: '2026-10-20T15:30:00+02:00', durationMin: 90 },
  }
  const seriesItem = (calendarEventId: string) =>
    ({
      id: 'item1',
      title: 'Vorlesung',
      schedule: { start: SERIES.start, durationMin: 60, calendarEventId },
    }) as Item

  beforeEach(() => {
    calendar.patchCalendarEvent.mockReset().mockResolvedValue(EVENT)
    calendar.deleteCalendarEvent.mockReset().mockResolvedValue(undefined)
    vi.mocked(updateItem).mockReset()
    vi.mocked(deleteItem).mockReset()
  })

  it('„Nur dieser Termin“ ändert das Vorkommen, nicht die Serie und nicht den Serien-Eintrag', async () => {
    await saveEvent(OCCURRENCE, later, {
      sendUpdates: 'none',
      item: seriesItem('serie'),
      scope: 'occurrence',
      series: SERIES,
    })
    expect(calendar.patchCalendarEvent).toHaveBeenCalledTimes(1)
    expect(calendar.patchCalendarEvent).toHaveBeenCalledWith(
      'serie_20261020',
      { timing: later.timing, wasAllDay: false },
      { sendUpdates: 'none' },
    )
    expect(updateItem).not.toHaveBeenCalled()
  })

  it('„Ganze Serie“ ändert die Serie mit neuer Uhrzeit, das Seriendatum bleibt', async () => {
    await saveEvent(OCCURRENCE, later, {
      sendUpdates: 'all',
      item: null,
      scope: 'series',
      series: SERIES,
    })
    expect(calendar.patchCalendarEvent).toHaveBeenCalledTimes(1)
    expect(calendar.patchCalendarEvent).toHaveBeenCalledWith(
      'serie',
      {
        timing: { allDay: false, start: '2026-10-06T15:30:00+02:00', durationMin: 90 },
        wasAllDay: false,
      },
      { sendUpdates: 'all' },
    )
  })

  it('„Ganze Serie“ nur mit anderem Datum ändert die Serienzeit nicht', async () => {
    const moved: EventFormValues = {
      ...SAME,
      recurrence: weekly,
      timing: { allDay: false, start: '2026-10-22T14:00:00+02:00', durationMin: 60 },
    }
    await saveEvent(OCCURRENCE, moved, {
      sendUpdates: 'none',
      item: null,
      scope: 'series',
      series: SERIES,
    })
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
  })

  it('„Ganze Serie“ übernimmt Titel und Zeit in einen Eintrag, der an der Serie hängt', async () => {
    await saveEvent(
      OCCURRENCE,
      { ...later, title: 'Vorlesung 2' },
      { sendUpdates: 'none', item: seriesItem('serie'), scope: 'series', series: SERIES },
    )
    expect(updateItem).toHaveBeenCalledWith('item1', {
      title: 'Vorlesung 2',
      schedule: { start: '2026-10-06T15:30:00+02:00', durationMin: 90, calendarEventId: 'serie' },
      durationMin: 90,
    })
  })

  it('„Ganze Serie“ ohne geladene Serie wirft und ändert nichts', async () => {
    await expect(
      saveEvent(OCCURRENCE, later, { sendUpdates: 'none', item: null, scope: 'series' }),
    ).rejects.toThrow()
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
  })

  it('geänderte Wiederholung gilt nur bei „Ganze Serie“; „Nur dieser Termin“ lässt sie weg', async () => {
    const monthly: EventFormValues = {
      ...SAME,
      timing: { allDay: false, start: OCCURRENCE.start, durationMin: 60 },
      recurrence: { freq: 'monthly', weekdays: [], end: { type: 'never' } },
    }
    await saveEvent(OCCURRENCE, monthly, {
      sendUpdates: 'none',
      item: null,
      scope: 'occurrence',
      series: SERIES,
    })
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
    await saveEvent(OCCURRENCE, monthly, {
      sendUpdates: 'none',
      item: null,
      scope: 'series',
      series: SERIES,
    })
    expect(calendar.patchCalendarEvent).toHaveBeenCalledWith(
      'serie',
      {
        recurrence: ['RRULE:FREQ=MONTHLY'],
        timing: { allDay: false, start: SERIES.start, durationMin: 60 },
        wasAllDay: false,
      },
      { sendUpdates: 'none' },
    )
  })

  it('eine benutzerdefinierte Regel (mit EXDATE) bleibt beim Speichern der Serie unverändert', async () => {
    const lines = ['RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=2TU', 'EXDATE:20271012T120000Z']
    const custom = { ...SERIES, recurrence: lines }
    await saveEvent(
      OCCURRENCE,
      { ...SAME, title: 'Anders', recurrence: fromRRule(lines, custom.start) },
      { sendUpdates: 'none', item: null, scope: 'series', series: custom },
    )
    expect(calendar.patchCalendarEvent).toHaveBeenCalledWith(
      'serie',
      { title: 'Anders' },
      { sendUpdates: 'none' },
    )
  })

  it('Löschen „Nur dieser Termin“ ⇒ DELETE des Vorkommens, Serien-Eintrag bleibt unberührt', async () => {
    await deleteEventAndLink(OCCURRENCE, {
      sendUpdates: 'none',
      item: seriesItem('serie'),
      deleteLinkedItem: true,
      scope: 'occurrence',
    })
    expect(calendar.deleteCalendarEvent).toHaveBeenCalledWith('serie_20261020', {
      sendUpdates: 'none',
    })
    expect(updateItem).not.toHaveBeenCalled()
    expect(deleteItem).not.toHaveBeenCalled()
  })

  it('Löschen „Ganze Serie“ ⇒ DELETE der Serie; Eintrag: schedule null oder löschen (Wahl)', async () => {
    await deleteEventAndLink(OCCURRENCE, {
      sendUpdates: 'none',
      item: seriesItem('serie'),
      deleteLinkedItem: false,
      scope: 'series',
    })
    expect(calendar.deleteCalendarEvent).toHaveBeenCalledWith('serie', { sendUpdates: 'none' })
    expect(updateItem).toHaveBeenCalledWith('item1', { schedule: null })
    await deleteEventAndLink(OCCURRENCE, {
      sendUpdates: 'none',
      item: seriesItem('serie'),
      deleteLinkedItem: true,
      scope: 'series',
    })
    expect(deleteItem).toHaveBeenCalledWith('item1')
  })

  it('Löschen „Ganze Serie“: eine schon gelöschte Serie (notFound) gilt als Erfolg', async () => {
    calendar.deleteCalendarEvent.mockRejectedValue(new GoogleError('notFound'))
    await deleteEventAndLink(OCCURRENCE, {
      sendUpdates: 'none',
      item: seriesItem('serie'),
      deleteLinkedItem: false,
      scope: 'series',
    })
    expect(updateItem).toHaveBeenCalledWith('item1', { schedule: null })
  })
})
