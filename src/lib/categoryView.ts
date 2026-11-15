import type { Category, Item, ItemType } from '../data/types'

const TYPE_RANK: Readonly<Record<ItemType, number>> = { aufgabe: 0, termin: 1, notiz: 2 }

function time(iso: string | null): number {
  const value = iso === null ? NaN : Date.parse(iso)
  return Number.isNaN(value) ? -Infinity : value
}

/** Offene Einträge einer Ablage, gefiltert nach Suchtext (Titel/Notizen), Aufgaben vor Terminen vor Notizen. */
export function itemsOfCategory(items: readonly Item[], categoryId: string, query: string): Item[] {
  const needle = query.trim().toLowerCase()
  return items
    .filter((item) => item.categoryId === categoryId && item.status === 'offen')
    .filter(
      (item) =>
        needle === '' ||
        item.title.toLowerCase().includes(needle) ||
        item.notes.toLowerCase().includes(needle),
    )
    .sort((a, b) => TYPE_RANK[a.type] - TYPE_RANK[b.type] || time(b.createdAt) - time(a.createdAt))
}

/** Anzahl je Ablage: normal = offene Einträge, Einkauf und Archiv = alle Einträge darin. */
export function countByCategory(
  items: readonly Item[],
  categories: readonly Category[],
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const category of categories) {
    counts[category.id] = items.filter(
      (item) =>
        item.categoryId === category.id && (category.kind !== 'normal' || item.status === 'offen'),
    ).length
  }
  return counts
}

/** Einträge des Archivs, zuletzt erledigte zuerst; ohne `completedAt` am Ende. */
export function archiveItems(items: readonly Item[], archiveId: string): Item[] {
  return items
    .filter((item) => item.categoryId === archiveId)
    .sort((a, b) => {
      const ta = time(a.completedAt)
      const tb = time(b.completedAt)
      if (ta === tb) return 0
      return tb > ta ? 1 : -1
    })
}
