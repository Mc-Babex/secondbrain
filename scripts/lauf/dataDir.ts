import { existsSync, type Dirent, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Wurzelordner des Code-Repos (`scripts/lauf/` → zwei Ebenen höher). */
export const CODE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Exit-Code für einen fehlenden Datenordner. */
export const EXIT_NO_DATA_DIR = 2

export class DataDirError extends Error {
  readonly exitCode = EXIT_NO_DATA_DIR
}

export interface DataDirOptions {
  argv: readonly string[]
  env: Readonly<Record<string, string | undefined>>
  codeRoot?: string
}

const FALLBACK_NAME = 'secondbrain-daten'

function argValue(argv: readonly string[]): string | undefined {
  const index = argv.indexOf('--daten')
  if (index >= 0) return argv[index + 1]
  const inline = argv.find((a) => a.startsWith('--daten='))
  return inline?.slice('--daten='.length)
}

/** Nachbarordner des Code-Repos mit `secondbrain.json` (das Code-Repo selbst zählt nicht). */
function findNeighbors(codeRoot: string): string[] {
  const code = resolve(codeRoot)
  const parent = dirname(code)
  let entries: Dirent[]
  try {
    entries = readdirSync(parent, { withFileTypes: true })
  } catch {
    throw new DataDirError(
      `Der Ordner neben dem Code-Repo ist nicht lesbar: ${parent}. ` +
        'Pfad mit --daten <pfad> oder SECONDBRAIN_DATEN angeben.',
    )
  }
  return entries
    .map((entry) => resolve(parent, entry.name))
    .filter((dir) => dir !== code && isDirectory(dir) && existsSync(join(dir, 'secondbrain.json')))
    .sort()
}

/** Ordner, auch wenn er über einen Symlink bzw. eine Junction erreichbar ist. */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function neighborOrFallback(codeRoot: string): string {
  const found = findNeighbors(codeRoot)
  if (found.length > 1) {
    throw new DataDirError(
      `Mehrere Daten-Repos neben dem Code-Repo gefunden (${found.join(', ')}). ` +
        'Pfad mit --daten <pfad> oder SECONDBRAIN_DATEN angeben.',
    )
  }
  return found[0] ?? resolve(codeRoot, '..', FALLBACK_NAME)
}

/**
 * Datenordner: `--daten <pfad>` vor `SECONDBRAIN_DATEN` vor einem Nachbarordner des Code-Repos mit
 * `secondbrain.json` vor `../secondbrain-daten`.
 */
export function resolveDataDir({ argv, env, codeRoot = CODE_ROOT }: DataDirOptions): string {
  const fromArg = argValue(argv)
  if (argv.includes('--daten') && !fromArg) {
    throw new DataDirError('Nach --daten fehlt der Pfad zum Datenordner.')
  }
  const dir = resolve(fromArg || env.SECONDBRAIN_DATEN || neighborOrFallback(codeRoot))
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new DataDirError(
      `Datenordner nicht gefunden: ${dir}. Gesucht wird nacheinander: --daten <pfad>, SECONDBRAIN_DATEN, ` +
        `ein Nachbarordner des Code-Repos mit secondbrain.json, ../${FALLBACK_NAME}. ` +
        'Pfad mit --daten <pfad> oder SECONDBRAIN_DATEN angeben.',
    )
  }
  return dir
}
