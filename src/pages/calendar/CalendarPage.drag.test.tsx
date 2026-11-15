import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import { resetDb } from '../../data/localStore'
import { createItem, listItems } from '../../data/repository'
import type { CalendarEvent } from '../../google/types'
import { GestureClaimContext } from '../../lib/gestureClaim'
import { hasUnsavedWork } from '../../lib/unsavedWork'
import { CalendarPage } from './CalendarPage'
import { clockLabel } from './dayLabels'
import { HOLD_MS } from './useTileDrag'

const calendar = vi.hoisted(() => ({
  listEvents: vi.fn(),
  patchCalendarEvent: vi.fn(),
  getSeries: vi.fn(),
}))
vi.mock('../../google/calendar', () => calendar)
vi.mock('./dayLabels', async (importOriginal) => {
  const original = await importOriginal<typeof import('./dayLabels')>()
  return { ...original, clockLabel: vi.fn(original.clockLabel) }
})
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
const SCROLLER_BOTTOM = 400
const claim = vi.fn()
let vibrate: ReturnType<typeof vi.fn>

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-17T10:07:00+02:00') })
  localStorage.clear()
  localStorage.setItem(CONNECTED_KEY, '1')
  claim.mockReset()
  vibrate = vi.fn()
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
  calendar.listEvents.mockReset().mockResolvedValue([TILE])
  calendar.patchCalendarEvent.mockReset().mockResolvedValue(TILE)
  calendar.getSeries.mockReset()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const index = [...document.querySelectorAll('[data-day]')].indexOf(this)
    const scroller = this.firstElementChild?.getAttribute('data-testid') === 'time-grid'
    const left = index >= 0 ? 50 + index * 100 : 0
    const height = index >= 0 ? COLUMN_HEIGHT : scroller ? SCROLLER_BOTTOM : 0
    return {
      top: 0,
      left,
      right: left + 90,
      bottom: height,
      width: 90,
      height,
      x: left,
      y: 0,
      toJSON: () => ({}),
    }
  })
  await resetDb(true)
})
afterEach(() => {
  // Gibt die Klick-Sperre nach einem Ziehen frei (läuft sonst über einen Timer).
  vi.advanceTimersByTime(1000)
  vi.restoreAllMocks()
  vi.useRealTimers()
})
afterAll(() => resetDb(true))

async function renderPage(
  events: CalendarEvent[] = [TILE],
  week = false,
  name: RegExp = /Zahnarzt/,
): Promise<HTMLElement> {
  calendar.listEvents.mockResolvedValue(events)
  if (week) localStorage.setItem('secondbrain.calendarMode', 'woche')
  render(
    <GestureClaimContext.Provider value={claim}>
      <CalendarPage />
    </GestureClaimContext.Provider>,
  )
  const tile = await screen.findByRole('button', { name })
  // Ab hier steuern Fake-Timer die Haltezeit und die Meldungen.
  vi.useRealTimers()
  vi.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    now: new Date('2026-10-17T10:07:00+02:00'),
  })
  return tile
}

const advance = (ms: number): Promise<void> =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

const touch = { pointerType: 'touch', pointerId: 7, isPrimary: true }
const mouse = { pointerType: 'mouse', pointerId: 1 }

function touchDown(element: Element, x = 70, y = 500): void {
  fireEvent.pointerDown(element, { ...touch, clientX: x, clientY: y, button: 0 })
}
function touchMoveTo(element: Element, x: number, y: number): void {
  fireEvent.pointerMove(element, { ...touch, clientX: x, clientY: y })
}
function touchUp(element: Element, x: number, y: number): void {
  fireEvent.pointerUp(element, { ...touch, clientX: x, clientY: y })
}

describe('Langes Drücken (Touch)', () => {
  it('startet nach 0,4 s den Ziehmodus, beansprucht die Geste und blockiert das Scrollen', async () => {
    const tile = await renderPage()
    touchDown(tile)
    expect(claim).not.toHaveBeenCalled()
    await advance(HOLD_MS - 10)
    expect(claim).not.toHaveBeenCalled()
    await advance(20)
    expect(claim).toHaveBeenCalledTimes(1)
    expect(vibrate).toHaveBeenCalledWith(10)
    const notPrevented = fireEvent.touchMove(tile, {
      touches: [{ clientX: 70, clientY: 520 }],
    })
    expect(notPrevented).toBe(false)
  })

  it('lässt die Geste vor Ablauf in Ruhe: Bewegung ⇒ kein Ziehen, touchmove bleibt frei', async () => {
    const tile = await renderPage()
    touchDown(tile)
    await advance(100)
    touchMoveTo(tile, 70, 520)
    await advance(HOLD_MS)
    expect(claim).not.toHaveBeenCalled()
    expect(fireEvent.touchMove(tile, { touches: [{ clientX: 70, clientY: 540 }] })).toBe(true)
    touchUp(tile, 70, 540)
    await advance(10)
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
  })

  it('verschiebt beim Loslassen im 15-Minuten-Raster und speichert genau einmal', async () => {
    const tile = await renderPage()
    touchDown(tile)
    await advance(HOLD_MS + 10)
    touchMoveTo(tile, 70, 524) // +30 Min.
    expect(screen.getByRole('status')).toHaveTextContent('Sa 17.10., 14:30–15:30')
    touchUp(tile, 70, 524)
    await advance(10)
    expect(calendar.patchCalendarEvent).toHaveBeenCalledTimes(1)
    const [id, changes, options] = calendar.patchCalendarEvent.mock.calls[0]
    expect(id).toBe('ev1')
    expect(changes).toEqual({
      timing: { allDay: false, start: '2026-10-17T14:30:00+02:00', durationMin: 60 },
      wasAllDay: false,
    })
    expect(options).toEqual({ sendUpdates: 'none' })
    expect(screen.getByRole('status')).toHaveTextContent('Verschoben auf Sa 17.10., 14:30')
    expect(screen.getByRole('button', { name: 'Rückgängig' })).toBeInTheDocument()
  })

  it('löst danach weder den Dialog noch einen Tap auf freie Zeit aus', async () => {
    const tile = await renderPage()
    touchDown(tile)
    await advance(HOLD_MS + 10)
    touchMoveTo(tile, 70, 524)
    touchUp(tile, 70, 524)
    await advance(10)
    fireEvent.click(tile)
    const column = document.querySelector('[data-day="2026-10-17"]')!
    fireEvent.pointerUp(column, { ...touch, clientX: 70, clientY: 524 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('speichert bei Abbruch (pointercancel) und Escape nichts', async () => {
    const tile = await renderPage()
    touchDown(tile)
    await advance(HOLD_MS + 10)
    touchMoveTo(tile, 70, 548)
    fireEvent.pointerCancel(tile, touch)
    touchUp(tile, 70, 548)

    touchDown(tile)
    await advance(HOLD_MS + 10)
    touchMoveTo(tile, 70, 548)
    fireEvent.keyDown(window, { key: 'Escape' })
    touchUp(tile, 70, 548)
    await advance(10)
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('unterdrückt das Kontextmenü auf Terminen bei Berührung', async () => {
    const tile = await renderPage()
    touchDown(tile)
    expect(fireEvent.contextMenu(tile)).toBe(false)
  })
})

describe('Antippen ohne Ziehen behält die Höhe', () => {
  const NINETY: CalendarEvent = { ...TILE, end: '2026-10-17T15:30:00+02:00' }

  it('Touch-Tap (< 400 ms) lässt die Höhe unverändert und öffnet den Dialog', async () => {
    const tile = await renderPage([NINETY])
    const height = tile.style.height
    expect(height).not.toBe('')
    touchDown(tile)
    await advance(100)
    touchUp(tile, 70, 500)
    fireEvent.click(tile)
    expect(tile.style.height).toBe(height)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('kurzer Mausklick lässt die Höhe unverändert und öffnet den Dialog', async () => {
    const tile = await renderPage([NINETY])
    const height = tile.style.height
    fireEvent.pointerDown(tile, { ...mouse, button: 0, buttons: 1, clientX: 70, clientY: 500 })
    fireEvent.pointerUp(tile, { ...mouse, clientX: 70, clientY: 500 })
    fireEvent.click(tile)
    expect(tile.style.height).toBe(height)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('Halten über 400 ms ohne Verschieben lässt die Höhe unverändert', async () => {
    const tile = await renderPage([NINETY])
    const height = tile.style.height
    touchDown(tile)
    await advance(HOLD_MS + 50)
    touchUp(tile, 70, 500)
    expect(tile.style.height).toBe(height)
    expect(tile.style.translate).toBe('')
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
  })
})

describe('Maus', () => {
  it('zieht ab 5 px mit gedrückter Taste; ein Klick ohne Ziehen öffnet den Dialog', async () => {
    const tile = await renderPage()
    fireEvent.pointerDown(tile, { ...mouse, button: 0, buttons: 1, clientX: 70, clientY: 500 })
    fireEvent.pointerMove(tile, { ...mouse, buttons: 1, clientX: 70, clientY: 503 })
    fireEvent.pointerUp(tile, { ...mouse, clientX: 70, clientY: 503 })
    fireEvent.click(tile)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
  })

  it('verschiebt und unterdrückt den folgenden Klick', async () => {
    const tile = await renderPage()
    fireEvent.pointerDown(tile, { ...mouse, button: 0, buttons: 1, clientX: 70, clientY: 500 })
    fireEvent.pointerMove(tile, { ...mouse, buttons: 1, clientX: 70, clientY: 524 })
    fireEvent.pointerUp(tile, { ...mouse, clientX: 70, clientY: 524 })
    fireEvent.click(tile)
    await advance(10)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(calendar.patchCalendarEvent).toHaveBeenCalledTimes(1)
    expect(calendar.patchCalendarEvent.mock.calls[0][1].timing.start).toBe(
      '2026-10-17T14:30:00+02:00',
    )
  })

  it('ändert am unteren Griff nur die Dauer (min. 15 Minuten)', async () => {
    const tile = await renderPage()
    const handle = tile.querySelector('[data-resize-handle]')!
    fireEvent.pointerDown(handle, { ...mouse, button: 0, buttons: 1, clientX: 70, clientY: 500 })
    fireEvent.pointerMove(handle, { ...mouse, buttons: 1, clientX: 70, clientY: 524 })
    fireEvent.pointerUp(handle, { ...mouse, clientX: 70, clientY: 524 })
    await advance(10)
    expect(calendar.patchCalendarEvent.mock.calls[0][1].timing).toEqual({
      allDay: false,
      start: '2026-10-17T14:00:00+02:00',
      durationMin: 90,
    })
    expect(screen.getByRole('status')).toHaveTextContent('Dauer: 1 Std. 30 Min.')

    fireEvent.pointerDown(handle, { ...mouse, button: 0, buttons: 1, clientX: 70, clientY: 500 })
    fireEvent.pointerMove(handle, { ...mouse, buttons: 1, clientX: 70, clientY: -900 })
    fireEvent.pointerUp(handle, { ...mouse, clientX: 70, clientY: -900 })
    await advance(10)
    expect(calendar.patchCalendarEvent.mock.calls[1][1].timing.durationMin).toBe(15)
  })

  it('setzt nach abgebrochener Dauer-Änderung die Höhe der Kachel zurück', async () => {
    const tile = await renderPage()
    const height = tile.style.height
    const handle = tile.querySelector('[data-resize-handle]')!
    fireEvent.pointerDown(handle, { ...mouse, button: 0, buttons: 1, clientX: 70, clientY: 500 })
    fireEvent.pointerMove(handle, { ...mouse, buttons: 1, clientX: 70, clientY: 548 })
    expect(tile.style.height).not.toBe(height)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(tile.style.height).toBe(height)
    expect(tile.style.height).not.toBe('')
    await advance(10)
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
  })

  it('wechselt in der Woche den Tag', async () => {
    const tile = await renderPage([TILE], true)
    // Spalten: Mo (links 50) … Sa (links 550) … So (links 650)
    fireEvent.pointerDown(tile, { ...mouse, button: 0, buttons: 1, clientX: 560, clientY: 500 })
    fireEvent.pointerMove(tile, { ...mouse, buttons: 1, clientX: 660, clientY: 500 })
    fireEvent.pointerUp(tile, { ...mouse, clientX: 660, clientY: 500 })
    await advance(10)
    expect(calendar.patchCalendarEvent.mock.calls[0][1].timing.start).toBe(
      '2026-10-18T14:00:00+02:00',
    )
    expect(screen.getByRole('status')).toHaveTextContent('Verschoben auf So 18.10., 14:00')
  })

  it('scrollt die Zeitleiste automatisch am unteren Rand', async () => {
    const tile = await renderPage()
    const scroller = document.querySelector('[data-testid="time-grid"]')!.parentElement!
    scroller.scrollTop = 0
    fireEvent.pointerDown(tile, { ...mouse, button: 0, buttons: 1, clientX: 70, clientY: 300 })
    fireEvent.pointerMove(tile, { ...mouse, buttons: 1, clientX: 70, clientY: SCROLLER_BOTTOM })
    await advance(100)
    expect(scroller.scrollTop).toBeGreaterThan(0)
    fireEvent.keyDown(window, { key: 'Escape' })
  })
})

describe('Nicht ziehbare Termine', () => {
  it('Einladungen und ganztägige Termine lassen sich nicht ziehen', async () => {
    const invite: CalendarEvent = { ...TILE, title: 'Einladung', editable: false }
    const allDay: CalendarEvent = {
      id: 'ev9',
      title: 'Zahnarzt Urlaub',
      start: '2026-10-17',
      end: '2026-10-18',
      allDay: true,
      editable: true,
    }
    await renderPage([invite, allDay], false, /Einladung/)
    for (const name of [/Einladung/, /Urlaub/]) {
      const tile = screen.getByRole('button', { name })
      expect(tile.querySelector('[data-resize-handle]')).toBeNull()
      touchDown(tile)
      await advance(HOLD_MS + 10)
      touchMoveTo(tile, 70, 548)
      touchUp(tile, 70, 548)
    }
    expect(claim).not.toHaveBeenCalled()
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
  })
})

describe('Serien, Gäste, Einträge', () => {
  it('lässt bei einer verknüpften Serie den Eintrag unverändert und patcht nur das Vorkommen', async () => {
    const schedule = {
      start: '2026-10-10T14:00:00+02:00',
      durationMin: 60,
      calendarEventId: 'serie',
    }
    await createItem({ type: 'aufgabe', title: 'Runde', categoryId: 'privat', schedule })
    const occurrence: CalendarEvent = { ...TILE, id: 'serie_2026', recurringEventId: 'serie' }
    const tile = await renderPage([occurrence])
    await advance(10)
    fireEvent.pointerDown(tile, { ...mouse, button: 0, buttons: 1, clientX: 70, clientY: 500 })
    fireEvent.pointerMove(tile, { ...mouse, buttons: 1, clientX: 70, clientY: 524 })
    fireEvent.pointerUp(tile, { ...mouse, clientX: 70, clientY: 524 })
    await advance(10)
    expect(calendar.patchCalendarEvent).toHaveBeenCalledTimes(1)
    expect(calendar.patchCalendarEvent.mock.calls[0][0]).toBe('serie_2026')
    const stored = listItems()
    await advance(50)
    expect((await stored)[0].schedule).toEqual(schedule)
  })

  it('rendert die Kachel beim Bewegen innerhalb eines 15-Minuten-Schritts nicht neu', async () => {
    const tile = await renderPage()
    fireEvent.pointerDown(tile, { ...mouse, button: 0, buttons: 1, clientX: 70, clientY: 500 })
    fireEvent.pointerMove(tile, { ...mouse, buttons: 1, clientX: 70, clientY: 524 })
    const badge = screen.getByRole('status')
    const renders = vi.mocked(clockLabel).mock.calls.length
    fireEvent.pointerMove(tile, { ...mouse, buttons: 1, clientX: 74, clientY: 526 })
    fireEvent.pointerMove(tile, { ...mouse, buttons: 1, clientX: 80, clientY: 527 })
    expect(vi.mocked(clockLabel).mock.calls.length).toBe(renders)
    expect(badge.style.left).toBe('80px')
    expect(badge.style.top).toBe('527px')
    fireEvent.pointerMove(tile, { ...mouse, buttons: 1, clientX: 80, clientY: 548 })
    expect(vi.mocked(clockLabel).mock.calls.length).toBeGreaterThan(renders)
    fireEvent.keyDown(window, { key: 'Escape' })
  })

  it('verschiebt bei einer Serie nur das Vorkommen', async () => {
    const occurrence: CalendarEvent = { ...TILE, id: 'serie_2026', recurringEventId: 'serie' }
    const tile = await renderPage([occurrence])
    fireEvent.pointerDown(tile, { ...mouse, button: 0, buttons: 1, clientX: 70, clientY: 500 })
    fireEvent.pointerMove(tile, { ...mouse, buttons: 1, clientX: 70, clientY: 524 })
    fireEvent.pointerUp(tile, { ...mouse, clientX: 70, clientY: 524 })
    await advance(10)
    expect(calendar.patchCalendarEvent).toHaveBeenCalledTimes(1)
    expect(calendar.patchCalendarEvent.mock.calls[0][0]).toBe('serie_2026')
    expect(calendar.getSeries).not.toHaveBeenCalled()
  })

  it('fragt bei Gästen vorher und sendet je nach Antwort', async () => {
    const tile = await renderPage(
      [{ ...TILE, title: 'Gast-Termin', hasGuests: true }],
      false,
      /Gast-Termin/,
    )
    fireEvent.pointerDown(tile, { ...mouse, button: 0, buttons: 1, clientX: 70, clientY: 500 })
    fireEvent.pointerMove(tile, { ...mouse, buttons: 1, clientX: 70, clientY: 524 })
    fireEvent.pointerUp(tile, { ...mouse, clientX: 70, clientY: 524 })
    await advance(10)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Gäste benachrichtigen?')).toBeInTheDocument()
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByLabelText('Ja'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    await advance(10)
    expect(calendar.patchCalendarEvent).toHaveBeenCalledTimes(1)
    expect(calendar.patchCalendarEvent.mock.calls[0][2]).toEqual({ sendUpdates: 'all' })
  })

  it('speichert bei „Abbrechen“ der Gäste-Rückfrage nichts', async () => {
    const tile = await renderPage(
      [{ ...TILE, title: 'Gast-Termin', hasGuests: true }],
      false,
      /Gast-Termin/,
    )
    fireEvent.pointerDown(tile, { ...mouse, button: 0, buttons: 1, clientX: 70, clientY: 500 })
    fireEvent.pointerMove(tile, { ...mouse, buttons: 1, clientX: 70, clientY: 524 })
    fireEvent.pointerUp(tile, { ...mouse, clientX: 70, clientY: 524 })
    await advance(10)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Abbrechen' }))
    await advance(10)
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('aktualisiert den verknüpften Eintrag und stellt ihn mit „Rückgängig“ wieder her', async () => {
    await createItem({
      type: 'aufgabe',
      title: 'Zahnarzt-Vorbereitung',
      categoryId: 'privat',
      schedule: { start: '2026-10-17T14:00:00+02:00', durationMin: 60, calendarEventId: 'ev1' },
    })
    const tile = await renderPage()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    fireEvent.pointerDown(tile, { ...mouse, button: 0, buttons: 1, clientX: 70, clientY: 500 })
    fireEvent.pointerMove(tile, { ...mouse, buttons: 1, clientX: 70, clientY: 524 })
    fireEvent.pointerUp(tile, { ...mouse, clientX: 70, clientY: 524 })
    await advance(10)
    const stored = listItems()
    await advance(50)
    expect((await stored)[0].schedule?.start).toBe('2026-10-17T14:30:00+02:00')
    await advance(500)
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }))
    await advance(10)
    expect(calendar.patchCalendarEvent).toHaveBeenCalledTimes(2)
    expect(calendar.patchCalendarEvent.mock.calls[1][1].timing.start).toBe(
      '2026-10-17T14:00:00+02:00',
    )
    expect(screen.queryByRole('button', { name: 'Rückgängig' })).not.toBeInTheDocument()
  })

  it('blendet die Meldung nach 5 s aus', async () => {
    const tile = await renderPage()
    fireEvent.pointerDown(tile, { ...mouse, button: 0, buttons: 1, clientX: 70, clientY: 500 })
    fireEvent.pointerMove(tile, { ...mouse, buttons: 1, clientX: 70, clientY: 524 })
    fireEvent.pointerUp(tile, { ...mouse, clientX: 70, clientY: 524 })
    await advance(10)
    expect(screen.getByRole('button', { name: 'Rückgängig' })).toBeInTheDocument()
    await advance(5000)
    expect(screen.queryByRole('button', { name: 'Rückgängig' })).not.toBeInTheDocument()
  })

  it('zeigt bei einem Fehler eine Meldung und die Kachel springt zurück', async () => {
    calendar.patchCalendarEvent.mockRejectedValue(new Error('kaputt'))
    const tile = await renderPage()
    fireEvent.pointerDown(tile, { ...mouse, button: 0, buttons: 1, clientX: 70, clientY: 500 })
    fireEvent.pointerMove(tile, { ...mouse, buttons: 1, clientX: 70, clientY: 524 })
    fireEvent.pointerUp(tile, { ...mouse, clientX: 70, clientY: 524 })
    await advance(10)
    expect(screen.getByRole('alert')).toHaveTextContent('Das hat nicht geklappt')
    expect(screen.getByRole('button', { name: /Zahnarzt, 14:00/ })).toBeInTheDocument()
  })
})

describe('Register „ungespeichert“', () => {
  it('meldet das Ziehen eines Termins an und nach dem Loslassen ab', async () => {
    const tile = await renderPage()
    expect(hasUnsavedWork()).toBe(false)
    touchDown(tile)
    await advance(HOLD_MS + 10)
    expect(hasUnsavedWork()).toBe(true)
    touchUp(tile, 70, 500)
    await advance(10)
    expect(hasUnsavedWork()).toBe(false)
  })
})
