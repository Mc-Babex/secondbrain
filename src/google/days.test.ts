import { daysBetween, shiftDay } from './days'

describe('days', () => {
  it('shiftDay rechnet über Monats- und Jahresgrenzen', () => {
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('daysBetween zählt Kalendertage, auch über die Zeitumstellung', () => {
    expect(daysBetween('2026-10-20', '2026-10-20')).toBe(0)
    expect(daysBetween('2026-10-24', '2026-10-27')).toBe(3)
    expect(daysBetween('2026-10-27', '2026-10-24')).toBe(-3)
  })
})
