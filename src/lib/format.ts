import { TIME_ZONE, zonedParts } from './time'

const formatter = new Intl.DateTimeFormat('de-DE', {
  timeZone: TIME_ZONE,
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Deutsch formatierter Zeitpunkt in Europe/Berlin, z. B. „Fr 16.10., 14:00". */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const v: Record<string, string> = {}
  for (const part of formatter.formatToParts(date)) v[part.type] = part.value
  return `${v.weekday.replace('.', '')} ${v.day}.${v.month}., ${v.hour}:${v.minute}`
}

/** Dauer in Minuten als Text, z. B. 90 → „1 Std. 30 Min.". */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} Min.`
  if (rest === 0) return `${hours} Std.`
  return `${hours} Std. ${rest} Min.`
}

/** Zeitfenster eines Eintrags, z. B. „Do 22.10., 10:30–10:45". */
export function formatTimeRange(startIso: string, durationMin: number): string {
  const start = new Date(startIso)
  if (Number.isNaN(start.getTime())) return startIso
  const end = new Date(start.getTime() + durationMin * 60_000)
  const p = zonedParts(end)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${formatDateTime(startIso)}–${pad(p.hour)}:${pad(p.minute)}`
}
