// Testsätze aus dem JSON-Block von docs/sortier-tests.md (Aufgaben 19 und 22).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isCategory, isObj, type Category, type Item } from '../../src/data/types'
import { CODE_ROOT } from './dataDir'
import type { CalendarEvent } from './files'

export interface ExpectedItem {
  type?: string
  categoryId?: string
  important?: boolean
  durationMin?: number | [number, number]
  schedule?: { start: string; durationMin: number } | null
  checked?: boolean
  sortError?: boolean
  /** Titel höchstens so lang (SPEC §8.3.4: kurzer Titel). */
  titleMaxLen?: number
  /** Teilstrings, die in `notes` vorkommen müssen (ohne Groß-/Kleinschreibung, Leerraum normalisiert). */
  notesContains?: string[]
  /** `true`: `notes` muss leer sein. */
  notesEmpty?: boolean
}

export interface TestCase {
  nr: number
  text: string
  newCategory?: { id: string; name: string }
  expect: ExpectedItem[]
}

/** Bereits vorhandener Eintrag im Daten-Repo (z. B. Artikel der Einkaufsliste). */
export interface ExistingItemSpec {
  title: string
  categoryId: string
  checked?: boolean
  /** Standard: `notiz`. */
  type?: 'aufgabe' | 'notiz'
  important?: boolean
  durationMin?: number
  /** Erwarteter Termin, den der Lauf der Aufgabe gibt (SPEC §8.4 e). */
  expectSchedule?: { start: string; durationMin: number }
}

export interface TestSpec {
  now: string
  planningWindow: { start: string; end: string }
  /** Pause der Ausgangslage; `null` = aus, fehlt = Feld nicht in `settings.json` (Standard-Pause). */
  pause?: { start: string; end: string } | null
  /** Alle Ablagen der Ausgangslage, ausdrücklich (unabhängig von den Standardwerten der App). */
  categories: Category[]
  existingItems?: ExistingItemSpec[]
  events: CalendarEvent[]
  cases: TestCase[]
}

const isDurationExpectation = (v: unknown): boolean =>
  v === undefined ||
  typeof v === 'number' ||
  (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number'))

const isScheduleExpectation = (v: unknown): boolean =>
  v === undefined ||
  v === null ||
  (isObj(v) && typeof v.start === 'string' && typeof v.durationMin === 'number')

const isOptionalBoolean = (v: unknown): boolean => v === undefined || typeof v === 'boolean'

const isExpectedItem = (v: unknown): v is ExpectedItem =>
  isObj(v) &&
  (v.type === undefined || typeof v.type === 'string') &&
  (v.categoryId === undefined || typeof v.categoryId === 'string') &&
  isOptionalBoolean(v.important) &&
  isOptionalBoolean(v.checked) &&
  isOptionalBoolean(v.sortError) &&
  isOptionalBoolean(v.notesEmpty) &&
  (v.titleMaxLen === undefined || typeof v.titleMaxLen === 'number') &&
  (v.notesContains === undefined ||
    (Array.isArray(v.notesContains) && v.notesContains.every((n) => typeof n === 'string'))) &&
  isDurationExpectation(v.durationMin) &&
  isScheduleExpectation(v.schedule)

const isTestCase = (v: unknown): v is TestCase =>
  isObj(v) &&
  typeof v.nr === 'number' &&
  typeof v.text === 'string' &&
  (v.newCategory === undefined ||
    (isObj(v.newCategory) &&
      typeof v.newCategory.id === 'string' &&
      typeof v.newCategory.name === 'string')) &&
  Array.isArray(v.expect) &&
  v.expect.every(isExpectedItem)

const isExistingItemSpec = (v: unknown): v is ExistingItemSpec =>
  isObj(v) &&
  typeof v.title === 'string' &&
  typeof v.categoryId === 'string' &&
  isOptionalBoolean(v.checked) &&
  (v.type === undefined || v.type === 'aufgabe' || v.type === 'notiz') &&
  isOptionalBoolean(v.important) &&
  (v.durationMin === undefined || typeof v.durationMin === 'number') &&
  (v.expectSchedule === undefined ||
    (isObj(v.expectSchedule) &&
      typeof v.expectSchedule.start === 'string' &&
      typeof v.expectSchedule.durationMin === 'number'))

const isEventList = (v: unknown): v is CalendarEvent[] =>
  Array.isArray(v) && v.every((e) => isObj(e) && typeof e.title === 'string')

export function isTestSpec(v: unknown): v is TestSpec {
  return (
    isObj(v) &&
    typeof v.now === 'string' &&
    isObj(v.planningWindow) &&
    typeof v.planningWindow.start === 'string' &&
    typeof v.planningWindow.end === 'string' &&
    (v.pause === undefined ||
      v.pause === null ||
      (isObj(v.pause) && typeof v.pause.start === 'string' && typeof v.pause.end === 'string')) &&
    Array.isArray(v.categories) &&
    v.categories.every(isCategory) &&
    (v.existingItems === undefined ||
      (Array.isArray(v.existingItems) && v.existingItems.every(isExistingItemSpec))) &&
    isEventList(v.events) &&
    Array.isArray(v.cases) &&
    v.cases.every(isTestCase)
  )
}

/** Testsatz 1 (`docs/sortier-tests.md`) oder 2 (`docs/sortier-tests-2.md`). */
export type TestSet = 1 | 2

const testFileOf = (set: TestSet): string => (set === 2 ? 'sortier-tests-2.md' : 'sortier-tests.md')

/** Wert der Option `--satz` (Standard 1); `null` bei ungültigem Wert. */
export function testSetFromArgs(argv: readonly string[]): TestSet | null {
  const index = argv.indexOf('--satz')
  if (index < 0) return 1
  const value = argv[index + 1]
  if (value === '1') return 1
  return value === '2' ? 2 : null
}

/** Liest und prüft den JSON-Block aus `docs/sortier-tests.md` (bzw. `-2.md`). */
export function loadTestSpec(codeRoot: string = CODE_ROOT, set: TestSet = 1): TestSpec {
  const file = testFileOf(set)
  const markdown = readFileSync(join(codeRoot, 'docs', file), 'utf-8')
  const block = /```json\r?\n([\s\S]*?)\r?\n```/.exec(markdown)
  if (!block) throw new Error(`JSON-Block in docs/${file} nicht gefunden.`)
  const parsed: unknown = JSON.parse(block[1])
  if (!isTestSpec(parsed)) throw new Error(`JSON-Block in docs/${file} ist ungültig.`)
  return parsed
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** Inbox-ID des Testsatzes (aufsteigend in Satzreihenfolge). */
export const inboxIdOf = (nr: number): string =>
  `20261021-11${pad(nr)}00-t${String(nr).padStart(3, '0')}`

/** `createdAt` des Testsatzes, kurz vor `now`. */
export const createdAtOf = (nr: number): string => `2026-10-21T11:${pad(nr)}:00+02:00`

/** Ablagen der Ausgangslage: genau die in der Spec angegebenen. */
export const testCategories = (spec: TestSpec): Category[] => spec.categories

/** ID des vorhandenen Eintrags (0-basierter Index in `existingItems`). */
export const existingIdOf = (index: number): string =>
  `20261020-090000-e${String(index + 1).padStart(3, '0')}`

/** Vorhandene Einträge der Ausgangslage als vollständige Items (feste IDs, vor `createdAtOf`). */
export function testExistingItems(spec: TestSpec): Item[] {
  return (spec.existingItems ?? []).map((e, index) => ({
    id: existingIdOf(index),
    type: e.type ?? 'notiz',
    title: e.title,
    notes: '',
    categoryId: e.categoryId,
    status: 'offen',
    important: e.important ?? false,
    durationMin: e.durationMin ?? null,
    schedule: null,
    originalCategoryId: null,
    ...((e.type ?? 'notiz') === 'notiz' ? { checked: e.checked ?? false } : {}),
    createdAt: '2026-10-20T09:00:00+02:00',
    updatedAt: '2026-10-20T09:00:00+02:00',
    completedAt: null,
  }))
}
