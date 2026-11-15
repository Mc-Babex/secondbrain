import { saveAutoSort } from './repository'
import { getSyncStatus, subscribeSyncStatus } from './syncStatus'

const KEY = 'secondbrain.pendingAutoSort'

/** Vorgemerkte Wahl aus der Ersteinrichtung (kein Geheimnis); `null`, wenn nichts vorgemerkt ist. */
export function getPendingAutoSort(): boolean | null {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'true' ? true : value === 'false' ? false : null
  } catch {
    return null
  }
}

export function setPendingAutoSort(value: boolean): void {
  try {
    localStorage.setItem(KEY, String(value))
  } catch {
    // Ohne Speicher gilt der Standard – unkritisch.
  }
}

/** Verwirft die Vormerkung, z. B. wenn der Nutzer `autoSort` später selbst umschaltet. */
export function clearPendingAutoSort(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nichts zu tun.
  }
}

let applying = false

/**
 * Schreibt die vorgemerkte Wahl erst, wenn ein Abgleich erfolgreich war (der Remote-Stand liegt dann lokal
 * vor), damit eine vorhandene settings.json im Daten-Repo nicht durch eine unvollständige Datei ersetzt wird.
 */
export async function applyPendingAutoSort(): Promise<void> {
  const value = getPendingAutoSort()
  const status = getSyncStatus()
  if (value === null || applying || status.state !== 'synchron' || status.lastSync === null) return
  applying = true
  try {
    await saveAutoSort(value)
    clearPendingAutoSort()
  } catch {
    // Der Merker bleibt; der nächste erfolgreiche Abgleich versucht es erneut.
  } finally {
    applying = false
  }
}

/** Wendet den Merker nach jedem erfolgreichen Abgleich an (auch nach Neustart); liefert die Abmeldung. */
export function startPendingAutoSort(): () => void {
  const run = (): void => void applyPendingAutoSort()
  run()
  return subscribeSyncStatus(run)
}
