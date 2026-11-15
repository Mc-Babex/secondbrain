const KEY = 'secondbrain.firstRunDone'

export interface FirstRunFacts {
  hasToken: boolean
  hasRepo: boolean
  hasEntries: boolean
  markerSet: boolean
}

/** Ersteinrichtung nur auf einem völlig leeren Gerät, das sie noch nie abgeschlossen hat (SPEC §6.5). */
export function shouldShowFirstRun(facts: FirstRunFacts): boolean {
  return !facts.hasToken && !facts.hasRepo && !facts.hasEntries && !facts.markerSet
}

/** Lokaler Merker „Ersteinrichtung abgeschlossen“ (kein Geheimnis). */
export function isFirstRunDone(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function markFirstRunDone(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Ohne Speicher entscheidet beim nächsten Start allein der Datenbestand – unkritisch.
  }
}
