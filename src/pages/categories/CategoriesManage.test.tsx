import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetDb } from '../../data/localStore'
import { createItem, getCategories, listItems } from '../../data/repository'
import { CategoriesPage } from './CategoriesPage'

beforeEach(async () => {
  await resetDb(true)
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('reduce'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})
afterAll(() => resetDb(true))

async function openCategory(user: ReturnType<typeof userEvent.setup>, name: RegExp | string) {
  await user.click(await screen.findByRole('button', { name }))
  return screen.findByRole('button', { name: 'Zurück zu den Ablagen' })
}

describe('Ablagen anzeigen und verwalten', () => {
  it('zeigt die Anzahl auf den Kacheln', async () => {
    await createItem({ type: 'aufgabe', title: 'A', categoryId: 'privat' })
    await createItem({ type: 'notiz', title: 'B', categoryId: 'privat' })
    render(<CategoriesPage />)
    expect(await screen.findByRole('button', { name: 'Privat, 2 Einträge' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Arbeit, 0 Einträge' })).toBeInTheDocument()
  })

  it('legt eine Ablage an und meldet Dubletten im Dialog', async () => {
    const user = userEvent.setup()
    render(<CategoriesPage />)
    await user.click(await screen.findByRole('button', { name: 'Neue Ablage' }))
    expect(screen.getByText('Hilft beim automatischen Einsortieren')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Name'), 'Garten')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByRole('button', { name: 'Garten, 0 Einträge' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Neue Ablage' }))
    await user.type(screen.getByLabelText('Name'), 'garten')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('gibt es schon')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('listet nur offene Einträge der Ablage und sucht in Titel und Notizen', async () => {
    const user = userEvent.setup()
    await createItem({ type: 'aufgabe', title: 'Steuer machen', categoryId: 'privat' })
    await createItem({ type: 'notiz', title: 'Idee', categoryId: 'privat', notes: 'Steuertipp' })
    await createItem({ type: 'aufgabe', title: 'Bericht', categoryId: 'arbeit' })
    render(<CategoriesPage />)
    await openCategory(user, /^Privat/)
    expect(await screen.findByText('Steuer machen')).toBeInTheDocument()
    expect(screen.getByText('Idee')).toBeInTheDocument()
    expect(screen.queryByText('Bericht')).not.toBeInTheDocument()

    const search = screen.getByRole('searchbox', { name: 'In Privat suchen' })
    await user.type(search, 'tipp')
    expect(screen.queryByText('Steuer machen')).not.toBeInTheDocument()
    expect(screen.getByText('Idee')).toBeInTheDocument()

    await user.clear(search)
    await user.type(search, 'xyz')
    expect(screen.getByText('Nichts gefunden für „xyz“.')).toBeInTheDocument()
  })

  it('zeigt den leeren Zustand', async () => {
    const user = userEvent.setup()
    render(<CategoriesPage />)
    await openCategory(user, /^Arbeit/)
    expect(await screen.findByText('Noch nichts in Arbeit.')).toBeInTheDocument()
  })

  it('verschiebt einen Eintrag über den Editor; er verschwindet aus der Liste', async () => {
    const user = userEvent.setup()
    await createItem({ type: 'aufgabe', title: 'Umziehen', categoryId: 'privat' })
    render(<CategoriesPage />)
    await openCategory(user, /^Privat/)
    await user.click(await screen.findByRole('button', { name: 'Umziehen' }))
    await user.selectOptions(screen.getByLabelText('Ablage'), 'arbeit')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(screen.queryByText('Umziehen')).not.toBeInTheDocument())
    expect((await listItems())[0].categoryId).toBe('arbeit')
  })

  it('erledigt eine Aufgabe per Checkbox', async () => {
    const user = userEvent.setup()
    await createItem({ type: 'aufgabe', title: 'Fertig machen', categoryId: 'privat' })
    render(<CategoriesPage />)
    await openCategory(user, /^Privat/)
    await user.click(await screen.findByRole('checkbox', { name: 'Fertig machen erledigen' }))
    await waitFor(() => expect(screen.queryByText('Fertig machen')).not.toBeInTheDocument())
    expect((await listItems())[0].status).toBe('erledigt')
  })

  it('benennt um: Kopfzeile und Ring zeigen den neuen Namen, die ID bleibt', async () => {
    const user = userEvent.setup()
    render(<CategoriesPage />)
    await openCategory(user, /^Arbeit/)
    await user.click(screen.getByRole('button', { name: 'Umbenennen' }))
    const name = screen.getByLabelText('Name')
    expect(name).toHaveValue('Arbeit')
    await user.clear(name)
    await user.type(name, 'Beruf')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByRole('heading', { name: 'Beruf' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Zurück zu den Ablagen' }))
    expect(await screen.findByRole('button', { name: 'Beruf, 0 Einträge' })).toBeInTheDocument()
    expect((await getCategories()).find((c) => c.name === 'Beruf')?.id).toBe('arbeit')
  })

  it('löscht eine Ablage und verschiebt die Einträge (Standard Privat)', async () => {
    const user = userEvent.setup()
    await createItem({ type: 'aufgabe', title: 'Bericht', categoryId: 'arbeit' })
    render(<CategoriesPage />)
    await openCategory(user, /^Arbeit/)
    await user.click(screen.getByRole('button', { name: 'Löschen' }))
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByText('1 Eintrag wird verschoben nach:')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Zielablage')).toHaveValue('privat')
    await user.click(within(dialog).getByRole('button', { name: 'Löschen und verschieben' }))
    expect(await screen.findByRole('button', { name: 'Privat, 1 Eintrag' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Arbeit/ })).not.toBeInTheDocument()
    expect((await listItems())[0].categoryId).toBe('privat')
  })

  it('wählt beim Löschen von Privat die erste andere normale Ablage', async () => {
    const user = userEvent.setup()
    render(<CategoriesPage />)
    await openCategory(user, /^Privat/)
    await user.click(screen.getByRole('button', { name: 'Löschen' }))
    const target = within(screen.getByRole('dialog')).getByLabelText('Zielablage')
    const first = (await getCategories()).find((c) => c.kind === 'normal' && c.id !== 'privat')
    expect(target).toHaveValue(first?.id)
  })

  it('bietet bei Einkaufsliste und Erledigt kein Löschen an', async () => {
    const user = userEvent.setup()
    render(<CategoriesPage />)
    await openCategory(user, /^Einkaufsliste/)
    expect(screen.getByRole('button', { name: 'Umbenennen' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Zurück zu den Ablagen' }))
    await openCategory(user, /^Erledigt/)
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument()
  })
})
