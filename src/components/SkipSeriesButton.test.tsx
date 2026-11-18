import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { defaultCategories } from '../data/defaults'
import { resetDb } from '../data/localStore'
import {
  addSeries,
  completeItem,
  createItem,
  createProject,
  deleteSeries,
  listItems,
  listProjects,
  skipSeriesInstance,
} from '../data/repository'
import { createDueSeriesInstances } from '../data/seriesInstances'
import { validSeries } from '../data/types'
import { ItemEditor } from './ItemEditor'
import { ProjectView } from '../pages/tasks/projects/ProjectView'

vi.mock('../google/auth', () => ({
  wasConnected: vi.fn().mockReturnValue(false),
  loadGoogleScript: vi.fn().mockResolvedValue({}),
}))

const { categories } = defaultCategories()

const FIELDS = {
  titlePattern: 'Übungsblatt {Nr}',
  every: 1,
  weekday: 1,
  startDate: '2026-11-02',
  endDate: null,
  count: null,
  dueWeekday: 5,
  durationMin: null,
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-09T10:00:00+01:00') })
  await resetDb(true)
})
afterEach(() => {
  vi.useRealTimers()
})
afterAll(() => resetDb(true))

async function createSeriesItems(every = 1) {
  const project = await createProject({ title: 'Analysis 1', categoryId: 'privat' })
  const series = await addSeries(project.id, { ...FIELDS, every })
  await createDueSeriesInstances()
  return { project, series, items: await listItems() }
}

describe('Knopf „Fällt aus“ im ItemEditor', () => {
  it('erscheint bei offenen Serien-Instanzen und meldet die neue Fälligkeit', async () => {
    const user = userEvent.setup()
    const { items } = await createSeriesItems()
    const second = items[1]
    render(<ItemEditor item={second} categories={categories} onClose={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Fällt aus – 1 Woche später' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Fällig jetzt Fr 20.11. – folgende Blätter eine Woche später',
    )
    expect((await listItems())[1].dueDate).toBe('2026-11-20')
  })

  it('heißt bei every 2 „2 Wochen später“ und meldet zwei Wochen', async () => {
    const user = userEvent.setup()
    const { items } = await createSeriesItems(2)
    render(<ItemEditor item={items[0]} categories={categories} onClose={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Fällt aus – 2 Wochen später' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Fällig jetzt Fr 20.11. – folgende Blätter zwei Wochen später',
    )
  })

  it('fehlt, wenn die Serie gelöscht wurde', async () => {
    const { project, series, items } = await createSeriesItems()
    await deleteSeries(project.id, series.id)
    render(<ItemEditor item={items[0]} categories={categories} onClose={vi.fn()} />)
    await screen.findByRole('dialog')
    expect(screen.queryByRole('button', { name: /Fällt aus/ })).not.toBeInTheDocument()
  })

  it('fehlt bei normalen Aufgaben und erledigten Instanzen', async () => {
    const plain = await createItem({ type: 'aufgabe', title: 'Normal', categoryId: 'privat' })
    const { rerender } = render(
      <ItemEditor item={plain} categories={categories} onClose={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: /Fällt aus/ })).not.toBeInTheDocument()

    const { items } = await createSeriesItems()
    const done = await completeItem(items[0].id)
    rerender(<ItemEditor item={done} categories={categories} onClose={vi.fn()} />)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Fällt aus/ })).not.toBeInTheDocument(),
    )
  })
})

describe('Fällt aus, Rückgängig und Ausfall zurücknehmen im ItemEditor', () => {
  const dueField = (): HTMLElement => screen.getByLabelText('Fällig bis')

  it('Fällt aus, dann Speichern: dueDate bleibt verschoben, Feld zeigt das neue Datum', async () => {
    const user = userEvent.setup()
    const { items } = await createSeriesItems()
    render(<ItemEditor item={items[1]} categories={categories} onClose={vi.fn()} />)
    expect(dueField()).toHaveValue('2026-11-13')
    await user.click(await screen.findByRole('button', { name: 'Fällt aus – 1 Woche später' }))
    await screen.findByRole('status')
    expect(dueField()).toHaveValue('2026-11-20')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(async () => expect((await listItems())[1].dueDate).toBe('2026-11-20'))
  })

  it('Rückgängig nimmt genau diesen Ausfall zurück', async () => {
    const user = userEvent.setup()
    const { items } = await createSeriesItems()
    render(<ItemEditor item={items[1]} categories={categories} onClose={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Fällt aus – 1 Woche später' }))
    await user.click(await screen.findByRole('button', { name: 'Rückgängig' }))
    await waitFor(() => expect(dueField()).toHaveValue('2026-11-13'))
    expect(validSeries((await listProjects())[0])[0].skippedDates).toEqual([])
    expect((await listItems())[1].dueDate).toBe('2026-11-13')
    expect(screen.getByRole('status')).toHaveTextContent(
      'Ausfall zurückgenommen – folgende Blätter wieder eine Woche früher',
    )
  })

  it('Blatt mit Ausfall: Knopf mit Tag, Klick wirkt wie Rückgängig', async () => {
    const user = userEvent.setup()
    const { items } = await createSeriesItems()
    await skipSeriesInstance(items[1].id)
    render(<ItemEditor item={(await listItems())[1]} categories={categories} onClose={vi.fn()} />)
    await user.click(
      await screen.findByRole('button', { name: 'Ausfall zurücknehmen – fällig wieder Fr 13.11.' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Ausfall zurückgenommen – folgende Blätter wieder eine Woche früher',
    )
    expect(dueField()).toHaveValue('2026-11-13')
    expect(validSeries((await listProjects())[0])[0].skippedDates).toEqual([])
    expect(screen.queryByRole('button', { name: /Ausfall zurücknehmen/ })).not.toBeInTheDocument()
  })

  it('bei every 2 meldet die Rücknahme zwei Wochen früher', async () => {
    const user = userEvent.setup()
    const { items } = await createSeriesItems(2)
    await skipSeriesInstance(items[0].id)
    render(<ItemEditor item={(await listItems())[0]} categories={categories} onClose={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: /Ausfall zurücknehmen/ }))
    expect(await screen.findByRole('status')).toHaveTextContent('zwei Wochen früher')
  })

  it('ohne Ausfall kein Knopf „Ausfall zurücknehmen“', async () => {
    const { items } = await createSeriesItems()
    render(<ItemEditor item={items[1]} categories={categories} onClose={vi.fn()} />)
    await screen.findByRole('button', { name: 'Fällt aus – 1 Woche später' })
    expect(screen.queryByRole('button', { name: /Ausfall zurücknehmen/ })).not.toBeInTheDocument()
  })

  it('Serie ohne dueWeekday: Knopftext ohne Datum', async () => {
    const user = userEvent.setup()
    const project = await createProject({ title: 'Analysis 1', categoryId: 'privat' })
    await addSeries(project.id, { ...FIELDS, dueWeekday: null as never })
    await createDueSeriesInstances()
    await skipSeriesInstance((await listItems())[1].id)
    render(<ItemEditor item={(await listItems())[1]} categories={categories} onClose={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Ausfall zurücknehmen' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Ausfall zurückgenommen')
  })
})

describe('Serien in der Projektansicht', () => {
  it('Ausfall eintragen und Entfernen', async () => {
    const user = userEvent.setup()
    const { project } = await createSeriesItems()
    render(<ProjectView projectId={project.id} backLabel="Zurück" onBack={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: /Ausfall für .* eintragen/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Ausfall eintragen' })
    expect(within(dialog).getAllByRole('option')).toHaveLength(8)
    await user.click(within(dialog).getByRole('button', { name: 'Eintragen' }))
    const list = await screen.findByRole('list', { name: /Ausfälle von/ })
    expect(list).toHaveTextContent('Fällt aus: Mo 16.11.')
    expect(validSeries((await listProjects())[0])[0].skippedDates).toEqual(['2026-11-16'])
    await user.click(within(list).getByRole('button', { name: /entfernen/ }))
    await waitFor(async () =>
      expect(validSeries((await listProjects())[0])[0].skippedDates).toEqual([]),
    )
  })

  it('Dialog weist auf die Neuberechnung offener Blätter hin, wenn der Rhythmus geändert wird', async () => {
    const user = userEvent.setup()
    const { project } = await createSeriesItems()
    render(<ProjectView projectId={project.id} backLabel="Zurück" onBack={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: /Serie .* bearbeiten/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Serie bearbeiten' })
    expect(within(dialog).queryByRole('note')).not.toBeInTheDocument()
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Rhythmus' }), '2')
    expect(await within(dialog).findByRole('note')).toHaveTextContent(
      'Offene Blätter werden neu berechnet',
    )
  })
})
