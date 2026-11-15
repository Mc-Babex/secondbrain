import { render, screen, waitFor } from '@testing-library/react'
import { App } from './App'
import { putFileLocal, resetDb, setSecret } from './data/localStore'
import { isFirstRunDone, markFirstRunDone } from './lib/firstRun'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  await resetDb(true)
})

describe('App – Ersteinrichtung', () => {
  it('zeigt auf einem leeren Gerät die Ersteinrichtung statt der Seiten', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Willkommen' })).toBeInTheDocument()
    expect(screen.queryByRole('main')).not.toBeInTheDocument()
    expect(isFirstRunDone()).toBe(false)
  })

  it('zeigt mit gesetztem Merker sofort die Seiten', () => {
    markFirstRunDone()
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Erfassung' })).toBeInTheDocument()
    expect(screen.queryByText('Willkommen')).not.toBeInTheDocument()
  })

  it('zeigt auf einem Bestandsgerät mit Token die Seiten und setzt den Merker', async () => {
    await setSecret('githubToken', 'github_pat_BESTAND')
    render(<App />)
    expect(screen.queryByRole('heading', { name: 'Willkommen' })).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Erfassung' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Willkommen' })).not.toBeInTheDocument()
    await waitFor(() => expect(isFirstRunDone()).toBe(true))
  })

  it('zeigt mit vorhandenen Einträgen keine Ersteinrichtung', async () => {
    await putFileLocal('inbox/a.json', {
      id: 'a',
      text: 'Hallo',
      createdAt: '2026-01-01T10:00:00+01:00',
      source: 'text',
    })
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Erfassung' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Willkommen' })).not.toBeInTheDocument()
  })
})
