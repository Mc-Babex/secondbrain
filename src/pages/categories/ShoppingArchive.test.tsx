import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetDb } from '../../data/localStore'
import { createItem, listItems } from '../../data/repository'
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

async function openCategory(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(await screen.findByRole('button', { name }))
  await screen.findByRole('button', { name: 'Zurück zu den Ablagen' })
}

async function shoppingId(): Promise<string> {
  const { getCategories } = await import('../../data/repository')
  return (await getCategories()).find((c) => c.kind === 'einkauf')?.id ?? ''
}

describe('Einkaufsliste', () => {
  it('fügt Artikel hinzu und meldet Dubletten (auch abgehakte, andere Schreibweise)', async () => {
    const user = userEvent.setup()
    render(<CategoriesPage />)
    await openCategory(user, /^Einkaufsliste/)
    expect(screen.getByText('Die Einkaufsliste ist leer.')).toBeInTheDocument()

    const input = screen.getByLabelText('Artikel hinzufügen')
    await user.type(input, 'Milch{Enter}')
    expect(await screen.findByRole('checkbox', { name: 'Milch' })).toBeInTheDocument()
    expect(input).toHaveValue('')

    await user.click(screen.getByRole('checkbox', { name: 'Milch' }))
    await user.type(input, 'milch')
    await user.click(screen.getByRole('button', { name: 'Hinzufügen' }))
    expect(await screen.findByRole('status')).toHaveTextContent('milch steht schon auf der Liste.')
    expect(input).toHaveValue('milch')
    expect(await listItems()).toHaveLength(1)
  })

  it('hakt ab: abgehakte stehen unten', async () => {
    const user = userEvent.setup()
    const categoryId = await shoppingId()
    await createItem({
      type: 'notiz',
      title: 'Brot',
      categoryId,
      checked: false,
      createdAt: '2026-10-01T10:00:00+02:00',
    })
    await createItem({
      type: 'notiz',
      title: 'Eier',
      categoryId,
      checked: false,
      createdAt: '2026-10-01T11:00:00+02:00',
    })
    render(<CategoriesPage />)
    await openCategory(user, /^Einkaufsliste/)
    await user.click(await screen.findByRole('checkbox', { name: 'Brot' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Brot' })).toBeChecked())
    const titles = screen.getAllByRole('checkbox').map((c) => c.closest('label')?.textContent)
    expect(titles).toEqual(['Eier', 'Brot'])
    const stored = (await listItems()).find((i) => i.title === 'Brot')
    expect(stored?.checked).toBe(true)
  })

  it('entfernt genau die abgehakten nach Bestätigung, Abbrechen nichts', async () => {
    const user = userEvent.setup()
    const categoryId = await shoppingId()
    await createItem({ type: 'notiz', title: 'Brot', categoryId, checked: true })
    await createItem({ type: 'notiz', title: 'Käse', categoryId, checked: true })
    await createItem({ type: 'notiz', title: 'Eier', categoryId, checked: false })
    render(<CategoriesPage />)
    await openCategory(user, /^Einkaufsliste/)
    await user.click(await screen.findByRole('button', { name: 'Ausgewählte eingekauft (2)' }))

    let dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('2 Artikel von der Liste entfernen?')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))
    expect(await listItems()).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: 'Ausgewählte eingekauft (2)' }))
    dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Entfernen' }))
    await waitFor(async () => expect(await listItems()).toHaveLength(1))
    expect((await listItems())[0].title).toBe('Eier')
    expect(screen.queryByRole('button', { name: /Ausgewählte eingekauft/ })).not.toBeInTheDocument()
  })

  it('zeigt den Knopf nur bei abgehakten Artikeln', async () => {
    const user = userEvent.setup()
    await createItem({
      type: 'notiz',
      title: 'Eier',
      categoryId: await shoppingId(),
      checked: false,
    })
    render(<CategoriesPage />)
    await openCategory(user, /^Einkaufsliste/)
    expect(await screen.findByRole('checkbox', { name: 'Eier' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ausgewählte eingekauft/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eier bearbeiten' })).toBeInTheDocument()
  })

  it('benennt um, bietet aber kein Löschen an', async () => {
    const user = userEvent.setup()
    render(<CategoriesPage />)
    await openCategory(user, /^Einkaufsliste/)
    expect(screen.queryByRole('button', { name: 'Löschen' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Umbenennen' }))
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Laden')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByRole('heading', { name: 'Laden' })).toBeInTheDocument()
  })
})

describe('Erledigt', () => {
  it('zeigt neueste zuerst mit Datum und Ursprungs-Ablage', async () => {
    const user = userEvent.setup()
    await createItem({
      type: 'aufgabe',
      title: 'Älter',
      categoryId: 'erledigt',
      status: 'erledigt',
      originalCategoryId: 'arbeit',
      completedAt: '2026-10-15T09:30:00+02:00',
    })
    await createItem({
      type: 'aufgabe',
      title: 'Neuer',
      categoryId: 'erledigt',
      status: 'erledigt',
      originalCategoryId: 'privat',
      completedAt: '2026-10-16T14:00:00+02:00',
    })
    render(<CategoriesPage />)
    await openCategory(user, /^Erledigt/)
    const rows = await screen.findAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Neuer')
    expect(rows[0]).toHaveTextContent('Privat')
    expect(rows[0]).toHaveTextContent('erledigt am Fr 16.10., 14:00')
    expect(rows[1]).toHaveTextContent('Älter')
    expect(rows[1]).toHaveTextContent('Arbeit')
  })

  it('zeigt den leeren Zustand', async () => {
    const user = userEvent.setup()
    render(<CategoriesPage />)
    await openCategory(user, /^Erledigt/)
    expect(await screen.findByText('Noch nichts erledigt.')).toBeInTheDocument()
  })

  it('stellt wieder her: zurück in die Ursprungs-Ablage, offen, aus der Liste weg', async () => {
    const user = userEvent.setup()
    await createItem({
      type: 'aufgabe',
      title: 'Bericht',
      categoryId: 'erledigt',
      status: 'erledigt',
      originalCategoryId: 'arbeit',
      completedAt: '2026-10-16T14:00:00+02:00',
    })
    render(<CategoriesPage />)
    await openCategory(user, /^Erledigt/)
    await user.click(await screen.findByRole('button', { name: 'Wiederherstellen' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Zurück in Arbeit')
    expect(screen.queryByText('Bericht')).not.toBeInTheDocument()
    const item = (await listItems()).find((i) => i.title === 'Bericht')
    expect(item?.categoryId).toBe('arbeit')
    expect(item?.status).toBe('offen')
  })

  it('sucht in Titel und Notizen', async () => {
    const user = userEvent.setup()
    await createItem({
      type: 'aufgabe',
      title: 'Steuer',
      categoryId: 'erledigt',
      status: 'erledigt',
      originalCategoryId: 'privat',
      completedAt: '2026-10-16T14:00:00+02:00',
    })
    await createItem({
      type: 'aufgabe',
      title: 'Bericht',
      categoryId: 'erledigt',
      status: 'erledigt',
      originalCategoryId: 'arbeit',
      completedAt: '2026-10-15T14:00:00+02:00',
    })
    render(<CategoriesPage />)
    await openCategory(user, /^Erledigt/)
    await user.type(await screen.findByRole('searchbox', { name: 'In Erledigt suchen' }), 'steu')
    expect(screen.getByText('Steuer')).toBeInTheDocument()
    expect(screen.queryByText('Bericht')).not.toBeInTheDocument()
  })
})
