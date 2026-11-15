import { describe, expect, it } from 'vitest'
import { mergeCategoriesFile } from './categoriesMerge'

const cat = (id: string, name: string, order: number, extra: object = {}) => ({
  id,
  name,
  kind: 'normal',
  order,
  description: '',
  ...extra,
})

const ids = (merged: unknown): string[] =>
  (merged as { categories: { id: string }[] }).categories.map((c) => c.id)
const find = (merged: unknown, id: string) =>
  (merged as { categories: { id: string }[] }).categories.find((c) => c.id === id)

const defaults = {
  categories: [
    cat('privat', 'Privat', 1),
    cat('arbeit', 'Arbeit', 2),
    cat('einkauf', 'Einkaufsliste', 3, { kind: 'einkauf' }),
    cat('erledigt', 'Erledigt', 4, { kind: 'archiv' }),
  ],
}

describe('mergeCategoriesFile mit Standardwert-Herkunft', () => {
  it('Remote gewinnt für unberührte Ablagen', () => {
    const remote = {
      categories: [
        cat('privat', 'Mein Privat', 1, { description: 'R' }),
        cat('einkauf', 'Markt', 2, { kind: 'einkauf' }),
        cat('erledigt', 'Fertig', 3, { kind: 'archiv' }),
      ],
    }
    const merged = mergeCategoriesFile(defaults, remote, [], [])
    expect(find(merged, 'privat')).toMatchObject({ name: 'Mein Privat', description: 'R' })
    expect(ids(merged)).toEqual(['privat', 'einkauf', 'erledigt'])
  })

  it('berührte Ablage gewinnt bei Name/Beschreibung, order kommt von Remote', () => {
    const local = {
      categories: [
        cat('privat', 'Persönlich', 5, { description: 'lokal' }),
        ...defaults.categories.slice(1),
      ],
    }
    const remote = { categories: [cat('privat', 'Privat', 2), ...defaults.categories.slice(2)] }
    const merged = mergeCategoriesFile(local, remote, [], ['privat'])
    expect(find(merged, 'privat')).toMatchObject({
      name: 'Persönlich',
      description: 'lokal',
      order: 2,
    })
  })

  it('unberührte, remote fehlende Ablage wird verworfen', () => {
    const remote = { categories: [cat('privat', 'Privat', 1), ...defaults.categories.slice(2)] }
    expect(ids(mergeCategoriesFile(defaults, remote, [], []))).not.toContain('arbeit')
  })

  it('1a: einzige Einkaufs-/Archiv-Ablage bleibt, wenn remote keine dieses Typs existiert', () => {
    const remote = { categories: [cat('privat', 'Privat', 1)] }
    const merged = mergeCategoriesFile(defaults, remote, [], [])
    expect(ids(merged)).toEqual(['privat', 'einkauf', 'erledigt'])
  })

  it('1a: bleibt nicht, wenn remote schon eine Ablage dieses Typs hat', () => {
    const remote = {
      categories: [cat('privat', 'Privat', 1), cat('markt', 'Markt', 2, { kind: 'einkauf' })],
    }
    const merged = mergeCategoriesFile(defaults, remote, [], [])
    expect(ids(merged)).toEqual(['privat', 'markt', 'erledigt'])
  })

  it('1b: Ablage, auf die lokale Einträge zeigen, bleibt', () => {
    const remote = { categories: [cat('privat', 'Privat', 1), ...defaults.categories.slice(2)] }
    const merged = mergeCategoriesFile(defaults, remote, [], [], new Set(['arbeit']))
    expect(ids(merged)).toContain('arbeit')
  })

  it('order-Kollision bei neuer Ablage: max+1', () => {
    const local = { categories: [cat('privat', 'Privat', 1), cat('garten', 'Garten', 3)] }
    const remote = {
      categories: [
        cat('privat', 'Privat', 1),
        cat('x', 'X', 2),
        cat('y', 'Y', 3),
        cat('z', 'Z', 7),
      ],
    }
    const merged = mergeCategoriesFile(local, remote, [], ['garten'])
    expect(find(merged, 'garten')).toMatchObject({ order: 8 })
  })

  it('lokale Tombstones verwerfen Remote-Ablagen', () => {
    const remote = { categories: [cat('privat', 'Privat', 1), cat('alt', 'Alt', 2)] }
    expect(ids(mergeCategoriesFile(defaults, remote, ['alt'], []))).not.toContain('alt')
  })

  it('erhält unbekannte Felder (Datei und Ablage)', () => {
    const local = { categories: defaults.categories, lokal: 1 }
    const remote = {
      categories: [cat('privat', 'Privat', 1, { icon: 'haus' })],
      fremd: 'x',
    }
    const merged = mergeCategoriesFile(local, remote, [], []) as Record<string, unknown>
    expect(merged.fremd).toBe('x')
    expect(merged.lokal).toBe(1)
    expect(find(merged, 'privat')).toMatchObject({ icon: 'haus' })
  })
})
