import type { Item } from '../data/types'
import { appointmentEnd, hasEnded, selectPastAppointments } from './pastAppointments'

function item(patch: Partial<Item>): Item {
  return {
    id: 'a',
    type: 'termin',
    title: 'T',
    notes: '',
    categoryId: 'privat',
    status: 'offen',
    important: false,
    durationMin: null,
    schedule: { start: '2026-10-22T14:00:00+02:00', durationMin: 60 },
    originalCategoryId: null,
    createdAt: '2026-10-01T10:00:00+02:00',
    updatedAt: '2026-10-01T10:00:00+02:00',
    completedAt: null,
    ...patch,
  }
}

const select = (i: Item, now: string): boolean =>
  selectPastAppointments([i], new Date(now)).length === 1

describe('selectPastAppointments', () => {
  it('wählt einen vergangenen Termin', () => {
    expect(select(item({}), '2026-10-22T16:00:00+02:00')).toBe(true)
  })
  it('wählt laufende und künftige Termine nicht', () => {
    expect(select(item({}), '2026-10-22T14:30:00+02:00')).toBe(false)
    expect(select(item({}), '2026-10-21T10:00:00+02:00')).toBe(false)
  })
  it('wählt Grenzfall Ende = jetzt', () => {
    expect(select(item({}), '2026-10-22T15:00:00+02:00')).toBe(true)
    expect(select(item({}), '2026-10-22T14:59:59+02:00')).toBe(false)
  })
  it('wählt Aufgaben und Notizen nie', () => {
    expect(select(item({ type: 'aufgabe' }), '2027-01-01T00:00:00+01:00')).toBe(false)
    expect(select(item({ type: 'notiz' }), '2027-01-01T00:00:00+01:00')).toBe(false)
  })
  it('wählt Termine ohne schedule nicht', () => {
    expect(select(item({ schedule: null }), '2027-01-01T00:00:00+01:00')).toBe(false)
  })
  it('wählt bereits erledigte Termine nicht', () => {
    expect(select(item({ status: 'erledigt' }), '2027-01-01T00:00:00+01:00')).toBe(false)
  })
  it('rechnet über die Zeitumstellung hinweg in echter Dauer', () => {
    // 25.10.2026 (Ende Sommerzeit): 01:30+02:00 plus 120 Min. endet um 02:30+01:00.
    const i = item({ schedule: { start: '2026-10-25T01:30:00+02:00', durationMin: 120 } })
    expect(appointmentEnd(i)?.toISOString()).toBe('2026-10-25T01:30:00.000Z')
    expect(select(i, '2026-10-25T02:29:00+01:00')).toBe(false)
    expect(select(i, '2026-10-25T02:30:00+01:00')).toBe(true)
  })
  it('ignoriert ungültige Startzeiten', () => {
    expect(hasEnded(item({ schedule: { start: 'kaputt', durationMin: 5 } }), new Date())).toBe(
      false,
    )
  })
})
