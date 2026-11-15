import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { resetDb } from '../../data/localStore'
import { createItem, listItems } from '../../data/repository'
import { GoogleError } from '../../google/types'
import { TasksPageWithCalendar } from './TasksPageWithCalendar'

const calendar = vi.hoisted(() => ({
  createEvent: vi.fn(),
  updateEventTime: vi.fn(),
  deleteEvent: vi.fn(),
  listEvents: vi.fn(),
  getEvent: vi.fn(),
}))
vi.mock('../../google/calendar', () => calendar)
vi.mock('../../google/auth', () => ({ hasClientId: () => false, loadGoogleScript: vi.fn() }))

beforeEach(async () => {
  // Feste Uhrzeit vor 09:00, sonst ist der gewählte Termin je nach Tageszeit schon „überfällig“.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-17T06:00:00+02:00') })
  calendar.createEvent.mockReset().mockResolvedValue('ev-new')
  calendar.updateEventTime.mockReset().mockResolvedValue(undefined)
  calendar.deleteEvent.mockReset().mockResolvedValue(undefined)
  calendar.listEvents.mockReset().mockResolvedValue([])
  calendar.getEvent
    .mockReset()
    .mockResolvedValue({ id: 'ev', title: '', start: '', end: '', allDay: false })
  await resetDb(true)
})
afterEach(() => vi.useRealTimers())
afterAll(() => resetDb(true))

const OVERDUE = '2026-10-16T14:00:00+02:00'

async function addTask(
  extra: Parameters<typeof createItem>[0] extends infer T ? Partial<T> : never = {},
) {
  return createItem({ type: 'aufgabe', title: 'Steuer', categoryId: 'privat', ...extra })
}

async function chooseTimeAndSave(user: ReturnType<typeof userEvent.setup>, time = '09:00') {
  const dialog = await screen.findByRole('dialog')
  const input = within(dialog).getByLabelText('Uhrzeit')
  await user.clear(input)
  await user.type(input, time)
  await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
}

describe('Aufgabenseite mit Kalender', () => {
  it('Einplanen legt einen Termin an und setzt schedule und Dauer', async () => {
    const item = await addTask()
    const user = userEvent.setup()
    render(<TasksPageWithCalendar />)
    await user.click(await screen.findByRole('button', { name: 'Einplanen' }))
    await user.selectOptions(await screen.findByLabelText('Dauer'), '60')
    await chooseTimeAndSave(user)
    await waitFor(async () => expect((await listItems())[0].schedule).not.toBeNull())
    const saved = (await listItems())[0]
    expect(calendar.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Steuer', durationMin: 60, itemId: item.id }),
    )
    expect(saved.schedule).toMatchObject({ durationMin: 60, calendarEventId: 'ev-new' })
    expect(saved.durationMin).toBe(60)
    expect(await screen.findByRole('button', { name: 'Termin ändern' })).toBeInTheDocument()
  })

  it('Umplanen patcht den vorhandenen Termin', async () => {
    await addTask({
      schedule: { start: '2026-12-01T10:00:00+01:00', durationMin: 30, calendarEventId: 'ev1' },
    })
    const user = userEvent.setup()
    render(<TasksPageWithCalendar />)
    await user.click(await screen.findByRole('button', { name: 'Termin ändern' }))
    await chooseTimeAndSave(user, '11:00')
    await waitFor(() => expect(calendar.updateEventTime).toHaveBeenCalled())
    expect(calendar.updateEventTime).toHaveBeenCalledWith('ev1', '2026-12-01T11:00:00+01:00', 30)
    expect(calendar.createEvent).not.toHaveBeenCalled()
    await waitFor(async () =>
      expect((await listItems())[0].schedule?.start).toBe('2026-12-01T11:00:00+01:00'),
    )
  })

  it('legt den Termin neu an, wenn er im Kalender nicht mehr existiert', async () => {
    await addTask({
      schedule: { start: '2026-12-01T10:00:00+01:00', durationMin: 30, calendarEventId: 'weg' },
    })
    calendar.updateEventTime.mockRejectedValue(new GoogleError('notFound'))
    const user = userEvent.setup()
    render(<TasksPageWithCalendar />)
    await user.click(await screen.findByRole('button', { name: 'Termin ändern' }))
    await chooseTimeAndSave(user)
    await waitFor(async () =>
      expect((await listItems())[0].schedule?.calendarEventId).toBe('ev-new'),
    )
    expect(calendar.createEvent).toHaveBeenCalledOnce()
  })

  it('Fehler zeigt eine Meldung und lässt das Item unverändert', async () => {
    await addTask()
    calendar.createEvent.mockRejectedValue(new GoogleError('offline'))
    const user = userEvent.setup()
    render(<TasksPageWithCalendar />)
    await user.click(await screen.findByRole('button', { name: 'Einplanen' }))
    await chooseTimeAndSave(user)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Google ist nicht erreichbar')
    const dialog = screen.getByRole('dialog')
    expect(dialog).toContainElement(alert)
    expect(within(dialog).getByLabelText('Uhrzeit')).toHaveValue('09:00')
    expect(within(dialog).getByRole('button', { name: 'Speichern' })).toBeEnabled()
    const [item] = await listItems()
    expect(item.schedule).toBeNull()
    expect(item.durationMin).toBeNull()
  })

  it('Nach einem Fehler kann im offenen Dialog erneut gespeichert werden (Dialog schließt bei Erfolg)', async () => {
    await addTask()
    calendar.createEvent
      .mockRejectedValueOnce(new GoogleError('unauthorized'))
      .mockResolvedValueOnce('ev-2')
    const user = userEvent.setup()
    render(<TasksPageWithCalendar />)
    await user.click(await screen.findByRole('button', { name: 'Einplanen' }))
    await chooseTimeAndSave(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Google-Verbindung abgelaufen')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect((await listItems())[0].schedule?.calendarEventId).toBe('ev-2')
  })

  it('Doppelklick auf Speichern erzeugt nur einen Termin', async () => {
    await addTask()
    let release: (id: string) => void = () => undefined
    calendar.createEvent.mockReturnValue(new Promise<string>((resolve) => (release = resolve)))
    const user = userEvent.setup()
    render(<TasksPageWithCalendar />)
    await user.click(await screen.findByRole('button', { name: 'Einplanen' }))
    const dialog = await screen.findByRole('dialog')
    await user.dblClick(within(dialog).getByRole('button', { name: 'Speichern' }))
    release('ev-1')
    await waitFor(async () => expect((await listItems())[0].schedule).not.toBeNull())
    expect(calendar.createEvent).toHaveBeenCalledTimes(1)
  })

  const AUTO = 'Nicht erledigt – automatisch neu planen'

  it('Überfällig „Nicht erledigt“ verschiebt den Termin in den ersten freien Slot am Tagesanfang', async () => {
    await addTask({ schedule: { start: OVERDUE, durationMin: 15, calendarEventId: 'ev9' } })
    const user = userEvent.setup()
    render(<TasksPageWithCalendar />)
    await user.click(await screen.findByRole('button', { name: AUTO }))
    await waitFor(() => expect(calendar.updateEventTime).toHaveBeenCalled())
    expect(calendar.updateEventTime).toHaveBeenCalledWith('ev9', '2026-10-17T09:00:00+02:00', 15)
    await waitFor(async () =>
      expect((await listItems())[0].schedule?.start).toBe('2026-10-17T09:00:00+02:00'),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Neu geplant: Sa 17.10., 09:00')
  })

  it('„Nicht erledigt“ weicht belegten Terminen aus; der eigene alte Termin zählt nicht', async () => {
    await addTask({
      schedule: { start: '2026-10-17T09:00:00+02:00', durationMin: 30, calendarEventId: 'ev9' },
    })
    vi.setSystemTime(new Date('2026-10-17T10:00:00+02:00'))
    calendar.listEvents.mockResolvedValue([
      {
        id: 'ev9',
        title: 'Steuer',
        start: '2026-10-18T09:00:00+02:00',
        end: '2026-10-18T09:30:00+02:00',
        allDay: false,
      },
      {
        id: 'x',
        title: 'Treffen',
        start: '2026-10-18T09:00:00+02:00',
        end: '2026-10-18T10:00:00+02:00',
        allDay: false,
      },
      {
        id: 'y',
        title: 'Frei',
        start: '2026-10-18T10:00:00+02:00',
        end: '2026-10-18T11:00:00+02:00',
        allDay: false,
        transparent: true,
      },
    ])
    const user = userEvent.setup()
    render(<TasksPageWithCalendar />)
    await user.click(await screen.findByRole('button', { name: AUTO }))
    await waitFor(() => expect(calendar.updateEventTime).toHaveBeenCalled())
    expect(calendar.updateEventTime).toHaveBeenCalledWith('ev9', '2026-10-18T10:00:00+02:00', 30)
  })

  it('„Nicht erledigt“ plant nicht in die Pause (Standard 12:00–13:00)', async () => {
    await addTask({
      schedule: { start: OVERDUE, durationMin: 150, calendarEventId: 'ev9' },
    })
    calendar.listEvents.mockResolvedValue([
      {
        id: 'x',
        title: 'Treffen',
        start: '2026-10-17T09:00:00+02:00',
        end: '2026-10-17T10:00:00+02:00',
        allDay: false,
      },
    ])
    const user = userEvent.setup()
    render(<TasksPageWithCalendar />)
    await user.click(await screen.findByRole('button', { name: AUTO }))
    await waitFor(() => expect(calendar.updateEventTime).toHaveBeenCalled())
    expect(calendar.updateEventTime).toHaveBeenCalledWith('ev9', '2026-10-17T13:00:00+02:00', 150)
  })

  it('ohne freien Slot: Hinweis und Dialog, nichts geändert', async () => {
    await addTask({ schedule: { start: OVERDUE, durationMin: 30, calendarEventId: 'ev9' } })
    calendar.listEvents.mockResolvedValue([
      {
        id: 'x',
        title: 'Dauerbelegt',
        start: '2026-10-17T00:00:00+02:00',
        end: '2026-12-31T00:00:00+01:00',
        allDay: false,
      },
    ])
    const user = userEvent.setup()
    render(<TasksPageWithCalendar />)
    await user.click(await screen.findByRole('button', { name: AUTO }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('kein freier Zeitraum')
    expect(calendar.updateEventTime).not.toHaveBeenCalled()
    expect((await listItems())[0].schedule?.start).toBe(OVERDUE)
  })

  it('nicht verbunden oder offline: Meldung, keine Änderung', async () => {
    await addTask({ schedule: { start: OVERDUE, durationMin: 30, calendarEventId: 'ev9' } })
    calendar.listEvents.mockRejectedValue(new GoogleError('offline'))
    const user = userEvent.setup()
    render(<TasksPageWithCalendar />)
    await user.click(await screen.findByRole('button', { name: AUTO }))
    expect(await screen.findByRole('alert')).toHaveTextContent('nicht erreichbar')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calendar.updateEventTime).not.toHaveBeenCalled()
    expect((await listItems())[0].schedule?.start).toBe(OVERDUE)
  })

  it('Überfällig: Uhr-Symbol „Selbst neu planen“ öffnet den Dialog und plant neu', async () => {
    await addTask({ schedule: { start: OVERDUE, durationMin: 30, calendarEventId: 'ev9' } })
    const user = userEvent.setup()
    render(<TasksPageWithCalendar />)
    await user.click(await screen.findByRole('button', { name: 'Selbst neu planen' }))
    await chooseTimeAndSave(user)
    await waitFor(() => expect(calendar.updateEventTime).toHaveBeenCalled())
    expect(calendar.updateEventTime.mock.calls[0][0]).toBe('ev9')
    await waitFor(async () => expect((await listItems())[0].schedule?.start).not.toBe(OVERDUE))
    expect(calendar.listEvents).not.toHaveBeenCalled()
  })

  it('Überfällig – löscht den Termin und setzt schedule auf null', async () => {
    await addTask({ schedule: { start: OVERDUE, durationMin: 30, calendarEventId: 'ev9' } })
    const user = userEvent.setup()
    render(<TasksPageWithCalendar />)
    await user.click(await screen.findByRole('button', { name: 'Aus dem Kalender nehmen' }))
    await waitFor(async () => expect((await listItems())[0].schedule).toBeNull())
    expect(calendar.deleteEvent).toHaveBeenCalledWith('ev9')
  })

  it('Überfällig – bei Fehler: Meldung, Item unverändert', async () => {
    await addTask({ schedule: { start: OVERDUE, durationMin: 30, calendarEventId: 'ev9' } })
    calendar.deleteEvent.mockRejectedValue(new GoogleError('offline'))
    const user = userEvent.setup()
    render(<TasksPageWithCalendar />)
    await user.click(await screen.findByRole('button', { name: 'Aus dem Kalender nehmen' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('nicht erreichbar')
    expect(alert.closest('li')).not.toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect((await listItems())[0].schedule).toMatchObject({
      start: OVERDUE,
      calendarEventId: 'ev9',
    })
  })
})

describe('Aufgabenseite – Eintrag an einer Serie', () => {
  const AUTO = 'Nicht erledigt – automatisch neu planen'
  const SERIES_SCHEDULE = { start: OVERDUE, durationMin: 30, calendarEventId: 'ev9' }

  beforeEach(() => {
    calendar.getEvent.mockResolvedValue({
      id: 'ev9',
      title: 'Vorlesung',
      start: OVERDUE,
      end: OVERDUE,
      allDay: false,
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TH'],
    })
  })

  async function expectUntouched() {
    expect(calendar.updateEventTime).not.toHaveBeenCalled()
    expect(calendar.createEvent).not.toHaveBeenCalled()
    expect(calendar.deleteEvent).not.toHaveBeenCalled()
    expect((await listItems())[0].schedule).toEqual(SERIES_SCHEDULE)
  }

  it('✗ Nicht erledigt verschiebt die Serie nicht', async () => {
    await addTask({ schedule: SERIES_SCHEDULE })
    const user = userEvent.setup()
    render(<TasksPageWithCalendar />)
    await user.click(await screen.findByRole('button', { name: AUTO }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Serientermin – im Kalender bearbeiten oder „– Aus Kalender“ wählen.',
    )
    await expectUntouched()
  })

  it('Uhr-Dialog (selbst neu planen) verschiebt die Serie nicht', async () => {
    await addTask({ schedule: SERIES_SCHEDULE })
    const user = userEvent.setup()
    render(<TasksPageWithCalendar />)
    await user.click(await screen.findByRole('button', { name: 'Selbst neu planen' }))
    await chooseTimeAndSave(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Serientermin – im Kalender bearbeiten oder „– Aus Kalender“ wählen.',
    )
    await expectUntouched()
  })

  it('– Aus Kalender löscht bei Google nichts, entfernt nur den Termin vom Eintrag', async () => {
    await addTask({ schedule: SERIES_SCHEDULE })
    const user = userEvent.setup()
    render(<TasksPageWithCalendar />)
    await user.click(await screen.findByRole('button', { name: 'Aus dem Kalender nehmen' }))
    expect(await screen.findByText('Serie bleibt im Kalender')).toBeInTheDocument()
    await waitFor(async () => expect((await listItems())[0].schedule).toBeNull())
    expect(calendar.deleteEvent).not.toHaveBeenCalled()
    expect(calendar.updateEventTime).not.toHaveBeenCalled()
    expect(calendar.createEvent).not.toHaveBeenCalled()
  })

  it('Slot-Suche: Vorkommen einer Serie (singleEvents) zählen als belegt', async () => {
    calendar.getEvent.mockResolvedValue({ id: 'ev9', title: '', start: '', end: '', allDay: false })
    await addTask({ schedule: { start: OVERDUE, durationMin: 30, calendarEventId: 'ev9' } })
    vi.setSystemTime(new Date('2026-10-17T10:00:00+02:00'))
    calendar.listEvents.mockResolvedValue([
      {
        id: 'serie_20261018T070000Z',
        title: 'Vorlesung',
        start: '2026-10-18T09:00:00+02:00',
        end: '2026-10-18T10:30:00+02:00',
        allDay: false,
        recurringEventId: 'serie',
      },
    ])
    const user = userEvent.setup()
    render(<TasksPageWithCalendar />)
    await user.click(await screen.findByRole('button', { name: AUTO }))
    await waitFor(() => expect(calendar.updateEventTime).toHaveBeenCalled())
    expect(calendar.updateEventTime).toHaveBeenCalledWith('ev9', '2026-10-18T10:30:00+02:00', 30)
  })
})
