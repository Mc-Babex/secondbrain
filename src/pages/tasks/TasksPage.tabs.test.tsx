import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { putFileLocal, resetDb } from '../../data/localStore'
import { createItem, createProject } from '../../data/repository'
import type { Item } from '../../data/types'
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

const titlesIn = (el: HTMLElement): string[] =>
  within(el)
    .getAllByRole('checkbox')
    .map((c) => (c.getAttribute('aria-label') ?? '').replace(/ erledigt$/, ''))

describe('Aufgabenseite: Aufbau und Reiter', () => {
  it('zeigt die Abschnitte über den Reitern in der Reihenfolge laut SPEC 6.3', async () => {
    await putFileLocal('suggestions/s1.json', {
      id: 's1',
      kind: 'neue-aufgabe',
      text: 'Vorschlag',
      reason: 'Grund',
      createdAt: '2026-10-21T10:00:00+02:00',
      proposedItem: { type: 'aufgabe', title: 'Vorschlag', categoryId: 'privat' },
    })
    await putFileLocal('runs/last.json', {
      finishedAt: '2026-10-21T14:05:00+02:00',
      itemIds: [],
      errors: [{ inboxId: null, message: 'Fehler X' }],
    })
    await task('Überfällige', { schedule: { start: '2026-10-20T10:00:00+02:00', durationMin: 30 } })
    render(<TasksPage />)
    const suggestions = await screen.findByText('Vorschläge von Claude')
    const hints = await screen.findByText('Hinweise vom letzten Lauf')
    const inbox = await screen.findByRole('button', { name: 'Jetzt sortieren' })
    const tabs = await screen.findByRole('tablist')
    const today = await screen.findByText('Heute / Überfällig')
    const before = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(before(suggestions, hints)).toBe(true)
    expect(before(hints, inbox)).toBe(true)
    expect(before(inbox, tabs)).toBe(true)
    expect(before(tabs, today)).toBe(true)
    expect(screen.queryByRole('heading', { name: 'Überfällig' })).not.toBeInTheDocument()
  })

  it('merkt Reiter und Zeitfilter nach dem Neuladen', async () => {
    const user = userEvent.setup()
    await task('Kurz', { durationMin: 10 })
    const first = render(<TasksPage />)
    await user.click(await screen.findByRole('button', { name: '≤ 15 Min.' }))
    await user.click(screen.getByRole('tab', { name: /Warte auf/ }))
    first.unmount()
    render(<TasksPage />)
    expect(await screen.findByRole('tab', { name: /Warte auf/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await user.click(screen.getByRole('tab', { name: 'Aktuell' }))
    expect(screen.getByRole('button', { name: '≤ 15 Min.' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('startet ohne verfügbaren localStorage mit den Standardwerten und ohne Fehler', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('gesperrt')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('gesperrt')
    })
    const user = userEvent.setup()
    await task('Etwas')
    render(<TasksPage />)
    expect(await screen.findByRole('tab', { name: 'Aktuell' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('button', { name: 'alle' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('tab', { name: /Irgendwann/ }))
    expect(screen.getByRole('tab', { name: /Irgendwann/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('hat Tab-Muster mit Anzahl (zusätzlich im aria-label) und vollen Namen als aria-label', async () => {
    await task('W', { gtd: 'warten' })
    await task('I1', { gtd: 'irgendwann' })
    await task('I2', { gtd: 'irgendwann' })
    await createProject({ title: 'Umzug', categoryId: 'privat' })
    render(<TasksPage />)
    const tab = await screen.findByRole('tab', { name: 'Irgendwann, 2' })
    expect(tab).toHaveTextContent('Irgendwann')
    expect(tab.querySelector('[class*="count"]')).toHaveTextContent('2')
    expect(screen.getByRole('tab', { name: 'Projekte, 1' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Warte auf, 1' })).toBeInTheDocument()
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      screen.getByRole('tab', { name: 'Aktuell' }).id,
    )
  })

  it('Pfeiltasten in der Leiste bewegen den Fokus und wechseln nicht die Seite', async () => {
    const user = userEvent.setup()
    const onWindowKey = vi.fn()
    window.addEventListener('keydown', onWindowKey)
    await task('Etwas')
    render(<TasksPage />)
    const first = await screen.findByRole('tab', { name: 'Aktuell' })
    first.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: /Projekte/ })).toHaveFocus()
    expect(first).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(first).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: /Irgendwann/ })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('tab', { name: /Irgendwann/ })).toHaveAttribute('aria-selected', 'true')
    expect(onWindowKey.mock.calls.filter(([e]) => e.key.startsWith('Arrow'))).toHaveLength(0)
    window.removeEventListener('keydown', onWindowKey)
  })

  it('zeigt Projekte, Warte auf und Irgendwann in einfacher Form', async () => {
    const user = userEvent.setup()
    await createProject({ title: 'Umzug', categoryId: 'privat' })
    await task('Antwort Amt', {
      gtd: 'warten',
      waiting: { person: 'Amt', since: '2026-10-01', followUpOn: null },
    })
    await task('Segeln lernen', { gtd: 'irgendwann' })
    render(<TasksPage />)
    await user.click(await screen.findByRole('tab', { name: /Projekte/ }))
    expect(screen.getByText('Umzug')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /Warte auf/ }))
    expect(screen.getByText('Antwort Amt')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /Irgendwann/ }))
    expect(screen.getByText('Segeln lernen')).toBeInTheDocument()
  })

  it('öffnet die Projektansicht aus dem Reiter; der Pfeil führt zurück zum Reiter „Projekte“', async () => {
    const user = userEvent.setup()
    await createProject({ title: 'Umzug', categoryId: 'privat' })
    render(<TasksPage />)
    await user.click(await screen.findByRole('tab', { name: /Projekte/ }))
    await user.click(await screen.findByRole('button', { name: /^Umzug/ }))
    expect(await screen.findByRole('heading', { name: 'Umzug' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Zurück zu den Aufgaben' }))
    expect(await screen.findByRole('tab', { name: /Projekte/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('button', { name: /^Umzug/ })).toBeInTheDocument()
  })
})

describe('Reiter „Aktuell“', () => {
  it('Fokus: nur offene Fokus-Aufgaben außer Irgendwann; Hinweis erst ab 6', async () => {
    for (let i = 1; i <= 5; i += 1) await task(`F${i}`, { important: true })
    await task('Später', { important: true, gtd: 'irgendwann' })
    await task('Erledigt', { important: true, status: 'erledigt' })
    await task('Normal')
    const { unmount } = render(<TasksPage />)
    const section = (await screen.findByRole('heading', { name: /Fokus/ })).closest(
      'section',
    ) as HTMLElement
    expect(titlesIn(section)).toHaveLength(5)
    expect(screen.queryByText(/Mehr als 5 Aufgaben im Fokus/)).not.toBeInTheDocument()
    unmount()
    await task('F6', { important: true })
    render(<TasksPage />)
    const again = (await screen.findByRole('heading', { name: /Fokus/ })).closest(
      'section',
    ) as HTMLElement
    await waitFor(() => expect(titlesIn(again)).toHaveLength(6))
    expect(
      screen.getByText('Mehr als 5 Aufgaben im Fokus – was davon ist wirklich wichtig?'),
    ).toBeInTheDocument()
    expect(within(again).queryByText('Später')).not.toBeInTheDocument()
  })

  it('Heute/Überfällig: Termine heute und überfällige mit den Aktionen, künftige unter Eingeplant', async () => {
    await task('Vorbei', { schedule: { start: '2026-10-20T10:00:00+02:00', durationMin: 30 } })
    await task('Heute früh', { schedule: { start: '2026-10-21T09:00:00+02:00', durationMin: 30 } })
    await task('Heute spät', { schedule: { start: '2026-10-21T17:00:00+02:00', durationMin: 30 } })
    await task('Morgen', { schedule: { start: '2026-10-22T10:00:00+02:00', durationMin: 30 } })
    render(
      <TasksPage
        renderOverdueActions={(i) => <button>Überfällig-Aktion {i.title}</button>}
        renderTaskActions={(i) => <button>Uhr {i.title}</button>}
      />,
    )
    const section = (await screen.findByText('Heute / Überfällig')).closest(
      'section',
    ) as HTMLElement
    expect(titlesIn(section)).toEqual(['Vorbei', 'Heute früh', 'Heute spät'])
    expect(within(section).getAllByRole('button', { name: 'Erledigt' })).toHaveLength(2)
    expect(
      within(section).getByRole('button', { name: 'Überfällig-Aktion Heute früh' }),
    ).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Uhr Heute spät' })).toBeInTheDocument()
    const planned = screen.getByText('Eingeplant (1)').closest('details') as HTMLElement
    expect(planned).not.toHaveAttribute('open')
    expect(within(planned).getByText('Morgen')).toBeInTheDocument()
    expect(within(planned).getByRole('button', { name: 'Uhr Morgen' })).toBeInTheDocument()
  })

  it('Nächste Schritte: nach Ablage gruppiert, nur nächster Schritt je Projekt, sortiert', async () => {
    const project = await createProject({ title: 'Umzug', categoryId: 'arbeit' })
    await task('Schritt 2', { projectId: project.id, projectOrder: 2 }, 'arbeit')
    await task('Schritt 1', { projectId: project.id, projectOrder: 1 }, 'arbeit')
    await task('Ohne Datum', {}, 'privat')
    await task('Fällig', { dueDate: '2026-10-25' }, 'privat')
    await task('Überfällig', { dueDate: '2026-10-10' }, 'privat')
    await task('Lang', { durationMin: 60 }, 'privat')
    await task('Kurz', { durationMin: 5 }, 'privat')
    render(<TasksPage />)
    const section = (await screen.findByText('Nächste Schritte')).closest('section') as HTMLElement
    const privat = within(section).getByRole('group', { name: 'Privat' })
    expect(titlesIn(privat)).toEqual(['Überfällig', 'Fällig', 'Kurz', 'Lang', 'Ohne Datum'])
    const arbeit = within(section).getByRole('group', { name: 'Arbeit' })
    expect(titlesIn(arbeit)).toEqual(['Schritt 1'])
    expect(within(arbeit).getByText('Projekt: Umzug')).toBeInTheDocument()
  })

  it('Zeitfilter: ≤ 15 Min./alle blendet größere und fehlende Dauer aus', async () => {
    const user = userEvent.setup()
    await task('A10', { durationMin: 10 })
    await task('B30', { durationMin: 30 })
    await task('C60', { durationMin: 60 })
    await task('D90', { durationMin: 90 })
    await task('E ohne')
    render(<TasksPage />)
    const section = (await screen.findByText('Nächste Schritte')).closest('section') as HTMLElement
    const visible = () =>
      within(section)
        .queryAllByRole('checkbox')
        .map((c) => c.getAttribute('aria-label'))
    expect(within(section).queryByRole('button', { name: '≤ 30' })).toBeNull()
    await user.click(within(section).getByRole('button', { name: '≤ 15 Min.' }))
    expect(visible()).toEqual(['A10 erledigt'])
    await user.click(within(section).getByRole('button', { name: 'alle' }))
    expect(visible()).toHaveLength(5)
  })

  it('zeigt einen Fokus-Eintrag mit Termin nur einmal', async () => {
    await task('Doppelt', {
      important: true,
      schedule: { start: '2026-10-21T17:00:00+02:00', durationMin: 30 },
    })
    render(<TasksPage />)
    await screen.findByText('Heute / Überfällig')
    expect(screen.getAllByText('Doppelt')).toHaveLength(1)
  })
})
