import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetDb } from '../../data/localStore'
import { addProjectStep, completeItem, createProject } from '../../data/repository'
import { CategoriesPage } from './CategoriesPage'

beforeEach(async () => {
  // Ohne Animation öffnet sich die Ablage sofort.
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('reduce'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  await resetDb(true)
})
afterAll(() => resetDb(true))

async function openPrivat(user: ReturnType<typeof userEvent.setup>) {
  render(<CategoriesPage />)
  await user.click(await screen.findByRole('button', { name: /^Privat, / }))
}

describe('Projektansicht auf Seite 4', () => {
  it('öffnet sich aus der Ablage und führt mit dem Pfeil zurück in die Ablage', async () => {
    const user = userEvent.setup()
    const project = await createProject({ title: 'Analysis', categoryId: 'privat' })
    await addProjectStep(project.id, { title: 'Blatt 1' })
    await openPrivat(user)
    await user.click(await screen.findByRole('button', { name: /^Analysis/ }))
    expect(await screen.findByRole('heading', { name: 'Analysis' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Blatt 1 erledigt' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Zurück zu Privat' }))
    expect(await screen.findByRole('heading', { name: 'Privat' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'In Privat suchen' })).toBeInTheDocument()
  })

  it('zeigt die Warnung ohne offenen Schritt in Ablage und Ansicht', async () => {
    const user = userEvent.setup()
    const project = await createProject({ title: 'Leer', categoryId: 'privat' })
    const step = await addProjectStep(project.id, { title: 'Erledigt' })
    await completeItem(step.id)
    await openPrivat(user)
    const card = await screen.findByRole('button', { name: /^Leer/ })
    expect(within(card).getByText('⚠ Nächsten Schritt festlegen')).toBeInTheDocument()
    await user.click(card)
    expect(await screen.findByRole('status')).toHaveTextContent('Nächsten Schritt festlegen')
  })

  it('zeigt nach dem Abschließen des Projekts die Ablage ohne das Projekt', async () => {
    const user = userEvent.setup()
    await createProject({ title: 'Kurz', categoryId: 'privat' })
    await openPrivat(user)
    await user.click(await screen.findByRole('button', { name: /^Kurz/ }))
    await user.click(await screen.findByRole('button', { name: 'Projekt abschließen' }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ja, abschließen' }),
    )
    expect(await screen.findByRole('searchbox', { name: 'In Privat suchen' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Kurz/ })).not.toBeInTheDocument()
  })
})
