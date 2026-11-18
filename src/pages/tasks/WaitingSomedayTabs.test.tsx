import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetDb } from '../../data/localStore'
import { createItem } from '../../data/repository'
import type { Item } from '../../data/types'
import { followUpText, sinceText } from './waitingText'
import { TasksPage } from './TasksPage'

const NOW = new Date('2026-10-21T15:00:00+02:00')

beforeEach(async () => {
  window.localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  await resetDb(true)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
afterAll(() => resetDb(true))

type Extra = Partial<Omit<Item, 'type' | 'title' | 'categoryId'>>
const task = (title: string, extra: Extra = {}, categoryId = 'privat') =>
  createItem({ type: 'aufgabe', title, categoryId, ...extra })
const waiting = (title: string, since: string, followUpOn: string | null = null, person = 'Amt') =>
  task(title, { gtd: 'warten', waiting: { person, since, followUpOn } })

const titles = (el: HTMLElement): string[] =>
  within(el)
    .getAllByRole('checkbox')
    .map((c) => (c.getAttribute('aria-label') ?? '').replace(/ erledigt$/, ''))

async function openTab(name: RegExp) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('tab', { name }))
  return user
}

describe('Texte', () => {
  it('sinceText und followUpText', () => {
    expect(sinceText(0)).toBe('seit heute')
    expect(sinceText(1)).toBe('seit 1 Tag')
    expect(sinceText(5)).toBe('seit 5 Tagen')
    expect(followUpText('2026-10-21', '2026-10-21')).toBe('heute nachhaken')
    expect(followUpText('2026-10-20', '2026-10-21')).toBe('nachhaken seit Di 20.10.')
    expect(followUpText('2026-10-23', '2026-10-21')).toBe('nachhaken am Fr 23.10.')
  })
})

describe('Reiter „Warte auf“', () => {
  it('sortiert fällige zuerst und zeigt „seit X Tagen“ über Monatsgrenze', async () => {
    await waiting('Ohne Nachhaken', '2026-10-01')
    await waiting('Später', '2026-10-01', '2026-10-30')
    await waiting('Fällig', '2026-09-28', '2026-10-20')
    await waiting('Heute erst', '2026-10-21')
    await waiting('Gestern', '2026-10-20')
    render(<TasksPage />)
    await openTab(/Warte auf/)
    const panel = screen.getByRole('tabpanel')
    expect(titles(panel)).toEqual(['Fällig', 'Später', 'Ohne Nachhaken', 'Gestern', 'Heute erst'])
    expect(within(panel).getByText('seit 23 Tagen')).toBeInTheDocument()
    expect(within(panel).getByText('seit heute')).toBeInTheDocument()
    expect(within(panel).getByText('seit 1 Tag')).toBeInTheDocument()
    expect(within(panel).getByText('nachhaken am Fr 30.10.')).toBeInTheDocument()
  })

  it('zählt Tage über die Zeitumstellung richtig', async () => {
    vi.setSystemTime(new Date('2026-10-26T00:30:00+01:00'))
    await waiting('Umstellung', '2026-10-24')
    render(<TasksPage />)
    await openTab(/Warte auf/)
    expect(screen.getByText('seit 2 Tagen')).toBeInTheDocument()
  })

  it('hebt Nachhaken heute und gestern hervor, morgen nicht', async () => {
    await waiting('Heute', '2026-10-10', '2026-10-21')
    await waiting('Gestern', '2026-10-10', '2026-10-20')
    await waiting('Morgen', '2026-10-10', '2026-10-22')
    render(<TasksPage />)
    await openTab(/Warte auf/)
    const row = (title: string) =>
      screen.getByRole('button', { name: title }).closest('li') as HTMLElement
    expect(within(row('Heute')).getByText(/heute nachhaken/)).toBeInTheDocument()
    expect(within(row('Gestern')).getByText(/nachhaken seit Di 20\.10\./)).toBeInTheDocument()
    expect(within(row('Morgen')).getByText('nachhaken am Do 22.10.')).toBeInTheDocument()
    expect(row('Heute').className).toMatch(/followUpRow/)
    expect(row('Gestern').className).toMatch(/followUpRow/)
    expect(row('Morgen').className).not.toMatch(/followUpRow/)
    expect(row('Heute')).toHaveAttribute('data-highlight', 'true')
    expect(row('Morgen')).not.toHaveAttribute('data-highlight')
  })

  it('„Antwort erhalten“ → Erledigt archiviert mit Rückgängig', async () => {
    await waiting('Antwort Amt', '2026-10-10')
    render(<TasksPage />)
    const user = await openTab(/Warte auf/)
    await user.click(screen.getByRole('button', { name: /Antwort erhalten/ }))
    const dialog = screen.getByRole('dialog', { name: 'Antwort erhalten' })
    await user.click(within(dialog).getByRole('button', { name: 'Erledigt (archivieren)' }))
    expect(await screen.findByRole('button', { name: 'Rückgängig' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText('Du wartest gerade auf nichts.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Rückgängig' }))
    expect(await screen.findByText('Antwort Amt')).toBeInTheDocument()
  })

  it('„Antwort erhalten“ → nächsten Schritt machen öffnet den Editor', async () => {
    await waiting('Antwort Amt', '2026-10-10')
    render(<TasksPage />)
    const user = await openTab(/Warte auf/)
    await user.click(screen.getByRole('button', { name: /Antwort erhalten/ }))
    await user.click(screen.getByRole('button', { name: 'Daraus nächsten Schritt machen' }))
    expect(await screen.findByRole('dialog', { name: 'Eintrag bearbeiten' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(await screen.findByText('Du wartest gerade auf nichts.')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Aktuell' }))
    expect(await screen.findByText('Antwort Amt')).toBeInTheDocument()
  })

  it('„Antwort erhalten“ → Abbrechen ändert nichts', async () => {
    await waiting('Antwort Amt', '2026-10-10')
    render(<TasksPage />)
    const user = await openTab(/Warte auf/)
    await user.click(screen.getByRole('button', { name: /Antwort erhalten/ }))
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Antwort Amt')).toBeInTheDocument()
  })

  it('Anzahl in der Reiter-Leiste stimmt, leerer Zustand', async () => {
    await waiting('A', '2026-10-10')
    await waiting('B', '2026-10-10')
    await task('Offen')
    render(<TasksPage />)
    expect(await screen.findByRole('tab', { name: 'Warte auf, 2' })).toBeInTheDocument()
    await task('C', {
      gtd: 'warten',
      waiting: { person: 'x', since: '2026-10-10', followUpOn: null },
    })
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Warte auf, 3' })).toBeInTheDocument(),
    )
  })

  it('zeigt den leeren Zustand', async () => {
    await task('Offen')
    render(<TasksPage />)
    await openTab(/Warte auf/)
    expect(screen.getByText('Du wartest gerade auf nichts.')).toBeInTheDocument()
  })
})

describe('Reiter „Irgendwann“', () => {
  it('gruppiert nach Ablage, neueste zuerst, Projekt-Schritte mit Projektname', async () => {
    vi.setSystemTime(new Date('2026-01-01T10:00:00+01:00'))
    await task('Alt', { gtd: 'irgendwann' }, 'privat')
    vi.setSystemTime(new Date('2026-06-01T10:00:00+02:00'))
    await task('Neu', { gtd: 'irgendwann' }, 'privat')
    vi.setSystemTime(NOW)
    await task('Arbeitsidee', { gtd: 'irgendwann' }, 'arbeit')
    render(<TasksPage />)
    await openTab(/Irgendwann/)
    const privat = screen.getByRole('group', { name: 'Privat' })
    expect(titles(privat)).toEqual(['Neu', 'Alt'])
    expect(titles(screen.getByRole('group', { name: 'Arbeit' }))).toEqual(['Arbeitsidee'])
  })

  it('„Aktivieren“ setzt den Status; Eintrag steht danach unter Aktuell', async () => {
    await task('Segeln lernen', { gtd: 'irgendwann' })
    render(<TasksPage />)
    const user = await openTab(/Irgendwann/)
    await user.click(screen.getByRole('button', { name: /Aktivieren/ }))
    expect(await screen.findByText('Aktiviert – steht jetzt unter Aktuell')).toBeInTheDocument()
    expect(await screen.findByText(/Nichts für irgendwann/)).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Aktuell' }))
    const section = (await screen.findByText('Nächste Schritte')).closest('section') as HTMLElement
    expect(within(section).getByText('Segeln lernen')).toBeInTheDocument()
  })

  it('zeigt den leeren Zustand und die Anzahl', async () => {
    await task('I', { gtd: 'irgendwann' })
    render(<TasksPage />)
    expect(await screen.findByRole('tab', { name: 'Irgendwann, 1' })).toBeInTheDocument()
  })
})

describe('Fokus-Hinweis', () => {
  it('erscheint oben im Reiter Aktuell, auch wenn der Abschnitt Fokus leer ist', async () => {
    for (let i = 1; i <= 6; i += 1) {
      await task(`F${i}`, {
        important: true,
        schedule: { start: '2026-10-21T17:00:00+02:00', durationMin: 30 },
      })
    }
    render(<TasksPage />)
    expect(
      await screen.findByText('Mehr als 5 Aufgaben im Fokus – was davon ist wirklich wichtig?'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Fokus/ })).not.toBeInTheDocument()
  })
})
