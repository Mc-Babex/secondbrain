import type { Item } from '../../src/data/types'

/** Gültige Beispieldaten für die Tests der Lauf-Skripte. */
export const validItem: Item = {
  id: '20261017-093000-k3f9',
  type: 'aufgabe',
  title: 'Krankenkasse anrufen',
  notes: '',
  categoryId: 'privat',
  status: 'offen',
  important: true,
  durationMin: 15,
  schedule: { start: '2026-10-18T09:00:00+02:00', durationMin: 15, calendarEventId: 'abc' },
  originalCategoryId: null,
  createdAt: '2026-10-17T09:30:00+02:00',
  updatedAt: '2026-10-17T10:00:00+02:00',
  completedAt: null,
}

export const validInbox = {
  id: '20261017-093000-k3f9',
  text: 'Morgen Krankenkasse anrufen',
  createdAt: '2026-10-17T09:30:00+02:00',
  source: 'sprache',
}
