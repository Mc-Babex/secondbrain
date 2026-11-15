import { useSyncExternalStore } from 'react'
import { logError } from '../data/errorLog'

/** Weicher Trennstrich (U+00AD). */
const SOFT_HYPHEN = String.fromCharCode(0xad)

/** Trennt einen Text; Trennstellen sind weiche Trennstriche (U+00AD). */
export type Hyphenator = (text: string) => string

interface HyphenApi {
  hyphenateSync: typeof import('hyphen/de').hyphenateSync
}

/**
 * Lädt die deutschen Trennmuster (Paket `hyphen`, TeX hyph-utf8, de-1996) als eigenen Chunk,
 * nicht im Haupt-Bundle. Leerzeichen und Bindestriche bleiben normale Umbruchstellen.
 */
export async function loadHyphenator(): Promise<Hyphenator> {
  const module: Partial<HyphenApi> & { default?: HyphenApi } = await import('hyphen/de')
  // Das Paket ist CommonJS: je nach Bündler liegen die Funktionen direkt oder unter `default`.
  const hyphenateSync = module.hyphenateSync ?? module.default?.hyphenateSync
  if (typeof hyphenateSync !== 'function') throw new Error('Trennmuster nicht verfügbar')
  return (text) => hyphenateSync(text, { hyphenChar: SOFT_HYPHEN, minWordLength: 6 })
}

let loaded: Hyphenator | null = null
let loading: Promise<void> | null = null
let failed = false
const listeners = new Set<() => void>()

function load(): Promise<void> {
  loading ??= loadHyphenator()
    .then((hyphenator) => {
      loaded = hyphenator
      failed = false
      listeners.forEach((listener) => listener())
    })
    .catch((error: unknown) => {
      // Offline und nicht im Cache: bleibt bei `hyphens: auto` und Schriftverkleinerung.
      // Einmal protokollieren; ein neuer Versuch folgt erst beim nächsten `online`-Ereignis.
      loading = null
      failed = true
      logError('Trennung', error)
      window.addEventListener('online', () => void load(), { once: true })
    })
  return loading
}

/** Wartet, bis der laufende Ladeversuch der Trennmuster abgeschlossen ist (für Tests). */
export function hyphenatorSettled(): Promise<void> {
  if (loaded || failed) return Promise.resolve()
  return load()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!loaded && !loading && !failed) void load()
  return () => {
    listeners.delete(listener)
  }
}

/** Trennfunktion, sobald die Muster geladen sind; bis dahin `null`. */
export function useHyphenator(): Hyphenator | null {
  return useSyncExternalStore(subscribe, () => loaded)
}
