import type { Category, Item } from '../data/types'

export const NO_CATEGORY_ID = '__ohne-ablage__'

export interface TaskGroup {
  id: string
  name: string
  items: Item[]
}

/** Überfällig laut SPEC §3.3: offene Aufgabe, deren geplantes Ende vor `now` liegt. */
export function isOverdue(item: Item, now: Date): boolean {
  if (item.type !== 'aufgabe' || item.status !== 'offen' || !item.schedule) return false
  const end = Date.parse(item.schedule.start) + item.schedule.durationMin * 60_000
  return end < now.getTime()
}

/**
 * Gruppiert Aufgaben nach Ablage (Reihenfolge laut `order`, ohne Archiv und Einkauf, leere Gruppen
 * entfallen). Aufgaben mit unbekannter Ablage landen in „Ohne Ablage“ am Ende. Die Reihenfolge
 * der Aufgaben innerhalb einer Gruppe bleibt erhalten.
 */
export function groupByCategory(
  items: readonly Item[],
  categories: readonly Category[],
): TaskGroup[] {
  const known = new Set(categories.map((c) => c.id))
  const groups: TaskGroup[] = [...categories]
    .filter((c) => c.kind === 'normal')
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ id: c.id, name: c.name, items: items.filter((i) => i.categoryId === c.id) }))
  const orphans = items.filter((i) => !known.has(i.categoryId))
  if (orphans.length > 0) groups.push({ id: NO_CATEGORY_ID, name: 'Ohne Ablage', items: orphans })
  return groups.filter((g) => g.items.length > 0)
}
