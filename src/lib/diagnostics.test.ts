import { describe, expect, it } from 'vitest'
import { buildDiagnosticsText, type DiagnosticsState } from './diagnostics'

const GITHUB_TOKEN = 'github_pat_GEHEIMER_TOKEN_123'
const GOOGLE_TOKEN = 'ya29.GEHEIMES-GOOGLE-TOKEN'
const ACCOUNT = 'alex@example.com'

const state: DiagnosticsState = {
  appVersion: '1.2.3',
  buildStamp: '2026-10-19T10:00:00.000Z abc1234',
  standalone: true,
  userAgent: 'Mozilla/5.0 (iPhone)',
  viewport: { width: 390, height: 844 },
  sync: {
    state: 'fehler',
    pending: 2,
    lastSync: '2026-10-19T09:00:00+02:00',
    message: 'Keine Verbindung',
  },
  invalidCount: 1,
  githubRepo: 'alex/daten',
  githubTokenPresent: true,
  googleConnected: true,
  speechAvailable: false,
  storage: { persistent: true, usage: 2_097_152, quota: 1_073_741_824 },
  errors: [{ at: '2026-10-19T09:30:00.000Z', area: 'Sync', message: 'Offline', count: 3 }],
}

describe('buildDiagnosticsText', () => {
  it('enthält alle Punkte', () => {
    const text = buildDiagnosticsText(state)
    for (const part of [
      'Version: 1.2.3',
      'Build: 2026-10-19T10:00:00.000Z abc1234',
      'Anzeigemodus: installiert',
      'Mozilla/5.0 (iPhone)',
      '390 × 844',
      'Sync-Status: fehler (Keine Verbindung)',
      'Ausstehende Änderungen: 2',
      'Letzter Abgleich: 2026-10-19T09:00:00+02:00',
      'Ungültige Dateien: 1',
      'Repo alex/daten, Token vorhanden',
      'Google: verbunden',
      'Spracherkennung: nein',
      'dauerhaft: ja',
      '2,0 MB von 1024,0 MB',
      '[Sync] Offline ×3',
    ]) {
      expect(text).toContain(part)
    }
  })

  it('zeigt Fallbacks ohne Token, Google und Fehler', () => {
    const text = buildDiagnosticsText({
      ...state,
      standalone: false,
      githubRepo: null,
      githubTokenPresent: false,
      googleConnected: false,
      errors: [],
      storage: { persistent: null, usage: null, quota: null },
    })
    expect(text).toContain('Anzeigemodus: Browser')
    expect(text).toContain('Token fehlt')
    expect(text).toContain('Google: nicht verbunden')
    expect(text).toContain('keine')
    expect(text).toContain('unbekannt')
  })

  it('enthält weder Tokens noch Konto-Adresse', () => {
    const withSecrets: DiagnosticsState & Record<string, unknown> = {
      ...state,
      sync: { ...state.sync, message: `Fehler mit ${GITHUB_TOKEN} ${GOOGLE_TOKEN} ${ACCOUNT}` },
      githubToken: GITHUB_TOKEN,
      googleToken: GOOGLE_TOKEN,
      account: ACCOUNT,
    }
    const text = buildDiagnosticsText(withSecrets)
    for (const secret of [GITHUB_TOKEN, GOOGLE_TOKEN, ACCOUNT]) expect(text).not.toContain(secret)
  })
})
