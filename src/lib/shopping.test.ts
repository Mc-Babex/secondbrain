import { describe, expect, it } from 'vitest'
import type { Item } from '../data/types'
import { findSameArticle, normalizeArticle } from './shopping'

const make = (id: string, title: string, categoryId: string, checked?: boolean): Item => ({
  id,
  type: 'notiz',
  title,
  notes: '',
  categoryId,
  status: 'offen',
  important: false,
  durationMin: null,
  schedule: null,
  originalCategoryId: null,
  ...(checked === undefined ? {} : { checked }),
  createdAt: '2026-10-01T10:00:00+02:00',
  updatedAt: '2026-10-01T10:00:00+02:00',
  completedAt: null,
})

describe('normalizeArticle', () => {
  it('ignoriert Groß-/Kleinschreibung, Ränder und mehrfache Leerzeichen', () => {
    expect(normalizeArticle(' Knoblauch')).toBe('knoblauch')
    expect(normalizeArticle('KNOBLAUCH  ')).toBe('knoblauch')
    expect(normalizeArticle('Rote   Bete')).toBe('rote bete')
  })
})

describe('findSameArticle', () => {
  const items = [make('a', 'Knoblauch', 'einkauf', true), make('b', 'Knoblauch', 'privat')]

  it('findet gleiche Artikel, auch abgehakte', () => {
    expect(findSameArticle(items, ' knoblauch', 'einkauf')?.id).toBe('a')
    expect(findSameArticle(items, 'KNOBLAUCH  ', 'einkauf')?.id).toBe('a')
  })

  it('unterscheidet andere Artikel', () => {
    expect(findSameArticle(items, 'Knoblauchzehen', 'einkauf')).toBeUndefined()
  })

  it('zählt nur Einträge der Einkaufsliste', () => {
    expect(findSameArticle([make('b', 'Milch', 'privat')], 'Milch', 'einkauf')).toBeUndefined()
  })
})
