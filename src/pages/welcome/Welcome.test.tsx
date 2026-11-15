import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { getFile, getOutbox, getSecret, resetDb } from '../../data/localStore'
import { getPendingAutoSort } from '../../data/pendingAutoSort'
import { TEMPLATE_REPO_URL, TESTER_GUIDE_URL, TOKEN_URL } from '../../lib/links'
import { hasUnsavedWork } from '../../lib/unsavedWork'
import { Welcome } from './Welcome'

const mocks = vi.hoisted(() => ({ testConnection: vi.fn(), syncNow: vi.fn() }))

vi.mock('../../data/github', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/github')>()),
  testConnection: mocks.testConnection,
}))
vi.mock('../../data/sync', () => ({ syncNow: mocks.syncNow }))

const TOKEN = 'github_pat_GEHEIMERINHALTabcd'
const START = 'Los geht’s'

type User = ReturnType<typeof userEvent.setup>

function stubClipboard(readText: () => Promise<string>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { readText, writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  })
}

beforeEach(async () => {
  localStorage.clear()
  mocks.testConnection.mockReset().mockResolvedValue('ok')
  mocks.syncNow.mockReset().mockResolvedValue(undefined)
  await resetDb(true)
})

const click = (user: User, name: string) => user.click(screen.getByRole('button', { name }))

async function skipToStep4(user: User) {
  await click(user, START)
  await click(user, 'Später')
  await click(user, 'Später')
}

describe('Welcome', () => {
  it('führt von ① bis ④, Zurück funktioniert, Später überspringt', async () => {
    const user = userEvent.setup()
    const onFinish = vi.fn()
    render(<Welcome onFinish={onFinish} />)
    expect(screen.getByText('Schritt 1 von 4')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Zurück' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Später' })).not.toBeInTheDocument()

    await click(user, START)
    expect(screen.getByText('Schritt 2 von 4')).toBeInTheDocument()
    await click(user, 'Später')
    expect(screen.getByText('Schritt 3 von 4')).toBeInTheDocument()
    await click(user, 'Zurück')
    expect(screen.getByText('Schritt 2 von 4')).toBeInTheDocument()
    await click(user, 'Später')
    await click(user, 'Später')
    expect(screen.getByText('Schritt 4 von 4')).toBeInTheDocument()
    expect(onFinish).not.toHaveBeenCalled()
    await click(user, 'Ohne Claude weiter')
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1))
  })

  it('verlinkt in ② Vorlage und Token-Seite; Verbindung führt zu ③', async () => {
    const user = userEvent.setup()
    // Erst nach setup(): userEvent ersetzt sonst die Zwischenablage durch eigene Attrappen.
    stubClipboard(() => Promise.resolve(TOKEN))
    render(<Welcome onFinish={vi.fn()} />)
    await click(user, START)
    expect(screen.getByRole('link', { name: 'Daten-Repo aus Vorlage anlegen' })).toHaveAttribute(
      'href',
      TEMPLATE_REPO_URL,
    )
    expect(screen.getByRole('link', { name: 'Token erstellen' })).toHaveAttribute('href', TOKEN_URL)
    expect(TOKEN_URL).toContain('expires_in=335')

    await user.type(screen.getByLabelText('Daten-Repository'), 'max/daten')
    await click(user, 'Token einfügen')
    expect(await screen.findByRole('heading', { name: 'Google-Kalender' })).toBeInTheDocument()
    expect(mocks.testConnection).toHaveBeenCalledWith({ token: TOKEN, repo: 'max/daten' })
    expect(await getSecret('githubRepo')).toBe('max/daten')
    expect(mocks.syncNow).toHaveBeenCalled()
  })

  it('merkt die Wahl in ④ nur vor und schreibt keine settings.json', async () => {
    const user = userEvent.setup()
    const onFinish = vi.fn()
    render(<Welcome onFinish={onFinish} />)
    await skipToStep4(user)
    expect(screen.getByRole('link', { name: 'Anleitung' })).toHaveAttribute(
      'href',
      TESTER_GUIDE_URL,
    )
    await click(user, 'Ich richte Claude ein')
    expect(onFinish).toHaveBeenCalled()
    expect(getPendingAutoSort()).toBe(true)
    expect(await getFile('settings.json')).toBeUndefined()
    expect(await getOutbox()).toEqual([])
  })

  it('merkt „Ohne Claude weiter“ als false vor', async () => {
    const user = userEvent.setup()
    render(<Welcome onFinish={vi.fn()} />)
    await skipToStep4(user)
    await click(user, 'Ohne Claude weiter')
    expect(getPendingAutoSort()).toBe(false)
  })

  it('legt den Token nur ins verdeckte Feld und nicht ins Log', async () => {
    const user = userEvent.setup()
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    stubClipboard(() => Promise.reject(new Error('verweigert')))
    const { container } = render(<Welcome onFinish={vi.fn()} />)
    await click(user, START)
    await user.type(screen.getByLabelText('Daten-Repository'), 'max/daten')
    await click(user, 'Token einfügen')
    const field = await screen.findByLabelText('Eingefügtes Token')
    expect(field).toHaveAttribute('type', 'password')
    await user.type(field, TOKEN)
    const leaks = [...container.querySelectorAll('*:not(input[type="password"])')].filter((el) =>
      [...el.attributes].some((a) => a.value.includes(TOKEN)),
    )
    expect(leaks).toEqual([])
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN)
    log.mockRestore()
  })

  it('setzt den Fokus bei jedem Schrittwechsel auf die Überschrift', async () => {
    const user = userEvent.setup()
    render(<Welcome onFinish={vi.fn()} />)
    await click(user, START)
    expect(await screen.findByRole('heading', { name: 'Daten-Repo verbinden' })).toHaveFocus()
    await click(user, 'Zurück')
    expect(await screen.findByRole('heading', { name: 'Willkommen' })).toHaveFocus()
  })

  it('meldet sich in ② mit Eingaben als ungespeichert', async () => {
    const user = userEvent.setup()
    render(<Welcome onFinish={vi.fn()} />)
    await click(user, START)
    expect(hasUnsavedWork()).toBe(false)
    await user.type(screen.getByLabelText('Daten-Repository'), 'm')
    await waitFor(() => expect(hasUnsavedWork()).toBe(true))
    await click(user, 'Später')
    await waitFor(() => expect(hasUnsavedWork()).toBe(false))
  })
})
