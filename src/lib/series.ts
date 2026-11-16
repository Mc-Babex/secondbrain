import type { Item, Project, StepSeries } from '../data/types'
import { toIso } from './time'

/** Obergrenze neu angelegter Instanzen je Sync und Serie (SPEC §3.12). */
export const MAX_INSTANCES_PER_SYNC = 10

const DAY_MS = 86_400_000

const dayMs = (date: string): number => Date.parse(`${date}T00:00:00Z`)

/** Addiert Kalendertage zu einem `YYYY-MM-DD`. */
export function addDays(date: string, days: number): string {
  return new Date(dayMs(date) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Wochentag eines `YYYY-MM-DD`: 1 = Montag … 7 = Sonntag. */
export function weekdayOf(date: string): number {
  return new Date(dayMs(date)).getUTCDay() || 7
}

/** Erster Tag ab `from` (einschließlich) mit dem gewünschten Wochentag (1 = Mo … 7 = So). */
function onOrAfterWeekday(from: string, weekday: number): string {
  return addDays(from, (weekday - weekdayOf(from) + 7) % 7)
}

const validWeekday = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 7

/**
 * Stichtage der Serie nach `fromExclusive` (`null` = ab Start) bis einschließlich `toInclusive`
 * (`null` = nur durch Ende begrenzt), höchstens `limit` Stück. Erster Stichtag = erster `weekday`
 * ab `startDate`, danach alle `every` Wochen; Ende durch `endDate` bzw. `count` (Nummer, daher
 * höchstens `count - lastNumber` weitere Stichtage). Ungültiger Wochentag ⇒ keine Stichtage.
 */
function nextDates(
  series: StepSeries,
  fromExclusive: string | null,
  toInclusive: string | null,
  limit: number,
): string[] {
  if (!validWeekday(series.weekday)) return []
  const step = 7 * Math.max(1, Math.floor(series.every))
  const first = onOrAfterWeekday(series.startDate, series.weekday)
  const remaining = series.count === null ? Infinity : series.count - series.lastNumber
  const cap = Math.min(limit, remaining)
  let k = 0
  if (fromExclusive !== null && dayMs(first) <= dayMs(fromExclusive)) {
    k = Math.floor((dayMs(fromExclusive) - dayMs(first)) / DAY_MS / step) + 1
  }
  const dates: string[] = []
  while (dates.length < cap) {
    const date = addDays(first, k * step)
    if (toInclusive !== null && date > toInclusive) break
    if (series.endDate !== null && date > series.endDate) break
    dates.push(date)
    k++
  }
  return dates
}

/** Stichtage mit `fromExclusive` < Stichtag ≤ `toInclusive` (SPEC §3.12). */
export function occurrences(
  series: StepSeries,
  fromExclusive: string | null,
  toInclusive: string,
): string[] {
  return nextDates(series, fromExclusive, toInclusive, Infinity)
}

/** Titel einer Instanz: `{Nr}` im Muster wird ersetzt; fehlt es, wird die Nummer angehängt („Übungsblatt 5“). */
export function instanceTitle(pattern: string, number: number): string {
  return pattern.includes('{Nr}')
    ? pattern.split('{Nr}').join(String(number))
    : `${pattern} ${number}`
}

/** Fälligkeit: erster `dueWeekday` ab dem Stichtag (der Stichtag selbst zählt); `null` ohne Fälligkeit. */
export function dueDateFor(series: StepSeries, date: string): string | null {
  if (series.dueWeekday === null || !validWeekday(series.dueWeekday)) return null
  return onOrAfterWeekday(date, series.dueWeekday)
}

export interface SeriesPreview {
  number: number
  date: string
  title: string
  dueDate: string | null
}

/** Die nächsten `n` Instanzen nach `lastNumber`/`lastDate` (Vorschau im Serien-Dialog). */
export function previewNext(series: StepSeries, n = 3): SeriesPreview[] {
  return nextDates(series, series.lastDate, null, n).map((date, index) => {
    const number = series.lastNumber + index + 1
    return {
      number,
      date,
      title: instanceTitle(series.titlePattern, number),
      dueDate: dueDateFor(series, date),
    }
  })
}

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193

/** FNV-1a (32 Bit) über die UTF-16-Codeeinheiten; fest und ohne Abhängigkeit. */
function fnv1a(text: string): number {
  let hash = FNV_OFFSET
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), FNV_PRIME) >>> 0
  }
  return hash
}

/**
 * Deterministische Instanz-ID `YYYYMMDD-000000-xxxx` (SPEC §3.12): `xxxx` = FNV-1a (32 Bit) über
 * `Projekt-ID NUL Serien-ID NUL Stichtag`, modulo 36⁴, in Basis 36 mit führenden Nullen.
 */
export function instanceId(projectId: string, seriesId: string, date: string): string {
  const hash = fnv1a(`${projectId}\u0000${seriesId}\u0000${date}`) % 36 ** 4
  return `${date.replaceAll('-', '')}-000000-${hash.toString(36).padStart(4, '0')}`
}

/** Stichtag (`YYYY-MM-DD`) aus einer Instanz-ID, sonst `null`. */
function dateOfInstanceId(id: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})-/.exec(id)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}

/** Mitternacht des Stichtags in Europe/Berlin – bei allen Geräten identisch, damit Konflikte entfallen. */
function midnightIso(date: string): string {
  const offset = toIso(new Date(`${date}T12:00:00Z`)).slice(-6)
  return `${date}T00:00:00${offset}`
}

export interface DueResult {
  instances: Item[]
  lastNumber: number
  lastDate: string | null
}

/**
 * Anzulegende Instanzen einer aktiven Serie (SPEC §3.12), höchstens `max`. `lastNumber`/`lastDate` =
 * Maximum aus Serie und vorhandenen Einträgen mit dieser `seriesId` im Projekt (auch archivierte; der
 * Stichtag steckt im Datumsteil der Instanz-ID). Existiert die ID schon, wird nichts angelegt.
 * Zeitstempel (`createdAt`/`updatedAt`) = Mitternacht des Stichtags, damit zwei Geräte dieselbe Datei erzeugen.
 */
export function dueInstances(
  project: Pick<Project, 'id' | 'categoryId'>,
  series: StepSeries,
  existingItems: readonly Item[],
  today: string,
  max = MAX_INSTANCES_PER_SYNC,
): DueResult {
  const own = existingItems.filter((i) => i.projectId === project.id)
  const ofSeries = own.filter((i) => i.seriesId === series.id)
  let lastNumber = series.lastNumber
  let lastDate = series.lastDate
  for (const item of ofSeries) {
    lastNumber = Math.max(lastNumber, item.seriesNumber ?? 0)
    const date = dateOfInstanceId(item.id)
    if (date !== null && (lastDate === null || date > lastDate)) lastDate = date
  }
  const result: DueResult = { instances: [], lastNumber, lastDate }
  if (series.state !== 'aktiv') return result
  const ids = new Set(existingItems.map((i) => i.id))
  let order = own.reduce((m, i) => Math.max(m, i.projectOrder ?? 0), 0)
  const dates = nextDates({ ...series, lastNumber }, lastDate, today, max)
  for (const date of dates) {
    const id = instanceId(project.id, series.id, date)
    if (ids.has(id)) continue
    result.lastNumber += 1
    result.lastDate = date
    const stamp = midnightIso(date)
    result.instances.push({
      id,
      type: 'aufgabe',
      title: instanceTitle(series.titlePattern, result.lastNumber),
      notes: '',
      categoryId: project.categoryId,
      status: 'offen',
      important: false,
      durationMin: series.durationMin,
      schedule: null,
      originalCategoryId: null,
      createdAt: stamp,
      updatedAt: stamp,
      completedAt: null,
      gtd: 'naechster-schritt',
      dueDate: dueDateFor(series, date),
      projectId: project.id,
      projectOrder: ++order,
      seriesId: series.id,
      seriesNumber: result.lastNumber,
      v: 2,
    })
  }
  return result
}
