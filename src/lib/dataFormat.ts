/** Formatversion des Daten-Repos (`secondbrain.json`, SPEC §3.11); gemeinsam von App und Lauf-Skripten genutzt. */
export const SUPPORTED_DATA_FORMAT = 1

export const DATA_FORMAT_PATH = 'secondbrain.json'

export const MSG_DATA_FORMAT_NEWER =
  'Die Daten wurden mit einer neueren App-Version gespeichert. Bitte App neu laden bzw. aktualisieren.'
export const MSG_DATA_FORMAT_INVALID = 'secondbrain.json im Daten-Repo ist ungültig.'

export type DataFormat = { valid: true; format: number } | { valid: false }

/**
 * Liest die Formatversion aus dem Inhalt von `secondbrain.json`. `undefined` (Datei fehlt) und ein
 * fehlendes Feld `format` ergeben 1; `format` muss sonst eine ganze Zahl ≥ 1 sein.
 */
export function readDataFormat(json: unknown): DataFormat {
  if (json === undefined) return { valid: true, format: 1 }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return { valid: false }
  const format = (json as Record<string, unknown>).format
  if (format === undefined) return { valid: true, format: 1 }
  if (typeof format !== 'number' || !Number.isInteger(format) || format < 1) return { valid: false }
  return { valid: true, format }
}

export function isSupportedDataFormat(json: unknown): boolean {
  const result = readDataFormat(json)
  return result.valid && result.format <= SUPPORTED_DATA_FORMAT
}

/** Meldung, wenn Schreiben nicht erlaubt ist (neueres Format oder ungültige Datei); sonst `null`. */
export function dataFormatProblem(json: unknown): string | null {
  const result = readDataFormat(json)
  if (!result.valid) return MSG_DATA_FORMAT_INVALID
  return result.format > SUPPORTED_DATA_FORMAT ? MSG_DATA_FORMAT_NEWER : null
}
