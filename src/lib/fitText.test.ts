import { fitFontSize } from './fitText'

describe('fitFontSize', () => {
  it('behält die Höchstgröße, wenn sie passt', () => {
    expect(fitFontSize(14, 11, () => true)).toBe(14)
  })

  it('verkleinert schrittweise bis es passt', () => {
    expect(fitFontSize(14, 11, (size) => size <= 12.5)).toBe(12.5)
  })

  it('liefert die Untergrenze, wenn nichts passt', () => {
    expect(fitFontSize(14, 11, () => false)).toBe(11)
  })

  it('liefert die Untergrenze, wenn die Höchstgröße darunter liegt', () => {
    expect(fitFontSize(10, 11, () => false)).toBe(11)
  })

  it('braucht für 16 → 11,5 px nur wenige Prüfungen (binäre Suche)', () => {
    const fits = vi.fn((size: number) => size <= 11.5)
    expect(fitFontSize(16, 11, fits)).toBe(11.5)
    expect(fits.mock.calls.length).toBeLessThanOrEqual(8)
  })
})
