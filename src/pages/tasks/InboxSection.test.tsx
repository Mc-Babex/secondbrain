import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { defaultCategories } from '../../data/defaults'
import { resetDb } from '../../data/localStore'
import { addInboxEntry, createProject, listInbox, listItems } from '../../data/repository'
import { InboxSection } from './InboxSection'

beforeEach(() => resetDb(true))
afterAll(() => resetDb(true))

const { categories } = defaultCategories()

describe('InboxSection – „In Ablage…“ mit GTD-Feldern', () => {
  it('legt eine Aufgabe mit gewähltem Status, Projekt und Feldern an', async () => {
    const user = userEvent.setup()
    const project = await createProject({ title: 'Umzug', categoryId: 'privat' })
    const entry = await addInboxEntry('Kartons besorgen', 'text')
    render(<InboxSection entries={[entry]} categories={categories} run={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'In Ablage…' }))
    expect(screen.getByRole('radio', { name: 'Nächster Schritt' })).toBeChecked()
    expect(screen.getByRole('button', { name: /Fokus/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('Dauer')).toHaveValue('')

    await user.click(screen.getByRole('radio', { name: 'Warte auf' }))
    await user.type(screen.getByLabelText('Person / Was'), 'Nachbar')
    await user.click(screen.getByRole('button', { name: /Fokus/ }))
    fireEvent.change(screen.getByLabelText('Fällig bis'), { target: { value: '2026-12-24' } })
    await user.selectOptions(screen.getByLabelText('Dauer'), '10')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Umzug' })).toBeInTheDocument())
    await user.selectOptions(screen.getByLabelText('Projekt'), project.id)
    await user.click(screen.getByRole('button', { name: 'Ablegen' }))

    await waitFor(async () => expect(await listItems()).toHaveLength(1))
    await waitFor(async () => expect((await listItems())[0].gtd).toBe('warten'))
    const [item] = await listItems()
    expect(item).toMatchObject({
      type: 'aufgabe',
      title: 'Kartons besorgen',
      gtd: 'warten',
      important: true,
      dueDate: '2026-12-24',
      durationMin: 10,
      projectId: project.id,
      projectOrder: 1,
      waiting: { person: 'Nachbar', followUpOn: null },
    })
    expect(await listInbox()).toHaveLength(0)
  })

  it('zeigt bei Notiz keine GTD-Felder', async () => {
    const user = userEvent.setup()
    const entry = await addInboxEntry('Idee', 'text')
    render(<InboxSection entries={[entry]} categories={categories} run={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'In Ablage…' }))
    expect(screen.getByRole('radiogroup')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Art'), 'notiz')
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })
})
