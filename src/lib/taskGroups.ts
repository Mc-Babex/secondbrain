import type { Category, Item } from '../data/types'

export const NO_CATEGORY_ID = '__ohne-ablage__'

export interface TaskGroup {
  id: string
  name: string
  items: Item[]
}

export interface TaskView {
  overdue: Item[]
  groups: TaskGroup[]
}

const time = (iso: string): number => Date.parse(iso)

/** Überfällig laut SPEC §3.3: offene Aufgabe, deren geplantes Ende vor `now` liegt. */
export function isOverdue(item: Item, now: Date): boolean {
  if (item.type !== 'aufgabe' || item.status !== 'offen' || !item.schedule) return false
  const end = time(item.schedule.start) + item.schedule.durationMin * 60_000
  return end < now.getTime()
}

function compareInGroup(a: Item, b: Item): number {
  if (a.schedule && b.schedule) return time(a.schedule.start) - time(b.schedule.start)
  if (a.schedule) return -1
  if (b.schedule) return 1
  if (a.important !== b.important) return a.important ? -1 : 1
  return time(a.createdAt) - time(b.createdAt)
}

/**
 * Ordnet die Aufgabenseite: Überfällige (nach Termin) und offene Aufgaben je Ablage.
 * Gruppen in `order`-Reihenfolge, ohne Archiv/Einkauf, leere Gruppen entfallen; Aufgaben mit
 * unbekannter Ablage landen in „Ohne Ablage". Überfällige erscheinen nicht in den Gruppen.
 */
export function buildTaskView(items: Item[], categories: Category[], now: Date): TaskView {
  const open = items.filter((i) => i.type === 'aufgabe' && i.status === 'offen')
  const overdue = open
    .filter((i) => isOverdue(i, now))
    .sort((a, b) => time(a.schedule?.start ?? '') - time(b.schedule?.start ?? ''))
  const rest = open.filter((i) => !isOverdue(i, now))

  const known = new Set(categories.map((c) => c.id))
  const groups: TaskGroup[] = [...categories]
    .filter((c) => c.kind === 'normal')
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ id: c.id, name: c.name, items: rest.filter((i) => i.categoryId === c.id) }))
  const orphans = rest.filter((i) => !known.has(i.categoryId))
  if (orphans.length > 0) groups.push({ id: NO_CATEGORY_ID, name: 'Ohne Ablage', items: orphans })

  return {
    overdue,
    groups: groups
      .filter((g) => g.items.length > 0)
      .map((g) => ({ ...g, items: [...g.items].sort(compareInGroup) })),
  }
}
