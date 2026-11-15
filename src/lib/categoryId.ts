const REPLACEMENTS: Readonly<Record<string, string>> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

/** Ablagen-ID aus dem Namen laut SPEC §3.5; bei Kollision wird `-2`, `-3` … angehängt. */
export function categoryIdFromName(name: string, existingIds: readonly string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[äöüß]/g, (c) => REPLACEMENTS[c])
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'ablage'
  if (!existingIds.includes(base)) return base
  let n = 2
  while (existingIds.includes(`${base}-${n}`)) n++
  return `${base}-${n}`
}
