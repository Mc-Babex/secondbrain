import { pathToFileURL } from 'node:url'
import { DataDirError, resolveDataDir } from './dataDir'
import { readDataFormatProblem, readDataRepo } from './dataRepo'
import { validateDataRepo } from './validate'

export interface PruefenResult {
  exitCode: number
  lines: string[]
}

export interface PruefenOptions {
  argv: readonly string[]
  env: Readonly<Record<string, string | undefined>>
  codeRoot?: string
}

/** `lauf:pruefen`: Exit 0 = OK, 1 = Prüffehler, 2 = Datenordner fehlt. */
export async function runPruefen(options: PruefenOptions): Promise<PruefenResult> {
  let dataDir: string
  try {
    dataDir = resolveDataDir(options)
  } catch (error) {
    if (error instanceof DataDirError) return { exitCode: error.exitCode, lines: [error.message] }
    throw error
  }
  const formatProblem = await readDataFormatProblem(dataDir)
  if (formatProblem !== null) return { exitCode: 1, lines: [formatProblem] }
  const files = await readDataRepo(dataDir)
  const errors = validateDataRepo(files)
  if (errors.length > 0) {
    return { exitCode: 1, lines: errors.map((e) => `${e.path}: ${e.message}`) }
  }
  const count =
    files.inbox.length +
    files.items.length +
    files.suggestions.length +
    [files.categories, files.settings, files.lastRun].filter((f) => f !== null).length
  return { exitCode: 0, lines: [`OK (${count} Dateien)`] }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  const result = await runPruefen({ argv: process.argv.slice(2), env: process.env })
  for (const line of result.lines) {
    if (result.exitCode === 0) console.log(line)
    else console.error(line)
  }
  process.exitCode = result.exitCode
}
