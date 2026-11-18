import type { Item, Project, StepSeries } from '../data/types'
import { nowIso, toIso } from './time'

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
 * ab `startDate`, danach alle `every` Wochen, ohne `skippedDates`; Ende nur durch `endDate`
 * (`count` kennt diese Funktion nicht). Ungültiger Wochentag ⇒ keine Stichtage.
 */
function walk(
  series: StepSeries,
  fromExclusive: string | null,
  toInclusive: string | null,
  limit: number,
): string[] {
  if (!validWeekday(series.weekday)) return []
  const step = 7 * Math.max(1, Math.floor(series.every))
  const first = onOrAfterWeekday(series.startDate, series.weekday)
  const skipped = new Set(series.skippedDates)
  let k = 0
  if (fromExclusive !== null && dayMs(first) <= dayMs(fromExclusive)) {
    k = Math.floor((dayMs(fromExclusive) - dayMs(first)) / DAY_MS / step) + 1
  }
  const dates: string[] = []
  while (dates.length < limit) {
    const date = addDays(first, k * step)
    if (toInclusive !== null && date > toInclusive) break
    if (series.endDate !== null && date > series.endDate) break
    k++
    if (!skipped.has(date)) dates.push(date)
  }
  return dates
}

/** Wie `walk`, zusätzlich begrenzt durch `count` (Nummer, daher höchstens `count - lastNumber` weitere). */
function nextDates(
  series: StepSeries,
  fromExclusive: string | null,
  toInclusive: string | null,
  limit: number,
): string[] {
  const remaining = series.count === null ? Infinity : series.count - series.lastNumber
  return walk(series, fromExclusive, toInclusive, Math.min(limit, remaining))
}

/** Der `n`-te Stichtag der Serie (1-basiert, ohne Ausfälle); `null` jenseits von `count`/`endDate`. */
export function nthOccurrence(series: StepSeries, n: number): string | null {
  if (!Number.isInteger(n) || n < 1) return null
  if (series.count !== null && n > series.count) return null
  const dates = walk(series, null, null, n)
  return dates.length === n ? dates[n - 1] : null
}

/** Abgeschlossen: beendet oder kein weiterer Stichtag (`count`/`endDate` erreicht); pausiert gilt nicht (SPEC §3.12). */
export function isSeriesFinished(series: StepSeries): boolean {
  if (series.state === 'beendet') return true
  if (series.state === 'pausiert') return false
  return nthOccurrence(series, series.lastNumber + 1) === null
}

/** Die nächsten `n` Stichtage nach `lastDate` – Auswahl für „Ausfall eintragen“ (SPEC §6.3.3). */
export function upcomingOccurrences(series: StepSeries, n = 8): string[] {
  return nextDates(series, series.lastDate, null, n)
}

/** Nächster Stichtag nach `lastDate` (Ausfälle und Ende beachtet) samt Nummer und Titel; `null` ohne weiteren. */
export function nextOccurrence(series: StepSeries): { date: string; title: string } | null {
  const number = series.lastNumber + 1
  const date = nthOccurrence(series, number)
  return date === null ? null : { date, title: instanceTitle(series.titlePattern, number) }
}

/** Zahl der Nummern k > `lastNumber` mit Stichtag (bis `count`/`endDate`); 0 bei Serien ohne Ende. */
export function remainingOccurrences(series: StepSeries): number {
  if (series.count === null && series.endDate === null) return 0
  const total = walk(series, null, null, series.count ?? Infinity).length
  return Math.max(0, total - series.lastNumber)
}

/** Eingetragene Ausfälle, die noch nach `lastDate` liegen (nur diese lassen sich entfernen). */
export function futureSkips(series: StepSeries): string[] {
  return series.skippedDates.filter((d) => series.lastDate === null || d > series.lastDate)
}

/** Menge der Ausfälle mit `date` ergänzt bzw. ohne `date` (sortiert, ohne Doppelte). */
export function withSkippedDate(skipped: readonly string[], date: string): string[] {
  return [...new Set([...skipped, date])].sort()
}
export function withoutSkippedDate(skipped: readonly string[], date: string): string[] {
  return skipped.filter((d) => d !== date)
}

/**
 * Ausfall an einer Instanz mit dem Stichtag `date`: der erste folgende Stichtag, der noch nicht
 * ausfällt (SPEC §3.12). Liegt hinter dem Ende der Serie kein Stichtag mehr, bleibt der Ausfall trotzdem wirksam.
 */
export function nextSkipDate(series: StepSeries, date: string): string {
  const step = 7 * Math.max(1, Math.floor(series.every))
  let candidate = addDays(date, step)
  while (series.skippedDates.includes(candidate)) candidate = addDays(candidate, step)
  return candidate
}

/**
 * Ausfälle der Instanz Nr `number` (SPEC §3.12): Tage aus `skippedDates` nach ihrem Stichtag und vor dem
 * Stichtag von Nr `number + 1` (gibt es keinen, alle danach); aufsteigend sortiert.
 */
export function instanceSkips(series: StepSeries, number: number): string[] {
  const from = nthOccurrence(series, number)
  if (from === null) return []
  const to = nthOccurrence(series, number + 1)
  return series.skippedDates.filter((d) => d > from && (to === null || d < to)).sort()
}

/** Stichtage von `lastDate` (exklusiv) bis `yesterday`, die beim Fortsetzen als Ausfall eingetragen werden. */
export function pausedOccurrences(series: StepSeries, yesterday: string): string[] {
  return walk(series, series.lastDate, yesterday, Infinity)
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
export function instanceDate(id: string): string | null {
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
    const date = instanceDate(item.id)
    if (date !== null && (lastDate === null || date > lastDate)) lastDate = date
  }
  const result: DueResult = { instances: [], lastNumber, lastDate }
  if (series.state !== 'aktiv') return result
  const ids = new Set(existingItems.map((i) => i.id))
  let order = own.reduce((m, i) => Math.max(m, i.projectOrder ?? 0), 0)
  // Nummernbasiert: Instanz k gehört zum k-ten Stichtag (auch wenn lastDate durch Bearbeiten davon abweicht).
  let created = 0
  for (let k = lastNumber + 1; created < max; k++) {
    const date = nthOccurrence(series, k)
    if (date === null || date > today) break
    result.lastNumber = k
    if (result.lastDate === null || date > result.lastDate) result.lastDate = date
    const id = instanceId(project.id, series.id, date)
    if (ids.has(id)) continue
    created++
    const stamp = midnightIso(date)
    result.instances.push({
      id,
      type: 'aufgabe',
      title: instanceTitle(series.titlePattern, k),
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
      seriesNumber: k,
      v: 2,
    })
  }
  return result
}

export interface InstanceChange {
  from: Item
  to: Item
}

export interface RecomputePlan {
  /** Geänderte Instanzen; bei anderer ID ersetzt `to` die Datei von `from`. */
  changes: InstanceChange[]
  /** Gelöschte künftige Instanzen (entstehen an ihrem Stichtag neu). */
  deleted: Item[]
  /** Neuer Fortschritt der Serie: nach Löschungen vor der kleinsten gelöschten Nummer, sonst unverändert. */
  lastNumber: number
  lastDate: string | null
}

export interface RecomputeOptions {
  /** `true`: `dueDate` neu nach Regel (Bearbeiten); `false`: nur bei geändertem Stichtag (Ausfall). */
  refreshDue: boolean
  /** Instanz, die unangetastet bleibt (die ausfallende selbst). */
  exceptId?: string
}

/**
 * Berechnet die offenen Instanzen einer Serie neu (SPEC §3.12): Nr n gehört zum n-ten Stichtag der
 * (neuen) Regel. Anderer Stichtag ≤ heute ⇒ Datei mit der ID des neuen Stichtags ersetzt die alte;
 * nach heute ⇒ löschen. Erledigte Instanzen und Instanzen jenseits des Serienendes bleiben.
 */
export function recomputeOpenInstances(
  projectId: string,
  series: StepSeries,
  items: readonly Item[],
  today: string,
  options: RecomputeOptions,
): RecomputePlan {
  const own = items.filter(
    (i) => i.projectId === projectId && i.seriesId === series.id && i.seriesNumber !== undefined,
  )
  const recomputed = (i: Item): boolean => i.status === 'offen' && i.id !== options.exceptId
  // Besetzt ist nur, was bleibt – offene Instanzen der Serie ziehen ja selbst um.
  const taken = new Set(items.filter((i) => !(own.includes(i) && recomputed(i))).map((i) => i.id))
  const changes: InstanceChange[] = []
  const deleted: Item[] = []
  const now = nowIso()
  for (const item of own) {
    if (!recomputed(item)) continue
    const oldDate = instanceDate(item.id)
    const newDate = nthOccurrence(series, item.seriesNumber ?? 0)
    if (oldDate === null || newDate === null) continue
    const due = dueDateFor(series, newDate)
    if (newDate === oldDate) {
      if (options.refreshDue && due !== (item.dueDate ?? null)) {
        changes.push({ from: item, to: { ...item, dueDate: due, updatedAt: now } })
      }
      continue
    }
    const newId = instanceId(projectId, series.id, newDate)
    // Ziel-ID belegt (z. B. von Hand angelegte Datei): die Instanz wird gelöscht und entsteht nicht doppelt.
    if (newDate > today || taken.has(newId)) {
      deleted.push(item)
      continue
    }
    changes.push({ from: item, to: { ...item, id: newId, dueDate: due, updatedAt: now } })
  }
  // Wurden künftige Instanzen gelöscht, entstehen sie ab der kleinsten gelöschten Nummer neu; sonst
  // bleibt der Fortschritt stehen (von Hand gelöschte Instanzen entstehen nicht neu).
  let lastNumber = series.lastNumber
  if (deleted.length > 0) {
    lastNumber = Math.min(...deleted.map((i) => i.seriesNumber ?? 0)) - 1
  }
  const lastDate =
    lastNumber > 0
      ? (nthOccurrence(series, lastNumber) ?? (deleted.length > 0 ? null : series.lastDate))
      : null
  return { changes, deleted, lastNumber, lastDate }
}
