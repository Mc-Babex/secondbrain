import { act, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { clearErrorLog, getErrorLog } from '../data/errorLog'
import {
  createAppUpdater,
  decideUpdate,
  isReloadAllowed,
  nextAttempt,
  parseVersionFile,
  RELOAD_RESET_MS,
  startAppUpdates,
  useUpdateNotice,
  type UpdateDeps,
} from './appUpdate'
import { installFocusGuard, setUnsaved } from './unsavedWork'

const MIN = 60_000

function setup(overrides: Partial<UpdateDeps> = {}) {
  let clock = 1_000_000
  const deps: UpdateDeps = {
    currentBuild: 'B1',
    fetchBuild: vi.fn().mockResolvedValue('B2'),
    updateServiceWorker: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn(),
    now: () => clock,
    ...overrides,
  }
  return {
    deps,
    advance: (ms: number) => {
      clock += ms
    },
  }
}

function NoticeProbe() {
  return <p>{useUpdateNotice() ? 'Hinweis' : 'kein Hinweis'}</p>
}

beforeEach(() => {
  localStorage.clear()
  clearErrorLog()
})
afterEach(() => {
  setUnsaved('feld', false)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('decideUpdate', () => {
  it('lädt neu, wenn nichts ungespeichert ist; sonst Hinweis', () => {
    expect(decideUpdate({ unsaved: false, reloadAllowed: true })).toBe('reload')
    expect(decideUpdate({ unsaved: true, reloadAllowed: true })).toBe('notice')
    expect(decideUpdate({ unsaved: false, reloadAllowed: false })).toBe('notice')
  })
})

describe('Schleifenschutz', () => {
  it('erlaubt zwei Versuche je Version innerhalb von 5 Minuten, danach nicht mehr', () => {
    let attempt = null
    expect(isReloadAllowed(attempt, 'B2', 0)).toBe(true)
    attempt = nextAttempt(attempt, 'B2', 0)
    expect(isReloadAllowed(attempt, 'B2', 1000)).toBe(true)
    attempt = nextAttempt(attempt, 'B2', 1000)
    expect(attempt.count).toBe(2)
    expect(isReloadAllowed(attempt, 'B2', 2000)).toBe(false)
  })

  it('zählt nach 5 Minuten oder bei anderer Version neu', () => {
    const attempt = { version: 'B2', count: 2, at: 0 }
    expect(isReloadAllowed(attempt, 'B2', 5 * MIN)).toBe(true)
    expect(isReloadAllowed(attempt, 'B3', 1000)).toBe(true)
    expect(nextAttempt(attempt, 'B3', 1000)).toEqual({ version: 'B3', count: 1, at: 1000 })
  })
})

describe('parseVersionFile', () => {
  it('akzeptiert nur Version und Build als Texte', () => {
    expect(parseVersionFile({ version: '0.8.0', build: 'B1' })).toEqual({
      version: '0.8.0',
      build: 'B1',
    })
    expect(parseVersionFile({ version: '0.8.0' })).toBeNull()
    expect(parseVersionFile('<html>')).toBeNull()
    expect(parseVersionFile(null)).toBeNull()
  })
})

describe('createAppUpdater', () => {
  it('lädt bei neuer Version und leerem Register sofort neu', async () => {
    const { deps } = setup()
    await createAppUpdater(deps).check()
    expect(deps.reload).toHaveBeenCalledTimes(1)
    expect(
      getErrorLog()
        .map((e) => e.message)
        .join(' | '),
    ).toContain('Seite wird neu geladen')
  })

  it('zeigt bei Text im Erfassungsfeld nur den Hinweis und lädt nicht neu', async () => {
    const { deps } = setup()
    setUnsaved('feld', true)
    render(<NoticeProbe />)
    await act(() => createAppUpdater(deps).check())
    expect(deps.reload).not.toHaveBeenCalled()
    expect(screen.getByText('Hinweis')).toBeInTheDocument()
  })

  it('lädt bei Rückkehr nach geleertem Register automatisch neu', async () => {
    const { deps, advance } = setup()
    const updater = createAppUpdater(deps)
    setUnsaved('feld', true)
    await updater.check()
    expect(deps.reload).not.toHaveBeenCalled()
    setUnsaved('feld', false)
    expect(deps.reload).not.toHaveBeenCalled()
    advance(10_000)
    await updater.check()
    expect(deps.reload).toHaveBeenCalledTimes(1)
  })

  it('lädt nicht neu bei gleicher Version', async () => {
    const { deps } = setup({ fetchBuild: vi.fn().mockResolvedValue('B1') })
    await createAppUpdater(deps).check()
    expect(deps.reload).not.toHaveBeenCalled()
  })

  it('Service Worker aktiv ohne Ungespeichertes: neu laden, sonst Hinweis', async () => {
    const first = setup()
    createAppUpdater(first.deps).serviceWorkerUpdated()
    await vi.waitFor(() => expect(first.deps.reload).toHaveBeenCalledTimes(1))
    localStorage.clear()
    const second = setup()
    setUnsaved('feld', true)
    createAppUpdater(second.deps).serviceWorkerUpdated()
    expect(second.deps.reload).not.toHaveBeenCalled()
  })

  it('lädt dieselbe Version nach zwei Versuchen innerhalb 5 Minuten kein drittes Mal', async () => {
    const { deps, advance } = setup()
    render(<NoticeProbe />)
    for (let run = 0; run < 3; run += 1) {
      // Jeder Durchlauf ist ein frischer Start nach dem Neuladen (gleicher Speicher).
      await act(() => createAppUpdater(deps).check())
      advance(30_000)
    }
    expect(deps.reload).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Hinweis')).toBeInTheDocument()
  })

  it('ignoriert Fehler still und protokolliert höchstens einmal je Start', async () => {
    const { deps, advance } = setup({
      updateServiceWorker: vi.fn().mockRejectedValue(new Error('offline')),
    })
    const updater = createAppUpdater(deps)
    await updater.check()
    advance(2 * MIN)
    await updater.check()
    expect(deps.reload).not.toHaveBeenCalled()
    expect(getErrorLog().filter((e) => e.message.includes('fehlgeschlagen'))).toHaveLength(1)
  })

  it('prüft höchstens alle 60 Sekunden', async () => {
    const { deps, advance } = setup({ fetchBuild: vi.fn().mockResolvedValue('B1') })
    const updater = createAppUpdater(deps)
    await updater.check()
    advance(30_000)
    await updater.check()
    expect(deps.fetchBuild).toHaveBeenCalledTimes(1)
    advance(31_000)
    await updater.check()
    expect(deps.fetchBuild).toHaveBeenCalledTimes(2)
  })

  it('setzt reloading nach 10 Sekunden zurück, damit der Knopf erneut wirkt', () => {
    vi.useFakeTimers()
    const { deps } = setup()
    const updater = createAppUpdater(deps)
    updater.reloadNow()
    updater.reloadNow()
    expect(deps.reload).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(RELOAD_RESET_MS)
    updater.reloadNow()
    expect(deps.reload).toHaveBeenCalledTimes(2)
  })

  it('zeigt bei fokussiertem Eingabefeld außerhalb eines Dialogs nur den Hinweis', async () => {
    installFocusGuard()
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    const { deps } = setup()
    render(<NoticeProbe />)
    await act(() => createAppUpdater(deps).check())
    expect(deps.reload).not.toHaveBeenCalled()
    expect(screen.getByText('Hinweis')).toBeInTheDocument()
    input.remove()
  })

  it('reloadNow lädt ohne Rücksicht auf das Register neu', () => {
    const { deps } = setup()
    setUnsaved('feld', true)
    createAppUpdater(deps).reloadNow()
    expect(deps.reload).toHaveBeenCalledTimes(1)
  })
})

describe('startAppUpdates', () => {
  it('prüft nach dem ersten Rendern und bei Rückkehr (gedrosselt), offline ohne Fehler', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'requestAnimationFrame', 'cancelAnimationFrame'] })
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'))
    vi.stubGlobal('fetch', fetchMock)
    startAppUpdates()
    expect(fetchMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(50)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/version.json', { cache: 'no-store' })

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(61_000)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
