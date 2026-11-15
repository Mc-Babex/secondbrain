import { act, renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import { clearErrorLog, getErrorLog } from '../data/errorLog'
import {
  WATCHDOG_DELAY_MS,
  checkDisplay,
  describeMeasure,
  isDisplayBlank,
  isDisplayShifted,
  measureDisplay,
  useDisplayWatchdog,
} from './displayWatchdog'

const rect = (height: number, top = 0, left = 0) => ({
  top,
  left,
  bottom: top + height,
  right: left + 390,
  height,
  width: 390,
  x: left,
  y: top,
  toJSON: () => ({}),
})

function setup(height: number, top = 0) {
  const main = document.createElement('main')
  const track = document.createElement('div')
  const page = document.createElement('div')
  track.append(page)
  page.style.transform = 'translate3d(0%, 0, 0)'
  document.body.append(main, track)
  vi.spyOn(main, 'getBoundingClientRect').mockReturnValue(rect(height))
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue(rect(height))
  vi.spyOn(page, 'getBoundingClientRect').mockReturnValue(rect(height, top))
  return { main, track, page }
}

beforeEach(() => {
  clearErrorLog()
  vi.stubGlobal('innerHeight', 800)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('Anzeige-Wächter', () => {
  it('protokolliert „Seite leer“ mit Messwerten bei Höhe 0', () => {
    const { main, track } = setup(0)
    expect(checkDisplay(main, track, 0)).toBe(true)
    const [entry] = getErrorLog()
    expect(entry.area).toBe('Anzeige')
    expect(entry.message).toContain('Seite leer')
    expect(entry.message).toContain('innen')
    expect(entry.message).toContain('tf translate3d')
  })

  it('protokolliert, wenn die Seite außerhalb des Fensters liegt oder versteckt ist', () => {
    const outside = setup(500, 900)
    expect(checkDisplay(outside.main, outside.track, 0)).toBe(true)
    const hidden = setup(500)
    hidden.page.style.visibility = 'hidden'
    expect(checkDisplay(hidden.main, hidden.track, 0)).toBe(true)
  })

  it('protokolliert bei normalen Messwerten nichts', () => {
    const { main, track } = setup(700)
    expect(checkDisplay(main, track, 0)).toBe(false)
    expect(getErrorLog()).toEqual([])
  })

  it('beschreibt die Messung und meldet fehlende Elemente nicht als leer', () => {
    const { main, track } = setup(700)
    const measure = measureDisplay(main, track, 0)
    expect(measure && isDisplayBlank(measure)).toBe(false)
    expect(measure && describeMeasure(measure)).toContain('Seite 0')
    expect(measureDisplay(null, track, 0)).toBeNull()
    expect(checkDisplay(null, null, 0)).toBe(false)
  })

  it('meldet einen Scroll-Versatz von main mit Messwerten', () => {
    const { main, track } = setup(700)
    main.scrollLeft = 12
    expect(checkDisplay(main, track, 0)).toBe(true)
    const [entry] = getErrorLog()
    expect(entry.message).toContain('Seite verschoben')
    expect(entry.message).toContain('scroll 12/0')
  })

  it('meldet, wenn die aktive Seite in Ruhe nicht an der Position von main steht', () => {
    const { main, track, page } = setup(700)
    vi.spyOn(page, 'getBoundingClientRect').mockReturnValue(rect(700, 0, 390))
    const measure = measureDisplay(main, track, 0)
    expect(measure && isDisplayShifted(measure)).toBe(true)
    expect(checkDisplay(main, track, 0)).toBe(true)
    expect(getErrorLog()[0].message).toContain('Seite 0, innen')
  })

  it('meldet die Abweichung nicht, solange gewischt oder übergeblendet wird', () => {
    const { main, track, page } = setup(700)
    vi.spyOn(page, 'getBoundingClientRect').mockReturnValue(rect(700, 0, 200))
    track.dataset.moving = ''
    expect(checkDisplay(main, track, 0)).toBe(false)
    delete track.dataset.moving
    track.dataset.dragging = ''
    expect(checkDisplay(main, track, 0)).toBe(false)
  })
})

describe('Wächter nach Dialog', () => {
  it('prüft nach dem Schließen eines Dialogs', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { main, track } = setup(0)
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.append(dialog)
    const { unmount } = renderHook(() =>
      useDisplayWatchdog({ current: main }, { current: track }, 0),
    )
    act(() => vi.advanceTimersByTime(WATCHDOG_DELAY_MS + 10))
    clearErrorLog()
    dialog.remove()
    await act(async () => {
      await Promise.resolve()
    })
    act(() => vi.advanceTimersByTime(WATCHDOG_DELAY_MS + 10))
    expect(getErrorLog()[0].message).toContain('Seite leer')
    unmount()
    vi.useRealTimers()
  })
})
