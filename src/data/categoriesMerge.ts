import { isObj } from './types'

const idOf = (entry: unknown): string | null =>
  isObj(entry) && typeof entry.id === 'string' ? entry.id : null

const isSingleKind = (kind: unknown): kind is string => kind === 'einkauf' || kind === 'archiv'

function mustKeep(
  id: string,
  entry: unknown,
  referencedIds: ReadonlySet<string>,
  singleKinds: ReadonlySet<string>,
): boolean {
  if (referencedIds.has(id)) return true
  return isObj(entry) && isSingleKind(entry.kind) && !singleKinds.has(entry.kind)
}

/**
 * Lokale Fassung stammt aus den Standardwerten: Die Remote-Fassung gilt, nur ausdrücklich geänderte
 * (Name/Beschreibung lokal, Reihenfolge remote) und neu angelegte Ablagen kommen vom Nutzer.
 * Neue mit kollidierender `order` bekommen die nächste freie hinter der größten Remote-`order`.
 * Eine unberührte, remote fehlende Standard-Ablage bleibt trotzdem, wenn lokale Einträge auf sie
 * zeigen oder sie die einzige ihres Typs `einkauf`/`archiv` wäre (genau eine je Typ, SPEC §3.5).
 */
function mergeSeeded(
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
  localList: readonly unknown[],
  remoteList: readonly unknown[],
  deletedIds: readonly string[],
  touched: readonly string[],
  referencedIds: ReadonlySet<string>,
): unknown {
  const localById = new Map<string, unknown>()
  for (const entry of localList) {
    const id = idOf(entry)
    if (id !== null) localById.set(id, entry)
  }
  const deleted = new Set(deletedIds)
  const remoteIds = new Set<string>()
  const used = new Set<number>()
  const singleKinds = new Set<string>()
  let max = 0
  const result: unknown[] = []
  for (const entry of remoteList) {
    const id = idOf(entry)
    if (id !== null && deleted.has(id)) continue
    if (id !== null) remoteIds.add(id)
    if (isObj(entry) && typeof entry.order === 'number') {
      used.add(entry.order)
      max = Math.max(max, entry.order)
    }
    if (isObj(entry) && isSingleKind(entry.kind)) singleKinds.add(entry.kind)
    const own = id !== null && touched.includes(id) ? localById.get(id) : undefined
    result.push(
      isObj(own) && isObj(entry) ? { ...entry, ...own, order: entry.order ?? own.order } : entry,
    )
  }
  for (const [id, entry] of localById) {
    if (remoteIds.has(id) || deleted.has(id)) continue
    if (!touched.includes(id) && !mustKeep(id, entry, referencedIds, singleKinds)) continue
    if (isObj(entry) && isSingleKind(entry.kind)) singleKinds.add(entry.kind)
    if (!isObj(entry) || typeof entry.order !== 'number' || !used.has(entry.order)) {
      if (isObj(entry) && typeof entry.order === 'number') used.add(entry.order)
      result.push(entry)
      continue
    }
    max = Math.max(max, ...used) + 1
    used.add(max)
    result.push({ ...entry, order: max })
  }
  return { ...remote, ...local, categories: result }
}

/**
 * Führt lokale und Remote-Fassung von `categories.json` nach `id` zusammen: Die lokale Fassung gilt
 * für alle lokal bekannten Ablagen; nur remote vorhandene Ablagen kommen hinzu, außer sie
 * wurden lokal gelöscht. Unbekannte Felder (Datei, Ablage) bleiben erhalten; bei Dateifeldern gilt lokal.
 * Ist eine Seite keine gültige Datei, gewinnt die lokale Fassung unverändert.
 */
export function mergeCategoriesFile(
  local: unknown,
  remote: unknown,
  deletedIds: readonly string[],
  seededTouched: readonly string[] | null = null,
  referencedIds: ReadonlySet<string> = new Set(),
): unknown {
  if (!isObj(local) || !Array.isArray(local.categories)) return local
  if (!isObj(remote) || !Array.isArray(remote.categories)) return local
  if (seededTouched !== null)
    return mergeSeeded(
      local,
      remote,
      local.categories,
      remote.categories,
      deletedIds,
      seededTouched,
      referencedIds,
    )
  const known = new Set<string>(deletedIds)
  for (const entry of local.categories)
    if (isObj(entry) && typeof entry.id === 'string') known.add(entry.id)
  // Gleiche ID lokal und remote (auch bei beidseitig neu angelegt): die lokale Fassung gewinnt.
  // Remote-only-Einträge, die nicht als Ablage gültig sind, bleiben roh erhalten (sonst würde der
  // Upload sie remote löschen); sie werden von der App nur nicht angezeigt.
  const added = remote.categories.filter((entry) => {
    const id = isObj(entry) && typeof entry.id === 'string' ? entry.id : null
    if (id !== null && known.has(id)) return false
    if (id !== null) known.add(id)
    return true
  })
  return { ...remote, ...local, categories: [...local.categories, ...added] }
}
