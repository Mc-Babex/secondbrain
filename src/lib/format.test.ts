import { formatDateTime, formatDuration } from './format'

describe('formatDateTime', () => {
  it('formatiert deutsch in Europe/Berlin', () => {
    expect(formatDateTime('2026-10-16T14:00:00+02:00')).toBe('Fr 16.10., 14:00')
    expect(formatDateTime('2026-10-16T12:05:00Z')).toBe('Fr 16.10., 14:05')
  })

  it('gibt ungültige Werte unverändert zurück', () => {
    expect(formatDateTime('kaputt')).toBe('kaputt')
  })
})

describe('formatDuration', () => {
  it('formatiert Minuten und Stunden', () => {
    expect(formatDuration(15)).toBe('15 Min.')
    expect(formatDuration(60)).toBe('1 Std.')
    expect(formatDuration(90)).toBe('1 Std. 30 Min.')
  })
})
