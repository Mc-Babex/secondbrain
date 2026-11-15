export type PersistResult = 'persistent' | 'volatile' | 'unsupported'

/** Bittet den Browser um dauerhaften Speicher; ohne `navigator.storage` kein Fehler. */
export async function requestPersistentStorage(): Promise<PersistResult> {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
  if (!storage || typeof storage.persist !== 'function') return 'unsupported'
  try {
    return (await storage.persist()) ? 'persistent' : 'volatile'
  } catch {
    return 'unsupported'
  }
}
