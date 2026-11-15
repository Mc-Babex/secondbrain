import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { getSecret, resetDb, setSecret } from '../../data/localStore'
import { resetSyncStatus, setSyncStatus } from '../../data/syncStatus'
import { TOKEN_URL } from '../../lib/links'
import { SettingsPage } from './SettingsPage'
import { markSetupSyncDone } from './setupState'

const mocks = vi.hoisted(() => ({
  testConnection: vi.fn(),
  syncNow: vi.fn(),
  persist: vi.fn(),
  listItems: vi.fn(),
}))

vi.mock('../../data/github', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/github')>()),
  testConnection: mocks.testConnection,
}))
vi.mock('../../data/repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/repository')>()),
  listItems: mocks.listItems,
}))
vi.mock('../../data/sync', () => ({ syncNow: mocks.syncNow }))
vi.mock('../../data/persistentStorage', () => ({ requestPersistentStorage: mocks.persist }))

const TOKEN = 'github_pat_GEHEIMERINHALTabcd'

async function freshDb(): Promise<void> {
  await resetDb()
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('secondbrain')
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

let writeTextSpy = vi.fn()

function stubClipboard(readText: () => Promise<string>) {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    value: { readText, writeText },
    configurable: true,
  })
  return writeText
}

beforeEach(async () => {
  localStorage.clear()
  mocks.testConnection.mockReset().mockResolvedValue('ok')
  mocks.syncNow.mockReset().mockImplementation(() => {
    act(() => setSyncStatus({ state: 'synchron' }))
    return Promise.resolve()
  })
  mocks.persist.mockReset().mockResolvedValue('persistent')
  mocks.listItems.mockReset().mockResolvedValue([])
  await freshDb()
})
afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard')
  vi.restoreAllMocks()
  act(() => resetSyncStatus())
})
afterAll(freshDb)

const setup = (readText?: () => Promise<string>) => {
  const user = userEvent.setup()
  // Erst nach userEvent.setup(): Das ersetzt sonst die Zwischenablage durch eigene Attrappen.
  if (readText) writeTextSpy = stubClipboard(readText)
  render(<SettingsPage onClose={() => undefined} />)
  return user
}

describe('Geführte Einrichtung', () => {
  it('ist ohne Token sichtbar (Schritt 1 offen) und verschwindet, wenn alles erledigt ist', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: 'Einrichtung' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /① GitHub/ })).toHaveTextContent('offen')
    const field = screen.getByLabelText('Daten-Repository')
    expect(field).toHaveValue('')
    expect(field).toHaveAttribute('placeholder', 'dein-konto/secondbrain-daten')
  })

  it('erscheint nicht mehr, wenn Token, Google und erster Abgleich erledigt sind', async () => {
    await setSecret('githubToken', TOKEN)
    await setSecret('githubRepo', 'alex/daten')
    localStorage.setItem('secondbrain.googleConnected', '1')
    markSetupSyncDone()
    setup()
    await screen.findByText('Token gespeichert (endet auf …abcd)')
    expect(screen.queryByRole('heading', { name: 'Einrichtung' })).not.toBeInTheDocument()
  })

  it('übernimmt das Token aus der Zwischenablage, testet, speichert, gleicht ab und leert die Ablage', async () => {
    const user = setup(() => Promise.resolve(`  ${TOKEN}\n`))
    await user.type(await screen.findByLabelText('Daten-Repository'), 'alex/secondbrain-daten')
    await user.click(await screen.findByRole('button', { name: 'Token einfügen' }))
    await waitFor(() =>
      expect(screen.getByText(/Token eingefügt \(endet auf …abcd\)/)).toBeInTheDocument(),
    )
    expect(mocks.testConnection).toHaveBeenCalledWith({
      token: TOKEN,
      repo: 'alex/secondbrain-daten',
    })
    expect(await getSecret('githubToken')).toBe(TOKEN)
    expect(await getSecret('githubRepo')).toBe('alex/secondbrain-daten')
    expect(writeTextSpy).toHaveBeenCalledWith('')
    expect(screen.getByText('Die Zwischenablage wurde geleert.')).toBeInTheDocument()
    await waitFor(() => expect(mocks.syncNow).toHaveBeenCalled())
    expect(await screen.findByText('0 Einträge geladen.')).toBeInTheDocument()
    expect(screen.getByText('Daten werden dauerhaft gespeichert.')).toBeInTheDocument()
    expect(mocks.persist).toHaveBeenCalledOnce()
    expect(document.body.textContent).not.toContain(TOKEN)
    // Im HTML darf das Token höchstens im value des verdeckten Felds stehen.
    const html = document.body.innerHTML.replace(/value="[^"]*"/g, '')
    expect(html).not.toContain(TOKEN)
  })

  it('gilt auf Bestandsgeräten mit Token und Google ohne Merker als erledigt', async () => {
    await setSecret('githubToken', TOKEN)
    await setSecret('githubRepo', 'alex/daten')
    localStorage.setItem('secondbrain.googleConnected', '1')
    setup()
    await screen.findByText('Token gespeichert (endet auf …abcd)')
    expect(screen.queryByRole('heading', { name: 'Einrichtung' })).not.toBeInTheDocument()
    expect(localStorage.getItem('secondbrain.setupSyncDone')).toBe('1')
  })

  it('gibt den Knopf nach einer Ausnahme im Abgleich wieder frei und zeigt eine Meldung', async () => {
    mocks.listItems.mockRejectedValue(new Error('kaputt'))
    await setSecret('githubToken', TOKEN)
    await setSecret('githubRepo', 'alex/daten')
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Jetzt abgleichen' }))
    expect(await screen.findByText(/Der Abgleich ist fehlgeschlagen/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jetzt abgleichen' })).toBeEnabled()
    expect(screen.getByRole('heading', { name: /③ Erster Abgleich/ })).toHaveTextContent('Fehler')
  })

  it('zeigt bei verweigerter Zwischenablage einen Hinweis und ein verdecktes Feld', async () => {
    const user = setup(() => Promise.reject(new Error('denied')))
    await user.type(await screen.findByLabelText('Daten-Repository'), 'alex/secondbrain-daten')
    await user.click(await screen.findByRole('button', { name: 'Token einfügen' }))
    expect(await screen.findByText(/Zwischenablage ist nicht lesbar/)).toBeInTheDocument()
    const field = screen.getByLabelText('Eingefügtes Token')
    expect(field).toHaveAttribute('type', 'password')
    expect(field).toHaveAttribute('autocomplete', 'off')
    expect(field).toHaveAttribute('autocapitalize', 'none')
    expect(field).toHaveAttribute('spellcheck', 'false')
    await user.type(field, TOKEN)
    await user.click(screen.getByRole('button', { name: 'Token übernehmen' }))
    await waitFor(() =>
      expect(screen.getByText(/Token eingefügt \(endet auf …abcd\)/)).toBeInTheDocument(),
    )
    expect(await getSecret('githubToken')).toBe(TOKEN)
    expect(screen.queryByLabelText('Eingefügtes Token')).not.toBeInTheDocument()
  })

  it('meldet ein leeres Repo-Feld, ohne die Zwischenablage zu lesen oder zu testen', async () => {
    const readText = vi.fn().mockResolvedValue(TOKEN)
    const user = setup(readText)
    await user.click(await screen.findByRole('button', { name: 'Token einfügen' }))
    expect(await screen.findByText(/besitzer\/name/)).toBeInTheDocument()
    expect(readText).not.toHaveBeenCalled()
    expect(mocks.testConnection).not.toHaveBeenCalled()
    expect(await getSecret('githubToken')).toBeUndefined()
  })

  it('weist ungültigen Text aus der Zwischenablage ab und speichert nichts', async () => {
    const user = setup(() => Promise.resolve('hallo welt'))
    await user.type(await screen.findByLabelText('Daten-Repository'), 'alex/secondbrain-daten')
    await user.click(await screen.findByRole('button', { name: 'Token einfügen' }))
    expect(await screen.findByText(/sieht nicht nach einem GitHub-Token aus/)).toBeInTheDocument()
    expect(mocks.testConnection).not.toHaveBeenCalled()
    expect(await getSecret('githubToken')).toBeUndefined()
  })

  it.each([
    ['unauthorized', 'Token ungültig oder abgelaufen'],
    ['notFound', 'Repository nicht gefunden oder kein Zugriff'],
    ['offline', 'Keine Internetverbindung'],
  ])('zeigt bei Verbindungstest %s die Meldung "%s" und speichert nichts', async (result, text) => {
    mocks.testConnection.mockResolvedValue(result)
    const user = setup(() => Promise.resolve(TOKEN))
    await user.type(await screen.findByLabelText('Daten-Repository'), 'alex/secondbrain-daten')
    await user.click(await screen.findByRole('button', { name: 'Token einfügen' }))
    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(await getSecret('githubToken')).toBeUndefined()
    expect(mocks.syncNow).not.toHaveBeenCalled()
  })

  it('verlinkt die Token-Seite mit vorbelegtem Namen und Ablauf in neuem Tab', async () => {
    setup()
    const link = await screen.findByRole('link', { name: 'Token bei GitHub erstellen' })
    expect(link).toHaveAttribute('href', TOKEN_URL)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('schreibt das Token in keinen console-Aufruf', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    )
    const user = setup(() => Promise.resolve(TOKEN))
    await user.type(await screen.findByLabelText('Daten-Repository'), 'alex/secondbrain-daten')
    await user.click(await screen.findByRole('button', { name: 'Token einfügen' }))
    await screen.findByText('0 Einträge geladen.')
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN)
    }
  })

  it.each([
    ['volatile', /iOS kann den Speicher leeren/],
    ['unsupported', /nicht unterstützt/],
  ])('zeigt das Speicherergebnis %s in Schritt 3', async (result, text) => {
    mocks.persist.mockResolvedValue(result)
    await setSecret('githubToken', TOKEN)
    await setSecret('githubRepo', 'alex/daten')
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Jetzt abgleichen' }))
    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(mocks.persist).toHaveBeenCalledOnce()
  })

  it('zeigt bei fehlgeschlagenem Abgleich die Meldung und markiert Schritt 3 als Fehler', async () => {
    mocks.syncNow.mockImplementation(() => {
      act(() => setSyncStatus({ state: 'offline', message: 'Keine Internetverbindung' }))
      return Promise.resolve()
    })
    await setSecret('githubToken', TOKEN)
    await setSecret('githubRepo', 'alex/daten')
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Jetzt abgleichen' }))
    expect(await screen.findByRole('heading', { name: /③ Erster Abgleich/ })).toHaveTextContent(
      'Fehler',
    )
    expect(mocks.persist).not.toHaveBeenCalled()
  })
})
