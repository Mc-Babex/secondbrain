import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { putFileLocal, resetDb } from '../../data/localStore'
import { createItem } from '../../data/repository'
import { GoogleError, type CalendarEvent } from '../../google/types'
import { CalendarPage } from './CalendarPage'

const calendar = vi.hoisted(() => ({ listEvents: vi.fn() }))
vi.mock('../../google/calendar', () => calendar)
vi.mock('../../google/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../google/auth')>()),
  hasClientId: () => true,
  loadGoogleScript: vi.fn().mockResolvedValue(undefined),
  getAccessToken: vi.fn().mockResolvedValue('token'),
}))

const CONNECTED_KEY = 'secondbrain.googleConnected'

const EVENTS: CalendarEvent[] = [
  {
    id: 'ev1',
    title: 'Zahnarzt',
    start: '2026-10-17T14:00:00+02:00',
    end: '2026-10-17T15:00:00+02:00',
    allDay: false,
  },
  {
    id: 'ev2',
    title: 'Fremdtermin',
    start: '2026-10-17T11:00:00+02:00',
    end: '2026-10-17T12:00:00+02:00',
    allDay: false,
  },
  { id: 'ev3', title: 'Urlaub', start: '2026-10-17', end: '2026-10-18', allDay: true },
]

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-17T10:00:00+02:00') })
  localStorage.clear()
  localStorage.setItem(CONNECTED_KEY, '1')
  calendar.listEvents.mockReset().mockResolvedValue(EVENTS)
  await resetDb(true)
})
afterEach(() => vi.useRealTimers())
afterAll(() => resetDb(true))

describe('Pausenband', () => {
  const settingsWith = async (pause: unknown): Promise<void> => {
    await putFileLocal('settings.json', {
      planningWindow: { start: '09:00', end: '19:00' },
      pause,
      timezone: 'Europe/Berlin',
    })
  }

  it('zeigt in der Tagesansicht ein Band 12:00–13:00 (Standard)', async () => {
    render(<CalendarPage />)
    const band = await screen.findByTestId('pause-band')
    expect(band).toHaveAttribute('data-start', '12:00')
    expect(band).toHaveAttribute('data-end', '13:00')
    expect(band).toHaveAttribute('title', 'Pause')
  })

  it('zeigt in der Wochenansicht ein Band je Tag', async () => {
    render(<CalendarPage />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Woche' }))
    await waitFor(() => expect(screen.getAllByTestId('pause-band')).toHaveLength(7))
  })

  it('zeigt bei pause: null kein Band', async () => {
    await settingsWith(null)
    render(<CalendarPage />)
    await screen.findByTestId('planning-window')
    await waitFor(() => expect(screen.queryByTestId('pause-band')).not.toBeInTheDocument())
  })

  it('zeigt bei ungültiger Pause kein Band', async () => {
    await settingsWith({ start: '13:00', end: '12:00' })
    render(<CalendarPage />)
    await screen.findByTestId('planning-window')
    await waitFor(() => expect(screen.queryByTestId('pause-band')).not.toBeInTheDocument())
  })
})

describe('Kalenderseite', () => {
  it('zeigt das heutige Datum und die Termine des Tages', async () => {
    render(<CalendarPage />)
    expect(screen.getByRole('heading', { name: 'Samstag, 17. Oktober 2026' })).toBeInTheDocument()
    expect(await screen.findByText('Fremdtermin')).toBeInTheDocument()
    expect(screen.getByText('Zahnarzt')).toBeInTheDocument()
  })

  it('Weiter, Zurück und Heute laden den passenden Zeitraum', async () => {
    const user = userEvent.setup()
    render(<CalendarPage />)
    await screen.findByText('Fremdtermin')
    const lastRange = () => calendar.listEvents.mock.calls.at(-1)?.slice(0, 2)

    await user.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(screen.getByRole('heading', { name: 'Sonntag, 18. Oktober 2026' })).toBeInTheDocument()
    await waitFor(() =>
      expect(lastRange()).toEqual(['2026-10-18T00:00:00+02:00', '2026-10-19T00:00:00+02:00']),
    )
    await user.click(screen.getByRole('button', { name: 'Zurück' }))
    await user.click(screen.getByRole('button', { name: 'Zurück' }))
    await waitFor(() =>
      expect(lastRange()).toEqual(['2026-10-16T00:00:00+02:00', '2026-10-17T00:00:00+02:00']),
    )
    await user.click(screen.getByRole('button', { name: 'Heute' }))
    expect(screen.getByRole('heading', { name: 'Samstag, 17. Oktober 2026' })).toBeInTheDocument()
    await waitFor(() =>
      expect(lastRange()).toEqual(['2026-10-17T00:00:00+02:00', '2026-10-18T00:00:00+02:00']),
    )
  })

  it('Woche zeigt 7 Spalten; ein Tageskopf öffnet diesen Tag', async () => {
    const user = userEvent.setup()
    render(<CalendarPage />)
    await user.click(screen.getByRole('button', { name: 'Woche' }))
    const columns = screen.getByTestId('time-grid').querySelectorAll('[data-day]')
    expect(Array.from(columns).map((c) => c.getAttribute('data-day'))).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ])
    expect(screen.getByText('Mo 12.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Montag, 12. Oktober 2026' }))
    expect(screen.getByRole('heading', { name: 'Montag, 12. Oktober 2026' })).toBeInTheDocument()
    expect(screen.getByTestId('time-grid').querySelectorAll('[data-day]')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Tag' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('stellt das Planungsfenster mit Position und Höhe dar', async () => {
    render(<CalendarPage />)
    const window = await screen.findByTestId('planning-window')
    expect(window).toHaveAttribute('data-start', '09:00')
    expect(window).toHaveAttribute('data-end', '19:00')
    expect(window.style.top).toBe('37.5%')
    expect(parseFloat(window.style.height)).toBeCloseTo((10 / 24) * 100, 3)
  })

  it('zeigt die Jetzt-Linie nur am heutigen Tag', async () => {
    const user = userEvent.setup()
    render(<CalendarPage />)
    const line = screen.getByTestId('now-line')
    expect(parseFloat(line.style.top)).toBeCloseTo((600 / 1440) * 100, 3)
    await user.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(screen.queryByTestId('now-line')).not.toBeInTheDocument()
  })

  it('öffnet den Termin-Dialog und daraus den Editor des verknüpften Eintrags', async () => {
    const item = await createItem({
      type: 'aufgabe',
      title: 'Zahnarzt-Vorbereitung',
      categoryId: 'privat',
      schedule: { start: '2026-10-17T14:00:00+02:00', durationMin: 60, calendarEventId: 'ev1' },
    })
    const user = userEvent.setup()
    render(<CalendarPage />)
    const tile = await screen.findByRole('button', { name: /Zahnarzt.*mit Eintrag verknüpft/ })
    expect(screen.getByRole('button', { name: /Fremdtermin/ })).not.toHaveAccessibleName(
      /verknüpft/,
    )
    await user.click(tile)
    const eventDialog = await screen.findByRole('dialog')
    expect(within(eventDialog).getByLabelText('Titel')).toHaveValue('Zahnarzt')
    await user.click(within(eventDialog).getByRole('button', { name: 'Eintrag öffnen' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Titel')).toHaveValue(item.title)
  })

  it('markiert Vorkommen einer verknüpften Serie über recurringEventId', async () => {
    await createItem({
      type: 'aufgabe',
      title: 'Wöchentliche Runde',
      categoryId: 'privat',
      schedule: { start: '2026-10-10T09:00:00+02:00', durationMin: 30, calendarEventId: 'serie1' },
    })
    calendar.listEvents.mockResolvedValue([
      {
        id: 'serie1_20261017T070000Z',
        title: 'Runde',
        start: '2026-10-17T09:00:00+02:00',
        end: '2026-10-17T09:30:00+02:00',
        allDay: false,
        recurringEventId: 'serie1',
      },
      { ...EVENTS[1], recurringEventId: 'andere' },
    ])
    render(<CalendarPage />)
    expect(
      await screen.findByRole('button', { name: /Runde.*mit Eintrag verknüpft/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Fremdtermin/ })).not.toHaveAccessibleName(
      /verknüpft/,
    )
  })

  it('zeigt ganztägige Termine nur in der Ganztags-Leiste', async () => {
    render(<CalendarPage />)
    const urlaub = await screen.findByText('Urlaub')
    expect(screen.getByTestId('allday-bar')).toContainElement(urlaub)
    expect(screen.getByTestId('time-grid')).not.toContainElement(urlaub)
  })

  it('nicht verbunden: Verbinden-Knopf, kein Abruf', async () => {
    localStorage.clear()
    const user = userEvent.setup()
    render(<CalendarPage />)
    const button = screen.getByRole('button', { name: 'Mit Google verbinden' })
    await user.click(button)
    expect(calendar.listEvents).not.toHaveBeenCalled()
  })

  it('Fehler: deutscher Hinweis, „Erneut versuchen“ lädt neu', async () => {
    calendar.listEvents.mockRejectedValueOnce(new GoogleError('offline'))
    const user = userEvent.setup()
    render(<CalendarPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Google ist nicht erreichbar')
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    expect(await screen.findByText('Fremdtermin')).toBeInTheDocument()
    expect(calendar.listEvents).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), {
      interactive: true,
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
