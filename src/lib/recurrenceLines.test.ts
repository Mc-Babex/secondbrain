import { describe, expect, it } from 'vitest'
import { fromRRule, rruleLinesFor } from './recurrence'

const START = '2026-10-20T09:00:00+02:00' // Dienstag
const never = { type: 'never' } as const

describe('fromRRule: UNTIL-Formen und WKST', () => {
  const until = (value: string) =>
    (fromRRule([`RRULE:FREQ=DAILY;UNTIL=${value}`], START) as { end: unknown }).end
  const date = (day: string) => ({ type: 'until', date: day })

  it('Datum, Wanduhrzeit und UTC-Zeitpunkte ergeben das Berliner Datum', () => {
    expect(until('20261024')).toEqual(date('2026-10-24'))
    expect(until('20261024T090000')).toEqual(date('2026-10-24'))
    // Startzeit des letzten Vorkommens
    expect(until('20261024T070000Z')).toEqual(date('2026-10-24'))
    // Tagesende Berlin (Sommerzeit bzw. Winterzeit)
    expect(until('20261024T215959Z')).toEqual(date('2026-10-24'))
    expect(until('20261224T225959Z')).toEqual(date('2026-12-24'))
    // 23:59:59 UTC = 00:59:59 Berlin am 25.12., vor der Startzeit 09:00 ⇒ Vortag
    expect(until('20261224T235959Z')).toEqual(date('2026-12-24'))
    // 00:00 UTC = 02:00 Berlin am 24.10., vor der Startzeit ⇒ Vortag
    expect(until('20261024T000000Z')).toEqual(date('2026-10-23'))
  })

  it('WKST wird bei INTERVAL=1 und bei WKST=MO ignoriert', () => {
    expect(fromRRule(['RRULE:FREQ=WEEKLY;WKST=SU;BYDAY=TU'], START)).toMatchObject({
      freq: 'weekly',
      weekdays: ['TU'],
    })
    expect(fromRRule(['RRULE:FREQ=WEEKLY;INTERVAL=2;WKST=MO;BYDAY=TU'], START).freq).toBe(
      'biweekly',
    )
  })
})

describe('rruleLinesFor', () => {
  const same = (lines: string[]) => rruleLinesFor(fromRRule(lines, START), START, lines)

  it('unverändertes Modell liefert die Originalzeilen (WKST, UNTIL-Form, BYMONTHDAY)', () => {
    for (const lines of [
      ['RRULE:FREQ=WEEKLY;WKST=SU;BYDAY=TU'],
      ['RRULE:FREQ=DAILY;UNTIL=20261024T070000Z'],
      ['RRULE:FREQ=MONTHLY;BYMONTHDAY=20;COUNT=4'],
      ['RRULE:FREQ=WEEKLY;BYDAY=TU', 'EXDATE:20261027T070000Z'],
      ['RRULE:FREQ=YEARLY'],
    ]) {
      expect(same(lines)).toEqual(lines)
    }
  })

  it('geändertes Modell wird neu erzeugt, EXDATE bleibt', () => {
    const lines = ['RRULE:FREQ=WEEKLY;WKST=SU;BYDAY=TU', 'EXDATE:20261027T070000Z']
    const model = fromRRule(lines, START)
    if (model.freq === 'custom') throw new Error('erwartet: Modell')
    expect(rruleLinesFor({ ...model, freq: 'daily' }, START, lines)).toEqual([
      'RRULE:FREQ=DAILY',
      'EXDATE:20261027T070000Z',
    ])
  })

  it('ohne Originalzeilen wird das Modell übersetzt', () => {
    expect(rruleLinesFor({ freq: 'daily', weekdays: [], end: never }, START, undefined)).toEqual([
      'RRULE:FREQ=DAILY',
    ])
    expect(rruleLinesFor({ freq: 'none', weekdays: [], end: never }, START, undefined)).toEqual([])
  })
})

describe('fromRRule: UNTIL und Startuhrzeit', () => {
  const endOf = (value: string, start: string, extra = '') =>
    (fromRRule([`RRULE:FREQ=DAILY${extra};UNTIL=${value}`], start) as { end: unknown }).end
  const date = (day: string) => ({ type: 'until', date: day })

  it('T235959Z: Start 10:00 ergibt 24.12., Start 00:30 ergibt 25.12.', () => {
    expect(endOf('20261224T235959Z', '2026-09-01T10:00:00+02:00')).toEqual(date('2026-12-24'))
    expect(endOf('20261224T235959Z', '2026-09-01T00:30:00+02:00')).toEqual(date('2026-12-25'))
  })

  it('Startzeit des letzten Vorkommens (Sommerzeit) ergibt dessen Tag', () => {
    expect(endOf('20261024T080000Z', '2026-09-01T10:00:00+02:00')).toEqual(date('2026-10-24'))
    expect(endOf('20261024T075959Z', '2026-09-01T10:00:00+02:00')).toEqual(date('2026-10-23'))
  })

  it('Zeitumstellung: Winterzeit-Vorkommen einer Sommerzeit-Serie', () => {
    // 10:00 Berlin am 28.10. = 09:00 UTC (Winterzeit)
    expect(endOf('20261028T090000Z', '2026-09-01T10:00:00+02:00')).toEqual(date('2026-10-28'))
    expect(endOf('20261028T085959Z', '2026-09-01T10:00:00+02:00')).toEqual(date('2026-10-27'))
  })

  it('Wanduhrzeit ohne Z: Uhrzeit vor Start ergibt Vortag', () => {
    expect(endOf('20261024T095959', '2026-09-01T10:00:00+02:00')).toEqual(date('2026-10-23'))
    expect(endOf('20261024T100000', '2026-09-01T10:00:00+02:00')).toEqual(date('2026-10-24'))
  })

  it('Datum und ganztägige Serien: Datum direkt', () => {
    expect(endOf('20261224', '2026-09-01T10:00:00+02:00')).toEqual(date('2026-12-24'))
    expect(endOf('20261224T235959Z', '2026-09-01')).toEqual(date('2026-12-24'))
  })

  it('nach einer Regeländerung entsteht kein Vorkommen nach dem ursprünglichen letzten', () => {
    const start = '2026-12-01T10:00:00+01:00' // Dienstag
    const lines = ['RRULE:FREQ=DAILY;UNTIL=20261224T235959Z']
    const model = fromRRule(lines, start)
    if (model.freq === 'custom') throw new Error('erwartet: Modell')
    const changed = rruleLinesFor(
      { ...model, freq: 'weekly', weekdays: ['TU', 'TH'] },
      start,
      lines,
    )
    // Letztes mögliches Vorkommen: 24.12. Die neue Regel endet am Ende dieses Tages (Berlin).
    expect(changed).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261224T225959Z'])
  })
})
