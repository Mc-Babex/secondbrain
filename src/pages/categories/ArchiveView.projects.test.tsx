import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { useItems } from '../../data/hooks'
import { resetDb } from '../../data/localStore'
import {
  addProjectStep,
  completeProject,
  createProject,
  listItems,
  listProjects,
} from '../../data/repository'
import type { Category } from '../../data/types'
import { ArchiveView } from './ArchiveView'

beforeEach(() => resetDb(true))
afterAll(() => resetDb(true))

const archive: Category = {
  id: 'erledigt',
  name: 'Erledigt',
  kind: 'archiv',
  order: 9,
  description: '',
}
const privat: Category = { id: 'privat', name: 'Privat', kind: 'normal', order: 1, description: '' }

/** Erledigtes Projekt mit zwei mitarchivierten Schritten. */
async function setup(): Promise<void> {
  const created = await createProject({ title: 'Analysis 1', categoryId: 'privat' })
  await addProjectStep(created.id, { title: 'Blatt 1' })
  await addProjectStep(created.id, { title: 'Blatt 2' })
  await completeProject(created.id)
}

function Live() {
  const items = useItems()
  return <ArchiveView category={archive} categories={[privat, archive]} items={items} />
}

describe('ArchiveView Projekte', () => {
  it('zeigt das abgeschlossene Projekt mit Datum und eingerückten Schritten, nicht einzeln', async () => {
    await setup()
    render(<Live />)
    const section = await screen.findByRole('region', { name: 'Projekte' })
    expect(within(section).getByText('Analysis 1')).toBeInTheDocument()
    expect(within(section).getByText(/abgeschlossen am/)).toBeInTheDocument()
    const steps = within(section).getByRole('list', { name: 'Schritte von Analysis 1' })
    expect(
      within(steps)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Blatt 1', 'Blatt 2'])
    // Nur das „Wiederherstellen“ des Projekts, keine Einzelzeilen für die Schritte.
    expect(screen.getAllByRole('button', { name: /wiederherstellen/i })).toHaveLength(1)
    expect(screen.getAllByText('Blatt 1')).toHaveLength(1)
  })

  it('Wiederherstellen macht das Projekt aktiv und entfernt es aus Erledigt', async () => {
    await setup()
    render(<Live />)
    await userEvent.click(
      await screen.findByRole('button', { name: 'Projekt Analysis 1 wiederherstellen' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('wieder aktiv')
    await waitFor(() => expect(screen.queryByText('Analysis 1')).not.toBeInTheDocument())
    expect((await listProjects())[0].status).toBe('aktiv')
    const items = await listItems()
    expect(items.every((i) => i.status === 'offen' && i.categoryId === 'privat')).toBe(true)
  })
})
