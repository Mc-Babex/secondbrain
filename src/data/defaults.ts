import type { CategoriesFile, Settings } from './types'

/** Standard-Ablagen laut SPEC §3.5. */
export function defaultCategories(): CategoriesFile {
  return {
    categories: [
      {
        id: 'privat',
        name: 'Privat',
        kind: 'normal',
        order: 1,
        description: 'Alles Persönliche: Haushalt, Arzttermine, Behörden, Freizeit …',
      },
      {
        id: 'arbeit',
        name: 'Arbeit',
        kind: 'normal',
        order: 2,
        description: 'Alles zu Beruf, Job oder Ausbildung',
      },
      { id: 'einkauf', name: 'Einkaufsliste', kind: 'einkauf', order: 3, description: '' },
      {
        id: 'erledigt',
        name: 'Erledigt',
        kind: 'archiv',
        order: 4,
        description: 'Archiv für abgehakte Aufgaben',
      },
    ],
  }
}

/** Standard-Einstellungen laut SPEC §3.6. */
export function defaultSettings(): Settings {
  return {
    planningWindow: { start: '09:00', end: '19:00' },
    pause: { start: '12:00', end: '13:00' },
    timezone: 'Europe/Berlin',
  }
}
