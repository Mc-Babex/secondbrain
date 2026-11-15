import { describe, expect, it } from 'vitest'
import { dictationHint, isIos } from './platform'

describe('platform', () => {
  it('erkennt iPhone und iPad', () => {
    expect(isIos({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)' })).toBe(
      true,
    )
    expect(
      isIos({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 }),
    ).toBe(true)
    expect(
      isIos({ userAgent: 'Mozilla/5.0 (Macintosh)', maxTouchPoints: 5, standalone: true }),
    ).toBe(true)
  })

  it('erkennt Windows und Mac ohne Touch nicht als iOS', () => {
    expect(
      isIos({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0 }),
    ).toBe(false)
    expect(
      isIos({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 }),
    ).toBe(false)
  })

  it('erkennt Windows mit Touchscreen nicht als iOS', () => {
    expect(
      isIos({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        platform: 'Win32',
        maxTouchPoints: 5,
      }),
    ).toBe(false)
  })

  it('liefert den Hinweis je Plattform', () => {
    expect(dictationHint(true)).toBe('Diktat: Mikrofon-Taste auf der iPhone-Tastatur')
    expect(dictationHint(false)).toContain('Win + H')
  })
})
