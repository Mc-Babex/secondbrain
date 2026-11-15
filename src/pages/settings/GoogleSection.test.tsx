import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { disconnect } from '../../google/auth'
import { GoogleSection } from './GoogleSection'
import { GoogleError } from '../../google/types'
import type { GoogleOAuth2, TokenClientConfig } from '../../google/types'

const SECRET = 'ya29.GEHEIMES-TOKEN-xyz'
const calendar = vi.hoisted(() => ({ getCalendarName: vi.fn() }))
vi.mock('../../google/calendar', () => calendar)

const oauth2: GoogleOAuth2 = {
  initTokenClient: vi.fn((config: TokenClientConfig) => ({
    requestAccessToken: () => config.callback({ access_token: SECRET, expires_in: 3600 }),
  })),
  revoke: vi.fn((_token: string, done?: () => void) => done?.()),
}

const renderSection = () => render(<GoogleSection />)

beforeEach(() => {
  localStorage.clear()
  calendar.getCalendarName.mockReset().mockResolvedValue('alex@example.com')
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id-test')
  window.google = { accounts: { oauth2 } }
})
afterEach(async () => {
  await disconnect()
  vi.unstubAllEnvs()
  delete window.google
})

describe('Abschnitt Google', () => {
  it('verbindet, zeigt den Kalendernamen und trennt wieder', async () => {
    const user = userEvent.setup()
    renderSection()
    expect(screen.getByText('Nicht verbunden')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mit Google verbinden' }))
    expect(await screen.findByText('Verbunden: alex@example.com')).toBeInTheDocument()
    expect(JSON.stringify({ ...localStorage })).not.toContain(SECRET)
    expect(localStorage.getItem('secondbrain.googleAccount')).toBe('alex@example.com')

    await user.click(screen.getByRole('button', { name: 'Trennen' }))
    await waitFor(() => expect(screen.getByText('Nicht verbunden')).toBeInTheDocument())
    expect(oauth2.revoke).toHaveBeenCalledWith(SECRET, expect.any(Function))
    expect(screen.queryByRole('button', { name: 'Trennen' })).not.toBeInTheDocument()
    expect(localStorage.getItem('secondbrain.googleConnected')).toBeNull()
    expect(localStorage.getItem('secondbrain.googleAccount')).toBeNull()
  })

  it('zeigt nach Neustart das gemerkte Konto ohne Netzaufruf', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    localStorage.setItem('secondbrain.googleConnected', '1')
    localStorage.setItem('secondbrain.googleAccount', 'alex@example.com')
    renderSection()
    expect(screen.getByText('Verbunden: alex@example.com')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(calendar.getCalendarName).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('stürzt ohne verfügbaren localStorage nicht ab und zeigt „Verbunden"', async () => {
    const user = userEvent.setup()
    renderSection()
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('gesperrt')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('gesperrt')
    })
    await user.click(screen.getByRole('button', { name: 'Mit Google verbinden' }))
    await waitFor(() => expect(calendar.getCalendarName).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    getItem.mockRestore()
    setItem.mockRestore()
  })

  it('weist bei abgelaufenem Zugang auf „Erneut verbinden" hin', async () => {
    calendar.getCalendarName.mockRejectedValue(new GoogleError('unauthorized'))
    const user = userEvent.setup()
    renderSection()
    await user.click(screen.getByRole('button', { name: 'Mit Google verbinden' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Erneut verbinden')
  })

  it('zeigt „Verbunden" nach Neustart anhand des lokalen Flags', async () => {
    localStorage.setItem('secondbrain.googleConnected', '1')
    renderSection()
    expect(screen.getByText('Verbunden')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trennen' })).toBeInTheDocument()
  })

  it('weist ohne Client-ID darauf hin und sperrt das Verbinden', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')
    renderSection()
    expect(screen.getByText(/Google-Client-ID fehlt/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mit Google verbinden' })).toBeDisabled()
  })

  it('lädt das GIS-Skript vorab, wenn eine Client-ID vorhanden ist', () => {
    delete window.google
    renderSection()
    expect(
      document.querySelector('script[src="https://accounts.google.com/gsi/client"]'),
    ).not.toBeNull()
  })

  it('zeigt Verbindungsfehler verständlich ohne Token', async () => {
    calendar.getCalendarName.mockRejectedValue(new Error(`Boom ${SECRET}`))
    const user = userEvent.setup()
    renderSection()
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Mit Google verbinden' }))
    })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Google hat einen Fehler gemeldet')
    expect(alert.textContent).not.toContain(SECRET)
  })
})
