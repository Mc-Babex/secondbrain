import { nowIso, toIso } from './time'

describe('toIso', () => {
  it('nutzt +02:00 in der Sommerzeit', () => {
    expect(toIso(new Date('2026-07-01T10:00:00Z'))).toBe('2026-07-01T12:00:00+02:00')
  })
  it('nutzt +01:00 in der Winterzeit', () => {
    expect(toIso(new Date('2026-01-15T10:00:00Z'))).toBe('2026-01-15T11:00:00+01:00')
  })
  it('behandelt Mitternacht korrekt', () => {
    expect(toIso(new Date('2026-01-14T23:00:00Z'))).toBe('2026-01-15T00:00:00+01:00')
  })
  it('wechselt am Ende der Sommerzeit den Offset', () => {
    expect(toIso(new Date('2026-10-25T00:30:00Z'))).toBe('2026-10-25T02:30:00+02:00')
    expect(toIso(new Date('2026-10-25T01:30:00Z'))).toBe('2026-10-25T02:30:00+01:00')
  })
})

describe('nowIso', () => {
  it('liefert ISO mit Offset', () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/)
  })
})
