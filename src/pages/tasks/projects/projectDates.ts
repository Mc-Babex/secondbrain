const dayFormatter = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'UTC',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
})
const fullFormatter = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'UTC',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

export const WEEKDAYS: readonly string[] = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
]

/** „Mo“ … „So“ für 1 … 7. */
export function weekdayShort(weekday: number): string {
  return WEEKDAYS[weekday - 1]?.slice(0, 2) ?? '?'
}

function parse(day: string): Date | null {
  const date = new Date(`${day}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

/** „Mo 19.10.“ für `YYYY-MM-DD`. */
export function formatDay(day: string): string {
  const date = parse(day)
  if (!date) return day
  const parts: Record<string, string> = {}
  for (const part of dayFormatter.formatToParts(date)) parts[part.type] = part.value
  return `${parts.weekday.replace('.', '')} ${parts.day}.${parts.month}.`
}

/** „Nächstes: Übungsblatt 6 ab Mo 30.11.“ (SPEC §3.12). */
export function nextSeriesText(next: { date: string; title: string }): string {
  return `Nächstes: ${next.title} ab ${formatDay(next.date)}`
}

/** „12.02.2027“ für `YYYY-MM-DD`. */
export function formatFullDay(day: string): string {
  const date = parse(day)
  return date ? fullFormatter.format(date) : day
}

/** Auswahl der Dauer in Minuten (wie im Bearbeiten-Dialog, SPEC §6.3.2). */
export const DURATION_CHOICES: readonly number[] = [2, 5, 10, 15, 30, 45, 60, 90, 120, 180, 240]
