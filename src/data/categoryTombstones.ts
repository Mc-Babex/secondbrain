import { deleteFileFromRemote, getFile, getOutbox, putFileFromRemote } from './localStore'
import { isObj } from './types'

/** Rein lokale Datei (wird vom Sync nie hoch- oder heruntergeladen). */
const CATEGORIES_PATH = 'categories.json'
const PATH = 'local/deleted-categories.json'

/** IDs lokal gelöschter Ablagen, bis `categories.json` erfolgreich hochgeladen wurde. */
export async function getDeletedCategoryIds(): Promise<string[]> {
  const data = (await getFile(PATH))?.data
  if (!isObj(data) || !Array.isArray(data.ids)) return []
  return data.ids.filter((id): id is string => typeof id === 'string')
}

async function write(ids: string[]): Promise<void> {
  if (ids.length === 0) await deleteFileFromRemote(PATH)
  else await putFileFromRemote(PATH, { ids }, 'local')
}

export async function rememberDeletedCategory(id: string): Promise<void> {
  const ids = await getDeletedCategoryIds()
  if (!ids.includes(id)) await write([...ids, id])
}

export async function forgetDeletedCategory(id: string): Promise<void> {
  const ids = await getDeletedCategoryIds()
  if (ids.includes(id)) await write(ids.filter((x) => x !== id))
}

/**
 * Nach einem Upload: vergisst die IDs, die in der hochgeladenen Fassung fehlen – aber nur, wenn
 * keine neuere `categories.json`-Änderung mehr in der Outbox wartet (sie könnte eine Ablage
 * enthalten, die inzwischen gelöscht wurde).
 */
export async function releaseUploadedDeletions(uploaded: unknown): Promise<void> {
  if ((await getOutbox()).some((e) => e.path === CATEGORIES_PATH)) return
  const present = new Set<string>()
  if (isObj(uploaded) && Array.isArray(uploaded.categories)) {
    for (const c of uploaded.categories) if (isObj(c) && typeof c.id === 'string') present.add(c.id)
  }
  const ids = await getDeletedCategoryIds()
  const keep = ids.filter((id) => present.has(id))
  if (keep.length !== ids.length) await write(keep)
}
