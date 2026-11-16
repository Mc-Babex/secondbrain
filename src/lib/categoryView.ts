import type { Category, Item, ItemType, Project } from '../data/types'

const TYPE_RANK: Readonly<Record<ItemType, number>> = { aufgabe: 0, termin: 1, notiz: 2 }

function time(iso: string | null): number {
  const value = iso === null ? NaN : Date.parse(iso)
  return Number.isNaN(value) ? -Infinity : value
}

/** Offene Einträge einer Ablage, gefiltert nach Suchtext (Titel/Notizen), Aufgaben vor Terminen vor Notizen. */
export function itemsOfCategory(
  items: readonly Item[],
  categoryId: string,
  query: string,
  projects: readonly Project[] = [],
): Item[] {
  const needle = query.trim().toLowerCase()
  const projectIds = new Set(projects.map((p) => p.id))
  return items
    .filter((item) => item.categoryId === categoryId && item.status === 'offen')
    .filter((item) => !item.projectId || !projectIds.has(item.projectId))
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

/** Aktive Projekte einer Ablage, nach Titel. */
export function activeProjectsOf(projects: readonly Project[], categoryId: string): Project[] {
  return projects
    .filter((p) => p.status === 'aktiv' && p.categoryId === categoryId)
    .sort((a, b) => a.title.localeCompare(b.title, 'de') || (a.id < b.id ? -1 : 1))
}

/** Mit dem Projekt archivierte Schritte (`archivedWithProject`) im Archiv, nach `projectOrder`. */
export function archivedStepsOf(
  project: Pick<Project, 'id'>,
  items: readonly Item[],
  archiveId: string,
): Item[] {
  return items
    .filter(
      (i) =>
        i.categoryId === archiveId && i.projectId === project.id && i.archivedWithProject === true,
    )
    .sort(
      (a, b) =>
        (a.projectOrder ?? Infinity) - (b.projectOrder ?? Infinity) || (a.id < b.id ? -1 : 1),
    )
}

/** Abgeschlossene Projekte, zuletzt abgeschlossene zuerst; ohne `completedAt` am Ende. */
export function completedProjects(projects: readonly Project[]): Project[] {
  return projects
    .filter((p) => p.status === 'erledigt')
    .sort((a, b) => time(b.completedAt) - time(a.completedAt) || (a.id < b.id ? -1 : 1))
}

/**
 * Einträge des Archivs, zuletzt erledigte zuerst; ohne `completedAt` am Ende. Mit `projects`
 * entfallen die mit einem abgeschlossenen Projekt archivierten Schritte (sie stehen beim Projekt).
 */
export function archiveItems(
  items: readonly Item[],
  archiveId: string,
  projects: readonly Project[] = [],
): Item[] {
  const grouped = new Set(completedProjects(projects).map((p) => p.id))
  return items
    .filter((item) => item.categoryId === archiveId)
    .filter(
      (item) =>
        !(item.archivedWithProject === true && item.projectId && grouped.has(item.projectId)),
    )
    .sort((a, b) => {
      const ta = time(a.completedAt)
      const tb = time(b.completedAt)
      if (ta === tb) return 0
      return tb > ta ? 1 : -1
    })
}
