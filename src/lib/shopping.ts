import type { Item } from '../data/types'

/** Vergleichsform eines Einkaufsartikels laut SPEC §3.9: klein, getrimmt, Leerzeichen zusammengefasst. */
export function normalizeArticle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Vorhandener Artikel der Einkaufsliste mit gleichem Titel (abgehakt oder nicht) oder `undefined`. */
export function findSameArticle(
  items: readonly Item[],
  title: string,
  shoppingCategoryId: string,
): Item | undefined {
  const wanted = normalizeArticle(title)
  return items.find(
    (item) => item.categoryId === shoppingCategoryId && normalizeArticle(item.title) === wanted,
  )
}
