import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetDb } from '../../../data/localStore'
import {
  addProjectStep,
  completeItem,
  createProject,
  listItems,
  listProjects,
} from '../../../data/repository'
import { TasksPage } from '../TasksPage'

const NOW = new Date('2026-11-16T10:00:00+01:00')

beforeEach(async () => {
  window.localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  await resetDb(true)
})
afterEach(() => {
  vi.useRealTimers()
})
afterAll(() => resetDb(true))

async function openProjectsTab(user: ReturnType<typeof userEvent.setup>) {
  render(<TasksPage />)
  await user.click(await screen.findByRole('tab', { name: /Projekte/ }))
}

const openProject = (user: ReturnType<typeof userEvent.setup>, name: RegExp | string) =>
  user.click(screen.getByRole('button', { name }))

describe('Reiter „Projekte“: anlegen, bearbeiten, löschen', () => {
  it('legt ein Projekt an (Fokus im ersten Feld, Ablage ohne Einkauf/Archiv) und zeigt es gruppiert', async () => {
    const user = userEvent.setup()
    await openProjectsTab(user)
    expect(await screen.findByText(/Keine aktiven Projekte/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Neues Projekt' }))
    const dialog = await screen.findByRole('dialog', { name: 'Neues Projekt' })
    expect(within(dialog).getByRole('textbox', { name: 'Titel' })).toHaveFocus()
    const options = within(dialog)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual(['Privat', 'Arbeit'])
    await user.type(within(dialog).getByRole('textbox', { name: 'Titel' }), 'Umzug')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Ablage' }), 'Arbeit')
    await user.type(within(dialog).getByRole('textbox', { name: 'Notiz' }), 'Kartons')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    const group = await screen.findByRole('group', { name: 'Arbeit' })
    expect(within(group).getByText('Umzug')).toBeInTheDocument()
    expect(within(group).getByText('⚠ Nächsten Schritt festlegen')).toBeInTheDocument()
    expect(await listProjects()).toEqual([
      expect.objectContaining({ title: 'Umzug', categoryId: 'arbeit', notes: 'Kartons' }),
    ])
  })

  it('verlangt einen Titel', async () => {
    const user = userEvent.setup()
    await openProjectsTab(user)
    await user.click(await screen.findByRole('button', { name: 'Neues Projekt' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Speichern' })).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox', { name: 'Titel' }), '   ')
    expect(within(dialog).getByRole('button', { name: 'Speichern' })).toBeDisabled()
  })

  it('bearbeitet Titel, Ablage und Notiz in der Projektansicht', async () => {
    const user = userEvent.setup()
    await createProject({ title: 'Alt', categoryId: 'privat' })
    await openProjectsTab(user)
    await openProject(user, /Alt/)
    await user.click(await screen.findByRole('button', { name: 'Projekt bearbeiten' }))
    const dialog = await screen.findByRole('dialog', { name: 'Projekt bearbeiten' })
    const title = within(dialog).getByRole('textbox', { name: 'Titel' })
    await user.clear(title)
    await user.type(title, 'Neu')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Ablage' }), 'Arbeit')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByRole('heading', { name: 'Neu' })).toBeInTheDocument()
    expect(screen.getByText('Ablage: Arbeit')).toBeInTheDocument()
    expect(await listProjects()).toEqual([
      expect.objectContaining({ title: 'Neu', categoryId: 'arbeit' }),
    ])
  })

  it('löscht ein Projekt nur ohne Schritte, nach Bestätigung', async () => {
    const user = userEvent.setup()
    const withSteps = await createProject({ title: 'Mit Schritt', categoryId: 'privat' })
    await addProjectStep(withSteps.id, { title: 'Eins' })
    await createProject({ title: 'Leer', categoryId: 'privat' })
    await openProjectsTab(user)

    await openProject(user, /Mit Schritt/)
    await screen.findByRole('heading', { name: 'Mit Schritt' })
    expect(screen.queryByRole('button', { name: 'Projekt löschen' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Zurück zu den Aufgaben' }))

    await openProject(user, /Leer/)
    await user.click(await screen.findByRole('button', { name: 'Projekt löschen' }))
    expect(await listProjects()).toHaveLength(2)
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ja, löschen' }),
    )
    await waitFor(async () => expect(await listProjects()).toHaveLength(1))
    expect(await screen.findByRole('tab', { name: /Projekte \(1\)/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Leer/ })).not.toBeInTheDocument()
  })
})

describe('Projektansicht: Schritte', () => {
  it('fügt Schritte per Enter hinzu, ↑/↓ ändern die Reihenfolge, der nächste Schritt folgt', async () => {
    const user = userEvent.setup()
    await createProject({ title: 'Analysis', categoryId: 'privat' })
    render(<TasksPage />)
    await user.click(await screen.findByRole('tab', { name: /Projekte/ }))
    await openProject(user, /Analysis/)
    const field = await screen.findByRole('textbox', { name: 'Neuer Schritt' })
    await user.type(field, 'Blatt 1{Enter}')
    await user.type(field, 'Blatt 2{Enter}')
    await waitFor(() => expect(field).toHaveValue(''))
    const titles = () =>
      screen
        .getAllByRole('checkbox')
        .map((c) => (c.getAttribute('aria-label') ?? '').replace(/ erledigt$/, ''))
    await waitFor(() => expect(titles()).toEqual(['Blatt 1', 'Blatt 2']))
    // Erster ↑ und letzter ↓ sind ohne Wirkung.
    expect(screen.getAllByRole('button', { name: 'Nach oben' })[0]).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Nach unten' })[1]).toBeDisabled()

    await user.click(screen.getAllByRole('button', { name: 'Nach unten' })[0])
    await waitFor(() => expect(titles()).toEqual(['Blatt 2', 'Blatt 1']))

    await user.click(screen.getByRole('button', { name: 'Zurück zu den Aufgaben' }))
    expect(await screen.findByText('Nächster Schritt: Blatt 2')).toBeInTheDocument()
    expect(screen.getByText('0/2')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Aktuell' }))
    const next = await screen.findByRole('group', { name: 'Privat' })
    expect(within(next).getByRole('button', { name: 'Blatt 2' })).toBeInTheDocument()
    expect(within(next).queryByRole('button', { name: 'Blatt 1' })).not.toBeInTheDocument()
    expect(within(next).getByText('Projekt: Analysis')).toBeInTheDocument()
  })

  it('zeigt die Warnung ohne offenen Schritt in Reiter und Ansicht und legt über das Feld einen Schritt an', async () => {
    const user = userEvent.setup()
    const project = await createProject({ title: 'Leer', categoryId: 'privat' })
    const step = await addProjectStep(project.id, { title: 'Schon erledigt' })
    await completeItem(step.id)
    await openProjectsTab(user)
    expect(await screen.findByText('⚠ Nächsten Schritt festlegen')).toBeInTheDocument()
    await openProject(user, /Leer/)
    expect(await screen.findByRole('status')).toHaveTextContent('Nächsten Schritt festlegen')
    expect(screen.getByText('Erledigte Schritte (1)')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Neuer Schritt' }), 'Weiter{Enter}')
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(screen.getByRole('checkbox', { name: 'Weiter erledigt' })).toBeInTheDocument()
  })

  it('speichert die gewählte Dauer am neuen Schritt', async () => {
    const user = userEvent.setup()
    await createProject({ title: 'Plan', categoryId: 'privat' })
    await openProjectsTab(user)
    await openProject(user, /^Plan/)
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Dauer des neuen Schritts' }),
      '30',
    )
    await user.type(screen.getByRole('textbox', { name: 'Neuer Schritt' }), 'Kurz{Enter}')
    await waitFor(async () =>
      expect(await listItems()).toEqual([
        expect.objectContaining({ title: 'Kurz', durationMin: 30 }),
      ]),
    )
  })

  it('öffnet den Editor beim Antippen eines Schritts', async () => {
    const user = userEvent.setup()
    const project = await createProject({ title: 'Plan', categoryId: 'privat' })
    await addProjectStep(project.id, { title: 'Blatt' })
    await openProjectsTab(user)
    await openProject(user, /^Plan/)
    await user.click(await screen.findByRole('button', { name: 'Blatt' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})

describe('Projekt abschließen', () => {
  it('fragt nach, schließt ab und führt das Projekt unter Erledigt', async () => {
    const user = userEvent.setup()
    const project = await createProject({ title: 'Fertig', categoryId: 'privat' })
    await addProjectStep(project.id, { title: 'Offen' })
    await openProjectsTab(user)
    await openProject(user, /Fertig/)
    await user.click(await screen.findByRole('button', { name: 'Projekt abschließen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Projekt abschließen?' })
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
    expect((await listProjects())[0].status).toBe('aktiv')

    await user.click(screen.getByRole('button', { name: 'Projekt abschließen' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ja, abschließen' }),
    )
    await waitFor(async () => expect((await listProjects())[0].status).toBe('erledigt'))
    expect(await screen.findByRole('tab', { name: /Projekte \(0\)/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Fertig/ })).not.toBeInTheDocument()
    expect((await listItems())[0]).toEqual(
      expect.objectContaining({ status: 'erledigt', archivedWithProject: true }),
    )
  })
})
