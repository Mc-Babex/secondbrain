import { pathToFileURL } from 'node:url'
import { isObj, type Item } from '../../src/data/types'
import { readRepoFile } from './dataRepo'
import { isPlanFile, type PlanEntry, type PlanFile } from './files'
import { dataDirOrResult, printResult, type LaufResult } from './git'
import { BACKUP_DIR, type TestCaseMap } from './testdaten'
import {
  existingIdOf,
  loadTestSpec,
  testSetFromArgs,
  type ExpectedItem,
  type TestCase,
  type TestSpec,
} from './testspec'

const isCaseMap = (v: unknown): v is TestCaseMap =>
  isObj(v) &&
  Array.isArray(v.cases) &&
  v.cases.every((c) => isObj(c) && typeof c.inboxId === 'string' && typeof c.nr === 'number')

function diffSchedule(actual: Item['schedule'], expected: ExpectedItem['schedule']): string[] {
  if (expected === undefined) return []
  if (expected === null) {
    return actual ? [`Zeit ${actual.start} (${actual.durationMin} Min.) statt kein Termin`] : []
  }
  if (!actual) return [`kein Termin statt ${expected.start}`]
  if (actual.start === expected.start && actual.durationMin === expected.durationMin) return []
  return [
    `Zeit ${actual.start} (${actual.durationMin} Min.) statt ${expected.start} (${expected.durationMin} Min.)`,
  ]
}

function diffDuration(actual: number | null, expected: ExpectedItem['durationMin']): string[] {
  if (typeof expected === 'number') {
    return actual === expected ? [] : [`Dauer ${actual} statt ${expected}`]
  }
  if (Array.isArray(expected)) {
    const inRange = actual !== null && actual >= expected[0] && actual <= expected[1]
    return inRange ? [] : [`Dauer ${actual} statt ${expected[0]}–${expected[1]}`]
  }
  return []
}

const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim().toLowerCase()

function diffTexts(actual: Item, expected: ExpectedItem): string[] {
  const out: string[] = []
  if (expected.titleMaxLen !== undefined && actual.title.length > expected.titleMaxLen) {
    out.push(`Titel ${actual.title.length} Zeichen statt höchstens ${expected.titleMaxLen}`)
  }
  if (expected.notesEmpty && actual.notes.trim() !== '') out.push('Notiz nicht leer')
  const notes = normalize(actual.notes)
  for (const part of expected.notesContains ?? []) {
    if (!notes.includes(normalize(part))) out.push(`Notiz enthält nicht „${part}“`)
  }
  return out
}

function diffItem(actual: Item, expected: ExpectedItem): string[] {
  const out: string[] = diffTexts(actual, expected)
  if (expected.type !== undefined && actual.type !== expected.type) {
    out.push(`Art ${actual.type} statt ${expected.type}`)
  }
  if (expected.categoryId !== undefined && actual.categoryId !== expected.categoryId) {
    out.push(`Ablage ${actual.categoryId} statt ${expected.categoryId}`)
  }
  if (expected.important !== undefined && actual.important !== expected.important) {
    out.push(`wichtig ${actual.important} statt ${expected.important}`)
  }
  if (expected.checked !== undefined && actual.checked !== expected.checked) {
    out.push(`checked ${actual.checked} statt ${expected.checked}`)
  }
  out.push(...diffDuration(actual.durationMin, expected.durationMin))
  out.push(...diffSchedule(actual.schedule, expected.schedule))
  return out
}

/** Abweichungen eines Falls gegen die Erwartung; leer = bestanden. */
export function diffCase(c: TestCase, entry: PlanEntry | undefined): string[] {
  if (!entry) return ['kein Eintrag im Plan']
  const expected = c.expect
  if (expected[0]?.sortError) {
    if (entry.result !== 'sortError') return ['kein sortError, Eintrag wurde einsortiert']
    const out: string[] = []
    if (!entry.message) out.push('sortError ohne Hinweistext')
    if (entry.items.length > 0) out.push(`sortError, aber ${entry.items.length} Einträge angelegt`)
    if (entry.newCategory) out.push(`sortError, aber neue Ablage ${entry.newCategory.id} angelegt`)
    return out
  }
  if (entry.result !== 'ok') return [`sortError statt Einsortierung (${entry.message ?? ''})`]
  if (entry.items.length !== expected.length) {
    return [`${entry.items.length} Einträge statt ${expected.length}`]
  }
  const out: string[] = []
  if (c.newCategory) {
    const created = entry.newCategory
    if (!created || created.id !== c.newCategory.id || created.name !== c.newCategory.name) {
      out.push(`neue Ablage ${created ? created.id : 'fehlt'} statt ${c.newCategory.id}`)
    }
  }
  if (!c.newCategory && entry.newCategory) {
    out.push(`unerwartete neue Ablage ${entry.newCategory.id}`)
  }
  entry.items.forEach((item, i) => out.push(...diffItem(item, expected[i])))
  return out
}

/** Jede Inbox-ID des Plans genau einmal, bekannt, und alle Fälle abgedeckt. */
export function planProblems(entries: readonly PlanEntry[], knownIds: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const { inboxId } of entries) {
    if (seen.has(inboxId)) out.push(`Plan: ${inboxId} kommt mehrfach vor`)
    else if (!knownIds.includes(inboxId)) out.push(`Plan: ${inboxId} ist unbekannt`)
    seen.add(inboxId)
  }
  for (const id of knownIds) {
    if (!seen.has(id)) out.push(`Plan: Eintrag für ${id} fehlt`)
  }
  if (entries.length !== knownIds.length) {
    out.push(`Plan: ${entries.length} Einträge statt ${knownIds.length}`)
  }
  return out
}

/** Abweichungen bei vorhandenen Aufgaben, die der Lauf einplanen soll (SPEC §8.4 e). */
export function existingProblems(spec: TestSpec, plan: PlanFile): string[] {
  const out: string[] = []
  ;(spec.existingItems ?? []).forEach((e, index) => {
    if (e.expectSchedule === undefined) return
    const planned = plan.existing?.find((x) => x.itemId === existingIdOf(index))
    const expected = e.expectSchedule
    if (!planned) out.push(`Vorhanden „${e.title}“: kein Termin statt ${expected.start}`)
    else if (planned.start !== expected.start || planned.durationMin !== expected.durationMin) {
      out.push(
        `Vorhanden „${e.title}“: Zeit ${planned.start} (${planned.durationMin} Min.) statt ${expected.start} (${expected.durationMin} Min.)`,
      )
    }
  })
  return out
}

const shorten = (text: string): string => (text.length > 40 ? `${text.slice(0, 40)}…` : text)

async function loadJson(dir: string, paths: string[]): Promise<unknown> {
  for (const path of paths) {
    const file = await readRepoFile(dir, path)
    if (file && file.parseError === undefined) return file.data
  }
  return undefined
}

/** `lauf:vergleich`: Exit 0 = alle Fälle bestanden, 1 = Abweichungen oder fehlende Dateien. */
export async function runVergleich(options: {
  argv: readonly string[]
  env: Readonly<Record<string, string | undefined>>
}): Promise<LaufResult> {
  const dir = dataDirOrResult(options)
  if (typeof dir !== 'string') return dir

  const plan = await loadJson(dir, ['.lauf/plan.json'])
  if (!isPlanFile(plan)) {
    return { exitCode: 1, lines: ['.lauf/plan.json fehlt oder ist ungültig (zuerst lauf:planen).'] }
  }
  const map = await loadJson(dir, ['.lauf/testfaelle.json', `${BACKUP_DIR}/testfaelle.json`])
  if (!isCaseMap(map)) {
    return {
      exitCode: 1,
      lines: ['.lauf/testfaelle.json fehlt (Ordner mit lauf:testdaten anlegen).'],
    }
  }

  const set = testSetFromArgs(options.argv)
  if (set === null) return { exitCode: 1, lines: ['Nach --satz muss 1 oder 2 stehen.'] }
  const spec = loadTestSpec(undefined, set)
  const lines: string[] = []
  let passed = 0
  for (const c of spec.cases) {
    const inboxId = map.cases.find((m) => m.nr === c.nr)?.inboxId
    const problems = diffCase(
      c,
      plan.entries.find((e) => e.inboxId === inboxId),
    )
    if (problems.length === 0) {
      passed++
      lines.push(`✓ ${c.nr}`)
    } else {
      lines.push(`✗ ${c.nr} ${shorten(c.text)}: ${problems.join('; ')}`)
    }
  }
  const structure = planProblems(
    plan.entries,
    spec.cases.flatMap((c) => map.cases.find((m) => m.nr === c.nr)?.inboxId ?? []),
  )
  for (const problem of structure) lines.push(`✗ ${problem}`)
  const existing = existingProblems(spec, plan)
  for (const problem of existing) lines.push(`✗ ${problem}`)
  lines.push(`ERGEBNIS: ${passed}/${spec.cases.length}`)
  const ok = passed === spec.cases.length && structure.length === 0 && existing.length === 0
  return { exitCode: ok ? 0 : 1, lines }
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  printResult(await runVergleich({ argv: process.argv.slice(2), env: process.env }))
}
