import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { resetDb } from '../../data/localStore'
import { listItems } from '../../data/repository'
import type { CalendarEvent } from '../../google/types'
import { GestureClaimContext } from '../../lib/gestureClaim'
import { CalendarPage } from './CalendarPage'

const calendar = vi.hoisted(() => ({ listEvents: vi.fn(), createCalendarEvent: vi.fn() }))
vi.mock('../../google/calendar', () => calendar)
vi.mock('../../google/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../google/auth')>()),
  hasClientId: () => true,
  loadGoogleScript: vi.fn().mockResolvedValue(undefined),
  getAccessToken: vi.fn().mockResolvedValue('token'),
}))

const CONNECTED_KEY = 'secondbrain.googleConnected'
const TILE: CalendarEvent = {
  id: 'ev1',
  title: 'Zahnarzt',
  start: '2026-10-17T14:00:00+02:00',
  end: '2026-10-17T15:00:00+02:00',
  allDay: false,
  editable: true,
}
const COLUMN_HEIGHT = 1152

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-17T10:07:00+02:00') })
  localStorage.clear()
  localStorage.setItem(CONNECTED_KEY, '1')
  calendar.listEvents.mockReset().mockResolvedValue([TILE])
  calendar.createCalendarEvent.mockReset().mockResolvedValue(TILE)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    left: 0,
    right: 100,
    bottom: COLUMN_HEIGHT,
    width: 100,
    height: COLUMN_HEIGHT,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  await resetDb(true)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
afterAll(() => resetDb(true))

const column = (day: string): HTMLElement => {
  const element = document.querySelector<HTMLElement>(`[data-day="${day}"]`)
  if (!element) throw new Error(`Spalte ${day} fehlt`)
  return element
}
const yFor = (minutes: number): number => (minutes / 1440) * COLUMN_HEIGHT

const dialog = () => screen.getByRole('dialog')
const field = (label: string) => within(dialog()).getByLabelText(label)

describe('Plus-Knopf', () => {
  it('öffnet den Dialog mit der nächsten Viertelstunde heute', async () => {
    render(<CalendarPage />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Neuer Termin' }))
    expect(within(dialog()).getByRole('heading', { name: 'Neuer Termin' })).toBeInTheDocument()
    expect(field('Datum')).toHaveValue('2026-10-17')
    expect(field('Beginn')).toHaveValue('10:15')
    expect(field('Ende')).toHaveValue('11:15')
    expect(within(dialog()).queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument()
  })

  it('nimmt an einem anderen Tag den Beginn des Planungsfensters', async () => {
    const user = userEvent.setup()
    render(<CalendarPage />)
    await user.click(await screen.findByRole('button', { name: 'Weiter' }))
    await user.click(screen.getByRole('button', { name: 'Neuer Termin' }))
    expect(field('Datum')).toHaveValue('2026-10-18')
    expect(field('Beginn')).toHaveValue('09:00')
  })

  it('zeigt ohne Google-Verbindung den Hinweis statt des Dialogs', async () => {
    localStorage.clear()
    render(<CalendarPage />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Neuer Termin' }))
    expect(screen.getByText('Mit Google verbinden, um Termine anzulegen.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Langes Drücken auf freie Zeit', () => {
  /** Erst nach dem Laden alle Timer faken (das Warten auf Daten braucht echte Timer). */
  const fakeAllTimers = (): void => {
    vi.useRealTimers()
    vi.useFakeTimers({ now: new Date('2026-10-17T10:07:00+02:00') })
  }

  const hold = (element: HTMLElement, y: number, ms = 450): void => {
    fireEvent.pointerDown(element, { clientX: 20, clientY: y })
    act(() => {
      vi.advanceTimersByTime(ms)
    })
    fireEvent.pointerUp(element, { clientX: 20, clientY: y })
  }

  it('öffnet nach 0,4 s in der Tagesansicht die abgerundete Viertelstunde', async () => {
    render(<CalendarPage />)
    await screen.findByRole('button', { name: /Zahnarzt/ })
    fakeAllTimers()
    hold(column('2026-10-17'), yFor(622))
    expect(field('Datum')).toHaveValue('2026-10-17')
    expect(field('Beginn')).toHaveValue('10:15')
  })

  it('öffnet in der Wochenansicht den gehaltenen Tag', async () => {
    render(<CalendarPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Woche' }))
    await screen.findByRole('button', { name: /Zahnarzt/ })
    await waitFor(() => column('2026-10-14'))
    fakeAllTimers()
    hold(column('2026-10-14'), yFor(890))
    expect(field('Datum')).toHaveValue('2026-10-14')
    expect(field('Beginn')).toHaveValue('14:45')
  })

  it('markiert die Stelle bei der Schwelle und öffnet den Dialog erst beim Loslassen', async () => {
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    render(<CalendarPage />)
    await screen.findByRole('button', { name: /Zahnarzt/ })
    fakeAllTimers()
    const col = column('2026-10-17')
    fireEvent.pointerDown(col, { clientX: 20, clientY: yFor(622) })
    expect(screen.queryByTestId('hold-mark')).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(450)
    })
    expect(screen.getByTestId('hold-mark')).toBeInTheDocument()
    expect(vibrate).toHaveBeenCalledWith(10)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.pointerUp(col, { clientX: 20, clientY: yFor(622) })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByTestId('hold-mark')).not.toBeInTheDocument()
    delete (navigator as { vibrate?: unknown }).vibrate
  })

  it('öffnet nach der Schwelle auch bei pointercancel (Systemgeste)', async () => {
    render(<CalendarPage />)
    await screen.findByRole('button', { name: /Zahnarzt/ })
    fakeAllTimers()
    const col = column('2026-10-17')
    fireEvent.pointerDown(col, { clientX: 20, clientY: yFor(622) })
    act(() => {
      vi.advanceTimersByTime(450)
    })
    fireEvent.pointerCancel(col)
    expect(field('Beginn')).toHaveValue('10:15')
  })

  it('lässt den Klick nach dem Loslassen den neuen Dialog nicht treffen', async () => {
    render(<CalendarPage />)
    await screen.findByRole('button', { name: /Zahnarzt/ })
    fakeAllTimers()
    hold(column('2026-10-17'), yFor(622))
    const onClick = vi.fn()
    field('Titel').addEventListener('click', onClick)
    fireEvent.click(field('Titel'))
    expect(onClick).not.toHaveBeenCalled()
    fireEvent.click(field('Titel'))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('beansprucht die Geste erst bei der Schwelle', async () => {
    const claim = vi.fn()
    render(
      <GestureClaimContext.Provider value={claim}>
        <CalendarPage />
      </GestureClaimContext.Provider>,
    )
    await screen.findByRole('button', { name: /Zahnarzt/ })
    fakeAllTimers()
    const col = column('2026-10-17')
    fireEvent.pointerDown(col, { clientX: 20, clientY: 300 })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(claim).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(claim).toHaveBeenCalledTimes(1)
    fireEvent.pointerUp(col, { clientX: 20, clientY: 300 })
  })

  it('öffnet nichts beim kurzen Tippen oder Klicken', async () => {
    render(<CalendarPage />)
    await screen.findByRole('button', { name: /Zahnarzt/ })
    fakeAllTimers()
    hold(column('2026-10-17'), yFor(622), 100)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.queryByTestId('hold-mark')).not.toBeInTheDocument()
  })

  describe('bricht ab bei', () => {
    const ready = async (): Promise<HTMLElement> => {
      render(<CalendarPage />)
      await screen.findByRole('button', { name: /Zahnarzt/ })
      fakeAllTimers()
      return column('2026-10-17')
    }
    const wait = (ms = 600): void => {
      act(() => {
        vi.advanceTimersByTime(ms)
      })
    }
    const scrollGrid = (): void => {
      fireEvent.scroll(document.querySelector('[data-testid="time-grid"]')!.parentElement!)
    }
    const expectNothing = (): void => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByTestId('hold-mark')).not.toBeInTheDocument()
    }

    it('Bewegung über 8 px', async () => {
      const col = await ready()
      fireEvent.pointerDown(col, { clientX: 20, clientY: 300 })
      fireEvent.pointerMove(col, { clientX: 20, clientY: 320 })
      wait()
      fireEvent.pointerUp(col, { clientX: 20, clientY: 320 })
      expectNothing()
    })

    it('pointercancel vor der Schwelle', async () => {
      const col = await ready()
      fireEvent.pointerDown(col, { clientX: 20, clientY: 300 })
      fireEvent.pointerCancel(col)
      wait()
      fireEvent.pointerUp(col, { clientX: 20, clientY: 300 })
      expectNothing()
    })

    it('Rechtsklick', async () => {
      const col = await ready()
      fireEvent.pointerDown(col, { clientX: 20, clientY: 300, button: 2 })
      wait()
      fireEvent.pointerUp(col, { clientX: 20, clientY: 300, button: 2 })
      expectNothing()
    })

    it('Scroll-Auslauf vor dem Drücken', async () => {
      const col = await ready()
      scrollGrid()
      fireEvent.pointerDown(col, { clientX: 20, clientY: 300 })
      wait()
      fireEvent.pointerUp(col, { clientX: 20, clientY: 300 })
      expectNothing()
    })

    it('Scrollen während des Haltens', async () => {
      const col = await ready()
      fireEvent.pointerDown(col, { clientX: 20, clientY: 300 })
      wait(100)
      scrollGrid()
      wait()
      fireEvent.pointerUp(col, { clientX: 20, clientY: 300 })
      expectNothing()
    })

    it('pointerleave bei der Maus, auch nach der Schwelle', async () => {
      const col = await ready()
      fireEvent.pointerDown(col, { clientX: 20, clientY: 300, pointerType: 'mouse' })
      fireEvent.pointerLeave(col, { pointerType: 'mouse' })
      wait()
      fireEvent.pointerUp(col, { clientX: 20, clientY: 300 })
      expectNothing()
      fireEvent.pointerDown(col, { clientX: 20, clientY: 300, pointerType: 'mouse' })
      wait(450)
      fireEvent.pointerLeave(col, { pointerType: 'mouse' })
      fireEvent.pointerUp(col, { clientX: 20, clientY: 300 })
      expectNothing()
    })
  })

  it('blockiert vor Ablauf das Scrollen nicht, danach schon', async () => {
    render(<CalendarPage />)
    await screen.findByRole('button', { name: /Zahnarzt/ })
    fakeAllTimers()
    const col = column('2026-10-17')
    fireEvent.pointerDown(col, { clientX: 20, clientY: 300 })
    const early = createEvent.touchMove(col, { cancelable: true })
    fireEvent(col, early)
    expect(early.defaultPrevented).toBe(false)
    act(() => {
      vi.advanceTimersByTime(450)
    })
    const late = createEvent.touchMove(col, { cancelable: true })
    fireEvent(col, late)
    expect(late.defaultPrevented).toBe(true)
    fireEvent.pointerUp(col, { clientX: 20, clientY: 300 })
  })

  it('unterdrückt das Kontextmenü bei Touch', async () => {
    render(<CalendarPage />)
    await screen.findByRole('button', { name: /Zahnarzt/ })
    fakeAllTimers()
    const col = column('2026-10-17')
    fireEvent.pointerDown(col, { clientX: 20, clientY: 300, pointerType: 'touch' })
    const menu = createEvent.contextMenu(col, { cancelable: true })
    fireEvent(col, menu)
    expect(menu.defaultPrevented).toBe(true)
  })

  it('startet auf einer Kachel kein Neu-Dialog', async () => {
    render(<CalendarPage />)
    const tile = await screen.findByRole('button', { name: /Zahnarzt/ })
    fakeAllTimers()
    hold(tile, yFor(840))
    expect(screen.queryByTestId('hold-mark')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: /Neuer Termin/ })).not.toBeInTheDocument()
  })

  it('zeigt ohne Google-Verbindung den Hinweis', async () => {
    localStorage.clear()
    render(<CalendarPage />)
    fakeAllTimers()
    hold(column('2026-10-17'), yFor(622))
    expect(screen.getByText('Mit Google verbinden, um Termine anzulegen.')).toBeInTheDocument()
  })
})

describe('Speichern', () => {
  it('legt genau einen Termin ohne Eintrag an und lädt neu', async () => {
    const user = userEvent.setup()
    render(<CalendarPage />)
    await user.click(await screen.findByRole('button', { name: 'Neuer Termin' }))
    await user.type(field('Titel'), 'Zahnreinigung')
    await user.click(within(dialog()).getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(calendar.createCalendarEvent).toHaveBeenCalledTimes(1))
    const [input, options] = calendar.createCalendarEvent.mock.calls[0]
    expect(input).toMatchObject({
      title: 'Zahnreinigung',
      timing: { allDay: false, start: '2026-10-17T10:15:00+02:00', durationMin: 60 },
    })
    expect(options).toEqual({ sendUpdates: 'none' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await listItems()).toHaveLength(0)
    await waitFor(() => expect(calendar.listEvents.mock.calls.length).toBeGreaterThan(1))
  })
})
