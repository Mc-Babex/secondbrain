import { describe, expect, it } from 'vitest'
import type { Item } from '../data/types'
import { hasSortWork, isPhaseEItem } from './sortWork'

const item = (over: Partial<Item> = {}): Item => ({
  id: '20261017-093000-k3f9',
  type: 'aufgabe',
  title: 'Aufgabe',
  notes: '',
  categoryId: 'privat',
  status: 'offen',
  important: true,
  durationMin: 15,
  schedule: null,
  originalCategoryId: null,
  createdAt: '2026-10-17T09:30:00+02:00',
  updatedAt: '2026-10-17T09:30:00+02:00',
  completedAt: null,
  ...over,
})
const sortError = { message: 'm', at: '2026-10-21T14:05:00+02:00' }

describe('hasSortWork', () => {
  it('leer: keine Arbeit', () => {
    expect(hasSortWork([], [])).toBe(false)
  })

  it('nur Inbox mit sortError: keine Arbeit, auch bei ungültig geformtem Wert', () => {
    expect(
      hasSortWork(
        [
          { id: 'a', sortError },
          { id: 'b', sortError: 'kaputt' },
          { id: 'c', sortError: null },
        ],
        [],
      ),
    ).toBe(false)
  })

  it('Inbox ohne sortError: Arbeit', () => {
    expect(hasSortWork([{ id: 'a', sortError }, { id: 'b' }], [])).toBe(true)
  })

  it('nur wichtige Aufgabe ohne Termin: Arbeit', () => {
    expect(hasSortWork([], [item()])).toBe(true)
  })

  it('erledigte, unwichtige, eingeplante Aufgaben und Notizen zählen nicht', () => {
    const items = [
      item({ status: 'erledigt', completedAt: '2026-10-18T09:00:00+02:00' }),
      item({ important: false }),
      item({ schedule: { start: '2026-10-18T09:00:00+02:00', durationMin: 15 } }),
      item({ type: 'notiz' }),
    ]
    expect(items.some(isPhaseEItem)).toBe(false)
    expect(hasSortWork([], items)).toBe(false)
  })
})
