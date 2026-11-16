import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetDb } from '../../data/localStore'
import {
  addProjectStep,
  createItem,
  createProject,
  listItems,
  listProjects,
  updateItem,
} from '../../data/repository'
import { TasksPage } from './TasksPage'

const calendar = vi.hoisted(() => ({
  createEvent: vi.fn(),
  updateEventTime: vi.fn(),
  deleteEvent: vi.fn(),
  listEvents: vi.fn(),
  getEvent: vi.fn(),
}))
const auth = vi.hoisted(() => ({
  wasConnected: vi.fn(),
  hasClientId: () => false,
  loadGoogleScript: vi.fn(),
}))
vi.mock('../../google/calendar', () => calendar)
vi.mock('../../google/auth', () => auth)

const NOW = new Date('2026-11-16T10:00:00+01:00')

beforeEach(async () => {
  window.localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  calendar.deleteEvent.mockReset().mockResolvedValue(undefined)
  calendar.getEvent
    .mockReset()
    .mockResolvedValue({ id: 'ev', title: '', start: '', end: '', allDay: false })
  auth.wasConnected.mockReset().mockReturnValue(true)
  await resetDb(true)
})
afterEach(() => {
  vi.useRealTimers()
})
afterAll(() => resetDb(true))

async function projectWith(...titles: string[]) {
  const project = await createProject({ title: 'Analysis', categoryId: 'privat' })
  for (const title of titles) await addProjectStep(project.id, { title })
  return project
}

describe('Abhaken eines Projekt-Schritts', () => {
  it('zeigt „Weiter mit: <Titel>“, wenn danach ein Schritt offen ist', async () => {
    const user = userEvent.setup()
    await projectWith('Blatt 1', 'Blatt 2')
    render(<TasksPage />)
    await user.click(await screen.findByRole('checkbox', { name: 'Blatt 1 erledigt' }))
    expect(await screen.findByText('Weiter mit: Blatt 2')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // Rückgängig bleibt möglich.
    await user.click(screen.getByRole('button', { name: 'Rückgängig' }))
    await waitFor(async () =>
      expect((await listItems()).every((i) => i.status === 'offen')).toBe(true),
    )
  })

  it('„Rückgängig“ stellt den Schritt wieder her und blendet „Weiter mit“ aus', async () => {
    const user = userEvent.setup()
    await projectWith('Blatt 1', 'Blatt 2')
    render(<TasksPage />)
    await user.click(await screen.findByRole('checkbox', { name: 'Blatt 1 erledigt' }))
    await screen.findByText('Weiter mit: Blatt 2')
    await user.click(screen.getByRole('button', { name: 'Rückgängig' }))
    await waitFor(() => expect(screen.queryByText(/Weiter mit/)).not.toBeInTheDocument())
    expect(await screen.findByRole('checkbox', { name: 'Blatt 1 erledigt' })).not.toBeChecked()
    expect((await listItems()).find((i) => i.title === 'Blatt 1')?.status).toBe('offen')
  })

  it('zeigt den Dialog beim letzten Schritt; „Hinzufügen“ legt einen neuen Schritt an', async () => {
    const user = userEvent.setup()
    await projectWith('Letzter')
    render(<TasksPage />)
    await user.click(await screen.findByRole('checkbox', { name: 'Letzter erledigt' }))
    const dialog = await screen.findByRole('dialog', { name: 'Was ist der nächste Schritt?' })
    expect(within(dialog).getByRole('textbox', { name: 'Nächster Schritt' })).toHaveFocus()
    expect(within(dialog).getByRole('button', { name: 'Hinzufügen' })).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox', { name: 'Nächster Schritt' }), 'Danach')
    await user.click(within(dialog).getByRole('button', { name: 'Hinzufügen' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('checkbox', { name: 'Danach erledigt' })).toBeInTheDocument()
    expect((await listProjects())[0].status).toBe('aktiv')
  })

  it('„Später“ schließt den Dialog, das Projekt zeigt die Warnung', async () => {
    const user = userEvent.setup()
    await projectWith('Letzter')
    render(<TasksPage />)
    await user.click(await screen.findByRole('checkbox', { name: 'Letzter erledigt' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Später' }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /Projekte/ }))
    expect(await screen.findByText('⚠ Nächsten Schritt festlegen')).toBeInTheDocument()
    expect((await listProjects())[0].status).toBe('aktiv')
  })

  it('„Projekt abschließen“ im Dialog schließt das Projekt ab', async () => {
    const user = userEvent.setup()
    await projectWith('Letzter')
    render(<TasksPage />)
    await user.click(await screen.findByRole('checkbox', { name: 'Letzter erledigt' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Projekt abschließen',
      }),
    )
    await waitFor(async () => expect((await listProjects())[0].status).toBe('erledigt'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('zeigt bei Aufgaben ohne Projekt keinen Hinweis', async () => {
    const user = userEvent.setup()
    await createItem({ type: 'aufgabe', title: 'Allein', categoryId: 'privat' })
    render(<TasksPage />)
    await user.click(await screen.findByRole('checkbox', { name: 'Allein erledigt' }))
    expect(await screen.findByRole('button', { name: 'Rückgängig' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText(/Weiter mit/)).not.toBeInTheDocument()
  })

  it('wirkt auch in der Projektansicht', async () => {
    const user = userEvent.setup()
    await projectWith('Blatt 1', 'Blatt 2')
    render(<TasksPage />)
    await user.click(await screen.findByRole('tab', { name: /Projekte/ }))
    await user.click(await screen.findByRole('button', { name: /^Analysis/ }))
    await user.click(await screen.findByRole('checkbox', { name: 'Blatt 1 erledigt' }))
    expect(await screen.findByText('Weiter mit: Blatt 2')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Blatt 2 erledigt' }))
    expect(
      await screen.findByRole('dialog', { name: 'Was ist der nächste Schritt?' }),
    ).toBeInTheDocument()
  })
})

describe('Projekt abschließen und Google-Termine', () => {
  async function scheduledProject() {
    const project = await projectWith('Künftig', 'Vergangen')
    const items = await listItems()
    const byTitle = (title: string) => items.find((i) => i.title === title)!
    await updateItem(byTitle('Künftig').id, {
      schedule: {
        start: '2026-11-18T10:00:00+01:00',
        durationMin: 30,
        calendarEventId: 'ev-future',
      },
    })
    await updateItem(byTitle('Vergangen').id, {
      schedule: {
        start: '2026-11-15T10:00:00+01:00',
        durationMin: 30,
        calendarEventId: 'ev-past',
      },
    })
    return project
  }

  async function completeFromView(user: ReturnType<typeof userEvent.setup>) {
    render(<TasksPage />)
    await user.click(await screen.findByRole('tab', { name: /Projekte/ }))
    await user.click(await screen.findByRole('button', { name: /^Analysis/ }))
    await user.click(await screen.findByRole('button', { name: 'Projekt abschließen' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ja, abschließen' }),
    )
    await waitFor(async () => expect((await listProjects())[0].status).toBe('erledigt'))
  }

  it('löscht künftige Termine offener Schritte, vergangene bleiben', async () => {
    const user = userEvent.setup()
    await scheduledProject()
    await completeFromView(user)
    expect(calendar.deleteEvent).toHaveBeenCalledTimes(1)
    expect(calendar.deleteEvent).toHaveBeenCalledWith('ev-future', { interactive: false })
    const items = await listItems()
    expect(items.find((i) => i.title === 'Künftig')?.schedule).toBeNull()
    expect(items.find((i) => i.title === 'Vergangen')?.schedule?.calendarEventId).toBe('ev-past')
    expect(await screen.findByText('Termin entfernt')).toBeInTheDocument()
  })

  it('schließt ohne Google-Verbindung trotzdem ab und weist darauf hin', async () => {
    auth.wasConnected.mockReturnValue(false)
    const user = userEvent.setup()
    await scheduledProject()
    await completeFromView(user)
    expect(calendar.deleteEvent).not.toHaveBeenCalled()
    expect(
      await screen.findByText('Termin bleibt im Kalender – Google nicht verbunden.'),
    ).toBeInTheDocument()
    expect((await listItems()).find((i) => i.title === 'Künftig')?.schedule).not.toBeNull()
  })
})
