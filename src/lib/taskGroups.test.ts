import { defaultCategories } from '../data/defaults'
import type { Item } from '../data/types'
import { buildTaskView, isOverdue } from './taskGroups'

const NOW = new Date('2026-10-17T12:00:00+02:00')

function item(partial: Partial<Item> & { id: string }): Item {
  return {
    type: 'aufgabe',
    title: partial.id,
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
    ...partial,
  }
}

const { categories } = defaultCategories()

describe('isOverdue', () => {
  it('prüft Ende des Termins gegen jetzt', () => {
    const past = item({
      id: 'a',
      schedule: { start: '2026-10-17T10:00:00+02:00', durationMin: 60 },
    })
    const running = item({
      id: 'b',
      schedule: { start: '2026-10-17T11:30:00+02:00', durationMin: 60 },
    })
    expect(isOverdue(past, NOW)).toBe(true)
    expect(isOverdue(running, NOW)).toBe(false)
  })

  it('betrifft nur offene Aufgaben mit Termin', () => {
    const schedule = { start: '2026-10-10T10:00:00+02:00', durationMin: 30 }
    expect(isOverdue(item({ id: 'a', type: 'termin', schedule }), NOW)).toBe(false)
    expect(isOverdue(item({ id: 'b', status: 'erledigt', schedule }), NOW)).toBe(false)
    expect(isOverdue(item({ id: 'c' }), NOW)).toBe(false)
  })
})

describe('buildTaskView', () => {
  it('schließt Notizen, Termine, Erledigte, Archiv und Einkauf aus', () => {
    const view = buildTaskView(
      [
        item({ id: 'n', type: 'notiz' }),
        item({ id: 't', type: 'termin' }),
        item({ id: 'e', status: 'erledigt' }),
        item({ id: 'ar', categoryId: 'erledigt' }),
        item({ id: 'ei', categoryId: 'einkauf' }),
        item({ id: 'ok' }),
      ],
      categories,
      NOW,
    )
    expect(view.groups.map((g) => g.items.map((i) => i.id))).toEqual([['ok']])
  })

  it('gruppiert in order-Reihenfolge und blendet leere Gruppen aus', () => {
    const view = buildTaskView(
      [item({ id: 'a', categoryId: 'arbeit' }), item({ id: 'b', categoryId: 'privat' })],
      [...categories].reverse(),
      NOW,
    )
    expect(view.groups.map((g) => g.name)).toEqual(['Privat', 'Arbeit'])
  })

  it('legt unbekannte Ablagen in „Ohne Ablage" am Ende', () => {
    const view = buildTaskView(
      [item({ id: 'x', categoryId: 'gibtsnicht' }), item({ id: 'b', categoryId: 'privat' })],
      categories,
      NOW,
    )
    expect(view.groups.map((g) => g.name)).toEqual(['Privat', 'Ohne Ablage'])
  })

  it('sortiert: eingeplant nach Termin, dann wichtig, dann createdAt', () => {
    const view = buildTaskView(
      [
        item({ id: 'alt', createdAt: '2026-10-01T10:00:00+02:00' }),
        item({ id: 'neu', createdAt: '2026-10-05T10:00:00+02:00' }),
        item({ id: 'wichtig', important: true, createdAt: '2026-10-09T10:00:00+02:00' }),
        item({ id: 'spaet', schedule: { start: '2026-10-20T10:00:00+02:00', durationMin: 30 } }),
        item({ id: 'frueh', schedule: { start: '2026-10-18T10:00:00+02:00', durationMin: 30 } }),
      ],
      categories,
      NOW,
    )
    expect(view.groups[0].items.map((i) => i.id)).toEqual([
      'frueh',
      'spaet',
      'wichtig',
      'alt',
      'neu',
    ])
  })

  it('führt Überfällige nur oben und nicht doppelt', () => {
    const view = buildTaskView(
      [
        item({ id: 'late', schedule: { start: '2026-10-16T10:00:00+02:00', durationMin: 30 } }),
        item({ id: 'earlier', schedule: { start: '2026-10-15T10:00:00+02:00', durationMin: 30 } }),
        item({ id: 'fine' }),
      ],
      categories,
      NOW,
    )
    expect(view.overdue.map((i) => i.id)).toEqual(['earlier', 'late'])
    expect(view.groups.flatMap((g) => g.items.map((i) => i.id))).toEqual(['fine'])
  })
})
