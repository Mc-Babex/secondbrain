import { zonedParts } from './time'

export interface PlanningWindow {
  start: string
  end: string
}

/** Standard-Pause laut SPEC §3.6, wenn `settings.json` kein `pause`-Feld hat. */
export const DEFAULT_PAUSE: PlanningWindow = { start: '12:00', end: '13:00' }

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

function isWindow(v: unknown): v is PlanningWindow {
  if (typeof v !== 'object' || v === null) return false
  const { start, end } = v as { start?: unknown; end?: unknown }
  return (
    typeof start === 'string' &&
    typeof end === 'string' &&
    TIME_PATTERN.test(start) &&
    TIME_PATTERN.test(end)
  )
}

/**
 * Wirksame Pause (SPEC §3.6): fehlendes Feld ⇒ Standard 12:00–13:00; `null` ⇒ keine;
 * ungültig (kein Zeitpaar, Ende ≤ Beginn, nicht vollständig im Planungsfenster) ⇒ keine.
 */
export function effectivePause(settings: {
  planningWindow: PlanningWindow
  pause?: unknown
}): PlanningWindow | null {
  const raw = settings.pause === undefined ? DEFAULT_PAUSE : settings.pause
  if (!isWindow(raw)) return null
  const start = timeToMinutes(raw.start)
  const end = timeToMinutes(raw.end)
  if (end <= start) return null
  if (start < timeToMinutes(settings.planningWindow.start)) return null
  if (end > timeToMinutes(settings.planningWindow.end)) return null
  return { start: raw.start, end: raw.end }
}

/**
 * Pause, die für einen Block der Länge `durationMin` gilt: Ist der Block länger als der längere
 * Teil des Planungsfensters vor bzw. nach der Pause, darf er über die Pause laufen (SPEC §8.4).
 */
export function pauseForDuration(
  window: PlanningWindow,
  pause: PlanningWindow | null | undefined,
  durationMin: number,
): PlanningWindow | null {
  if (!pause) return null
  const before = timeToMinutes(pause.start) - timeToMinutes(window.start)
  const after = timeToMinutes(window.end) - timeToMinutes(pause.end)
  return durationMin > Math.max(before, after) ? null : pause
}

/** „HH:MM" als Minuten seit Mitternacht. */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function offsetAt(date: Date): number {
  const p = zonedParts(date)
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return wallAsUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** Zeitpunkt zu einer Berliner Wanduhrzeit (Monat 1–12; Überlauf bei Tag/Minute wird normalisiert). */
export function zonedToDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  let guess = wall
  for (let i = 0; i < 2; i++) guess = wall - offsetAt(new Date(guess))
  return new Date(guess)
}

/**
 * Vorschlag für Start im Planungsfenster: nächste volle Viertelstunde; vor Fensterbeginn ⇒
 * Fensterbeginn; passt die Dauer heute nicht mehr hinein ⇒ Fensterbeginn des nächsten Tages.
 * Liegt der Block sonst in der Pause, beginnt er danach. Rein, ohne Kalenderabfrage.
 */
export function suggestSlot(
  now: Date,
  window: PlanningWindow,
  durationMin: number,
  pause: PlanningWindow | null = null,
): Date {
  const p = zonedParts(now)
  const windowStart = timeToMinutes(window.start)
  const windowEnd = timeToMinutes(window.end)

  const elapsed = p.hour * 60 + p.minute + (p.second > 0 ? 1 : 0)
  let minutes = Math.ceil(elapsed / 15) * 15
  let dayOffset = 0
  const active = pauseForDuration(window, pause, durationMin)
  const skipPause = (value: number): number =>
    active && value < timeToMinutes(active.end) && value + durationMin > timeToMinutes(active.start)
      ? Math.ceil(timeToMinutes(active.end) / 15) * 15
      : value
  if (minutes < windowStart) minutes = windowStart
  minutes = skipPause(minutes)
  if (minutes + durationMin > windowEnd) {
    minutes = skipPause(windowStart)
    dayOffset = 1
  }
  return zonedToDate(p.year, p.month, p.day + dayOffset, 0, minutes)
}
