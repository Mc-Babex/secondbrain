/** Lokales Fehlerprotokoll für die Diagnose (SPEC §6.5). Enthält nie Geheimnisse. */

export interface ErrorLogEntry {
  /** ISO-Zeitpunkt des letzten Auftretens */
  at: string
  /** Bereich, z. B. "Sync", "Google" */
  area: string
  message: string
  count: number
}

const STORAGE_KEY = 'secondbrain.errorLog'
const MAX_ENTRIES = 20
const MAX_MESSAGE = 300
const REMOVED = '[entfernt]'

const PATTERNS: RegExp[] = [
  /github_pat_[A-Za-z0-9_]+/g,
  /\bgh[pousr]_[A-Za-z0-9]+/g,
  /ya29\.[A-Za-z0-9._-]+/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /"?(?:access_|refresh_)?token"?\s*[:=]\s*"?[^\s"&,}]+/gi,
  /"?authorization"?\s*[:=]\s*"?(?:(?:Basic|Digest)\s+)?[^\s"&,}]+/gi,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
]
const URL_QUERY = /(https?:\/\/[^\s?#]*)[?#]\S*/g

/** Entfernt Token, Query-Strings/Fragmente und E-Mail-Adressen und kürzt auf 300 Zeichen. */
export function sanitizeMessage(text: string): string {
  let result = text.replace(URL_QUERY, `$1${REMOVED}`)
  for (const pattern of PATTERNS) result = result.replace(pattern, REMOVED)
  return result.length > MAX_MESSAGE ? `${result.slice(0, MAX_MESSAGE)}…` : result
}

function isEntry(value: unknown): value is ErrorLogEntry {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.at === 'string' &&
    typeof v.area === 'string' &&
    typeof v.message === 'string' &&
    typeof v.count === 'number'
  )
}

export function getErrorLog(): ErrorLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, MAX_ENTRIES) : []
  } catch {
    return []
  }
}

function save(entries: ErrorLogEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Das Protokoll darf nie selbst einen Fehler auslösen.
  }
}

/** Protokolliert einen Fehler (bereinigt, neueste zuerst, gleiche Meldung in Folge ⇒ Zähler). */
export function logError(area: string, error: unknown): void {
  try {
    const raw = error instanceof Error ? error.message || error.name : String(error)
    const message = sanitizeMessage(raw)
    const entries = getErrorLog()
    const first = entries[0]
    const at = new Date().toISOString()
    if (first && first.area === area && first.message === message) {
      entries[0] = { ...first, at, count: first.count + 1 }
    } else {
      entries.unshift({ at, area, message, count: 1 })
    }
    save(entries.slice(0, MAX_ENTRIES))
  } catch {
    // siehe oben
  }
}

export function clearErrorLog(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // siehe oben
  }
}

/** Protokolliert unbehandelte Fehler und abgelehnte Promises der ganzen App. */
export function installGlobalErrorLogging(): () => void {
  const onError = (event: ErrorEvent): void => logError('App', event.error ?? event.message)
  const onRejection = (event: PromiseRejectionEvent): void => logError('App', event.reason)
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}
