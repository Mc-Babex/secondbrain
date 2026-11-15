import { isObj, type StartedRun, type TriggerAnswer } from '../data/types'
import { TIME_ZONE } from './time'

export const LOCK_MS = 20 * 60 * 1000

const STARTED_STATUS: readonly string[] = ['gestartet', 'unklar', 'abgelehnt']
const TRIGGER_RESULTS: readonly string[] = [
  'gestartet',
  'nichts',
  'laeuft',
  'abgelehnt',
  'unklar',
  'fehler',
  'nicht-eingerichtet',
]

const isStr = (v: unknown): v is string => typeof v === 'string'
const isTime = (v: unknown): v is string => isStr(v) && !Number.isNaN(Date.parse(v))

/** Unbekannte Felder sind erlaubt (SPEC §3.1). */
export function isStartedRun(v: unknown): v is StartedRun {
  return (
    isObj(v) &&
    isStr(v.requestId) &&
    isTime(v.startedAt) &&
    isStr(v.status) &&
    STARTED_STATUS.includes(v.status)
  )
}

export function isTriggerAnswer(v: unknown): v is TriggerAnswer {
  return (
    isObj(v) &&
    isStr(v.requestId) &&
    isTime(v.at) &&
    isStr(v.result) &&
    TRIGGER_RESULTS.includes(v.result) &&
    (v.message === undefined || isStr(v.message)) &&
    (v.retryAfter === undefined || isTime(v.retryAfter))
  )
}

/**
 * Sperre aktiv (SPEC §3.10): Status `gestartet`/`unklar`, weniger als 20 Min. seit `startedAt`
 * und `last.json` fehlt oder `finishedAt` ≤ `startedAt`.
 */
export function isLockActive(
  started: StartedRun | null,
  lastRun: { finishedAt: string } | null,
  now: Date,
): boolean {
  if (started === null || started.status === 'abgelehnt') return false
  const startedAt = Date.parse(started.startedAt)
  if (Number.isNaN(startedAt) || now.getTime() >= startedAt + LOCK_MS) return false
  if (lastRun === null) return true
  const finishedAt = Date.parse(lastRun.finishedAt)
  return Number.isNaN(finishedAt) || finishedAt <= startedAt
}

const timeFormatter = new Intl.DateTimeFormat('de-DE', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export const MSG_NOTHING = 'Nichts zu sortieren'
export const MSG_RUNNING = 'Sortierung läuft bereits.'
export const MSG_STARTED = 'Sortierung gestartet'
const MSG_UNCLEAR = 'Start unklar – in 20 Min. erneut versuchen.'
export const MSG_NOT_SET_UP =
  'Automatisches Sortieren ist nicht eingerichtet. Einträge über ‚In Ablage…‘ einsortieren oder in den Einstellungen einrichten.'
export const MSG_FAILED = 'Start fehlgeschlagen – bitte später erneut versuchen.'

function rejectionMessage(answer: TriggerAnswer, now: Date): string {
  const text = answer.message ?? ''
  const status = /\b(\d{3})\b/.exec(text)?.[1]
  if (status === '429') {
    const retry = answer.retryAfter === undefined ? NaN : Date.parse(answer.retryAfter)
    const suffix =
      !Number.isNaN(retry) && retry > now.getTime() ? ` (ab ${timeFormatter.format(retry)})` : ''
    return `Start abgelehnt: Limit erreicht, bitte später erneut versuchen${suffix}.`
  }
  return status === undefined ? 'Start abgelehnt.' : `Start abgelehnt (Fehler ${status}).`
}

/** Deutsche Meldung zur Antwort der Action (SPEC §6.3). */
export function messageFor(answer: TriggerAnswer, now: Date): string {
  switch (answer.result) {
    case 'gestartet':
      return MSG_STARTED
    case 'nichts':
      return MSG_NOTHING
    case 'laeuft':
      return MSG_RUNNING
    case 'abgelehnt':
      return rejectionMessage(answer, now)
    case 'unklar':
      return MSG_UNCLEAR
    case 'fehler':
      return MSG_FAILED
    case 'nicht-eingerichtet':
      return MSG_NOT_SET_UP
  }
}
