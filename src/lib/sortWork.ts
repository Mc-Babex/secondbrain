import type { Item } from '../data/types'

/** SPEC §8.4 e: offene, wichtige Aufgabe ohne Termin. */
export function isPhaseEItem(item: Item): boolean {
  return (
    item.type === 'aufgabe' && item.status === 'offen' && item.important && item.schedule === null
  )
}

/**
 * Gibt es Arbeit für den Lauf? Inbox-Einträge zählen nur ohne `sortError` (egal welchen Werts),
 * dazu kommen Aufgaben nach §8.4 e. App und Lauf entscheiden damit gleich.
 */
export function hasSortWork(
  inbox: readonly { id: string; sortError?: unknown }[],
  items: readonly Item[],
): boolean {
  return inbox.some((entry) => entry.sortError === undefined) || items.some(isPhaseEItem)
}
