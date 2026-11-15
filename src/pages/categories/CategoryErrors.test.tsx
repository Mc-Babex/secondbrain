import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetDb } from '../../data/localStore'
import * as repository from '../../data/repository'
import type { Category } from '../../data/types'
import { CategoryFormDialog } from './CategoryFormDialog'
import { DeleteCategoryDialog } from './DeleteCategoryDialog'
import { CategoriesPage } from './CategoriesPage'
import { userMessage } from './userMessage'

vi.mock('../../data/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/repository')>()
  return {
    ...actual,
    createCategory: vi.fn(actual.createCategory),
    deleteCategory: vi.fn(actual.deleteCategory),
  }
})

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

const GENERIC = 'Das hat nicht geklappt. Bitte versuche es erneut.'

describe('userMessage', () => {
  it('reicht bekannte Meldungen durch', () => {
    expect(userMessage(new Error('Eine Ablage mit diesem Namen gibt es schon.'))).toBe(
      'Eine Ablage mit diesem Namen gibt es schon.',
    )
  })

  it('ersetzt technische und unbekannte Fehler', () => {
    expect(userMessage(new Error('categories.json ist ungültig'))).toBe(GENERIC)
    expect(userMessage('boom')).toBe(GENERIC)
  })
})

describe('Fehlertexte in den Ablagen-Dialogen', () => {
  it('Neue Ablage fokussiert das Namensfeld', () => {
    render(<CategoryFormDialog onClose={() => undefined} />)
    expect(screen.getByLabelText('Name')).toHaveFocus()
  })

  it('Anlegen zeigt bei technischem Fehler den allgemeinen Text', async () => {
    const user = userEvent.setup()
    vi.mocked(repository.createCategory).mockRejectedValueOnce(
      new Error('categories.json ist ungültig'),
    )
    render(<CategoryFormDialog onClose={() => undefined} />)
    await user.type(screen.getByLabelText('Name'), 'Garten')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC)
  })

  it('Löschen zeigt bei technischem Fehler den allgemeinen Text', async () => {
    const user = userEvent.setup()
    vi.mocked(repository.deleteCategory).mockRejectedValueOnce(
      new Error('categories.json ist ungültig'),
    )
    const categories = await repository.getCategories()
    const arbeit = categories.find((c) => c.id === 'arbeit') as Category
    render(
      <DeleteCategoryDialog
        category={arbeit}
        categories={categories}
        onClose={() => undefined}
        onDeleted={() => undefined}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Löschen und verschieben' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC)
  })

  it('Löschen ohne andere normale Ablage: Hinweis, Knopf gesperrt', async () => {
    const user = userEvent.setup()
    for (const c of await repository.getCategories()) {
      if (c.kind === 'normal' && c.id !== 'privat') await repository.deleteCategory(c.id, 'privat')
    }
    render(<CategoriesPage />)
    await user.click(await screen.findByRole('button', { name: /^Privat/ }))
    await user.click(await screen.findByRole('button', { name: 'Löschen' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/keine andere normale Ablage/)).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Zielablage')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Löschen und verschieben' })).toBeDisabled()
  })
})
