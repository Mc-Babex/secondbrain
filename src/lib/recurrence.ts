import { zonedToDate } from './planning'
import { zonedParts } from './time'

// Wiederholungsregeln: RRULE (RFC 5545) ⇄ Dialogmodell (SPEC §6.7).

export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'
export const WEEKDAYS: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

export type RepeatEnd =
  { type: 'never' } | { type: 'until'; date: string } | { type: 'count'; count: number }

export type RepeatFreq = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly'

export type Recurrence =
  | {
      freq: RepeatFreq
      /** Nur bei wöchentlich und alle 2 Wochen; leer = Wochentag des Starts. */
      weekdays: Weekday[]
      end: RepeatEnd
      /** Nicht abbildbare Zusatzzeilen (z. B. EXDATE), bleiben unverändert erhalten. */
      extraLines?: string[]
    }
  | { freq: 'custom'; lines: string[] }

export const NO_RECURRENCE: Recurrence = { freq: 'none', weekdays: [], end: { type: 'never' } }

const pad = (n: number, width = 2): string => String(n).padStart(width, '0')

/** Wochentag (Kürzel) eines Kalendertags `YYYY-MM-DD`. */
export function weekdayOf(date: string): Weekday {
  const [year, month, day] = date.split('-').map(Number)
  const index = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
  return WEEKDAYS[index]
}

function startDay(start: string): string {
  if (start.length === 10) return start
  const p = zonedParts(new Date(start))
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`
}

/** `UNTIL` in UTC: Ende des gewählten Tages (23:59:59) in Europe/Berlin. */
function untilUtc(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const end = new Date(zonedToDate(year, month, day + 1, 0, 0).getTime() - 1000)
  return (
    `${pad(end.getUTCFullYear(), 4)}${pad(end.getUTCMonth() + 1)}${pad(end.getUTCDate())}` +
    `T${pad(end.getUTCHours())}${pad(end.getUTCMinutes())}${pad(end.getUTCSeconds())}Z`
  )
}

function sortedWeekdays(weekdays: readonly Weekday[], fallback: Weekday): Weekday[] {
  const chosen = WEEKDAYS.filter((day) => weekdays.includes(day))
  return chosen.length > 0 ? chosen : [fallback]
}

/**
 * RRULE-Zeilen zum Modell. `start` ist der Beginn der Serie (ISO mit Offset oder `YYYY-MM-DD`);
 * bei ganztägigen Terminen (`YYYY-MM-DD`) ist `UNTIL` ein Datum, sonst UTC.
 */
export function toRRule(model: Recurrence, start: string): string[] {
  if (model.freq === 'custom') return [...model.lines]
  if (model.freq === 'none') return [...(model.extraLines ?? [])]
  const day = startDay(start)
  const parts: string[] = []
  if (model.freq === 'daily') parts.push('FREQ=DAILY')
  else if (model.freq === 'monthly') parts.push('FREQ=MONTHLY')
  else {
    parts.push('FREQ=WEEKLY')
    if (model.freq === 'biweekly') parts.push('INTERVAL=2')
    parts.push(`BYDAY=${sortedWeekdays(model.weekdays, weekdayOf(day)).join(',')}`)
  }
  if (model.end.type === 'until') {
    parts.push(
      `UNTIL=${start.length === 10 ? model.end.date.replaceAll('-', '') : untilUtc(model.end.date)}`,
    )
  } else if (model.end.type === 'count') {
    parts.push(`COUNT=${model.end.count}`)
  }
  return [`RRULE:${parts.join(';')}`, ...(model.extraLines ?? [])]
}

/**
 * `UNTIL` als Berliner Kalendertag des letzten möglichen Vorkommens: Datum (`YYYYMMDD`) und
 * ganztägige Serien gelten direkt; bei Uhrzeit (Wanduhrzeit oder `…Z`, in Berlin umgerechnet) gilt der
 * Vortag, wenn die Uhrzeit vor der Startuhrzeit der Serie liegt.
 */
function parseUntil(value: string, start: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value)
  if (!m) return null
  let [year, month, day] = [+m[1], +m[2], +m[3]]
  if (m[4] !== undefined && start.length !== 10) {
    let minutes = +m[4] * 60 + +m[5]
    if (m[7]) {
      const instant = new Date(Date.UTC(year, month - 1, day, +m[4], +m[5], +m[6]))
      if (Number.isNaN(instant.getTime())) return null
      const p = zonedParts(instant)
      ;[year, month, day] = [p.year, p.month, p.day]
      minutes = p.hour * 60 + p.minute
    }
    const first = zonedParts(new Date(start))
    if (minutes < first.hour * 60 + first.minute) {
      const previous = new Date(Date.UTC(year, month - 1, day - 1))
      ;[year, month, day] = [
        previous.getUTCFullYear(),
        previous.getUTCMonth() + 1,
        previous.getUTCDate(),
      ]
    }
  }
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`
}

function custom(lines: readonly string[]): Recurrence {
  return { freq: 'custom', lines: [...lines] }
}

function parseByDay(value: string): Weekday[] | null {
  const days = value.split(',')
  if (!days.every((d): d is Weekday => (WEEKDAYS as readonly string[]).includes(d))) return null
  return days
}

/**
 * Modell zu RRULE-Zeilen (Beginn der Serie `start`). Nicht abbildbare Regeln (YEARLY, BYSETPOS,
 * INTERVAL > 2, abweichender BYMONTHDAY, mehrere RRULE …) ergeben `custom` mit den Originalzeilen;
 * EXDATE-Zeilen bleiben als `extraLines` erhalten.
 */
export function fromRRule(lines: readonly string[] | undefined, start: string): Recurrence {
  if (!lines || lines.length === 0) return { freq: 'none', weekdays: [], end: { type: 'never' } }
  const rules = lines.filter((line) => /^RRULE:/i.test(line))
  const extra = lines.filter((line) => /^EXDATE/i.test(line))
  if (rules.length !== 1 || rules.length + extra.length !== lines.length) return custom(lines)

  const params = new Map<string, string>()
  for (const pair of rules[0].slice(6).split(';')) {
    const [key, value, ...rest] = pair.split('=')
    if (!key || !value || rest.length > 0 || params.has(key)) return custom(lines)
    params.set(key, value)
  }
  const allowed = ['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'UNTIL', 'COUNT', 'WKST']
  if ([...params.keys()].some((key) => !allowed.includes(key))) return custom(lines)

  const day = startDay(start)
  const freq = params.get('FREQ')
  const interval = params.get('INTERVAL') ?? '1'
  // WKST ändert nur bei INTERVAL > 1 die Bedeutung (und nur, wenn es nicht MO ist).
  const wkst = params.get('WKST')
  if (wkst !== undefined && !(WEEKDAYS as readonly string[]).includes(wkst)) return custom(lines)
  if (wkst !== undefined && wkst !== 'MO' && interval !== '1') return custom(lines)
  const byDay = params.get('BYDAY')
  const byMonthDay = params.get('BYMONTHDAY')
  let model: RepeatFreq
  let weekdays: Weekday[] = []

  if (freq === 'DAILY' && interval === '1' && !byDay && !byMonthDay) model = 'daily'
  else if (freq === 'MONTHLY' && interval === '1' && !byDay) {
    if (byMonthDay !== undefined && Number(byMonthDay) !== Number(day.slice(8)))
      return custom(lines)
    model = 'monthly'
  } else if (freq === 'WEEKLY' && (interval === '1' || interval === '2') && !byMonthDay) {
    model = interval === '2' ? 'biweekly' : 'weekly'
    const parsed = byDay === undefined ? [weekdayOf(day)] : parseByDay(byDay)
    if (!parsed) return custom(lines)
    weekdays = sortedWeekdays(parsed, weekdayOf(day))
  } else return custom(lines)

  const until = params.get('UNTIL')
  const count = params.get('COUNT')
  let end: RepeatEnd = { type: 'never' }
  if (until !== undefined && count !== undefined) return custom(lines)
  if (until !== undefined) {
    const date = parseUntil(until, start)
    if (!date) return custom(lines)
    end = { type: 'until', date }
  } else if (count !== undefined) {
    if (!/^[1-9]\d*$/.test(count)) return custom(lines)
    end = { type: 'count', count: Number(count) }
  }
  return { freq: model, weekdays, end, ...(extra.length > 0 ? { extraLines: extra } : {}) }
}

function canonical(model: Recurrence, fallbackDay: Weekday): string {
  if (model.freq === 'custom') return JSON.stringify(['custom', model.lines])
  const days = sortedWeekdays(model.weekdays, fallbackDay)
  return JSON.stringify([
    model.freq,
    model.freq === 'weekly' || model.freq === 'biweekly' ? days : [],
    model.end,
    model.extraLines ?? [],
  ])
}

/**
 * RRULE-Zeilen zum Speichern: Ist das Modell gegenüber den Originalzeilen unverändert, kommen die
 * Originalzeilen unverändert zurück (WKST, UNTIL-Form, BYMONTHDAY bleiben erhalten), sonst `toRRule`.
 */
export function rruleLinesFor(
  model: Recurrence,
  start: string,
  originalLines: readonly string[] | undefined,
): string[] {
  const original = fromRRule(originalLines, start)
  const day = weekdayOf(startDay(start))
  if (canonical(model, day) === canonical(original, day)) return [...(originalLines ?? [])]
  return toRRule(model, start)
}
