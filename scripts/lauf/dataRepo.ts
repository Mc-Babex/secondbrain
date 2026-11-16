import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { defaultCategories, defaultSettings } from '../../src/data/defaults'
import {
  isCategoriesFile,
  isSettings,
  type CategoriesFile,
  type Settings,
} from '../../src/data/types'
import { DATA_FORMAT_PATH, dataFormatProblem } from '../../src/lib/dataFormat'
import type { LaufResult } from './git'
import type { DataRepoFiles, RepoFile } from './validate'

const NOT_FOUND = 'ENOENT'

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === NOT_FOUND
}

/** Löst einen relativen Pfad (mit `/`) innerhalb des Datenordners auf; Ausbrüche sind verboten. */
function inside(dataDir: string, relPath: string): string {
  const full = resolve(dataDir, relPath)
  const rel = relative(resolve(dataDir), full)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Pfad liegt außerhalb des Datenordners: ${relPath}`)
  }
  return full
}

/** Liest eine Datei und parst sie als JSON; `null`, wenn sie nicht existiert. */
export async function readRepoFile(dataDir: string, relPath: string): Promise<RepoFile | null> {
  let text: string
  try {
    text = await readFile(inside(dataDir, relPath), 'utf-8')
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
  try {
    return { path: relPath, data: JSON.parse(text) as unknown }
  } catch (error) {
    return {
      path: relPath,
      data: undefined,
      parseError: error instanceof Error ? error.message : String(error),
    }
  }
}

/** Meldung zu `secondbrain.json` (neueres Format oder ungültig); `null`, wenn Schreiben erlaubt ist. */
export async function readDataFormatProblem(dataDir: string): Promise<string | null> {
  const file = await readRepoFile(dataDir, DATA_FORMAT_PATH)
  if (file === null) return null
  return dataFormatProblem(file.parseError === undefined ? file.data : null)
}

/** Abbruch-Ergebnis (Exit 1) für schreibende Lauf-Skripte, wenn das Datenformat nicht unterstützt wird. */
export async function dataFormatBlock(dataDir: string): Promise<LaufResult | null> {
  const problem = await readDataFormatProblem(dataDir)
  return problem === null ? null : { exitCode: 1, lines: [problem] }
}

/** Liest alle Dateien eines Unterordners; nicht-JSON-Dateien werden ungeparst gemeldet. */
async function readFolder(dataDir: string, folder: string): Promise<RepoFile[]> {
  let names: string[]
  try {
    names = (await readdir(join(dataDir, folder))).sort()
  } catch (error) {
    if (isNotFound(error)) return []
    throw error
  }
  const files: RepoFile[] = []
  for (const name of names) {
    if (name === '.gitkeep') continue // Platzhalter leerer Ordner (Vorlage), kein Datensatz
    const relPath = `${folder}/${name}`
    if (!name.endsWith('.json')) files.push({ path: relPath, data: undefined })
    else {
      const file = await readRepoFile(dataDir, relPath)
      if (file) files.push(file)
    }
  }
  return files
}

/** Liest inbox/, items/, suggestions/, projects/, categories.json, settings.json und runs/last.json roh. */
export async function readDataRepo(dataDir: string): Promise<DataRepoFiles> {
  return {
    inbox: await readFolder(dataDir, 'inbox'),
    items: await readFolder(dataDir, 'items'),
    suggestions: await readFolder(dataDir, 'suggestions'),
    projects: await readFolder(dataDir, 'projects'),
    categories: await readRepoFile(dataDir, 'categories.json'),
    settings: await readRepoFile(dataDir, 'settings.json'),
    lastRun: await readRepoFile(dataDir, 'runs/last.json'),
  }
}

/** Ablagen; fehlt die Datei, gelten die Standard-Ablagen (SPEC §3.1). */
export async function readCategories(dataDir: string): Promise<CategoriesFile> {
  const file = await readRepoFile(dataDir, 'categories.json')
  if (!file) return defaultCategories()
  if (!isCategoriesFile(file.data)) throw new Error('categories.json ist ungültig.')
  return file.data
}

/** Einstellungen; fehlt die Datei, gelten die Standardwerte (SPEC §3.1). */
export async function readSettings(dataDir: string): Promise<Settings> {
  const file = await readRepoFile(dataDir, 'settings.json')
  if (!file) return defaultSettings()
  if (!isSettings(file.data)) throw new Error('settings.json ist ungültig.')
  return file.data
}

/** Schreibt JSON (UTF-8, 2 Leerzeichen, abschließendes `\n`) und legt Ordner bei Bedarf an. */
export async function writeJsonFile(
  dataDir: string,
  relPath: string,
  data: unknown,
): Promise<void> {
  const full = inside(dataDir, relPath)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
}

/** Löscht eine einzelne Datei; eine fehlende Datei ist kein Fehler. */
export async function deleteFile(dataDir: string, relPath: string): Promise<void> {
  await rm(inside(dataDir, relPath), { force: true })
}
