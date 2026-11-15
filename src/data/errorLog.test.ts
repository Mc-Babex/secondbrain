import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearErrorLog,
  getErrorLog,
  installGlobalErrorLogging,
  logError,
  sanitizeMessage,
} from './errorLog'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('sanitizeMessage', () => {
  it.each([
    'github_pat_11ABCDEF0123456789_abcdefXYZ',
    'ghp_abcdefghijklmnopqrstuvwxyz0123',
    'gho_abcdefghijklmnopqrstuvwxyz0123',
    'ghs_abcdefghijklmnopqrstuvwxyz0123',
    'ghu_abcdefghijklmnopqrstuvwxyz0123',
    'ya29.a0AfH6SMBx-geheim_123',
    'Bearer abc.def-ghi',
    'token=geheim123',
    'access_token=geheim123',
  ])('entfernt %s', (secret) => {
    const result = sanitizeMessage(`Fehler bei ${secret} im Aufruf`)
    expect(result).not.toContain(secret)
    expect(result).toContain('[entfernt]')
    expect(result).toContain('Fehler bei')
  })

  it.each([
    '{"token":"0123456789abcdef0123456789abcdef01234567"}',
    '{"access_token": "geheim123", "x": 1}',
    '{"refresh_token":"geheim123"}',
    'refresh_token=geheim123',
    'Authorization: Basic geheim123',
    'AUTHORIZATION=geheim123',
    '"authorization":"Bearer geheim123"',
  ])('entfernt Schlüssel-Wert-Form %s', (text) => {
    const result = sanitizeMessage(`Antwort ${text} Ende`)
    expect(result).not.toContain('geheim123')
    expect(result).not.toContain('0123456789abcdef')
    expect(result).toContain('[entfernt]')
    expect(result).toContain('Antwort')
  })

  it('entfernt Query-Strings, Fragmente und E-Mail-Adressen', () => {
    const result = sanitizeMessage(
      'GET https://api.example.com/a?x=1&y=2 und https://b.de/c#frag, alex@example.com',
    )
    expect(result).not.toContain('x=1')
    expect(result).not.toContain('frag')
    expect(result).not.toContain('alex@example.com')
    expect(result).toContain('https://api.example.com/a')
  })

  it('lässt normale Meldungen lesbar und kürzt auf 300 Zeichen', () => {
    expect(sanitizeMessage('Keine Verbindung zu GitHub.')).toBe('Keine Verbindung zu GitHub.')
    expect(sanitizeMessage('a'.repeat(500)).length).toBeLessThanOrEqual(301)
  })
})

describe('Fehlerprotokoll', () => {
  it('behält die 20 neuesten von 25 Einträgen, neueste zuerst', () => {
    for (let i = 1; i <= 25; i++) logError('Test', `Fehler ${i}`)
    const log = getErrorLog()
    expect(log).toHaveLength(20)
    expect(log[0]?.message).toBe('Fehler 25')
    expect(log[19]?.message).toBe('Fehler 6')
  })

  it('zählt gleiche Meldungen direkt hintereinander', () => {
    logError('Sync', 'Offline')
    logError('Sync', 'Offline')
    logError('Sync', 'Offline')
    expect(getErrorLog()).toHaveLength(1)
    expect(getErrorLog()[0]?.count).toBe(3)
  })

  it('überlebt einen Neustart und lässt sich leeren', async () => {
    logError('Sync', 'Offline')
    vi.resetModules()
    const fresh = await import('./errorLog')
    expect(fresh.getErrorLog()).toHaveLength(1)
    fresh.clearErrorLog()
    expect(fresh.getErrorLog()).toEqual([])
  })

  it('wirft nie, wenn der Speicher fehlschlägt', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('voll')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('kaputt')
    })
    expect(() => logError('Test', 'x')).not.toThrow()
    expect(() => clearErrorLog()).not.toThrow()
    expect(getErrorLog()).toEqual([])
  })

  it('protokolliert unbehandelte Fehler und abgelehnte Promises', () => {
    const remove = installGlobalErrorLogging()
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('Kaputt') }))
    const rejection = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(rejection, 'reason', { value: new Error('Abgelehnt') })
    window.dispatchEvent(rejection)
    remove()
    const messages = getErrorLog().map((entry) => entry.message)
    expect(messages).toEqual(['Abgelehnt', 'Kaputt'])
  })
})
