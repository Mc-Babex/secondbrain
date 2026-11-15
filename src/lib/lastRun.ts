import type { LastRun } from '../data/types'
import { formatDateTime } from './format'
import { zonedParts } from './time'

const DAY_MS = 24 * 60 * 60 * 1000
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000

/** `finishedAt` höchstens 24 h her (und nicht mehr als 5 Min. in der Zukunft). */
export function isRecent(lastRun: LastRun | null, now: Date): boolean {
  if (lastRun === null) return false
  const age = now.getTime() - Date.parse(lastRun.finishedAt)
  return age <= DAY_MS && age >= -FUTURE_TOLERANCE_MS
}

const sameDay = (a: Date, b: Date): boolean => {
  const x = zonedParts(a)
  const y = zonedParts(b)
  return x.year === y.year && x.month === y.month && x.day === y.day
}

/** „Zuletzt sortiert: 14:05" (heute) bzw. „Zuletzt sortiert: Fr 16.10., 14:00". */
export function formatLastSorted(finishedAt: string, now: Date): string {
  const date = new Date(finishedAt)
  if (Number.isNaN(date.getTime())) return ''
  if (!sameDay(date, now)) return `Zuletzt sortiert: ${formatDateTime(finishedAt)}`
  const p = zonedParts(date)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `Zuletzt sortiert: ${pad(p.hour)}:${pad(p.minute)}`
}

/** IDs der im letzten Lauf angelegten Einträge, solange der Lauf `isRecent` ist. */
export function recentItemIds(lastRun: LastRun | null, now: Date): Set<string> {
  return lastRun !== null && isRecent(lastRun, now) ? new Set(lastRun.itemIds) : new Set()
}
