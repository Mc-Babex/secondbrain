import type { GtdStatus } from '../data/types'

const GTD_STATUSES: readonly string[] = ['naechster-schritt', 'warten', 'irgendwann']

export function isGtdStatus(v: unknown): v is GtdStatus {
  return typeof v === 'string' && GTD_STATUSES.includes(v)
}

/**
 * Migration auf GTD (SPEC §3.13), rein und idempotent: eine offene Aufgabe ohne gültiges `gtd`
 * wird „Nächster Schritt“; alles andere (Notizen, Termine, Einkauf, Erledigtes) bleibt unverändert.
 * Ohne Abhängigkeit von `src/data/`, damit auch die Lauf-Skripte sie nutzen können.
 */
export function migrateItem<T extends { type: unknown; status: unknown; gtd?: unknown }>(
  item: T,
): T {
  if (item.type !== 'aufgabe' || item.status !== 'offen' || isGtdStatus(item.gtd)) return item
  return { ...item, gtd: 'naechster-schritt' }
}
