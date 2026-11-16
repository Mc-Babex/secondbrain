import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { resetDb } from '../../data/localStore'
import {
  addInboxEntry,
  createItem,
  listInbox,
  listItems,
  listSuggestions,
} from '../../data/repository'
import { putFileLocal } from '../../data/localStore'
import { TasksPage } from './TasksPage'

beforeEach(() => resetDb(true))
afterAll(() => resetDb(true))

async function addSuggestion(): Promise<void> {
  await putFileLocal('suggestions/s1.json', {
    id: 's1',
    kind: 'neue-aufgabe',
    text: 'Zahnarzt anrufen',
    reason: 'Kam in der Notiz vor',
    createdAt: '2026-10-01T10:00:00+02:00',
    proposedItem: { type: 'aufgabe', title: 'Zahnarzt anrufen', categoryId: 'privat' },
  })
}

describe('TasksPage', () => {
  it('zeigt leeren Zustand und keine optionalen Bereiche', async () => {
    render(<TasksPage />)
    expect(await screen.findByText(/Keine nächsten Schritte/)).toBeInTheDocument()
    expect(screen.queryByText('Vorschläge von Claude')).not.toBeInTheDocument()
    expect(screen.queryByText('Überfällig')).not.toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('zeigt Vorschläge und nimmt sie an', async () => {
    await addSuggestion()
    render(<TasksPage />)
    expect(await screen.findByText('Kam in der Notiz vor')).toBeInTheDocument()
    expect(screen.getByText('Ablage: Privat')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Annehmen' }))
    await waitFor(async () => expect(await listItems()).toHaveLength(1))
    expect(await listSuggestions()).toHaveLength(0)
    expect(await screen.findByText('Zahnarzt anrufen')).toBeInTheDocument()
  })

  it('lehnt Vorschläge ab', async () => {
    await addSuggestion()
    render(<TasksPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Ablehnen' }))
    await waitFor(async () => expect(await listSuggestions()).toHaveLength(0))
    expect(await listItems()).toHaveLength(0)
  })

  it('zeigt Überfälliges mit deutschem Termin und erledigt per ✓', async () => {
    await createItem({
      type: 'aufgabe',
      title: 'Steuer',
      categoryId: 'privat',
      schedule: { start: '2026-10-16T14:00:00+02:00', durationMin: 30 },
    })
    render(<TasksPage />)
    const section = (await screen.findByText('Heute / Überfällig')).closest(
      'section',
    ) as HTMLElement
    expect(within(section).getByText('Steuer')).toBeInTheDocument()
    expect(within(section).getByText('Termin Fr 16.10., 14:00')).toBeInTheDocument()
    await userEvent.click(within(section).getByRole('button', { name: 'Erledigt' }))
    await waitFor(async () => expect((await listItems())[0].status).toBe('erledigt'))
  })

  it('legt Eingangskorb-Einträge in der gewählten Ablage ab', async () => {
    const user = userEvent.setup()
    await addInboxEntry('Milch kaufen\nund Brot', 'text')
    render(<TasksPage />)
    await user.click(await screen.findByRole('button', { name: 'In Ablage…' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText('Titel')).toHaveValue('Milch kaufen')
    expect(within(dialog).getByLabelText('Art')).toHaveValue('aufgabe')
    expect(within(dialog).queryByRole('option', { name: 'Erledigt' })).not.toBeInTheDocument()
    await user.selectOptions(within(dialog).getByLabelText('Ablage'), 'einkauf')
    await user.click(within(dialog).getByRole('button', { name: 'Ablegen' }))
    await waitFor(async () => expect(await listInbox()).toHaveLength(0))
    const [item] = await listItems()
    expect(item).toMatchObject({ title: 'Milch kaufen', categoryId: 'einkauf', type: 'aufgabe' })
  })

  it('übernimmt den Rest eines mehrzeiligen Eingangskorb-Texts als Notiz (Fehler A1)', async () => {
    const user = userEvent.setup()
    await addInboxEntry('Wohnung putzen\nBad und Küche\nFenster nicht vergessen', 'text')
    render(<TasksPage />)
    await user.click(await screen.findByRole('button', { name: 'In Ablage…' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText('Titel')).toHaveValue('Wohnung putzen')
    expect(within(dialog).getByLabelText('Notiz')).toHaveValue(
      'Bad und Küche\nFenster nicht vergessen',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Ablegen' }))
    await waitFor(async () => expect(await listInbox()).toHaveLength(0))
    const [item] = await listItems()
    expect(item.title).toBe('Wohnung putzen')
    expect(item.notes).toBe('Bad und Küche\nFenster nicht vergessen')
  })

  it('speichert genau die im Dialog geänderten Werte für Titel und Notiz', async () => {
    const user = userEvent.setup()
    await addInboxEntry('Kurz\nDetails', 'text')
    render(<TasksPage />)
    await user.click(await screen.findByRole('button', { name: 'In Ablage…' }))
    const dialog = screen.getByRole('dialog')
    await user.clear(within(dialog).getByLabelText('Titel'))
    await user.type(within(dialog).getByLabelText('Titel'), 'Neuer Titel')
    await user.clear(within(dialog).getByLabelText('Notiz'))
    await user.type(within(dialog).getByLabelText('Notiz'), 'Zeile 1{Enter}Zeile 2')
    await user.click(within(dialog).getByRole('button', { name: 'Ablegen' }))
    await waitFor(async () => expect(await listItems()).toHaveLength(1))
    expect((await listItems())[0]).toMatchObject({
      title: 'Neuer Titel',
      notes: 'Zeile 1\nZeile 2',
    })
  })

  it('löscht Eingangskorb-Einträge erst nach Rückfrage', async () => {
    const user = userEvent.setup()
    await addInboxEntry('Weg damit', 'text')
    render(<TasksPage />)
    await user.click(await screen.findByRole('button', { name: /Eingangskorb-Eintrag löschen/ }))
    expect(await listInbox()).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
    await waitFor(async () => expect(await listInbox()).toHaveLength(0))
  })

  it('erledigt per Checkbox und stellt mit Rückgängig wieder her', async () => {
    const user = userEvent.setup()
    await createItem({ type: 'aufgabe', title: 'Putzen', categoryId: 'privat' })
    render(<TasksPage />)
    await user.click(await screen.findByRole('checkbox', { name: 'Putzen erledigt' }))
    await waitFor(async () => expect((await listItems())[0].status).toBe('erledigt'))
    await user.click(await screen.findByRole('button', { name: 'Rückgängig' }))
    await waitFor(async () => expect((await listItems())[0].status).toBe('offen'))
    expect(await screen.findByRole('checkbox', { name: 'Putzen erledigt' })).toBeInTheDocument()
  })

  it('zeigt nur Aufgaben und öffnet den Editor beim Antippen des Titels', async () => {
    const user = userEvent.setup()
    await createItem({
      type: 'aufgabe',
      title: 'Lernen',
      categoryId: 'studium',
      important: true,
      durationMin: 90,
    })
    await createItem({ type: 'notiz', title: 'Nur Notiz', categoryId: 'privat' })
    render(<TasksPage />)
    const row = (await screen.findByRole('button', { name: 'Lernen' })).closest('li') as HTMLElement
    expect(within(row).getByText('Fokus')).toBeInTheDocument()
    expect(within(row).getByText('1 Std. 30 Min.')).toBeInTheDocument()
    expect(screen.queryByText('Nur Notiz')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lernen' }))
    expect(screen.getByRole('dialog', { name: 'Eintrag bearbeiten' })).toBeInTheDocument()
  })

  it('stellt Slots für Aufgabe 07 bereit', async () => {
    await createItem({
      type: 'aufgabe',
      title: 'Alt',
      categoryId: 'privat',
      schedule: { start: '2026-10-01T10:00:00+02:00', durationMin: 30 },
    })
    await createItem({ type: 'aufgabe', title: 'Offen', categoryId: 'privat' })
    render(
      <TasksPage
        renderOverdueActions={(i) => <button>Neu planen {i.title}</button>}
        renderTaskActions={(i) => <button>Uhr {i.title}</button>}
      />,
    )
    expect(await screen.findByRole('button', { name: 'Neu planen Alt' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Uhr Offen' })).toBeInTheDocument()
  })

  describe('Lauf-Anzeige', () => {
    const NOW = new Date('2026-10-21T15:00:00+02:00')
    const lastRun = (finishedAt: string, itemIds: string[], errors: unknown[] = []) =>
      putFileLocal('runs/last.json', { finishedAt, itemIds, errors })

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'], now: NOW })
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('zeigt „Neu einsortiert“ nicht mehr, aber die Lauf-Fehler als Hinweise', async () => {
      const task = await createItem({ type: 'aufgabe', title: 'Zahnarzt', categoryId: 'privat' })
      await lastRun(
        '2026-10-21T14:05:00+02:00',
        [task.id],
        [{ inboxId: null, message: 'Termin konnte nicht angelegt werden.' }],
      )
      render(<TasksPage />)
      const section = (await screen.findByText('Hinweise vom letzten Lauf')).closest(
        'section',
      ) as HTMLElement
      expect(within(section).getByText('Termin konnte nicht angelegt werden.')).toBeInTheDocument()
      expect(screen.queryByText('Neu einsortiert')).not.toBeInTheDocument()
    })

    it('blendet die Hinweise bei altem Lauf oder ohne Fehler aus', async () => {
      const task = await createItem({ type: 'aufgabe', title: 'Alt', categoryId: 'privat' })
      const error = [{ inboxId: null, message: 'Fehler X' }]
      await lastRun('2026-10-19T14:05:00+02:00', [task.id], error)
      const { unmount } = render(<TasksPage />)
      await screen.findByText('Alt')
      expect(screen.queryByText('Hinweise vom letzten Lauf')).not.toBeInTheDocument()
      expect(screen.queryByText('neu')).not.toBeInTheDocument()
      unmount()
      await lastRun('2026-10-21T14:05:00+02:00', [task.id])
      render(<TasksPage />)
      await screen.findByText('Alt')
      expect(screen.queryByText('Hinweise vom letzten Lauf')).not.toBeInTheDocument()
    })

    it('kennzeichnet nur Aufgaben des Laufs in den Gruppen mit „neu“', async () => {
      const fresh = await createItem({ type: 'aufgabe', title: 'Frisch', categoryId: 'privat' })
      await createItem({ type: 'aufgabe', title: 'Bekannt', categoryId: 'privat' })
      await lastRun('2026-10-21T14:05:00+02:00', [fresh.id])
      render(<TasksPage />)
      const group = (await screen.findByText('Bekannt')).closest('section') as HTMLElement
      const badges = within(group).getAllByText('neu')
      expect(badges).toHaveLength(1)
      expect(badges[0].closest('li')).toHaveTextContent('Frisch')
    })

    it('zeigt sortError im Eingangskorb; manuelles Einsortieren funktioniert weiter', async () => {
      await putFileLocal('inbox/e1.json', {
        id: 'e1',
        text: 'Zahnarzt Freitag',
        createdAt: '2026-10-21T13:00:00+02:00',
        sortError: { message: 'Kein freier Block.', at: '2026-10-21T14:05:00+02:00' },
      })
      render(<TasksPage />)
      const note = await screen.findByRole('note')
      expect(note).toHaveTextContent('Kein freier Block.')
      fireEvent.click(screen.getByRole('button', { name: 'In Ablage…' }))
      const dialog = screen.getByRole('dialog')
      fireEvent.click(within(dialog).getByRole('button', { name: 'Ablegen' }))
      await waitFor(async () => expect(await listItems()).toHaveLength(1))
      expect((await listItems())[0]).not.toHaveProperty('sortError')
      expect(await listInbox()).toHaveLength(0)
    })
  })
})
