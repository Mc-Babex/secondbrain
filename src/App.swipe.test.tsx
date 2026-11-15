import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { resetDb } from './data/localStore'
import { resetSyncStatus } from './data/syncStatus'
import { markFirstRunDone } from './lib/firstRun'

beforeEach(async () => {
  vi.stubGlobal('innerWidth', 390)
  localStorage.clear()
  markFirstRunDone()
  sessionStorage.clear()
  await resetDb(true)
})
afterEach(() => {
  vi.unstubAllGlobals()
  act(() => resetSyncStatus())
})

const touch = { pointerType: 'touch', pointerId: 1 }
const mouse = { pointerType: 'mouse', pointerId: 1 }

const track = () => screen.getByTestId('page-track')
const main = () => screen.getByRole('main')
const slot = (i: number) => track().children[i] as HTMLElement
const slots = () => [...track().children] as HTMLElement[]
/** Ruhelage: kein Transform, keine Markierungen, nur die aktive Seite sichtbar (CSS). */
function expectRest() {
  expect(slots().map((s) => s.style.transform)).toEqual(['', '', '', ''])
  expect(slots().map((s) => s.style.visibility)).toEqual(['', '', '', ''])
  expect(track()).not.toHaveAttribute('data-dragging')
  expect(track()).not.toHaveAttribute('data-moving')
}
/** Seite `i` ist Ziel (am Ziel oder auf dem Weg dorthin), nichts wird mehr gezogen. */
function expectTarget(i: number) {
  expect(track()).not.toHaveAttribute('data-dragging')
  expect(['', 'translate3d(calc(0% + 0px), 0, 0)']).toContain(slot(i).style.transform)
}
const frame = () => act(() => new Promise<void>((done) => requestAnimationFrame(() => done())))
const move = (x: number, y = 300) =>
  fireEvent.pointerMove(main(), { ...touch, clientX: x, clientY: y })
const release = (x: number, y = 300) =>
  fireEvent.pointerUp(main(), { ...touch, clientX: x, clientY: y })

function drag(x: number, y = 300) {
  fireEvent.pointerDown(main(), { ...touch, clientX: 300, clientY: y })
  move(x, y)
}

function expectCurrentDot(name: string) {
  expect(screen.getByRole('button', { name: `Seite: ${name}` })).toHaveAttribute(
    'aria-current',
    'page',
  )
}

describe('Flüssiges Wischen', () => {
  it('bewegt die Leiste mit dem Finger und rastet beim Loslassen auf der Nachbarseite ein', async () => {
    render(<App />)
    expectRest()
    drag(240)
    await frame()
    expect(slot(1).style.transform).toBe('translate3d(calc(0% + -60px), 0, 0)')
    expect(slot(2).style.transform).toBe('translate3d(calc(100% + -60px), 0, 0)')
    expect(track()).toHaveAttribute('data-dragging')
    move(60)
    await frame()
    expect(slot(1).style.transform).toBe('translate3d(calc(0% + -240px), 0, 0)')
    release(60)
    expect(slot(2).style.transform).toBe('translate3d(calc(0% + 0px), 0, 0)')
    expect(slot(1).style.transform).toBe('translate3d(calc(-100% + 0px), 0, 0)')
    expect(track()).not.toHaveAttribute('data-dragging')
    expectCurrentDot('Aufgaben')
  })

  it('federt bei kurzem, langsamem Ziehen zurück', async () => {
    render(<App />)
    drag(280)
    await frame()
    release(280)
    expectTarget(1)
    expectCurrentDot('Erfassung')
  })

  it('dämpft das Ziehen über den Rand hinaus und wechselt dort nicht', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.keyboard('{ArrowLeft}')
    drag(300)
    move(500)
    await frame()
    const offset = Number(/calc\(0% \+ ([\d.]+)px\)/.exec(slot(0).style.transform)?.[1])
    expect(offset).toBeGreaterThan(0)
    expect(offset).toBeLessThan(100)
    release(500)
    expectCurrentDot('Kalender')
  })

  it('setzt nicht aktive Seiten auf inert', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    const inertHeadings = () =>
      [...container.querySelectorAll('[inert]')].map((el) => el.querySelector('h1,h2')?.textContent)
    expect(container.querySelectorAll('[inert]')).toHaveLength(3)
    expect(inertHeadings()).not.toContain('Erfassung')
    await user.keyboard('{ArrowRight}')
    expect(container.querySelectorAll('[inert]')).toHaveLength(3)
    expect(inertHeadings()).not.toContain('Aufgaben')
  })

  it('bewegt die Leiste bei Ausnahmen nicht', async () => {
    render(<App />)
    // senkrecht
    drag(290, 400)
    release(290, 400)
    // Randstreifen
    drag(100, 10)
    release(100, 10)
    // data-no-swipe
    const zone = document.createElement('div')
    zone.setAttribute('data-no-swipe', '')
    main().appendChild(zone)
    fireEvent.pointerDown(zone, { ...touch, clientX: 300, clientY: 300 })
    fireEvent.pointerMove(zone, { ...touch, clientX: 100, clientY: 300 })
    fireEvent.pointerUp(zone, { ...touch, clientX: 100, clientY: 300 })
    // zweiter Finger
    fireEvent.pointerDown(main(), { ...touch, clientX: 300, clientY: 300 })
    fireEvent.pointerDown(main(), {
      pointerType: 'touch',
      pointerId: 2,
      clientX: 320,
      clientY: 300,
    })
    move(100)
    // offener Dialog
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    drag(100)
    dialog.remove()
    await frame()
    await waitFor(expectRest)
    expect(track()).not.toHaveAttribute('data-dragging')
  })

  it('bewegt die Leiste nicht bei waagerecht scrollbarem Bereich und bei Textauswahl', async () => {
    render(<App />)
    const scroller = document.createElement('div')
    scroller.style.overflowX = 'auto'
    Object.defineProperty(scroller, 'scrollWidth', { value: 600 })
    Object.defineProperty(scroller, 'clientWidth', { value: 300 })
    main().appendChild(scroller)
    fireEvent.pointerDown(scroller, { ...touch, clientX: 300, clientY: 300 })
    fireEvent.pointerMove(scroller, { ...touch, clientX: 100, clientY: 300 })
    fireEvent.pointerUp(scroller, { ...touch, clientX: 100, clientY: 300 })

    const field = screen.getByLabelText('Text') as HTMLTextAreaElement
    field.value = 'Milch kaufen'
    field.setSelectionRange(0, 5)
    fireEvent.pointerDown(field, { ...touch, clientX: 300, clientY: 300 })
    fireEvent.pointerMove(field, { ...touch, clientX: 100, clientY: 300 })
    fireEvent.pointerUp(field, { ...touch, clientX: 100, clientY: 300 })
    await frame()
    expectRest()
  })

  it('Pfeiltasten und Punkte wechseln über den Übergang, auch über mehrere Seiten', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.keyboard('{ArrowRight}')
    expect(slot(2).style.transform).toBe('translate3d(calc(0% + 0px), 0, 0)')
    await user.click(screen.getByRole('button', { name: 'Seite: Kalender' }))
    expect(slot(0).style.transform).toBe('translate3d(calc(0% + 0px), 0, 0)')
    expect(track()).not.toHaveAttribute('data-reduced')
  })

  it('Pfeiltasten wechseln nicht bei offenem Dialog', async () => {
    const user = userEvent.setup()
    render(<App />)
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    await user.keyboard('{ArrowRight}')
    dialog.remove()
    expectRest()
  })

  it('wechselt bei reduzierter Bewegung ohne Übergang und ohne Mitziehen', async () => {
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
    render(<App />)
    expect(track()).toHaveAttribute('data-reduced')
    drag(100)
    await frame()
    expectRest()
    release(100)
    expectCurrentDot('Aufgaben')
  })

  it('Maus: einfacher Klick bleibt ein Klick, nach dem Ziehen wird der Klick unterdrückt', async () => {
    render(<App />)
    const gear = screen.getByRole('button', { name: 'Einstellungen' })
    fireEvent.pointerDown(gear, { ...mouse, clientX: 20, clientY: 20 })
    fireEvent.pointerUp(gear, { ...mouse, clientX: 20, clientY: 20 })
    fireEvent.click(gear)
    expect(await screen.findByRole('heading', { name: 'Einstellungen' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Zurück' }))
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Einstellungen' })).not.toBeInTheDocument(),
    )

    fireEvent.pointerDown(main(), { ...mouse, clientX: 300, clientY: 300 })
    fireEvent.pointerMove(main(), { ...mouse, clientX: 100, clientY: 300 })
    fireEvent.pointerUp(main(), { ...mouse, clientX: 100, clientY: 300 })
    fireEvent.click(screen.getByRole('button', { name: 'Einstellungen' }))
    expect(screen.queryByRole('heading', { name: 'Einstellungen' })).not.toBeInTheDocument()
    expectCurrentDot('Aufgaben')
  })

  it('Maus: Ziehen beginnt nicht auf Knöpfen', () => {
    render(<App />)
    const button = main().querySelector('button')
    if (!button) throw new Error('kein Knopf auf der Seite')
    fireEvent.pointerDown(button, { ...mouse, clientX: 300, clientY: 300 })
    fireEvent.pointerMove(main(), { ...mouse, clientX: 100, clientY: 300 })
    fireEvent.pointerUp(main(), { ...mouse, clientX: 100, clientY: 300 })
    expectCurrentDot('Erfassung')
  })
})

describe('Achse halten (A3)', () => {
  const touchMove = (x = 0, y = 0, extra = 0) =>
    fireEvent.touchMove(main(), {
      touches: [{ clientX: x, clientY: y }, ...Array(extra).fill({ clientX: 0, clientY: 0 })],
      cancelable: true,
    })

  it('folgt nach festgelegter Waagerechte nur dx, senkrechte Bewegung bricht nicht ab', async () => {
    render(<App />)
    drag(150)
    move(150, 220)
    await frame()
    expect(slot(1).style.transform).toBe('translate3d(calc(0% + -150px), 0, 0)')
    expect(track()).toHaveAttribute('data-dragging')
    release(150, 220)
    expect(slot(2).style.transform).toBe('translate3d(calc(0% + 0px), 0, 0)')
    expectCurrentDot('Aufgaben')
  })

  it('touchmove: vor der Entscheidung (kleine Bewegung) wird nicht verhindert', () => {
    render(<App />)
    fireEvent.pointerDown(main(), { ...touch, clientX: 300, clientY: 300 })
    expect(touchMove(296, 300)).toBe(true)
  })

  it('touchmove: nach festgelegter Waagerechte wird verhindert', () => {
    render(<App />)
    drag(240)
    expect(touchMove(240, 300)).toBe(false)
  })

  it('touchmove ohne vorheriges pointermove: waagerechte Bewegung wird verhindert', () => {
    render(<App />)
    fireEvent.pointerDown(main(), { ...touch, clientX: 300, clientY: 300 })
    expect(touchMove(240, 300)).toBe(false)
  })

  it('touchmove ohne vorheriges pointermove: senkrechte Bewegung wird nicht verhindert', () => {
    render(<App />)
    fireEvent.pointerDown(main(), { ...touch, clientX: 300, clientY: 300 })
    expect(touchMove(300, 220)).toBe(true)
  })

  it('touchmove: bei senkrechter Geste wird nicht verhindert', () => {
    render(<App />)
    drag(300, 220)
    expect(touchMove(300, 220)).toBe(true)
  })

  it('touchmove: bei mehreren Fingern wird nie verhindert', () => {
    render(<App />)
    drag(240)
    expect(touchMove(240, 300, 1)).toBe(true)
  })

  it('pointercancel nach festgelegter Waagerechte mit Weg über einem Drittel wechselt die Seite', () => {
    render(<App />)
    drag(150)
    fireEvent.pointerCancel(main(), { ...touch })
    expectCurrentDot('Aufgaben')
  })

  it('pointercancel nach festgelegter Waagerechte mit kurzem Weg federt zurück', () => {
    render(<App />)
    drag(285)
    fireEvent.pointerCancel(main(), { ...touch })
    expectTarget(1)
    expectCurrentDot('Erfassung')
  })

  it('pointercancel vor der Entscheidung wechselt nicht', () => {
    render(<App />)
    fireEvent.pointerDown(main(), { ...touch, clientX: 300, clientY: 300 })
    move(296, 300)
    fireEvent.pointerCancel(main(), { ...touch })
    expectRest()
    expectCurrentDot('Erfassung')
  })
})
