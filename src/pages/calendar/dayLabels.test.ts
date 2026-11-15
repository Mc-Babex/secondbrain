import { clockLabel, dayFullLabel, dayShortLabel, dayToAnchor, minutesLabel } from './dayLabels'

describe('dayLabels', () => {
  it('Kurzkopf ohne Punkt', () => {
    expect(dayShortLabel('2026-10-12')).toBe('Mo 12.')
    expect(dayShortLabel('2026-10-18')).toBe('So 18.')
  })
  it('voller Tagesname', () => {
    expect(dayFullLabel('2026-10-12')).toBe('Montag, 12. Oktober 2026')
  })
  it('Anker liegt mittags in Berlin', () => {
    expect(dayToAnchor('2026-10-12').toISOString()).toBe('2026-10-12T10:00:00.000Z')
  })
  it('Uhrzeiten', () => {
    expect(clockLabel('2026-10-12T09:05:00+02:00')).toBe('09:05')
    expect(minutesLabel(575)).toBe('09:35')
  })
})
