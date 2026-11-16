import { defaultCategories } from '../data/defaults'
import type { Item } from '../data/types'
import { groupByCategory, isOverdue } from './taskGroups'

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

describe('groupByCategory', () => {
  it('schließt Archiv und Einkauf aus', () => {
    const groups = groupByCategory(
      [
        item({ id: 'ar', categoryId: 'erledigt' }),
        item({ id: 'ei', categoryId: 'einkauf' }),
        item({ id: 'ok' }),
      ],
      categories,
    )
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([['ok']])
  })

  it('gruppiert in order-Reihenfolge und blendet leere Gruppen aus', () => {
    const groups = groupByCategory(
      [item({ id: 'a', categoryId: 'arbeit' }), item({ id: 'b', categoryId: 'privat' })],
      [...categories].reverse(),
    )
    expect(groups.map((g) => g.name)).toEqual(['Privat', 'Arbeit'])
  })

  it('legt unbekannte Ablagen in „Ohne Ablage“ am Ende', () => {
    const groups = groupByCategory(
      [item({ id: 'x', categoryId: 'gibtsnicht' }), item({ id: 'b', categoryId: 'privat' })],
      categories,
    )
    expect(groups.map((g) => g.name)).toEqual(['Privat', 'Ohne Ablage'])
  })

  it('behält die Reihenfolge innerhalb der Gruppe', () => {
    const groups = groupByCategory([item({ id: 'z' }), item({ id: 'a' })], categories)
    expect(groups[0].items.map((i) => i.id)).toEqual(['z', 'a'])
  })
})
