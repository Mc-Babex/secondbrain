import { describe, expect, it } from 'vitest'
import type { StartedRun, TriggerAnswer } from '../data/types'
import { isLockActive, isStartedRun, isTriggerAnswer, messageFor } from './sortLock'

const started = (over: Partial<StartedRun> = {}): StartedRun => ({
  requestId: '20261021-140000-r7k2',
  startedAt: '2026-10-21T14:00:05+02:00',
  status: 'gestartet',
  ...over,
})
const at = (iso: string): Date => new Date(iso)
const NOW = at('2026-10-21T14:05:00+02:00')

describe('isLockActive', () => {
  it('ist ohne started.json nicht aktiv', () => {
    expect(isLockActive(null, null, NOW)).toBe(false)
  })

  it('gilt für gestartet und unklar, nicht für abgelehnt', () => {
    expect(isLockActive(started(), null, NOW)).toBe(true)
    expect(isLockActive(started({ status: 'unklar' }), null, NOW)).toBe(true)
    expect(isLockActive(started({ status: 'abgelehnt' }), null, NOW)).toBe(false)
  })

  it('endet genau 20 Minuten nach startedAt', () => {
    expect(isLockActive(started(), null, at('2026-10-21T14:20:04+02:00'))).toBe(true)
    expect(isLockActive(started(), null, at('2026-10-21T14:20:05+02:00'))).toBe(false)
    expect(isLockActive(started(), null, at('2026-10-21T15:00:00+02:00'))).toBe(false)
  })

  it('endet, wenn last.json nach startedAt fertig wurde', () => {
    expect(isLockActive(started(), { finishedAt: '2026-10-21T14:04:00+02:00' }, NOW)).toBe(false)
  })

  it('bleibt bei finishedAt vor oder gleich startedAt', () => {
    expect(isLockActive(started(), { finishedAt: '2026-10-21T13:00:00+02:00' }, NOW)).toBe(true)
    expect(isLockActive(started(), { finishedAt: '2026-10-21T14:00:05+02:00' }, NOW)).toBe(true)
  })

  it('vergleicht Zeitpunkte, nicht Zeichenketten (andere Offsets)', () => {
    expect(isLockActive(started(), { finishedAt: '2026-10-21T12:04:00+00:00' }, NOW)).toBe(false)
  })
})

describe('Type Guards', () => {
  it('erkennen gültige Formen und tolerieren unbekannte Felder', () => {
    expect(isStartedRun({ ...started(), extra: 1 })).toBe(true)
    expect(isStartedRun(started({ status: 'kaputt' as StartedRun['status'] }))).toBe(false)
    expect(isStartedRun({ requestId: 'x' })).toBe(false)
    expect(isStartedRun(null)).toBe(false)
    expect(isStartedRun(started({ startedAt: 'gestern' }))).toBe(false)

    const answer = { requestId: 'a', at: '2026-10-21T14:00:06+02:00', result: 'nichts', x: 1 }
    expect(isTriggerAnswer(answer)).toBe(true)
    expect(isTriggerAnswer({ ...answer, result: 'sonstwas' })).toBe(false)
    expect(isTriggerAnswer({ ...answer, message: 5 })).toBe(false)
    expect(isTriggerAnswer({ ...answer, retryAfter: 'bald' })).toBe(false)
    expect(isTriggerAnswer({ ...answer, result: 'nicht-eingerichtet' })).toBe(true)
    expect(isTriggerAnswer([])).toBe(false)
  })
})

describe('messageFor', () => {
  const answer = (over: Partial<TriggerAnswer>): TriggerAnswer => ({
    requestId: 'a',
    at: '2026-10-21T14:00:06+02:00',
    result: 'gestartet',
    message: '',
    ...over,
  })

  it('liefert die Meldungen aus SPEC §6.3', () => {
    expect(messageFor(answer({}), NOW)).toBe('Sortierung gestartet')
    expect(messageFor(answer({ result: 'nichts' }), NOW)).toBe('Nichts zu sortieren')
    expect(messageFor(answer({ result: 'laeuft' }), NOW)).toBe('Sortierung läuft bereits.')
    expect(messageFor(answer({ result: 'unklar' }), NOW)).toBe(
      'Start unklar – in 20 Min. erneut versuchen.',
    )
    expect(messageFor(answer({ result: 'nicht-eingerichtet' }), NOW)).toBe(
      'Automatisches Sortieren ist nicht eingerichtet. Einträge über ‚In Ablage…‘ einsortieren oder in den Einstellungen einrichten.',
    )
    expect(messageFor(answer({ result: 'fehler' }), NOW)).toBe(
      'Start fehlgeschlagen – bitte später erneut versuchen.',
    )
  })

  it('nennt bei 429 die Uhrzeit in Europe/Berlin', () => {
    const text = messageFor(
      answer({
        result: 'abgelehnt',
        message: 'HTTP 429 (rate_limit_error)',
        retryAfter: '2026-10-21T15:30:00+02:00',
      }),
      NOW,
    )
    expect(text).toBe('Start abgelehnt: Limit erreicht, bitte später erneut versuchen (ab 15:30).')
  })

  it('lässt bei 429 ohne (oder mit vergangener) Zeit die Uhrzeit weg', () => {
    const base = { result: 'abgelehnt', message: 'HTTP 429' } as const
    const plain = 'Start abgelehnt: Limit erreicht, bitte später erneut versuchen.'
    expect(messageFor(answer(base), NOW)).toBe(plain)
    expect(messageFor(answer({ ...base, retryAfter: '2026-10-21T14:00:00+02:00' }), NOW)).toBe(
      plain,
    )
  })

  it('nennt sonst den Fehlercode', () => {
    expect(messageFor(answer({ result: 'abgelehnt', message: 'HTTP 401' }), NOW)).toBe(
      'Start abgelehnt (Fehler 401).',
    )
    expect(messageFor(answer({ result: 'abgelehnt', message: '' }), NOW)).toBe('Start abgelehnt.')
  })
})
