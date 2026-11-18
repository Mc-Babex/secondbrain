import { validSeries, type GtdStatus, type Item, type Project } from '../data/types'
import { isGtdStatus } from './gtdMigration'
import { nextOccurrence, remainingOccurrences } from './series'
import { zonedParts } from './time'

/** Angezeigter Status einer offenen Aufgabe (SPEC §3.3). */
export type DisplayStatus = 'termin' | GtdStatus

export type TimeLimit = 15 | null

/** Mehr als so viele Aufgaben im Fokus lösen den Hinweis aus (SPEC §6.3.1). */
export const FOCUS_LIMIT = 5

const pad = (n: number, width = 2): string => String(n).padStart(width, '0')

/** Kalendertag (`YYYY-MM-DD`) eines Zeitpunkts in Europe/Berlin. */
export function berlinDate(date: Date): string {
  const p = zonedParts(date)
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`
}

/** Anzahl Kalendertage von `from` bis `to` (beide `YYYY-MM-DD`); negativ, wenn `to` früher liegt. */
function daysBetween(from: string, to: string): number {
  const ms = (day: string): number => Date.parse(`${day}T00:00:00Z`)
  return Math.round((ms(to) - ms(from)) / 86_400_000)
}

const isOpenTask = (item: Item): boolean => item.type === 'aufgabe' && item.status === 'offen'

/** `null` für Nicht-Aufgaben und Erledigtes; sonst „Termin“ (bei `schedule`) oder der gespeicherte Status. */
export function displayStatus(item: Item): DisplayStatus | null {
  if (!isOpenTask(item)) return null
  if (item.schedule) return 'termin'
  return isGtdStatus(item.gtd) ? item.gtd : 'naechster-schritt'
}

/** ⚡ 2-Minuten-Regel. */
export function isQuick(item: Item): boolean {
  return item.durationMin !== null && item.durationMin <= 2
}

/** „fällig bis“ liegt vor heute (Europe/Berlin). */
export function isDueOverdue(item: Item, now: Date): boolean {
  return isOpenTask(item) && typeof item.dueDate === 'string' && item.dueDate < berlinDate(now)
}

/** Warte-auf-Aufgabe, deren Nachhaken-Tag heute oder früher ist. */
export function followUpDue(item: Item, now: Date): boolean {
  const on = item.waiting?.followUpOn
  return (
    isOpenTask(item) && item.gtd === 'warten' && typeof on === 'string' && on <= berlinDate(now)
  )
}

/** Tage seit `waiting.since` (nie negativ); 0, wenn keine Angabe vorliegt. */
export function waitingDays(item: Item, now: Date): number {
  const since = item.waiting?.since
  if (typeof since !== 'string') return 0
  return Math.max(0, daysBetween(since, berlinDate(now)))
}

// --- Projekte ----------------------------------------------------------------

/** Schritte eines Projekts (auch erledigte), nach `projectOrder`; ohne Wert hinten nach `createdAt`. */
export function projectSteps(projectId: string, items: readonly Item[]): Item[] {
  return items
    .filter((i) => i.type === 'aufgabe' && i.projectId === projectId)
    .sort((a, b) => {
      const ao = a.projectOrder
      const bo = b.projectOrder
      if (ao !== undefined && bo !== undefined && ao !== bo) return ao - bo
      if ((ao === undefined) !== (bo === undefined)) return ao === undefined ? 1 : -1
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1
    })
}

/** Offener Schritt mit kleinstem `projectOrder` (gleich welcher Status), sonst `null`. */
export function nextStepOf(project: Pick<Project, 'id'>, items: readonly Item[]): Item | null {
  return projectSteps(project.id, items).find((i) => i.status === 'offen') ?? null
}

/**
 * Nächster Serientermin eines aktiven Projekts: frühester weiterer Stichtag der aktiven Serien
 * (pausierte und beendete zählen nicht), Titel mit `{Nr}` = `lastNumber + 1` (SPEC §3.12).
 */
export function nextSeriesOccurrence(
  project: Pick<Project, 'series' | 'status'>,
): { date: string; title: string } | null {
  if (project.status !== 'aktiv') return null
  let best: { date: string; title: string } | null = null
  for (const series of validSeries(project)) {
    if (series.state !== 'aktiv') continue
    const next = nextOccurrence(series)
    if (next && (best === null || next.date < best.date)) best = next
  }
  return best
}

/** Fortschritt x/y: y zählt zusätzlich die noch nicht angelegten Stichtage aktiver Serien mit festem Ende. */
export function projectProgress(
  project: Pick<Project, 'id' | 'series' | 'status'>,
  items: readonly Item[],
): { done: number; total: number } {
  const steps = projectSteps(project.id, items)
  const planned =
    project.status === 'aktiv'
      ? validSeries(project)
          .filter((s) => s.state === 'aktiv')
          .reduce((sum, s) => sum + remainingOccurrences(s), 0)
      : 0
  return {
    done: steps.filter((i) => i.status === 'erledigt').length,
    total: steps.length + planned,
  }
}

/** Aktives Projekt ohne offenen Schritt und ohne weiteren Serientermin ⇒ „⚠ Nächsten Schritt festlegen“. */
export function needsNextStep(project: Project, items: readonly Item[]): boolean {
  return (
    project.status === 'aktiv' &&
    nextStepOf(project, items) === null &&
    nextSeriesOccurrence(project) === null
  )
}

// --- Sortierung und Filter ---------------------------------------------------

function compareNullableLast(a: number | string | null, b: number | string | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Nächste Schritte (SPEC §6.3.1): `dueDate` aufsteigend (Überfällige stehen damit vorn, ohne Datum
 * zuletzt), bei Gleichstand Dauer aufsteigend (ohne Dauer zuletzt), dann `createdAt`.
 */
export function sortNextSteps(items: readonly Item[]): Item[] {
  return [...items].sort(
    (a, b) =>
      compareNullableLast(a.dueDate ?? null, b.dueDate ?? null) ||
      compareNullableLast(a.durationMin, b.durationMin) ||
      compareNullableLast(a.createdAt, b.createdAt) ||
      compareNullableLast(a.id, b.id),
  )
}

/** Zeitfilter: größere **oder fehlende** Dauer fällt bei gesetztem Limit heraus. */
export function filterByTime(items: readonly Item[], limit: TimeLimit): Item[] {
  if (limit === null) return [...items]
  return items.filter((i) => i.durationMin !== null && i.durationMin <= limit)
}

const byScheduleStart = (a: Item, b: Item): number => {
  const diff = Date.parse(a.schedule?.start ?? '') - Date.parse(b.schedule?.start ?? '')
  return Number.isNaN(diff) || diff === 0 ? compareNullableLast(a.id, b.id) : diff
}

// --- Abschnitte des Reiters „Aktuell“ und der übrigen Reiter ----------------

/** ★ Fokus: offene Aufgaben mit `important`, außer „Irgendwann“; Reihenfolge wie Nächste Schritte. */
export function focusItems(items: readonly Item[]): Item[] {
  return sortNextSteps(
    items.filter((i) => isOpenTask(i) && i.important && displayStatus(i) !== 'irgendwann'),
  )
}

export function focusOverLimit(items: readonly Item[]): boolean {
  return focusItems(items).length > FOCUS_LIMIT
}

function scheduleEnd(item: Item): number {
  return item.schedule ? Date.parse(item.schedule.start) + item.schedule.durationMin * 60_000 : NaN
}

/** Aufgaben mit Termin heute (auch schon vorbei) und überfällige (SPEC §3.3), nach Beginn. */
export function todayAndOverdue(items: readonly Item[], now: Date): Item[] {
  const today = berlinDate(now)
  return items
    .filter((i) => {
      if (!isOpenTask(i) || !i.schedule) return false
      const start = new Date(i.schedule.start)
      return (
        (!Number.isNaN(start.getTime()) && berlinDate(start) === today) ||
        scheduleEnd(i) < now.getTime()
      )
    })
    .sort(byScheduleStart)
}

/** Eingeplant: offene Aufgaben mit Termin nach heute, nach Beginn. */
export function plannedLater(items: readonly Item[], now: Date): Item[] {
  const today = berlinDate(now)
  return items
    .filter((i) => {
      if (!isOpenTask(i) || !i.schedule) return false
      const start = new Date(i.schedule.start)
      return !Number.isNaN(start.getTime()) && berlinDate(start) > today
    })
    .sort(byScheduleStart)
}

/**
 * Nächste Schritte ohne Fokus: Status „Nächster Schritt“; von jedem (bekannten) Projekt nur dessen
 * nächster Schritt. Sortiert laut `sortNextSteps` (Zeitfilter und Gruppierung nach Ablage: Oberfläche).
 */
export function nextStepsSection(items: readonly Item[], projects: readonly Project[]): Item[] {
  const known = new Map(projects.map((p) => [p.id, p]))
  return sortNextSteps(
    items.filter((i) => {
      if (displayStatus(i) !== 'naechster-schritt' || i.important) return false
      const project = i.projectId ? known.get(i.projectId) : undefined
      return project === undefined || nextStepOf(project, items)?.id === i.id
    }),
  )
}

/** Warte auf: `followUpOn` aufsteigend (fällige zuerst, ohne Angabe zuletzt), dann `since`. */
export function waitingItems(items: readonly Item[]): Item[] {
  return items
    .filter((i) => displayStatus(i) === 'warten')
    .sort(
      (a, b) =>
        compareNullableLast(a.waiting?.followUpOn ?? null, b.waiting?.followUpOn ?? null) ||
        compareNullableLast(a.waiting?.since ?? null, b.waiting?.since ?? null) ||
        compareNullableLast(a.createdAt, b.createdAt) ||
        compareNullableLast(a.id, b.id),
    )
}

/** Irgendwann: neueste zuerst (Gruppierung nach Ablage: Oberfläche). */
export function somedayItems(items: readonly Item[]): Item[] {
  return items
    .filter((i) => displayStatus(i) === 'irgendwann')
    .sort(
      (a, b) => compareNullableLast(b.createdAt, a.createdAt) || compareNullableLast(a.id, b.id),
    )
}
