import { deleteFileFromRemote, getFile, putFileFromRemote } from './localStore'
import { isObj } from './types'

/** Rein lokale Datei (wird vom Sync nie hoch- oder heruntergeladen). */
const PATH = 'local/categories-seeded.json'

/**
 * Wurde die lokale `categories.json` aus den Standardwerten erzeugt (ohne dass je eine Remote-Fassung
 * vorlag), stehen hier die IDs der Ablagen, die der Nutzer seitdem angelegt oder geändert hat.
 * `null`: die lokale Datei stammt nicht (mehr) aus den Standardwerten. Fehlt die Marke oder ist sie
 * kaputt, ist das ebenfalls `null` und es gilt der normale Merge (lokal gewinnt).
 */
export async function getSeededTouched(): Promise<string[] | null> {
  const data = (await getFile(PATH))?.data
  if (!isObj(data) || !Array.isArray(data.touched)) return null
  return data.touched.filter((id): id is string => typeof id === 'string')
}

export async function markSeeded(): Promise<void> {
  if ((await getSeededTouched()) === null) await putFileFromRemote(PATH, { touched: [] }, 'local')
}

/** Merkt eine ausdrücklich geänderte oder neue Ablage; ohne Standardwert-Herkunft ohne Wirkung. */
export async function touchSeeded(id: string): Promise<void> {
  const touched = await getSeededTouched()
  if (touched !== null && !touched.includes(id)) {
    await putFileFromRemote(PATH, { touched: [...touched, id] }, 'local')
  }
}

export async function clearSeeded(): Promise<void> {
  if ((await getSeededTouched()) !== null) await deleteFileFromRemote(PATH)
}
