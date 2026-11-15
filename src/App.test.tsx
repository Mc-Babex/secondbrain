import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { App } from './App'
import { resetDb } from './data/localStore'
import { hasUnsavedWork } from './lib/unsavedWork'
import { resetSyncStatus, setSyncStatus } from './data/syncStatus'
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

function swipe(from: number, to: number, fromY = 100, toY = 100) {
  const main = screen.getByRole('main')
  fireEvent.pointerDown(main, { clientX: from, clientY: fromY, pointerId: 1 })
  fireEvent.pointerMove(main, { clientX: to, clientY: toY, pointerId: 1 })
  fireEvent.pointerUp(main, { clientX: to, clientY: toY, pointerId: 1 })
}

describe('App', () => {
  it('startet auf der Erfassung', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Erfassung' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Seite: Erfassung' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('wechselt per Pfeiltaste', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('button', { name: 'Seite: Kalender' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(screen.getByRole('heading', { name: 'Aufgaben' })).toBeInTheDocument()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('heading', { name: 'Erfassung' })).toBeInTheDocument()
  })

  it('hat die Reihenfolge Kalender, Erfassung, Aufgaben, Ablagen', () => {
    render(<App />)
    const dots = screen.getAllByRole('button', { name: /^Seite: / })
    expect(dots.map((d) => d.getAttribute('aria-label'))).toEqual([
      'Seite: Kalender',
      'Seite: Erfassung',
      'Seite: Aufgaben',
      'Seite: Ablagen',
    ])
  })

  it('wechselt per Punkte-Leiste', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Seite: Aufgaben' }))
    expect(screen.getByRole('heading', { name: 'Aufgaben' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Seite: Aufgaben' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('wechselt per Wischgeste (links = nächste Seite, rechts = zurück)', () => {
    render(<App />)
    swipe(300, 100)
    expect(screen.getByRole('heading', { name: 'Aufgaben' })).toBeInTheDocument()
    swipe(100, 300)
    expect(screen.getByRole('heading', { name: 'Erfassung' })).toBeInTheDocument()
    swipe(100, 300)
    expect(screen.getByRole('button', { name: 'Seite: Kalender' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('ignoriert vertikales Wischen und kurze Wege', () => {
    render(<App />)
    swipe(200, 180)
    swipe(200, 120, 100, 300)
    expect(screen.getByRole('heading', { name: 'Erfassung' })).toBeInTheDocument()
  })

  it('wechselt nicht über den Rand hinaus', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.keyboard('{ArrowLeft}')
    swipe(100, 300)
    expect(screen.getByRole('button', { name: 'Seite: Kalender' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}')
    swipe(300, 100)
    expect(screen.getByRole('heading', { name: 'Ablagen' })).toBeInTheDocument()
  })

  it('wechselt nicht, wenn der Fokus in einem Eingabefeld liegt', async () => {
    const user = userEvent.setup()
    render(
      <>
        <App />
        <input aria-label="Test" />
      </>,
    )
    await user.click(screen.getByLabelText('Test'))
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('heading', { name: 'Erfassung' })).toBeInTheDocument()
  })

  it('meldet geöffnete Einstellungen als ungespeichert an', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(hasUnsavedWork()).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Einstellungen' }))
    expect(hasUnsavedWork()).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(hasUnsavedWork()).toBe(false)
  })

  it('öffnet und schließt die Einstellungen (Zurück-Knopf und Esc)', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Einstellungen' }))
    expect(screen.getByRole('heading', { name: 'Einstellungen' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(screen.getByRole('heading', { name: 'Erfassung' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Einstellungen' }))
    await user.keyboard('{Escape}')
    expect(screen.getByRole('heading', { name: 'Erfassung' })).toBeInTheDocument()
  })

  it('hält die Seiten beim Öffnen der Einstellungen gemountet', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('Text'), 'Milch kaufen')
    await user.click(screen.getByRole('button', { name: 'Einstellungen' }))
    expect(screen.getByRole('heading', { name: 'Einstellungen' })).toBeInTheDocument()
    expect(screen.getByLabelText('Text')).not.toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Zurück' }))
    expect(screen.getByLabelText('Text')).toHaveValue('Milch kaufen')
  })

  it('zeigt den Sync-Status oben und öffnet damit die Einstellungen', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByText('nicht eingerichtet')).toBeInTheDocument()
    act(() => setSyncStatus({ state: 'ausstehend', pending: 2 }))
    await user.click(screen.getByText('2 ausstehend'))
    expect(screen.getByRole('heading', { name: 'Einstellungen' })).toBeInTheDocument()
  })

  it('zeigt abgelegte Erfassungen nach dem Seitenwechsel im Eingangskorb', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByRole('textbox'), 'Milch kaufen')
    await user.keyboard('{Control>}{Enter}{/Control}')
    expect(await screen.findByText('1 im Eingangskorb')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Seite: Aufgaben' }))
    expect(await screen.findByRole('heading', { name: 'Eingangskorb' })).toBeInTheDocument()
    expect(screen.getByText('Milch kaufen')).toBeInTheDocument()
  })

  describe('Touch-Gesten', () => {
    const touch = { pointerType: 'touch', pointerId: 1 }

    function touchSwipe(
      target: Element,
      from: [number, number],
      to: [number, number],
      options: { mid?: [number, number]; extra?: () => void } = {},
    ) {
      fireEvent.pointerDown(target, { ...touch, clientX: from[0], clientY: from[1] })
      options.extra?.()
      if (options.mid) {
        fireEvent.pointerMove(target, {
          ...touch,
          clientX: options.mid[0],
          clientY: options.mid[1],
        })
      }
      fireEvent.pointerMove(target, { ...touch, clientX: to[0], clientY: to[1] })
      fireEvent.pointerUp(target, { ...touch, clientX: to[0], clientY: to[1] })
    }

    function expectCapture() {
      expect(screen.getByRole('heading', { name: 'Erfassung' })).toBeInTheDocument()
    }

    it('wechselt bei waagerechtem Wischen', () => {
      render(<App />)
      touchSwipe(screen.getByRole('main'), [250, 300], [50, 305])
      expect(screen.getByRole('heading', { name: 'Aufgaben' })).toBeInTheDocument()
    })

    it('wechselt nicht bei schrägem oder erst senkrechtem Wischen', () => {
      render(<App />)
      const main = screen.getByRole('main')
      touchSwipe(main, [250, 300], [150, 400])
      touchSwipe(main, [250, 300], [50, 305], { mid: [250, 330] })
      expectCapture()
    })

    it('wechselt nicht beim Start in einem data-no-swipe-Bereich', () => {
      render(<App />)
      const zone = document.createElement('div')
      zone.setAttribute('data-no-swipe', '')
      screen.getByRole('main').appendChild(zone)
      touchSwipe(zone, [250, 300], [50, 300])
      expectCapture()
    })

    it('wechselt nicht beim Start in einem waagerecht scrollbaren Bereich', () => {
      render(<App />)
      const scroller = document.createElement('div')
      scroller.style.overflowX = 'auto'
      Object.defineProperty(scroller, 'scrollWidth', { value: 600 })
      Object.defineProperty(scroller, 'clientWidth', { value: 300 })
      screen.getByRole('main').appendChild(scroller)
      touchSwipe(scroller, [250, 300], [50, 300])
      expectCapture()
    })

    it('wechselt nicht im oberen und unteren Randstreifen', () => {
      render(<App />)
      const main = screen.getByRole('main')
      touchSwipe(main, [250, 10], [50, 10])
      touchSwipe(main, [250, window.innerHeight - 5], [50, window.innerHeight - 5])
      expectCapture()
    })

    it('wechselt nicht mit einem zweiten Finger', () => {
      render(<App />)
      const main = screen.getByRole('main')
      touchSwipe(main, [250, 300], [50, 300], {
        extra: () =>
          fireEvent.pointerDown(main, {
            pointerType: 'touch',
            pointerId: 2,
            clientX: 260,
            clientY: 320,
          }),
      })
      fireEvent.pointerUp(main, { pointerType: 'touch', pointerId: 2, clientX: 60, clientY: 320 })
      expectCapture()
    })

    it('wechselt nicht nach pointercancel', () => {
      render(<App />)
      const main = screen.getByRole('main')
      fireEvent.pointerDown(main, { ...touch, clientX: 250, clientY: 300 })
      fireEvent.pointerCancel(main, touch)
      fireEvent.pointerUp(main, { ...touch, clientX: 50, clientY: 300 })
      expectCapture()
    })

    it('wischt nach einem hängenden Touch (ohne up/cancel) mit neuem Primärfinger wieder', () => {
      render(<App />)
      const main = screen.getByRole('main')
      fireEvent.pointerDown(main, { ...touch, clientX: 250, clientY: 300 })
      const next = { pointerType: 'touch', pointerId: 2, isPrimary: true }
      fireEvent.pointerDown(main, { ...next, clientX: 250, clientY: 300 })
      fireEvent.pointerMove(main, { ...next, clientX: 50, clientY: 305 })
      fireEvent.pointerUp(main, { ...next, clientX: 50, clientY: 305 })
      expect(screen.getByRole('heading', { name: 'Aufgaben' })).toBeInTheDocument()
    })

    it('wechselt nicht per Touch bei offenem Dialog', () => {
      render(<App />)
      const dialog = document.createElement('div')
      dialog.setAttribute('role', 'dialog')
      document.body.appendChild(dialog)
      touchSwipe(screen.getByRole('main'), [250, 300], [50, 305])
      dialog.remove()
      expectCapture()
    })

    it('wechselt nicht bei markiertem Text im Eingabefeld', () => {
      render(<App />)
      const field = screen.getByLabelText('Text') as HTMLTextAreaElement
      field.value = 'Milch kaufen'
      field.setSelectionRange(0, 5)
      touchSwipe(field, [250, 300], [50, 300])
      expectCapture()
    })

    it('Maus-Wischen funktioniert weiter wie bisher', () => {
      render(<App />)
      const main = screen.getByRole('main')
      fireEvent.pointerDown(main, { pointerType: 'mouse', clientX: 250, clientY: 10, pointerId: 1 })
      fireEvent.pointerUp(main, { pointerType: 'mouse', clientX: 50, clientY: 10, pointerId: 1 })
      expect(screen.getByRole('heading', { name: 'Aufgaben' })).toBeInTheDocument()
    })
  })
})
