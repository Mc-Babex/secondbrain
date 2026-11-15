import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { App } from './App'
import { resetDb } from './data/localStore'
import { getErrorLog, clearErrorLog } from './data/errorLog'
import { markFirstRunDone } from './lib/firstRun'

vi.mock('./lib/displayWatchdog', () => ({ useDisplayWatchdog: () => undefined }))
vi.mock('./google/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./google/auth')>()),
  hasClientId: () => true,
  loadGoogleScript: vi.fn().mockResolvedValue(undefined),
  getAccessToken: vi.fn().mockResolvedValue('token'),
}))

const today = new Date().toISOString().slice(0, 10)

/** Rohe Google-Antwort mit ungewöhnlichen Terminen (Serien, ganztägig, Einladungen, kaputte Felder). */
const RAW_ITEMS: unknown[] = [
  {
    id: 'a1',
    summary: 'Serie',
    recurringEventId: 'a',
    start: { dateTime: `${today}T09:00:00+02:00` },
    end: { dateTime: `${today}T10:00:00+02:00` },
  },
  { id: 'a2', start: { date: today }, end: { date: today } },
  { id: 'a3', summary: 'Mehrtägig', start: { date: today }, end: { date: '2099-01-01' } },
  {
    id: 'a4',
    summary: 'Einladung',
    organizer: { email: 'x@y.de' },
    attendees: [{ self: true, responseStatus: 'declined' }, { email: 'z@y.de' }],
    start: { dateTime: `${today}T11:00:00+02:00` },
    end: { dateTime: `${today}T11:00:00+02:00` },
  },
  { id: 'a5', summary: 'Ohne Zeiten', start: {}, end: null },
  {
    id: 'a6',
    summary: 'Ende vor Beginn',
    start: { dateTime: `${today}T15:00:00+02:00` },
    end: { dateTime: `${today}T14:00:00+02:00` },
  },
  {
    id: 'a7',
    summary: 'Kaputt',
    start: { dateTime: 'kein Datum' },
    end: { dateTime: 'auch nicht' },
  },
  { id: 'a8', summary: 42, start: 'x', end: [] },
  null,
  'text',
]

beforeEach(async () => {
  localStorage.clear()
  markFirstRunDone()
  localStorage.setItem('secondbrain.googleConnected', '1')
  clearErrorLog()
  await resetDb(true)
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ summary: 'a@b.de', items: RAW_ITEMS }), { status: 200 }),
        ),
      ),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('App mit ungewöhnlichen Google-Daten', () => {
  it('bleibt beim Seitenwechsel sichtbar und wirft keinen Render-Fehler', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const user = userEvent.setup()
    render(<App />)
    for (const key of [
      '{ArrowLeft}',
      '{ArrowRight}',
      '{ArrowRight}',
      '{ArrowRight}',
      '{ArrowLeft}',
    ]) {
      await user.keyboard(key)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30))
      })
    }
    await user.click(screen.getByRole('button', { name: 'Seite: Kalender' }))
    await waitFor(() => expect(screen.queryByText('Lade Termine …')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Seite: Kalender' })).toBeInTheDocument()
    expect(screen.getByText('Mehrtägig')).toBeInTheDocument()
    expect(getErrorLog()).toEqual([])
    const reactErrors = consoleError.mock.calls.filter((call) =>
      String(call[0]).includes('The above error occurred'),
    )
    expect(reactErrors).toEqual([])
    consoleError.mockRestore()
  })
})
