import { act, fireEvent, render, screen } from '@testing-library/react'
import { App } from './App'
import { clearErrorLog, getErrorLog } from './data/errorLog'
import { resetDb } from './data/localStore'
import { resetSyncStatus } from './data/syncStatus'
import { markFirstRunDone } from './lib/firstRun'

beforeEach(async () => {
  vi.stubGlobal('innerWidth', 390)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  localStorage.clear()
  markFirstRunDone()
  sessionStorage.clear()
  await resetDb(true)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  act(() => resetSyncStatus())
})

const touch = { pointerType: 'touch', pointerId: 1 }
const track = () => screen.getByTestId('page-track')
const main = () => screen.getByRole('main')
const slots = () => [...track().children] as HTMLElement[]
const visible = () => slots().map((s) => s.style.visibility === 'visible')
const transforms = () => slots().map((s) => s.style.transform)

function drag(x: number) {
  fireEvent.pointerDown(main(), { ...touch, clientX: 300, clientY: 300 })
  fireEvent.pointerMove(main(), { ...touch, clientX: x, clientY: 300 })
}
const release = (x: number) => fireEvent.pointerUp(main(), { ...touch, clientX: x, clientY: 300 })

function expectRest() {
  expect(transforms()).toEqual(['', '', '', ''])
  expect(visible()).toEqual([false, false, false, false])
  expect(track()).not.toHaveAttribute('data-dragging')
  expect(track()).not.toHaveAttribute('data-moving')
}

function expectCurrentDot(name: string) {
  expect(screen.getByRole('button', { name: `Seite: ${name}` })).toHaveAttribute(
    'aria-current',
    'page',
  )
}

function mockReducedMotion() {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: true,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  )
}

describe('Ruhelage ohne große transformierte Ebene (Aufgabe 74)', () => {
  it('in Ruhe: weder Leiste noch Seiten haben einen Transform, nur die aktive Seite ist markiert', () => {
    render(<App />)
    expectRest()
    expect(track().style.transform).toBe('')
    expect(main().style.transform).toBe('')
    expect(slots().map((s) => s.hasAttribute('data-active'))).toEqual([false, true, false, false])
  })

  it('Geste: aktive Seite und beide Nachbarn sichtbar; nach der Rückfallzeit nur noch die aktive', () => {
    render(<App />)
    drag(240)
    expect(visible()).toEqual([true, true, true, false])
    expect(track()).toHaveAttribute('data-dragging')
    release(60)
    expect(visible()).toEqual([true, true, true, false])
    expect(track()).toHaveAttribute('data-moving')
    expect(transforms()[2]).toBe('translate3d(calc(0% + 0px), 0, 0)')
    act(() => vi.advanceTimersByTime(399))
    expect(track()).toHaveAttribute('data-moving')
    act(() => vi.advanceTimersByTime(2))
    expectRest()
    expectCurrentDot('Aufgaben')
  })

  it('transitionend beendet den Übergang vor der Rückfallzeit', () => {
    render(<App />)
    drag(100)
    release(100)
    expect(track()).toHaveAttribute('data-moving')
    const event = new Event('transitionend', { bubbles: true })
    Object.defineProperty(event, 'propertyName', { value: 'transform' })
    fireEvent(slots()[2], event)
    expectRest()
  })

  it('zurückfedernde Geste endet in Ruhe auf der alten Seite', () => {
    render(<App />)
    drag(280)
    release(280)
    expect(track()).toHaveAttribute('data-moving')
    act(() => vi.advanceTimersByTime(401))
    expectRest()
    expectCurrentDot('Erfassung')
  })

  it('Tastenwechsel gleitet und endet in Ruhe', () => {
    render(<App />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(visible()).toEqual([true, true, true, false])
    expect(track()).toHaveAttribute('data-moving')
    act(() => vi.advanceTimersByTime(401))
    expectRest()
    expectCurrentDot('Aufgaben')
  })

  it('reduzierte Bewegung: sofort in Ruhe, nie sichtbare Nachbarn', () => {
    mockReducedMotion()
    render(<App />)
    drag(100)
    expectRest()
    release(100)
    expectRest()
    expectCurrentDot('Aufgaben')
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expectRest()
    expectCurrentDot('Erfassung')
  })
})

describe('Seitenbereich nie scrollbar (Aufgabe 74)', () => {
  it('setzt einen Scroll-Versatz von main auf 0 zurück und protokolliert einmalig', () => {
    clearErrorLog()
    render(<App />)
    main().scrollLeft = 25
    fireEvent.scroll(main())
    expect(main().scrollLeft).toBe(0)
    main().scrollLeft = 10
    fireEvent.scroll(main())
    expect(main().scrollLeft).toBe(0)
    const entries = getErrorLog().filter((e) => e.message.includes('Seitenbereich war verschoben'))
    expect(entries).toHaveLength(1)
    expect(entries[0].message).toContain('(25/0)')
  })
})
