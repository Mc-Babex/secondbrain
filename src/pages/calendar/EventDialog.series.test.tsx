import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { resetDb } from '../../data/localStore'
import { createItem, listItems } from '../../data/repository'
import type { Item } from '../../data/types'
import { GoogleError, type CalendarEvent } from '../../google/types'
import { blankForm } from './eventForm'
import { EventDialog } from './EventDialog'

const calendar = vi.hoisted(() => ({
  patchCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  createCalendarEvent: vi.fn(),
  getSeries: vi.fn(),
}))
vi.mock('../../google/calendar', () => calendar)

const SERIES: CalendarEvent = {
  id: 'serie',
  title: 'Vorlesung',
  start: '2026-10-06T14:00:00+02:00',
  end: '2026-10-06T15:00:00+02:00',
  allDay: false,
  recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
  organizerSelf: true,
  editable: true,
}
const OCCURRENCE: CalendarEvent = {
  ...SERIES,
  id: 'serie_20261020T120000Z',
  start: '2026-10-20T14:00:00+02:00',
  end: '2026-10-20T15:00:00+02:00',
  recurringEventId: 'serie',
  recurrence: undefined,
  hasGuests: false,
}

type User = ReturnType<typeof userEvent.setup>

function setupEvent(event: CalendarEvent = OCCURRENCE, item: Item | null = null) {
  const onClose = vi.fn()
  render(
    <EventDialog
      event={event}
      item={item}
      onClose={onClose}
      onSaved={vi.fn()}
      onOpenItem={vi.fn()}
    />,
  )
  return { onClose, user: userEvent.setup() }
}

function setupNew(date = '2026-10-19') {
  const onClose = vi.fn()
  render(
    <EventDialog
      event={null}
      draft={blankForm(date, '09:00')}
      item={null}
      onClose={onClose}
      onSaved={vi.fn()}
      onOpenItem={vi.fn()}
    />,
  )
  return { onClose, user: userEvent.setup() }
}

const save = (user: User) => user.click(screen.getByRole('button', { name: 'Speichern' }))
const loaded = () => screen.findByRole('checkbox', { name: 'Di' })

async function seriesItem(calendarEventId = 'serie'): Promise<Item> {
  return createItem({
    type: 'termin',
    title: 'Vorlesung',
    categoryId: 'studium',
    durationMin: 60,
    schedule: { start: SERIES.start, durationMin: 60, calendarEventId },
  })
}

beforeEach(async () => {
  calendar.patchCalendarEvent.mockReset().mockResolvedValue(SERIES)
  calendar.deleteCalendarEvent.mockReset().mockResolvedValue(undefined)
  calendar.createCalendarEvent.mockReset().mockResolvedValue(SERIES)
  calendar.getSeries.mockReset().mockResolvedValue(SERIES)
  await resetDb(true)
})
afterAll(() => resetDb(true))

describe('Termin-Dialog – Wiederholung anlegen', () => {
  async function create(user: User) {
    await user.type(screen.getByLabelText('Titel'), 'Vorlesung')
    await save(user)
    await waitFor(() => expect(calendar.createCalendarEvent).toHaveBeenCalled())
    return calendar.createCalendarEvent.mock.calls[0][0]
  }

  it('wöchentlich Mo+Mi bis Datum ⇒ RRULE mit UNTIL in UTC', async () => {
    const { user } = setupNew()
    await user.selectOptions(screen.getByLabelText('Wiederholung'), 'weekly')
    expect(screen.getByRole('checkbox', { name: 'Mo' })).toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: 'Mi' }))
    await user.selectOptions(screen.getByLabelText('Wiederholung endet'), 'until')
    fireEvent.change(screen.getByLabelText('Letzter Tag'), { target: { value: '2026-12-18' } })
    const body = await create(user)
    expect(body.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261218T225959Z'])
  })

  it('täglich nach Anzahl ⇒ COUNT', async () => {
    const { user } = setupNew()
    await user.selectOptions(screen.getByLabelText('Wiederholung'), 'daily')
    await user.selectOptions(screen.getByLabelText('Wiederholung endet'), 'count')
    fireEvent.change(screen.getByLabelText('Anzahl Termine'), { target: { value: '5' } })
    expect((await create(user)).recurrence).toEqual(['RRULE:FREQ=DAILY;COUNT=5'])
  })

  it('alle 2 Wochen: Vorgabe ist der Wochentag des Datums', async () => {
    const { user } = setupNew('2026-10-21')
    await user.selectOptions(screen.getByLabelText('Wiederholung'), 'biweekly')
    expect(screen.getByRole('checkbox', { name: 'Mi' })).toBeChecked()
    expect((await create(user)).recurrence).toEqual(['RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=WE'])
  })

  it('monatlich ⇒ gleicher Tag im Monat', async () => {
    const { user } = setupNew()
    await user.selectOptions(screen.getByLabelText('Wiederholung'), 'monthly')
    expect((await create(user)).recurrence).toEqual(['RRULE:FREQ=MONTHLY'])
  })

  it('ohne Wiederholung kein recurrence-Feld', async () => {
    const { user } = setupNew()
    expect(await create(user)).not.toHaveProperty('recurrence')
  })

  it('verlangt ein Enddatum nicht vor dem Beginn und mindestens einen Termin', async () => {
    const { user } = setupNew()
    await user.type(screen.getByLabelText('Titel'), 'x')
    await user.selectOptions(screen.getByLabelText('Wiederholung'), 'daily')
    await user.selectOptions(screen.getByLabelText('Wiederholung endet'), 'until')
    fireEvent.change(screen.getByLabelText('Letzter Tag'), { target: { value: '2026-10-01' } })
    await save(user)
    expect(screen.getByRole('alert')).toHaveTextContent('nicht vor dem Beginn enden')
    await user.selectOptions(screen.getByLabelText('Wiederholung endet'), 'count')
    fireEvent.change(screen.getByLabelText('Anzahl Termine'), { target: { value: '0' } })
    await save(user)
    expect(screen.getByRole('alert')).toHaveTextContent('mindestens 1 Termin')
    expect(calendar.createCalendarEvent).not.toHaveBeenCalled()
  })

  it('Wiederholung bei einem Einzeltermin hinzufügen ⇒ PATCH recurrence auf den Termin', async () => {
    const single: CalendarEvent = { ...SERIES, id: 'ev1', recurrence: undefined }
    const { user } = setupEvent(single)
    await user.selectOptions(screen.getByLabelText('Wiederholung'), 'weekly')
    await save(user)
    await waitFor(() => expect(calendar.patchCalendarEvent).toHaveBeenCalled())
    expect(calendar.patchCalendarEvent).toHaveBeenCalledWith(
      'ev1',
      {
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
        timing: { allDay: false, start: SERIES.start, durationMin: 60 },
        wasAllDay: false,
      },
      { sendUpdates: 'none' },
    )
  })
})

describe('Termin-Dialog – Serien-Vorkommen speichern', () => {
  it('lädt die Serie und zeigt ihre Regel', async () => {
    setupEvent()
    expect(await loaded()).toBeChecked()
    expect(calendar.getSeries).toHaveBeenCalledWith('serie', { interactive: false })
    expect(screen.getByLabelText('Wiederholung')).toHaveValue('weekly')
  })

  it('fragt „Nur dieser Termin“ / „Ganze Serie“; Vorauswahl ist nur dieser Termin', async () => {
    const { user } = setupEvent()
    await loaded()
    await user.type(screen.getByLabelText('Titel'), '!')
    await save(user)
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: 'Nur dieser Termin' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Ganze Serie' })).toBeEnabled()
  })

  it('„Nur dieser Termin“ ⇒ PATCH auf das Vorkommen', async () => {
    const { user, onClose } = setupEvent()
    await loaded()
    fireEvent.change(screen.getByLabelText('Beginn'), { target: { value: '16:00' } })
    await save(user)
    await save(user)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calendar.patchCalendarEvent).toHaveBeenCalledTimes(1)
    expect(calendar.patchCalendarEvent).toHaveBeenCalledWith(
      'serie_20261020T120000Z',
      {
        timing: { allDay: false, start: '2026-10-20T16:00:00+02:00', durationMin: 60 },
        wasAllDay: false,
      },
      { sendUpdates: 'none' },
    )
  })

  it('„Ganze Serie“ ⇒ PATCH auf die Serie mit neuer Uhrzeit, Seriendatum bleibt', async () => {
    const { user, onClose } = setupEvent()
    await loaded()
    fireEvent.change(screen.getByLabelText('Beginn'), { target: { value: '16:00' } })
    await save(user)
    await user.click(screen.getByRole('radio', { name: 'Ganze Serie' }))
    expect(screen.getByText(/Uhrzeit und Dauer gelten für alle Termine/)).toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calendar.patchCalendarEvent).toHaveBeenCalledTimes(1)
    expect(calendar.patchCalendarEvent).toHaveBeenCalledWith(
      'serie',
      {
        timing: { allDay: false, start: '2026-10-06T16:00:00+02:00', durationMin: 60 },
        wasAllDay: false,
      },
      { sendUpdates: 'none' },
    )
  })

  it('Gäste: nach der Serien-Wahl folgt die Gäste-Rückfrage, beide in einem Schritt', async () => {
    const { user } = setupEvent({ ...OCCURRENCE, hasGuests: true })
    await loaded()
    await user.type(screen.getByLabelText('Titel'), '!')
    await save(user)
    await user.click(screen.getByRole('radio', { name: 'Ganze Serie' }))
    await user.click(screen.getByRole('radio', { name: 'Ja' }))
    await save(user)
    await waitFor(() => expect(calendar.patchCalendarEvent).toHaveBeenCalled())
    expect(calendar.patchCalendarEvent).toHaveBeenCalledWith(
      'serie',
      { title: 'Vorlesung!' },
      { sendUpdates: 'all' },
    )
  })

  it('geänderte Wiederholung: bei „Nur dieser Termin“ Hinweis und kein recurrence im PATCH', async () => {
    const { user } = setupEvent()
    await loaded()
    await user.selectOptions(screen.getByLabelText('Wiederholung'), 'daily')
    await user.type(screen.getByLabelText('Titel'), '!')
    await save(user)
    expect(screen.getByText(/nur für die ganze Serie ändern/)).toBeInTheDocument()
    await save(user)
    await waitFor(() => expect(calendar.patchCalendarEvent).toHaveBeenCalled())
    expect(calendar.patchCalendarEvent.mock.calls[0][0]).toBe('serie_20261020T120000Z')
    expect(calendar.patchCalendarEvent.mock.calls[0][1]).toEqual({ title: 'Vorlesung!' })
  })

  it('geänderte Wiederholung bei „Ganze Serie“ ⇒ PATCH recurrence auf die Serie', async () => {
    const { user } = setupEvent()
    await loaded()
    await user.selectOptions(screen.getByLabelText('Wiederholung'), 'daily')
    await save(user)
    await user.click(screen.getByRole('radio', { name: 'Ganze Serie' }))
    await save(user)
    await waitFor(() => expect(calendar.patchCalendarEvent).toHaveBeenCalled())
    expect(calendar.patchCalendarEvent.mock.calls[0][0]).toBe('serie')
    expect(calendar.patchCalendarEvent.mock.calls[0][1]).toMatchObject({
      recurrence: ['RRULE:FREQ=DAILY'],
    })
  })

  it('benutzerdefinierte Regel: nur Text, bleibt beim Speichern unverändert', async () => {
    const lines = ['RRULE:FREQ=YEARLY;BYMONTH=10', 'EXDATE:20271012T120000Z']
    calendar.getSeries.mockResolvedValue({ ...SERIES, recurrence: lines })
    const { user } = setupEvent()
    expect(await screen.findByText('Wiederholung: benutzerdefiniert')).toBeInTheDocument()
    expect(screen.queryByLabelText('Wiederholung')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Titel'), '!')
    await save(user)
    await user.click(screen.getByRole('radio', { name: 'Ganze Serie' }))
    await save(user)
    await waitFor(() => expect(calendar.patchCalendarEvent).toHaveBeenCalled())
    expect(calendar.patchCalendarEvent.mock.calls[0][1]).toEqual({ title: 'Vorlesung!' })
  })

  it('Serie nicht ladbar: „Ganze Serie“ ist gesperrt, „Nur dieser Termin“ geht', async () => {
    calendar.getSeries.mockRejectedValue(new GoogleError('offline'))
    const { user } = setupEvent()
    expect(await screen.findByText(/Wiederholung konnte nicht geladen werden/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Titel'), '!')
    await save(user)
    expect(screen.getByRole('radio', { name: 'Ganze Serie' })).toBeDisabled()
    await save(user)
    await waitFor(() => expect(calendar.patchCalendarEvent).toHaveBeenCalled())
    expect(calendar.patchCalendarEvent.mock.calls[0][0]).toBe('serie_20261020T120000Z')
  })
})

describe('Termin-Dialog – Serien-Vorkommen löschen', () => {
  const startDelete = (user: User) => user.click(screen.getByRole('button', { name: 'Löschen' }))
  const confirm = (user: User) =>
    user.click(screen.getByRole('button', { name: 'Endgültig löschen' }))

  it('„Nur dieser Termin“ ⇒ DELETE des Vorkommens', async () => {
    const { user, onClose } = setupEvent()
    await loaded()
    await startDelete(user)
    expect(screen.getByRole('radio', { name: 'Nur dieser Termin' })).toBeChecked()
    await confirm(user)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calendar.deleteCalendarEvent).toHaveBeenCalledTimes(1)
    expect(calendar.deleteCalendarEvent).toHaveBeenCalledWith('serie_20261020T120000Z', {
      sendUpdates: 'none',
    })
  })

  it('„Ganze Serie“ ⇒ DELETE der Serie', async () => {
    const { user, onClose } = setupEvent()
    await loaded()
    await startDelete(user)
    await user.click(screen.getByRole('radio', { name: 'Ganze Serie' }))
    expect(screen.getByText('Alle Termine der Serie werden gelöscht.')).toBeInTheDocument()
    await confirm(user)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calendar.deleteCalendarEvent).toHaveBeenCalledTimes(1)
    expect(calendar.deleteCalendarEvent).toHaveBeenCalledWith('serie', { sendUpdates: 'none' })
  })
})

describe('Termin-Dialog – Eintrag hängt an der Serie', () => {
  const startDelete = (user: User) => user.click(screen.getByRole('button', { name: 'Löschen' }))
  const confirm = (user: User) =>
    user.click(screen.getByRole('button', { name: 'Endgültig löschen' }))

  it('einzelnes Vorkommen löschen: keine Eintrag-Wahl, Eintrag bleibt unverändert', async () => {
    const item = await seriesItem()
    const { user, onClose } = setupEvent(OCCURRENCE, item)
    await loaded()
    await startDelete(user)
    expect(screen.queryByText('Verknüpfter Eintrag')).not.toBeInTheDocument()
    await confirm(user)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect((await listItems())[0].schedule).toEqual(item.schedule)
  })

  it('ganze Serie löschen: „Nur Termin löschen (Eintrag bleibt)“ ⇒ schedule null', async () => {
    const item = await seriesItem()
    const { user, onClose } = setupEvent(OCCURRENCE, item)
    await loaded()
    await startDelete(user)
    await user.click(screen.getByRole('radio', { name: 'Ganze Serie' }))
    expect(screen.getByRole('radio', { name: 'Nur Termin löschen (Eintrag bleibt)' })).toBeChecked()
    await confirm(user)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect((await listItems())[0].schedule).toBeNull()
  })

  it('ganze Serie löschen: „Termin und Eintrag löschen“ entfernt den Eintrag', async () => {
    const item = await seriesItem()
    const { user, onClose } = setupEvent(OCCURRENCE, item)
    await loaded()
    await startDelete(user)
    await user.click(screen.getByRole('radio', { name: 'Ganze Serie' }))
    await user.click(screen.getByRole('radio', { name: 'Termin und Eintrag löschen' }))
    await confirm(user)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(await listItems()).toHaveLength(0)
  })

  it('einzelnes Vorkommen ändern: Eintrag unverändert', async () => {
    const item = await seriesItem()
    const { user, onClose } = setupEvent(OCCURRENCE, item)
    await loaded()
    await user.clear(screen.getByLabelText('Titel'))
    await user.type(screen.getByLabelText('Titel'), 'Anders')
    fireEvent.change(screen.getByLabelText('Beginn'), { target: { value: '16:00' } })
    await save(user)
    await save(user)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const [saved] = await listItems()
    expect(saved.title).toBe('Vorlesung')
    expect(saved.schedule).toEqual(item.schedule)
  })

  it('ganze Serie ändern: Titel und Zeit gehen in den Eintrag', async () => {
    const item = await seriesItem()
    const { user, onClose } = setupEvent(OCCURRENCE, item)
    await loaded()
    await user.clear(screen.getByLabelText('Titel'))
    await user.type(screen.getByLabelText('Titel'), 'Vorlesung 2')
    await save(user)
    await user.click(screen.getByRole('radio', { name: 'Ganze Serie' }))
    await save(user)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect((await listItems())[0].title).toBe('Vorlesung 2')
  })
})
