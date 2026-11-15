export const TIME_ZONE = 'Europe/Berlin'

export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Kalender- und Uhrzeitbestandteile eines Zeitpunkts in Europe/Berlin. */
export function zonedParts(date: Date): ZonedParts {
  const values: Record<string, number> = {}
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value)
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  }
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0')

/** ISO 8601 mit Offset der Zeitzone Europe/Berlin, z. B. `2026-10-17T09:30:00+02:00`. */
export function toIso(date: Date): string {
  const p = zonedParts(date)
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  const offsetMin = Math.round((wallAsUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000)
  const sign = offsetMin < 0 ? '-' : '+'
  const abs = Math.abs(offsetMin)
  return (
    `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

export function nowIso(): string {
  return toIso(new Date())
}
