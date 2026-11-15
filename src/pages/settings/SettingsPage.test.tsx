import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { getFile, getSecret, putFileLocal, resetDb, setSecret } from '../../data/localStore'
import { getPendingAutoSort, setPendingAutoSort } from '../../data/pendingAutoSort'
import { listItems } from '../../data/repository'
import { resetSyncStatus, setSyncStatus } from '../../data/syncStatus'
import { SettingsPage } from './SettingsPage'

const mocks = vi.hoisted(() => ({ testConnection: vi.fn(), syncNow: vi.fn() }))

vi.mock('../../data/github', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/github')>()),
  testConnection: mocks.testConnection,
}))
vi.mock('../../data/sync', () => ({ syncNow: mocks.syncNow }))

const SECRET_TOKEN = 'github_pat_GEHEIMERINHALTx9Fz'

async function freshDb(): Promise<void> {
  await resetDb()
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('secondbrain')
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  mocks.testConnection.mockReset()
  mocks.syncNow.mockReset().mockResolvedValue(undefined)
  await freshDb()
})
afterEach(() => {
  localStorage.clear()
  vi.unstubAllEnvs()
  act(() => resetSyncStatus())
})
afterAll(freshDb)

const setup = () => {
  const user = userEvent.setup()
  render(<SettingsPage onClose={() => undefined} />)
  return user
}

describe('Abschnitt GitHub', () => {
  it('zeigt das Repo-Feld leer mit neutralem Platzhalter', () => {
    setup()
    const field = screen.getByLabelText('Repository')
    expect(field).toHaveValue('')
    expect(field).toHaveAttribute('placeholder', 'dein-konto/secondbrain-daten')
  })

  it('zeigt ein gespeichertes Repo weiter an', async () => {
    await setSecret('githubRepo', 'alex/mein-daten')
    setup()
    await waitFor(() => expect(screen.getByLabelText('Repository')).toHaveValue('alex/mein-daten'))
  })

  it('speichert Repo und Token und startet einen Sync', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('Repository'), 'alex/secondbrain-daten')
    await user.type(screen.getByLabelText('Token'), SECRET_TOKEN)
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(async () => expect(await getSecret('githubToken')).toBe(SECRET_TOKEN))
    expect(await getSecret('githubRepo')).toBe('alex/secondbrain-daten')
    expect(mocks.syncNow).toHaveBeenCalledOnce()
  })

  it('lehnt ein ungültiges Repo-Format ab und speichert nichts', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('Repository'), 'kein-slash')
    await user.type(screen.getByLabelText('Token'), SECRET_TOKEN)
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByText(/besitzer\/name/)).toBeInTheDocument()
    expect(await getSecret('githubToken')).toBeUndefined()
    expect(await getSecret('githubRepo')).toBeUndefined()
    expect(mocks.syncNow).not.toHaveBeenCalled()
  })

  it('Token-Feld ist ein Passwortfeld mit Umschalter und autocomplete="off"', async () => {
    const user = setup()
    const token = screen.getByLabelText('Token')
    expect(token).toHaveAttribute('type', 'password')
    expect(token).toHaveAttribute('autocomplete', 'off')
    await user.click(screen.getByLabelText('Token anzeigen'))
    expect(token).toHaveAttribute('type', 'text')
  })

  it.each([
    ['ok', 'Verbunden'],
    ['unauthorized', 'Token ungültig oder abgelaufen'],
    ['notFound', 'Repository nicht gefunden oder kein Zugriff'],
    ['offline', 'Keine Internetverbindung'],
    ['error', 'Unbekannter Fehler'],
  ])('Verbindungstest %s zeigt "%s"', async (result, text) => {
    mocks.testConnection.mockResolvedValue(result)
    const user = setup()
    await user.type(screen.getByLabelText('Repository'), 'alex/daten')
    await user.type(screen.getByLabelText('Token'), SECRET_TOKEN)
    await user.click(screen.getByRole('button', { name: 'Verbindung testen' }))
    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(mocks.testConnection).toHaveBeenCalledWith({ token: SECRET_TOKEN, repo: 'alex/daten' })
  })

  it('zeigt einen gespeicherten Token nie im Klartext', async () => {
    await setSecret('githubToken', SECRET_TOKEN)
    await setSecret('githubRepo', 'alex/daten')
    setup()
    expect(await screen.findByText('Token gespeichert (endet auf …x9Fz)')).toBeInTheDocument()
    expect(screen.getByLabelText('Repository')).toHaveValue('alex/daten')
    expect(screen.getByLabelText('Token')).toHaveValue('')
    expect(document.body.innerHTML).not.toContain(SECRET_TOKEN)
    expect(document.body.textContent).not.toContain(SECRET_TOKEN)
  })

  it('entfernt den Token erst nach Bestätigung', async () => {
    await setSecret('githubToken', SECRET_TOKEN)
    await setSecret('githubRepo', 'alex/daten')
    act(() => setSyncStatus({ state: 'synchron' }))
    const user = setup()
    await user.click(await screen.findByRole('button', { name: 'Token entfernen' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
    expect(await getSecret('githubToken')).toBe(SECRET_TOKEN)

    await user.click(screen.getByRole('button', { name: 'Token entfernen' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Entfernen' }))
    await waitFor(async () => expect(await getSecret('githubToken')).toBeUndefined())
    expect(screen.getByLabelText('Repository')).toHaveValue('')
    expect(screen.queryByText(/Token gespeichert/)).not.toBeInTheDocument()
    expect(screen.getByText('Nicht eingerichtet')).toBeInTheDocument()
  })

  it('enthält die Kurzanleitung', () => {
    setup()
    expect(screen.getByText(/Contents: Read and write/)).toBeInTheDocument()
  })
})

describe('Abschnitt Planungsfenster', () => {
  it('zeigt den Standard 09:00–19:00 und speichert settings.json', async () => {
    const user = setup()
    const start = screen.getByLabelText('Beginn')
    const end = screen.getByLabelText('Ende')
    expect(start).toHaveValue('09:00')
    expect(end).toHaveValue('19:00')
    expect(start).toHaveAttribute('step', '900')
    await user.clear(start)
    await user.type(start, '08:30')
    await user.click(screen.getByRole('button', { name: 'Fenster speichern' }))
    await waitFor(async () => {
      const data = (await getFile('settings.json'))?.data as { planningWindow: { start: string } }
      expect(data.planningWindow.start).toBe('08:30')
    })
  })

  it('verlangt Beginn vor Ende', async () => {
    const user = setup()
    const start = screen.getByLabelText('Beginn')
    await user.clear(start)
    await user.type(start, '20:00')
    await user.click(screen.getByRole('button', { name: 'Fenster speichern' }))
    expect(await screen.findByText('Der Beginn muss vor dem Ende liegen.')).toBeInTheDocument()
    expect(await getFile('settings.json')).toBeUndefined()
  })
})

describe('Abschnitt Pause', () => {
  const savedPause = async (): Promise<unknown> =>
    ((await getFile('settings.json'))?.data as { pause?: unknown }).pause

  it('zeigt den Standard (an, 12:00–13:00) und speichert ihn', async () => {
    const user = setup()
    expect(screen.getByRole('checkbox', { name: 'Pause' })).toBeChecked()
    expect(screen.getByLabelText('Pause Beginn')).toHaveValue('12:00')
    expect(screen.getByLabelText('Pause Ende')).toHaveValue('13:00')
    await user.clear(screen.getByLabelText('Pause Beginn'))
    await user.type(screen.getByLabelText('Pause Beginn'), '12:30')
    await user.click(screen.getByRole('button', { name: 'Fenster speichern' }))
    await waitFor(async () => expect(await savedPause()).toEqual({ start: '12:30', end: '13:00' }))
  })

  it('speichert beim Ausschalten pause: null und blendet die Zeiten aus', async () => {
    const user = setup()
    await user.click(screen.getByRole('checkbox', { name: 'Pause' }))
    expect(screen.queryByLabelText('Pause Beginn')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Fenster speichern' }))
    await waitFor(async () => expect(await savedPause()).toBeNull())
  })

  it('verlangt eine Pause innerhalb des Planungsfensters mit Ende nach Beginn', async () => {
    const user = setup()
    const message =
      'Die Pause muss innerhalb des Planungsfensters liegen und nach ihrem Beginn enden.'
    await user.clear(screen.getByLabelText('Pause Ende'))
    await user.type(screen.getByLabelText('Pause Ende'), '11:00')
    await user.click(screen.getByRole('button', { name: 'Fenster speichern' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Pause Ende'))
    await user.type(screen.getByLabelText('Pause Ende'), '19:30')
    await user.click(screen.getByRole('button', { name: 'Fenster speichern' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(await getFile('settings.json')).toBeUndefined()
  })

  it('zeigt eine gespeicherte abgeschaltete Pause als aus', async () => {
    await putFileLocal('settings.json', {
      planningWindow: { start: '09:00', end: '19:00' },
      pause: null,
      timezone: 'Europe/Berlin',
    })
    setup()
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Pause' })).not.toBeChecked())
  })
})

describe('Abschnitt Info', () => {
  it('zeigt Status, ausstehende Änderungen, letzten Sync und Version', () => {
    act(() =>
      setSyncStatus({ state: 'ausstehend', pending: 4, lastSync: '2026-10-16T12:00:00+02:00' }),
    )
    setup()
    const info = screen.getByRole('region', { name: 'Info' })
    expect(within(info).getByText('Änderungen ausstehend')).toBeInTheDocument()
    expect(within(info).getByText('4')).toBeInTheDocument()
    expect(within(info).getByText(/12:00/)).toBeInTheDocument()
    expect(
      within(info).getByText(`${__APP_VERSION__} · Build ${__BUILD_STAMP__}`),
    ).toBeInTheDocument()
    expect(__APP_VERSION__).toBe('0.8.1')
  })

  it('zeigt die Google-Zeile mit Konto, ohne Verbindung und ohne Client-ID', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id-test')
    localStorage.setItem('secondbrain.googleConnected', '1')
    localStorage.setItem('secondbrain.googleAccount', 'alex@example.com')
    const first = render(<SettingsPage onClose={() => undefined} />)
    const info = () => within(screen.getByRole('region', { name: 'Info' }))
    expect(info().getByText('Verbunden (alex@example.com)')).toBeInTheDocument()
    first.unmount()

    localStorage.clear()
    const second = render(<SettingsPage onClose={() => undefined} />)
    expect(info().getByText('Nicht verbunden')).toBeInTheDocument()
    second.unmount()

    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')
    render(<SettingsPage onClose={() => undefined} />)
    expect(info().getByText('Client-ID fehlt')).toBeInTheDocument()
  })

  it('"Jetzt synchronisieren" ruft syncNow auf', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Jetzt synchronisieren' }))
    expect(mocks.syncNow).toHaveBeenCalledOnce()
  })

  it('listet ungültige Dateien auf', async () => {
    await putFileLocal('items/kaputt.json', { kaputt: true })
    await listItems()
    setup()
    expect(await screen.findByText('items/kaputt.json')).toBeInTheDocument()
  })
})

describe('Abschnitt Automatisches Sortieren', () => {
  const saved = async (): Promise<Record<string, unknown>> =>
    (await getFile('settings.json'))?.data as Record<string, unknown>

  it('steht ohne gespeicherten Wert auf „an“ und zeigt Text und Link', () => {
    setup()
    expect(screen.getByRole('checkbox', { name: 'Mit Claude sortieren' })).toBeChecked()
    expect(
      screen.getByText(/Claude sortiert den Eingangskorb über deine eigene Routine/),
    ).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Anleitung' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(link.getAttribute('href')).toContain('TESTER-ANLEITUNG.md')
  })

  it('speichert beim Ausschalten autoSort und erhält Fenster, Pause und unbekannte Felder', async () => {
    await putFileLocal('settings.json', {
      planningWindow: { start: '08:00', end: '18:00' },
      pause: null,
      timezone: 'Europe/Berlin',
      zukunft: { a: 1 },
    })
    const user = setup()
    const box = screen.getByRole('checkbox', { name: 'Mit Claude sortieren' })
    await waitFor(() => expect(screen.getByLabelText('Beginn')).toHaveValue('08:00'))
    await user.click(box)
    await waitFor(async () => expect((await saved()).autoSort).toBe(false))
    expect(await saved()).toMatchObject({
      planningWindow: { start: '08:00', end: '18:00' },
      pause: null,
      zukunft: { a: 1 },
    })
    expect(box).not.toBeChecked()
    expect(screen.getByText(/Einträge sortierst du selbst über/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Anleitung zum Einrichten' })).toBeInTheDocument()
  })

  it('zeigt einen gespeicherten Wert „aus“ an', async () => {
    await putFileLocal('settings.json', {
      planningWindow: { start: '09:00', end: '19:00' },
      timezone: 'Europe/Berlin',
      autoSort: false,
    })
    setup()
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Mit Claude sortieren' })).not.toBeChecked(),
    )
  })

  it('verwirft beim Umschalten eine vorgemerkte Wahl aus der Ersteinrichtung', async () => {
    setPendingAutoSort(true)
    const user = setup()
    await user.click(screen.getByRole('checkbox', { name: 'Mit Claude sortieren' }))
    await waitFor(async () => expect((await saved()).autoSort).toBe(false))
    expect(getPendingAutoSort()).toBeNull()
  })

  it('Speichern im Planungsfenster erhält autoSort', async () => {
    await putFileLocal('settings.json', {
      planningWindow: { start: '09:00', end: '19:00' },
      timezone: 'Europe/Berlin',
      autoSort: false,
    })
    const user = setup()
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Mit Claude sortieren' })).not.toBeChecked(),
    )
    const start = screen.getByLabelText('Beginn')
    await user.clear(start)
    await user.type(start, '08:30')
    await user.click(screen.getByRole('button', { name: 'Fenster speichern' }))
    await waitFor(async () =>
      expect((await saved()).planningWindow).toMatchObject({ start: '08:30' }),
    )
    expect((await saved()).autoSort).toBe(false)
  })
})
