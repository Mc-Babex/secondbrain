import { describe, expect, it } from 'vitest'
import type { Category, Item, Project } from '../data/types'
import {
  activeProjectsOf,
  archivedStepsOf,
  archiveItems,
  completedProjects,
  countByCategory,
  itemsOfCategory,
} from './categoryView'

const make = (id: string, patch: Partial<Item> = {}): Item => ({
  id,
  type: 'aufgabe',
  title: id,
  notes: '',
  categoryId: 'privat',
  status: 'offen',
  important: false,
  durationMin: null,
  schedule: null,
  originalCategoryId: null,
  createdAt: '2026-10-01T10:00:00+02:00',
  updatedAt: '2026-10-01T10:00:00+02:00',
  completedAt: null,
  ...patch,
})

describe('itemsOfCategory', () => {
  it('filtert nach Ablage und Status offen', () => {
    const items = [
      make('a'),
      make('b', { categoryId: 'arbeit' }),
      make('c', { status: 'erledigt' }),
    ]
    expect(itemsOfCategory(items, 'privat', '').map((i) => i.id)).toEqual(['a'])
  })

  it('sucht in Titel und Notizen ohne Groß-/Kleinschreibung', () => {
    const items = [
      make('a', { title: 'Steuer' }),
      make('b', { notes: 'wegen STEUER fragen' }),
      make('c', { title: 'Putzen' }),
    ]
    const found = itemsOfCategory(items, 'privat', 'steuer').map((i) => i.id)
    expect(found.sort()).toEqual(['a', 'b'])
    expect(itemsOfCategory(items, 'privat', '')).toHaveLength(3)
  })

  it('sortiert Aufgaben vor Terminen vor Notizen, neueste zuerst', () => {
    const items = [
      make('n1', { type: 'notiz', createdAt: '2026-10-05T10:00:00+02:00' }),
      make('t1', { type: 'termin' }),
      make('a-alt', { createdAt: '2026-10-01T10:00:00+02:00' }),
      make('a-neu', { createdAt: '2026-10-03T10:00:00+02:00' }),
    ]
    expect(itemsOfCategory(items, 'privat', '').map((i) => i.id)).toEqual([
      'a-neu',
      'a-alt',
      't1',
      'n1',
    ])
  })
})

describe('countByCategory', () => {
  const categories: Category[] = [
    { id: 'privat', name: 'Privat', kind: 'normal', order: 1, description: '' },
    { id: 'einkauf', name: 'Einkauf', kind: 'einkauf', order: 2, description: '' },
    { id: 'erledigt', name: 'Erledigt', kind: 'archiv', order: 3, description: '' },
  ]

  it('zählt je Art der Ablage', () => {
    const items = [
      make('a'),
      make('b', { status: 'erledigt' }),
      make('c', { categoryId: 'einkauf', checked: true }),
      make('d', { categoryId: 'einkauf' }),
      make('e', { categoryId: 'erledigt', status: 'erledigt' }),
    ]
    expect(countByCategory(items, categories)).toEqual({ privat: 1, einkauf: 2, erledigt: 1 })
  })
})

describe('archiveItems', () => {
  it('sortiert nach completedAt, neueste zuerst, fehlende ans Ende', () => {
    const items = [
      make('alt', { categoryId: 'erledigt', completedAt: '2026-10-01T10:00:00+02:00' }),
      make('ohne', { categoryId: 'erledigt' }),
      make('neu', { categoryId: 'erledigt', completedAt: '2026-10-09T10:00:00+02:00' }),
      make('fremd', { completedAt: '2026-10-10T10:00:00+02:00' }),
    ]
    expect(archiveItems(items, 'erledigt').map((i) => i.id)).toEqual(['neu', 'alt', 'ohne'])
  })
})

describe('Projekte in Ablagen', () => {
  const project = (id: string, patch: Partial<Project> = {}): Project => ({
    id,
    title: id,
    notes: '',
    categoryId: 'privat',
    status: 'aktiv',
    series: [],
    createdAt: '2026-10-01T10:00:00+02:00',
    updatedAt: '2026-10-01T10:00:00+02:00',
    completedAt: null,
    ...patch,
  })

  it('itemsOfCategory blendet Schritte bekannter Projekte aus', () => {
    const items = [make('a'), make('b', { projectId: 'p1' }), make('c', { projectId: 'fremd' })]
    expect(itemsOfCategory(items, 'privat', '', [project('p1')]).map((i) => i.id)).toEqual([
      'a',
      'c',
    ])
  })

  it('activeProjectsOf: aktive der Ablage nach Titel', () => {
    const projects = [
      project('z'),
      project('a'),
      project('e', { status: 'erledigt' }),
      project('o', { categoryId: 'arbeit' }),
    ]
    expect(activeProjectsOf(projects, 'privat').map((p) => p.id)).toEqual(['a', 'z'])
  })

  it('completedProjects: neueste zuerst; archiveItems blendet mitarchivierte Schritte aus', () => {
    const projects = [
      project('p1', { status: 'erledigt', completedAt: '2026-10-02T10:00:00+02:00' }),
      project('p2', { status: 'erledigt', completedAt: '2026-10-05T10:00:00+02:00' }),
      project('p3'),
    ]
    expect(completedProjects(projects).map((p) => p.id)).toEqual(['p2', 'p1'])
    const archived = (id: string, patch: Partial<Item>) =>
      make(id, { categoryId: 'erledigt', status: 'erledigt', ...patch })
    const items = [
      archived('s1', { projectId: 'p1', archivedWithProject: true, projectOrder: 2 }),
      archived('s0', { projectId: 'p1', archivedWithProject: true, projectOrder: 1 }),
      archived('single', { projectId: 'p1' }),
      archived('x', {}),
    ]
    expect(archivedStepsOf(projects[0], items, 'erledigt').map((i) => i.id)).toEqual(['s0', 's1'])
    expect(archiveItems(items, 'erledigt', projects).map((i) => i.id)).toEqual(['single', 'x'])
    expect(archiveItems(items, 'erledigt').length).toBe(4)
  })
})
