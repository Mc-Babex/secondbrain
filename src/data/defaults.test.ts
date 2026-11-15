import { defaultCategories, defaultSettings } from './defaults'
import { isCategoriesFile, isSettings } from './types'

describe('defaults', () => {
  it('Standard-Ablagen laut SPEC §3.5', () => {
    const file = defaultCategories()
    expect(isCategoriesFile(file)).toBe(true)
    expect(file.categories.map((c) => [c.id, c.name, c.kind, c.order])).toEqual([
      ['privat', 'Privat', 'normal', 1],
      ['arbeit', 'Arbeit', 'normal', 2],
      ['einkauf', 'Einkaufsliste', 'einkauf', 3],
      ['erledigt', 'Erledigt', 'archiv', 4],
    ])
    expect(file.categories[0].description).toBe(
      'Alles Persönliche: Haushalt, Arzttermine, Behörden, Freizeit …',
    )
    expect(file.categories[1].description).toBe('Alles zu Beruf, Job oder Ausbildung')
    expect(file.categories[3].description).toBe('Archiv für abgehakte Aufgaben')
  })
  it('Standard-Einstellungen laut SPEC §3.6', () => {
    const s = defaultSettings()
    expect(isSettings(s)).toBe(true)
    expect(s).toEqual({
      planningWindow: { start: '09:00', end: '19:00' },
      pause: { start: '12:00', end: '13:00' },
      timezone: 'Europe/Berlin',
    })
  })
  it('liefert unabhängige Kopien', () => {
    defaultSettings().planningWindow.start = 'x'
    expect(defaultSettings().planningWindow.start).toBe('09:00')
  })
})
