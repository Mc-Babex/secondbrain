import { mkdir, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { InboxEntry } from '../../src/data/types'
import { writeJsonFile } from './dataRepo'
import { printResult, type LaufResult } from './git'
import {
  createdAtOf,
  inboxIdOf,
  loadTestSpec,
  testCategories,
  testExistingItems,
  testSetFromArgs,
} from './testspec'

/** Zuordnung Inbox-ID → Fallnummer (`.lauf/testfaelle.json`). */
export interface TestCaseMap {
  cases: { inboxId: string; nr: number }[]
}

/** `lauf:start` leert `.lauf/`; die Kopie hier bleibt für Termine und Vergleich erhalten. */
export const BACKUP_DIR = '.testdaten'

function targetFromArgs(argv: readonly string[]): string | null {
  const index = argv.indexOf('--ziel')
  const value = index >= 0 ? argv[index + 1] : undefined
  return value && !value.startsWith('--') ? resolve(value) : null
}

async function isEmptyOrMissing(dir: string): Promise<boolean> {
  try {
    return (await readdir(dir)).length === 0
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return true
    throw error
  }
}

/** `lauf:testdaten`: Exit 0 = Ordner angelegt, 1 = Aufruf- oder Ordnerfehler. */
export async function runTestdaten({ argv }: { argv: readonly string[] }): Promise<LaufResult> {
  const dir = targetFromArgs(argv)
  if (!dir) return { exitCode: 1, lines: ['Nach --ziel fehlt der Pfad zum Testordner.'] }
  if (!(await isEmptyOrMissing(dir))) {
    return { exitCode: 1, lines: [`Zielordner ist nicht leer: ${dir}`] }
  }

  const set = testSetFromArgs(argv)
  if (set === null) return { exitCode: 1, lines: ['Nach --satz muss 1 oder 2 stehen.'] }
  const spec = loadTestSpec(undefined, set)
  await mkdir(dir, { recursive: true })
  for (const c of spec.cases) {
    const entry: InboxEntry = {
      id: inboxIdOf(c.nr),
      text: c.text,
      createdAt: createdAtOf(c.nr),
      source: 'text',
    }
    await writeJsonFile(dir, `inbox/${entry.id}.json`, entry)
  }
  for (const item of testExistingItems(spec))
    await writeJsonFile(dir, `items/${item.id}.json`, item)
  await writeJsonFile(dir, 'categories.json', { categories: testCategories(spec) })
  await writeJsonFile(dir, 'settings.json', {
    planningWindow: spec.planningWindow,
    ...(spec.pause === undefined ? {} : { pause: spec.pause }),
    timezone: 'Europe/Berlin',
  })
  const satz = set === 2 ? ' --satz 2' : ''
  const caseMap: TestCaseMap = {
    cases: spec.cases.map((c) => ({ inboxId: inboxIdOf(c.nr), nr: c.nr })),
  }
  for (const folder of ['.lauf', BACKUP_DIR]) {
    await writeJsonFile(dir, `${folder}/termine.json`, { events: spec.events })
    await writeJsonFile(dir, `${folder}/testfaelle.json`, caseMap)
  }

  return {
    exitCode: 0,
    lines: [
      `Testordner angelegt: ${dir} (${spec.cases.length} Eingangskorb-Einträge)`,
      `Trockenlauf: npm run lauf:start -- --daten "${dir}" --ohne-git --jetzt ${spec.now}`,
      `Danach planen: npm run lauf:planen -- --daten "${dir}" --jetzt ${spec.now}`,
      `Vergleich: npm run lauf:vergleich -- --daten "${dir}"${satz}`,
      `Hinweis: lauf:start leert .lauf/; Termine und Fallzuordnung liegen als Kopie in ${BACKUP_DIR}/.`,
    ],
  }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  printResult(await runTestdaten({ argv: process.argv.slice(2) }))
}
