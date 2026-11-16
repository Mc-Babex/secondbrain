import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Category, Item, Project } from '../../data/types'
import { NormalCategoryView } from './NormalCategoryView'

const category: Category = {
  id: 'studium',
  name: 'Studium',
  kind: 'normal',
  order: 1,
  description: '',
}

const base = {
  notes: '',
  categoryId: 'studium',
  important: false,
  durationMin: null,
  schedule: null,
  originalCategoryId: null,
  createdAt: '2026-11-01T10:00:00+01:00',
  updatedAt: '2026-11-01T10:00:00+01:00',
  completedAt: null,
}

const task = (id: string, patch: Partial<Item> = {}): Item => ({
  ...base,
  id,
  type: 'aufgabe',
  title: `Aufgabe ${id}`,
  status: 'offen',
  ...patch,
})

const project = (id: string, title: string, patch: Partial<Project> = {}): Project => ({
  id,
  title,
  notes: '',
  categoryId: 'studium',
  status: 'aktiv',
  series: [],
  createdAt: '2026-11-01T10:00:00+01:00',
  updatedAt: '2026-11-01T10:00:00+01:00',
  completedAt: null,
  ...patch,
})

const projects = [
  project('p2', 'Zeta'),
  project('p1', 'Analysis'),
  project('p3', 'Fertig', { status: 'erledigt', completedAt: '2026-11-10T10:00:00+01:00' }),
  project('p4', 'Andere Ablage', { categoryId: 'privat' }),
]

const items: Item[] = [
  task('s1', { projectId: 'p1', projectOrder: 1, title: 'Blatt 1' }),
  task('s2', { projectId: 'p1', projectOrder: 2, title: 'Blatt 2' }),
  task('free', { title: 'Freie Aufgabe', important: true, durationMin: 2, dueDate: '2000-01-01' }),
  task('wait', {
    title: 'Warten',
    gtd: 'warten',
    waiting: { person: 'Anna', since: '2026-11-01', followUpOn: null },
  }),
  task('some', { title: 'Mal sehen', gtd: 'irgendwann' }),
  task('date', {
    title: 'Mit Termin',
    schedule: { start: '2026-11-20T14:00:00+01:00', durationMin: 30 },
  }),
]

const view = (onOpenProject?: (id: string) => void) =>
  render(
    <NormalCategoryView
      category={category}
      categories={[category]}
      items={items}
      projects={projects}
      onOpenProject={onOpenProject}
    />,
  )

describe('NormalCategoryView Projekte', () => {
  it('zeigt aktive Projekte der Ablage oben, nach Titel, mit x/y und nächstem Schritt', () => {
    view()
    const section = screen.getByRole('region', { name: 'Projekte' })
    const cards = within(section)
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '')
    expect(cards).toHaveLength(2)
    expect(cards[0]).toContain('Analysis')
    expect(cards[0]).toContain('0/2')
    expect(cards[0]).toContain('Nächster Schritt: Blatt 1')
    expect(cards[1]).toContain('Zeta')
    expect(cards[1]).toContain('⚠ Nächsten Schritt festlegen')
    expect(screen.queryByText('Fertig')).not.toBeInTheDocument()
    expect(screen.queryByText('Andere Ablage')).not.toBeInTheDocument()
  })

  it('zeigt Projekt-Schritte nicht noch einmal in der Liste', () => {
    view()
    expect(screen.queryByText('Blatt 2')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Blatt 1' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Freie Aufgabe' })).toBeInTheDocument()
  })

  it('zeigt Kennzeichen aller Status', () => {
    view()
    expect(screen.getAllByText('Nächster Schritt').length).toBeGreaterThan(0)
    expect(screen.getByText('Warte auf Anna')).toBeInTheDocument()
    expect(screen.getByText('Irgendwann')).toBeInTheDocument()
    expect(screen.getByText('Termin Fr 20.11., 14:00')).toBeInTheDocument()
    expect(screen.getByText(/Fokus/)).toBeInTheDocument()
    expect(screen.getByText(/2 Min\./)).toBeInTheDocument()
    expect(screen.getByText(/überfällig, fällig/)).toBeInTheDocument()
  })

  it('Projektkarte ist ohne onOpenProject nicht antippbar, mit ruft sie es auf', async () => {
    const first = view()
    expect(screen.queryByRole('button', { name: /Analysis/ })).not.toBeInTheDocument()
    first.unmount()
    const onOpen = vi.fn()
    view(onOpen)
    await userEvent.click(screen.getByRole('button', { name: /Analysis/ }))
    expect(onOpen).toHaveBeenCalledWith('p1')
  })

  it('Suche filtert Projekte und Aufgaben nach Titel', async () => {
    view()
    await userEvent.type(screen.getByRole('searchbox'), 'zeta')
    expect(screen.getByText('Zeta')).toBeInTheDocument()
    expect(screen.queryByText('Analysis')).not.toBeInTheDocument()
    expect(screen.queryByText('Freie Aufgabe')).not.toBeInTheDocument()
  })
})
