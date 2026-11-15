import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { App } from '../App'
import { clearErrorLog, getErrorLog } from '../data/errorLog'
import { resetDb } from '../data/localStore'
import { resetSyncStatus } from '../data/syncStatus'
import { markFirstRunDone } from '../lib/firstRun'
import { ErrorBoundary } from './ErrorBoundary'
import { firstComponentName } from './componentName'

const fail = vi.hoisted(() => ({ capture: false, settings: false }))
vi.mock('../pages/capture/CapturePage', async (importOriginal) => {
  const original = await importOriginal<typeof import('../pages/capture/CapturePage')>()
  return {
    CapturePage: () => {
      if (fail.capture) throw new Error('Seite kaputt')
      return <original.CapturePage />
    },
  }
})
vi.mock('../pages/settings/SettingsPage', async (importOriginal) => {
  const original = await importOriginal<typeof import('../pages/settings/SettingsPage')>()
  return {
    SettingsPage: (props: { onClose: () => void }) => {
      if (fail.settings) throw new Error('Einstellungen kaputt')
      return <original.SettingsPage {...props} />
    },
  }
})

let broken = true
function Bomb() {
  if (broken) throw new Error('Kaputt mit Bearer abc123def')
  return <p>Alles gut</p>
}

beforeEach(async () => {
  broken = true
  fail.capture = false
  fail.settings = false
  localStorage.clear()
  markFirstRunDone()
  clearErrorLog()
  await resetDb(true)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  act(() => resetSyncStatus())
})

describe('ErrorBoundary', () => {
  it('zeigt statt Leere den Hinweis mit beiden Knöpfen und protokolliert bereinigt', () => {
    render(
      <ErrorBoundary area="Seite Test">
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Diese Seite hatte einen Fehler.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Neu laden' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'App neu starten' })).toBeInTheDocument()
    const [entry] = getErrorLog()
    expect(entry.area).toBe('Seite Test')
    expect(entry.message).toContain('Kaputt')
    expect(entry.message).not.toContain('abc123def')
  })

  it('„Neu laden“ mountet die Kinder neu', async () => {
    render(
      <ErrorBoundary area="Seite Test">
        <Bomb />
      </ErrorBoundary>,
    )
    broken = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Neu laden' }))
    expect(screen.getByText('Alles gut')).toBeInTheDocument()
  })

  it('„App neu starten“ lädt die Seite neu', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    render(
      <ErrorBoundary area="Seite Test">
        <Bomb />
      </ErrorBoundary>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'App neu starten' }))
    expect(reload).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('ein Fehler in einer Seite lässt die anderen Seiten bedienbar', async () => {
    fail.capture = true
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByText('Diese Seite hatte einen Fehler.')).toBeInTheDocument()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('heading', { name: 'Aufgaben' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Seite: Aufgaben' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(getErrorLog()[0].area).toBe('Seite Erfassung')
  })
})

describe('weitere Grenzen', () => {
  it('äußere Grenze: eigener Text', () => {
    render(
      <ErrorBoundary area="App" message="Die App hatte einen Fehler.">
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Die App hatte einen Fehler.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Schließen' })).not.toBeInTheDocument()
  })

  it('Einstellungen: Fehler zeigt Hinweis mit „Schließen“, das die Einstellungen schließt', async () => {
    fail.settings = true
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Einstellungen' }))
    expect(screen.getByText('Diese Seite hatte einen Fehler.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(screen.getByRole('heading', { name: 'Erfassung' })).toBeInTheDocument()
    expect(getErrorLog()[0].area).toBe('Seite Einstellungen')
  })

  it('protokolliert den Komponentennamen ohne Pfade', () => {
    const stack = ['', '    at Bomb (http://x/src/a.tsx:3:1)', '    at div'].join('\n')
    expect(firstComponentName(stack)).toBe('Bomb')
    expect(firstComponentName(null)).toBeNull()
    render(
      <ErrorBoundary area="Seite Test">
        <Bomb />
      </ErrorBoundary>,
    )
    expect(getErrorLog()[0].message).toMatch(/\[in Bomb\]/)
  })
})

describe('PageSlot-Darstellung', () => {
  it('markiert nur die aktive Seite mit data-active', () => {
    render(<App />)
    const slots = screen.getByTestId('page-track').children
    expect([...slots].map((slot) => slot.hasAttribute('data-active'))).toEqual([
      false,
      true,
      false,
      false,
    ])
  })
})
