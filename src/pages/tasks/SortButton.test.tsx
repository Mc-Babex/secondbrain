import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeBase64 } from '../../data/github'
import { resetSortTrigger } from '../../data/sortTrigger'
import { putFileFromRemote, resetDb, setSecret } from '../../data/localStore'
import { OpenSettingsContext } from '../../lib/openSettings'
import { putFileLocal } from '../../data/localStore'
import { SortButton } from './SortButton'
import { TasksPage } from './TasksPage'

vi.mock('../../data/sync', () => ({ syncNow: vi.fn(async () => undefined) }))

const NOW = new Date()
const iso = (offsetMin: number): string =>
  new Date(NOW.getTime() + offsetMin * 60_000).toISOString()

let fetchMock: ReturnType<typeof vi.fn>
let remote: Map<string, unknown>

beforeEach(async () => {
  resetSortTrigger()
  localStorage.clear()
  await resetDb(true)
  remote = new Map()
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { client_payload: { requestId: string } }
      remote.set('runs/trigger.json', {
        requestId: body.client_payload.requestId,
        at: iso(0),
        result: 'gestartet',
        message: '',
      })
      return new Response(null, { status: 204 })
    }
    const path = decodeURIComponent(/\/contents\/([^?]+)/.exec(url)?.[1] ?? '')
    if (!remote.has(path)) return new Response('{}', { status: 404 })
    return new Response(
      JSON.stringify({ content: encodeBase64(JSON.stringify(remote.get(path))), sha: 'x' }),
      { status: 200 },
    )
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  resetSortTrigger()
  vi.unstubAllGlobals()
})

async function connect(): Promise<void> {
  await setSecret('githubToken', 'ghp_geheimerTestToken123')
  await setSecret('githubRepo', 'alex/daten')
}

describe('Knopf „Jetzt sortieren“', () => {
  it('ist auch bei leerem Eingangskorb sichtbar und per Tastatur bedienbar', async () => {
    const user = userEvent.setup()
    render(<TasksPage />)
    const button = await screen.findByRole('button', { name: 'Jetzt sortieren' })
    button.focus()
    expect(button).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByText('GitHub in den Einstellungen verbinden.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('GitHub in den Einstellungen')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('meldet „Nichts zu sortieren“ ohne Arbeit und gibt den Knopf wieder frei', async () => {
    await connect()
    render(<TasksPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Jetzt sortieren' }))
    expect(await screen.findByText('Nichts zu sortieren')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jetzt sortieren' })).toBeEnabled()
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  })

  it('bleibt nach dem Neuladen gesperrt, solange die Sperre aus started.json gilt', async () => {
    await connect()
    await putFileFromRemote('inbox/a.json', { id: 'a', text: 'x', createdAt: iso(0) }, 's')
    remote.set('runs/started.json', {
      requestId: 'alt',
      startedAt: iso(-5),
      status: 'gestartet',
    })
    render(<TasksPage />)
    const button = await screen.findByRole('button', { name: 'Sortierung läuft …' })
    expect(button).toBeDisabled()
  })

  it('bleibt frei, wenn die Sperre abgelaufen ist', async () => {
    await connect()
    remote.set('runs/started.json', {
      requestId: 'alt',
      startedAt: iso(-30),
      status: 'gestartet',
    })
    render(<TasksPage />)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: 'Jetzt sortieren' })).toBeEnabled()
  })

  it('bleibt nach Seitenwechsel gesperrt, sendet nicht erneut und zeigt die Antwort', async () => {
    await connect()
    await putFileFromRemote('inbox/a.json', { id: 'a', text: 'x', createdAt: iso(0) }, 's')
    const posts = (): number => fetchMock.mock.calls.filter(([, i]) => i?.method === 'POST').length
    const first = render(<TasksPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Jetzt sortieren' }))
    await vi.waitFor(() => expect(posts()).toBe(1))
    first.unmount()

    render(<TasksPage />)
    const button = await screen.findByRole('button', { name: 'Sortierung läuft …' })
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(posts()).toBe(1)
    expect(
      await screen.findByText('Sortierung gestartet', {}, { timeout: 9000 }),
    ).toBeInTheDocument()
    expect(posts()).toBe(1)
  }, 20_000)

  it('ist vor Abschluss der Wiederherstellung deaktiviert und reagiert nicht', async () => {
    await connect()
    render(<SortButton />)
    const button = screen.getByRole('button', { name: 'Prüfe …' })
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(await screen.findByRole('button', { name: 'Jetzt sortieren' })).toBeEnabled()
    expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(0)
  })

  it('zeigt ohne Claude einen ruhigen Hinweis und öffnet die Einstellungen', async () => {
    await putFileLocal('settings.json', {
      planningWindow: { start: '09:00', end: '19:00' },
      timezone: 'Europe/Berlin',
      autoSort: false,
    })
    const open = vi.fn()
    render(
      <OpenSettingsContext.Provider value={open}>
        <SortButton />
      </OpenSettingsContext.Provider>,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Jetzt sortieren' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Automatisches Sortieren ist nicht eingerichtet.')
    expect(status.className).not.toMatch(/error/i)
    expect(screen.getByRole('button', { name: 'Jetzt sortieren' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Einstellungen' }))
    expect(open).toHaveBeenCalledTimes(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
