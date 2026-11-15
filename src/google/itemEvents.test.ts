import { vi } from 'vitest'
import { resetDb } from '../data/localStore'
import { createItem, listItems, restoreItem } from '../data/repository'
import type { Item } from '../data/types'
import {
  completeItemWithEvent,
  deleteItemWithEvent,
  moveItemEvent,
  removeCheckedWithEvents,
  restoreItemWithEvent,
  scheduleItem,
} from './itemEvents'
import { GoogleError } from './types'

const calendar = vi.hoisted(() => ({
  deleteEvent: vi.fn(),
  createEvent: vi.fn(),
  getEvent: vi.fn(),
  updateEventTime: vi.fn(),
}))
const auth = vi.hoisted(() => ({ wasConnected: vi.fn() }))
vi.mock('./calendar', () => calendar)
vi.mock('./auth', () => auth)

const NOW = new Date('2026-10-17T10:00:00+02:00')
const FUTURE = '2026-10-18T10:00:00+02:00'
const PAST = '2026-10-17T08:00:00+02:00'

beforeEach(async () => {
  calendar.deleteEvent.mockReset().mockResolvedValue(undefined)
  calendar.createEvent.mockReset().mockResolvedValue('ev-neu')
  calendar.getEvent
    .mockReset()
    .mockResolvedValue({ id: 'ev', title: '', start: '', end: '', allDay: false })
  calendar.updateEventTime.mockReset().mockResolvedValue(undefined)
  auth.wasConnected.mockReset().mockReturnValue(true)
  await resetDb(true)
})
afterAll(() => resetDb(true))

function withEvent(start: string) {
  return createItem({
    type: 'aufgabe',
    title: 'Termin',
    categoryId: 'privat',
    schedule: { start, durationMin: 30, calendarEventId: 'ev1' },
  })
}

describe('deleteItemWithEvent', () => {
  it('löscht erst den Google-Termin, dann den Eintrag', async () => {
    const item = await withEvent(FUTURE)
    await deleteItemWithEvent(item)
    expect(calendar.deleteEvent).toHaveBeenCalledWith('ev1')
    expect(await listItems()).toHaveLength(0)
  })

  it('ruft ohne Termin Google nicht auf', async () => {
    const item = await createItem({ type: 'notiz', title: 'x', categoryId: 'privat' })
    await deleteItemWithEvent(item)
    expect(calendar.deleteEvent).not.toHaveBeenCalled()
    expect(await listItems()).toHaveLength(0)
  })

  it('lässt den Eintrag bei einem Google-Fehler stehen', async () => {
    calendar.deleteEvent.mockRejectedValue(new GoogleError('offline'))
    const item = await withEvent(FUTURE)
    await expect(deleteItemWithEvent(item)).rejects.toBeInstanceOf(GoogleError)
    expect(await listItems()).toHaveLength(1)
  })
})

describe('completeItemWithEvent', () => {
  it('löscht den zukünftigen Termin, setzt schedule null und erledigt', async () => {
    const item = await withEvent(FUTURE)
    const { note, removed } = await completeItemWithEvent(item, NOW)
    expect(note).toBe('Termin entfernt')
    expect(removed).toEqual({ start: FUTURE, durationMin: 30 })
    expect(calendar.deleteEvent).toHaveBeenCalledWith('ev1', { interactive: false })
    expect(await listItems()).toEqual([
      expect.objectContaining({ status: 'erledigt', schedule: null }),
    ])
  })

  it('lässt einen vergangenen Termin ohne Google-Aufruf stehen', async () => {
    const item = await withEvent(PAST)
    expect((await completeItemWithEvent(item, NOW)).note).toBeNull()
    expect(calendar.deleteEvent).not.toHaveBeenCalled()
    const [saved] = await listItems()
    expect(saved.status).toBe('erledigt')
    expect(saved.schedule?.calendarEventId).toBe('ev1')
  })

  it('erledigt ohne Verbindung und weist darauf hin', async () => {
    auth.wasConnected.mockReturnValue(false)
    const item = await withEvent(FUTURE)
    expect((await completeItemWithEvent(item, NOW)).note).toBe(
      'Termin bleibt im Kalender – Google nicht verbunden.',
    )
    expect(calendar.deleteEvent).not.toHaveBeenCalled()
    const [saved] = await listItems()
    expect(saved.status).toBe('erledigt')
    expect(saved.schedule).not.toBeNull()
  })

  it('erledigt trotz Google-Fehler und lässt den Termin stehen', async () => {
    calendar.deleteEvent.mockRejectedValue(new GoogleError('offline'))
    const item = await withEvent(FUTURE)
    expect((await completeItemWithEvent(item, NOW)).note).toMatch(/^Termin bleibt im Kalender – /)
    const [saved] = await listItems()
    expect(saved.status).toBe('erledigt')
    expect(saved.schedule?.calendarEventId).toBe('ev1')
  })
})

describe('removeCheckedWithEvents', () => {
  function checkedArticle(): Promise<Item> {
    return createItem({
      type: 'notiz',
      title: 'Milch',
      categoryId: 'einkauf',
      checked: true,
      schedule: { start: FUTURE, durationMin: 30, calendarEventId: 'ev9' },
    })
  }

  it('löscht den Termin eines abgehakten Artikels mit', async () => {
    const item = await checkedArticle()
    expect(await removeCheckedWithEvents([item])).toBeNull()
    expect(calendar.deleteEvent).toHaveBeenCalledWith('ev9', { interactive: false })
    expect(await listItems()).toHaveLength(0)
  })

  it('löscht den Artikel auch bei Google-Fehler und meldet es', async () => {
    calendar.deleteEvent.mockRejectedValue(new GoogleError('server'))
    const item = await checkedArticle()
    expect(await removeCheckedWithEvents([item])).toMatch(/^Termin bleibt im Kalender/)
    expect(await listItems()).toHaveLength(0)
  })
})

describe('restoreItemWithEvent', () => {
  async function completed() {
    const item = await withEvent(FUTURE)
    const { removed } = await completeItemWithEvent(item, NOW)
    return { item, removed }
  }

  it('legt den entfernten zukünftigen Termin neu an (ohne Popup)', async () => {
    const { item, removed } = await completed()
    expect(await restoreItemWithEvent(item.id, removed, NOW)).toBeNull()
    expect(calendar.createEvent).toHaveBeenCalledWith(
      { title: 'Termin', start: FUTURE, durationMin: 30, itemId: item.id },
      { interactive: false },
    )
    const [saved] = await listItems()
    expect(saved.status).toBe('offen')
    expect(saved.schedule).toEqual({ start: FUTURE, durationMin: 30, calendarEventId: 'ev-neu' })
  })

  it('stellt bei Google-Fehler trotzdem wieder her und meldet es', async () => {
    const { item, removed } = await completed()
    calendar.createEvent.mockRejectedValue(new GoogleError('offline'))
    expect(await restoreItemWithEvent(item.id, removed, NOW)).toBe(
      'Termin konnte nicht wiederhergestellt werden – über die Uhr neu planen.',
    )
    const [saved] = await listItems()
    expect(saved.status).toBe('offen')
    expect(saved.schedule).toBeNull()
  })

  it('legt keinen Termin an, wenn der Start inzwischen vorbei ist', async () => {
    const { item, removed } = await completed()
    const later = new Date('2026-10-19T10:00:00+02:00')
    expect(await restoreItemWithEvent(item.id, removed, later)).toBeNull()
    expect(calendar.createEvent).not.toHaveBeenCalled()
    expect((await listItems())[0].status).toBe('offen')
  })
})

describe('Aktionen ohne Termin-Änderung', () => {
  it('Wiederherstellen ruft Google nicht auf', async () => {
    const item = await withEvent(PAST)
    await completeItemWithEvent(item, NOW)
    calendar.deleteEvent.mockClear()
    await restoreItem(item.id)
    expect(calendar.deleteEvent).not.toHaveBeenCalled()
    expect((await listItems())[0].schedule?.calendarEventId).toBe('ev1')
  })
})

describe('Eintrag an einer Serie (calendarEventId ist eine Serien-ID)', () => {
  const SERIES = { id: 'ev1', title: 'Vorlesung', start: '', end: '', allDay: false }
  const seriesEvent = { ...SERIES, recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'] }
  const occurrence = { ...SERIES, id: 'ev1_20261019', recurringEventId: 'ev0' }

  beforeEach(() => {
    calendar.getEvent.mockResolvedValue(seriesEvent)
  })

  it('Eintrag löschen: die Serie bleibt, nur der Eintrag wird gelöscht', async () => {
    const item = await withEvent(FUTURE)
    await deleteItemWithEvent(item)
    expect(calendar.deleteEvent).not.toHaveBeenCalled()
    expect(await listItems()).toHaveLength(0)
  })

  it('Eintrag löschen: auch ein Vorkommen (recurringEventId) wird nicht gelöscht', async () => {
    calendar.getEvent.mockResolvedValue(occurrence)
    await deleteItemWithEvent(await withEvent(FUTURE))
    expect(calendar.deleteEvent).not.toHaveBeenCalled()
  })

  it('Eintrag löschen: Fehler bei der Serien-Prüfung lässt alles stehen', async () => {
    const item = await withEvent(FUTURE)
    calendar.getEvent.mockRejectedValue(new GoogleError('offline'))
    await expect(deleteItemWithEvent(item)).rejects.toBeInstanceOf(GoogleError)
    expect(calendar.deleteEvent).not.toHaveBeenCalled()
    expect(await listItems()).toHaveLength(1)
  })

  it('Erledigen mit zukünftigem Termin: die Serie bleibt, der Eintrag wird erledigt', async () => {
    const item = await withEvent(FUTURE)
    const { note, removed } = await completeItemWithEvent(item, NOW)
    expect(note).toBe('Termin bleibt im Kalender – Serientermin.')
    expect(removed).toBeNull()
    expect(calendar.deleteEvent).not.toHaveBeenCalled()
    const [saved] = await listItems()
    expect(saved.status).toBe('erledigt')
    expect(saved.schedule?.calendarEventId).toBe('ev1')
  })

  it('„Ausgewählte eingekauft“ löscht keine Serie, die übrigen Termine schon', async () => {
    const a = await createItem({
      type: 'notiz',
      title: 'Milch',
      categoryId: 'einkauf',
      checked: true,
      schedule: { start: FUTURE, durationMin: 30, calendarEventId: 'ev1' },
    })
    const b = await createItem({
      type: 'notiz',
      title: 'Eier',
      categoryId: 'einkauf',
      checked: true,
      schedule: { start: FUTURE, durationMin: 30, calendarEventId: 'ev2' },
    })
    calendar.getEvent.mockImplementation(async (id: string) =>
      id === 'ev1' ? seriesEvent : { ...SERIES, id },
    )
    expect(await removeCheckedWithEvents([a, b])).toBe('Termin bleibt im Kalender – Serientermin.')
    expect(calendar.deleteEvent).toHaveBeenCalledTimes(1)
    expect(calendar.deleteEvent).toHaveBeenCalledWith('ev2', { interactive: false })
  })

  it('Verschieben (Bearbeiten-Dialog, Uhr-Dialog, ✗) ändert die Serie nicht und legt nichts neu an', async () => {
    const item = await withEvent(FUTURE)
    expect(await moveItemEvent(item, '2026-10-19T09:00:00+02:00', 60)).toBe(
      'Serientermin – im Kalender bearbeiten.',
    )
    await expect(scheduleItem(item, '2026-10-19T09:00:00+02:00', 60)).rejects.toMatchObject({
      kind: 'series',
    })
    expect(calendar.updateEventTime).not.toHaveBeenCalled()
    expect(calendar.createEvent).not.toHaveBeenCalled()
    expect((await listItems())[0].schedule).toEqual({
      start: FUTURE,
      durationMin: 30,
      calendarEventId: 'ev1',
    })
  })

  it('Verschieben: ein nicht mehr vorhandener Termin wird weiter neu angelegt', async () => {
    const item = await withEvent(FUTURE)
    calendar.getEvent.mockRejectedValue(new GoogleError('notFound'))
    calendar.updateEventTime.mockRejectedValue(new GoogleError('notFound'))
    expect(await moveItemEvent(item, '2026-10-19T09:00:00+02:00', 60)).toBeNull()
    expect(calendar.createEvent).toHaveBeenCalled()
  })

  it('Verschieben: ein normaler Termin wird weiter per PATCH verschoben', async () => {
    calendar.getEvent.mockResolvedValue(SERIES)
    const item = await withEvent(FUTURE)
    expect(await moveItemEvent(item, '2026-10-19T09:00:00+02:00', 60)).toBeNull()
    expect(calendar.updateEventTime).toHaveBeenCalledWith('ev1', '2026-10-19T09:00:00+02:00', 60)
  })
})
