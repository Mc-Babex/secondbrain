import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetDb } from '../../../data/localStore'
import { createProject, listProjects } from '../../../data/repository'
import type { StepSeries } from '../../../data/types'
import { validSeries } from '../../../data/types'
import { ProjectView } from './ProjectView'

const NOW = new Date('2026-11-16T10:00:00+01:00')

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  await resetDb(true)
})
afterEach(() => {
  vi.useRealTimers()
})
afterAll(() => resetDb(true))

async function openView() {
  const project = await createProject({ title: 'Analysis 1', categoryId: 'privat' })
  render(<ProjectView projectId={project.id} backLabel="Zurück" onBack={vi.fn()} />)
  await screen.findByRole('heading', { name: 'Analysis 1' })
  return project
}

const savedSeries = async (): Promise<StepSeries[]> => validSeries((await listProjects())[0])

async function fillSeries(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Serie hinzufügen' }))
  const dialog = await screen.findByRole('dialog', { name: 'Neue Serie' })
  const pattern = within(dialog).getByRole('textbox', { name: /Titelmuster/ })
  expect(pattern).toHaveFocus()
  await user.type(pattern, 'Übungsblatt {{Nr}')
  fireEvent.change(within(dialog).getByLabelText('Startdatum'), { target: { value: '2026-10-19' } })
  await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Neuer Schritt am' }), '1')
  await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Fällig am' }), '5')
  await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Ende' }), 'date')
  fireEvent.change(within(dialog).getByLabelText('Enddatum'), { target: { value: '2027-02-12' } })
  return dialog
}

describe('Serien-Dialog', () => {
  it('legt „Übungsblatt {Nr}“ wöchentlich Mo, fällig Fr, Ende 12.02.2027 an und zeigt die Vorschau', async () => {
    const user = userEvent.setup()
    await openView()
    const dialog = await fillSeries(user)
    expect(
      within(dialog).getByText('{Nr} wird durch die laufende Nummer ersetzt', { exact: false }),
    ).toBeInTheDocument()
    const preview = within(within(dialog).getByRole('region', { name: 'Vorschau' }))
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(preview).toEqual([
      'Übungsblatt 1 · ab Mo 19.10., fällig Fr 23.10.',
      'Übungsblatt 2 · ab Mo 26.10., fällig Fr 30.10.',
      'Übungsblatt 3 · ab Mo 02.11., fällig Fr 06.11.',
    ])
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    await waitFor(async () => expect(await savedSeries()).toHaveLength(1))
    expect((await savedSeries())[0]).toEqual(
      expect.objectContaining({
        titlePattern: 'Übungsblatt {Nr}',
        every: 1,
        weekday: 1,
        startDate: '2026-10-19',
        endDate: '2027-02-12',
        count: null,
        dueWeekday: 5,
        durationMin: null,
        state: 'aktiv',
        lastNumber: 0,
        lastDate: null,
      }),
    )
    const list = await screen.findByRole('region', { name: 'Serien' })
    expect(within(list).getByText('Übungsblatt {Nr}')).toBeInTheDocument()
    expect(
      within(list).getByText(/jede Woche Mo · fällig Fr · bis 12\.02\.2027/),
    ).toBeInTheDocument()
    expect(within(list).getByText('Aktiv')).toBeInTheDocument()
  })

  it('zeigt bei leerem Titelmuster einen Hinweis statt „Keine weiteren Termine“', async () => {
    const user = userEvent.setup()
    await openView()
    await user.click(await screen.findByRole('button', { name: 'Serie hinzufügen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Neue Serie' })
    const preview = within(dialog).getByRole('region', { name: 'Vorschau' })
    expect(preview).toHaveTextContent('Titelmuster eingeben, um die Vorschau zu sehen.')
    expect(preview).not.toHaveTextContent('Keine weiteren Termine')
  })

  it('meldet Fehler auf Deutsch: Titel leer, Enddatum vor Start, Anzahl unter 1', async () => {
    const user = userEvent.setup()
    await openView()
    await user.click(await screen.findByRole('button', { name: 'Serie hinzufügen' }))
    const dialog = await screen.findByRole('dialog')
    const save = within(dialog).getByRole('button', { name: 'Speichern' })
    await user.click(save)
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Bitte ein Titelmuster eingeben.',
    )

    await user.type(within(dialog).getByRole('textbox', { name: /Titelmuster/ }), 'Blatt')
    fireEvent.change(within(dialog).getByLabelText('Startdatum'), {
      target: { value: '2026-10-19' },
    })
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Ende' }), 'date')
    fireEvent.change(within(dialog).getByLabelText('Enddatum'), { target: { value: '2026-10-01' } })
    await user.click(save)
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Das Enddatum liegt vor dem Startdatum.',
    )

    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Ende' }), 'count')
    await user.type(within(dialog).getByLabelText('Anzahl'), '0')
    await user.click(save)
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Die Anzahl muss mindestens 1 sein.',
    )
    expect(await savedSeries()).toHaveLength(0)
  })

  it('speichert Ende per Anzahl und Dauer', async () => {
    const user = userEvent.setup()
    await openView()
    await user.click(await screen.findByRole('button', { name: 'Serie hinzufügen' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByRole('textbox', { name: /Titelmuster/ }), 'Aufgabe')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Rhythmus' }), '2')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Ende' }), 'count')
    await user.type(within(dialog).getByLabelText('Anzahl'), '4')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Dauer' }), '60')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    await waitFor(async () => expect(await savedSeries()).toHaveLength(1))
    expect((await savedSeries())[0]).toEqual(
      expect.objectContaining({
        every: 2,
        count: 4,
        endDate: null,
        durationMin: 60,
        dueWeekday: null,
      }),
    )
  })

  it('Pausieren, Fortsetzen und Beenden (mit Bestätigung) ändern den Zustand', async () => {
    const user = userEvent.setup()
    await openView()
    const dialog = await fillSeries(user)
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    await waitFor(async () => expect(await savedSeries()).toHaveLength(1))

    await user.click(await screen.findByRole('button', { name: /pausieren$/ }))
    await waitFor(async () => expect((await savedSeries())[0].state).toBe('pausiert'))
    expect(await screen.findByText('Pausiert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /fortsetzen$/ }))
    await waitFor(async () => expect((await savedSeries())[0].state).toBe('aktiv'))

    await user.click(await screen.findByRole('button', { name: /beenden$/ }))
    const confirm = await screen.findByRole('dialog', { name: 'Serie beenden?' })
    await user.click(within(confirm).getByRole('button', { name: 'Abbrechen' }))
    expect((await savedSeries())[0].state).toBe('aktiv')
    await user.click(screen.getByRole('button', { name: /beenden$/ }))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ja, beenden' }),
    )
    await waitFor(async () => expect((await savedSeries())[0].state).toBe('beendet'))
    expect(await screen.findByText('Beendet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pausieren$/ })).not.toBeInTheDocument()
  })

  it('bearbeitet eine Serie; Nummerierung und Instanzen bleiben', async () => {
    const user = userEvent.setup()
    await openView()
    const dialog = await fillSeries(user)
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    await waitFor(async () => expect(await savedSeries()).toHaveLength(1))
    await user.click(await screen.findByRole('button', { name: /^Serie .* bearbeiten$/ }))
    const edit = await screen.findByRole('dialog', { name: 'Serie bearbeiten' })
    const pattern = within(edit).getByRole('textbox', { name: /Titelmuster/ })
    expect(pattern).toHaveValue('Übungsblatt {Nr}')
    await user.clear(pattern)
    await user.type(pattern, 'Blatt {{Nr}')
    await user.click(within(edit).getByRole('button', { name: 'Speichern' }))
    await waitFor(async () => expect((await savedSeries())[0].titlePattern).toBe('Blatt {Nr}'))
    expect((await savedSeries())[0]).toEqual(
      expect.objectContaining({ endDate: '2027-02-12', dueWeekday: 5, lastNumber: 0 }),
    )
  })
})
