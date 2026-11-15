const KEY = 'secondbrain.pendingSort'

/** So lange wartet die App auf die Antwort der Action (`runs/trigger.json`). */
export const PENDING_MAX_MS = 2 * 60 * 1000

export interface PendingSort {
  requestId: string
  sentAt: string
}

function isPendingSort(value: unknown): value is PendingSort {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.requestId === 'string' && typeof record.sentAt === 'string'
}

/** Offene Anfrage „Jetzt sortieren“ (kein Geheimnis); überlebt Neuladen der App. */
export function savePendingSort(pending: PendingSort): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(pending))
  } catch {
    // Ohne lokalen Speicher bleibt nur der Schutz innerhalb dieser Sitzung.
  }
}

export function clearPendingSort(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // siehe savePendingSort
  }
}

/** Gibt die offene Anfrage zurück, wenn sie jünger als 2 Min. ist; sonst wird sie gelöscht. */
export function loadPendingSort(now: Date): PendingSort | null {
  let pending: PendingSort | null
  try {
    const raw = localStorage.getItem(KEY)
    const value: unknown = raw === null ? null : JSON.parse(raw)
    pending = isPendingSort(value) ? value : null
  } catch {
    pending = null
  }
  if (pending === null) return null
  const age = now.getTime() - new Date(pending.sentAt).getTime()
  if (!Number.isFinite(age) || age < 0 || age >= PENDING_MAX_MS) {
    clearPendingSort()
    return null
  }
  return pending
}
