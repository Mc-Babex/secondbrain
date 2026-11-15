const KEY = 'secondbrain.setupSyncDone'

/** Merker „erster Abgleich der Einrichtung abgeschlossen“ (lokal, kein Geheimnis). */
export function isSetupSyncDone(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function markSetupSyncDone(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Ohne Speicher erscheint die Einrichtung beim nächsten Öffnen erneut – unkritisch.
  }
}
