import { sanitizeMessage, type ErrorLogEntry } from '../data/errorLog'
import type { SyncStatus } from '../data/syncStatus'

export interface DiagnosticsState {
  appVersion: string
  buildStamp: string
  standalone: boolean
  userAgent: string
  viewport: { width: number; height: number }
  sync: SyncStatus
  invalidCount: number
  /** Repo-Name (`besitzer/name`) oder `null`; nie das Token. */
  githubRepo: string | null
  githubTokenPresent: boolean
  googleConnected: boolean
  speechAvailable: boolean
  storage: { persistent: boolean | null; usage: number | null; quota: number | null }
  errors: ErrorLogEntry[]
}

function yesNo(value: boolean): string {
  return value ? 'ja' : 'nein'
}

function megabytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1).replace('.', ',')} MB`
}

function storageText(storage: DiagnosticsState['storage']): string {
  const persistent = storage.persistent === null ? 'unbekannt' : yesNo(storage.persistent)
  const usage =
    storage.usage !== null && storage.quota !== null
      ? `${megabytes(storage.usage)} von ${megabytes(storage.quota)}`
      : 'unbekannt'
  return `dauerhaft: ${persistent}, Belegung: ${usage}`
}

/** Baut den kopierbaren Diagnosetext (reine Funktion, ohne Geheimnisse). */
export function buildDiagnosticsText(state: DiagnosticsState): string {
  const { sync } = state
  const lines = [
    'SecondBrain Diagnose',
    `Version: ${state.appVersion} (Build: ${state.buildStamp})`,
    `Anzeigemodus: ${state.standalone ? 'installiert' : 'Browser'}`,
    `Gerät/Browser: ${state.userAgent}`,
    `Fenstergröße: ${state.viewport.width} × ${state.viewport.height}`,
    `Sync-Status: ${sync.state}${sync.message ? ` (${sanitizeMessage(sync.message)})` : ''}`,
    `Ausstehende Änderungen: ${sync.pending}`,
    `Letzter Abgleich: ${sync.lastSync ?? 'noch nie'}`,
    `Ungültige Dateien: ${state.invalidCount}`,
    `GitHub: Repo ${state.githubRepo ?? 'nicht gesetzt'}, Token ${state.githubTokenPresent ? 'vorhanden' : 'fehlt'}`,
    `Google: ${state.googleConnected ? 'verbunden' : 'nicht verbunden'}`,
    `Spracherkennung: ${yesNo(state.speechAvailable)}`,
    `Speicher: ${storageText(state.storage)}`,
    'Letzte Fehler:',
  ]
  if (state.errors.length === 0) lines.push('  keine')
  for (const entry of state.errors) {
    const count = entry.count > 1 ? ` ×${entry.count}` : ''
    lines.push(`  ${entry.at} [${entry.area}] ${entry.message}${count}`)
  }
  return lines.join('\n')
}
