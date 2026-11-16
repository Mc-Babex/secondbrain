const dayFormatter = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'UTC',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
})

/** „Fr 23.10.“ für einen Kalendertag `YYYY-MM-DD`; unlesbare Angaben bleiben unverändert. */
export function formatDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return day
  const v: Record<string, string> = {}
  for (const part of dayFormatter.formatToParts(date)) v[part.type] = part.value
  return `${v.weekday.replace('.', '')} ${v.day}.${v.month}.`
}

/** „seit heute“, „seit 1 Tag“, „seit N Tagen“. */
export function sinceText(days: number): string {
  if (days <= 0) return 'seit heute'
  return days === 1 ? 'seit 1 Tag' : `seit ${days} Tagen`
}

/** „nachhaken am Fr 23.10.“, „heute nachhaken“ bzw. „nachhaken seit Di 20.10.“ (Tage als `YYYY-MM-DD`). */
export function followUpText(followUpOn: string, today: string): string {
  if (followUpOn === today) return 'heute nachhaken'
  return followUpOn < today
    ? `nachhaken seit ${formatDay(followUpOn)}`
    : `nachhaken am ${formatDay(followUpOn)}`
}
