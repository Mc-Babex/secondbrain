const KEY = 'secondbrain.captureDraft'

/** Liest den ungespeicherten Entwurf; ohne Speicher (z. B. gesperrt) leer. */
export function loadDraft(): string {
  try {
    return sessionStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveDraft(text: string): void {
  try {
    if (text === '') sessionStorage.removeItem(KEY)
    else sessionStorage.setItem(KEY, text)
  } catch {
    // Entwurf ist nur eine Komfortfunktion; ohne Speicher einfach nicht sichern.
  }
}
