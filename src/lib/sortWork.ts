/**
 * Gibt es Arbeit für den Lauf? Nur Inbox-Einträge ohne `sortError` (egal welchen Werts) zählen
 * (SPEC §6.3/§8.2, Phase 9); vorhandene Aufgaben lösen keinen Lauf aus. App und Lauf entscheiden damit gleich.
 */
export function hasSortWork(inbox: readonly { id: string; sortError?: unknown }[]): boolean {
  return inbox.some((entry) => entry.sortError === undefined)
}
