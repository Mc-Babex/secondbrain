import { describe, expect, it } from 'vitest'
import { fromRRule, toRRule, weekdayOf, type Recurrence } from './recurrence'

const START = '2026-10-20T09:00:00+02:00' // Dienstag
const never = { type: 'never' } as const

function roundTrip(model: Recurrence, start = START): Recurrence {
  return fromRRule(toRRule(model, start), start)
}

describe('toRRule', () => {
  it('keine Wiederholung ergibt keine Zeilen', () => {
    expect(toRRule({ freq: 'none', weekdays: [], end: never }, START)).toEqual([])
  })

  it('täglich, monatlich', () => {
    expect(toRRule({ freq: 'daily', weekdays: [], end: never }, START)).toEqual([
      'RRULE:FREQ=DAILY',
    ])
    expect(toRRule({ freq: 'monthly', weekdays: [], end: never }, START)).toEqual([
      'RRULE:FREQ=MONTHLY',
    ])
  })

  it('wöchentlich Mo+Mi (sortiert), Vorgabe = Wochentag des Datums', () => {
    expect(toRRule({ freq: 'weekly', weekdays: ['WE', 'MO'], end: never }, START)).toEqual([
      'RRULE:FREQ=WEEKLY;BYDAY=MO,WE',
    ])
    expect(toRRule({ freq: 'weekly', weekdays: [], end: never }, START)).toEqual([
      'RRULE:FREQ=WEEKLY;BYDAY=TU',
    ])
  })

  it('alle 2 Wochen', () => {
    expect(toRRule({ freq: 'biweekly', weekdays: ['FR'], end: never }, START)).toEqual([
      'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=FR',
    ])
  })

  it('UNTIL in UTC: Tagesende Berlin (Sommer- und Winterzeit)', () => {
    const until = (date: string) =>
      toRRule({ freq: 'daily', weekdays: [], end: { type: 'until', date } }, START)
    expect(until('2026-10-24')).toEqual(['RRULE:FREQ=DAILY;UNTIL=20261024T215959Z'])
    expect(until('2026-12-24')).toEqual(['RRULE:FREQ=DAILY;UNTIL=20261224T225959Z'])
    expect(until('2026-10-25')).toEqual(['RRULE:FREQ=DAILY;UNTIL=20261025T225959Z'])
  })

  it('ganztägig (Datum als Start): UNTIL als Datum', () => {
    expect(
      toRRule(
        { freq: 'daily', weekdays: [], end: { type: 'until', date: '2026-10-24' } },
        '2026-10-20',
      ),
    ).toEqual(['RRULE:FREQ=DAILY;UNTIL=20261024'])
  })

  it('Anzahl', () => {
    expect(
      toRRule({ freq: 'weekly', weekdays: ['TU'], end: { type: 'count', count: 5 } }, START),
    ).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=5'])
  })

  it('custom bleibt unverändert, extraLines werden angehängt', () => {
    const lines = ['RRULE:FREQ=YEARLY', 'EXDATE:20271020T070000Z']
    expect(toRRule({ freq: 'custom', lines }, START)).toEqual(lines)
    expect(
      toRRule(
        { freq: 'daily', weekdays: [], end: never, extraLines: ['EXDATE:20261021T070000Z'] },
        START,
      ),
    ).toEqual(['RRULE:FREQ=DAILY', 'EXDATE:20261021T070000Z'])
  })
})

describe('Hin und zurück', () => {
  const cases: Recurrence[] = [
    { freq: 'none', weekdays: [], end: never },
    { freq: 'daily', weekdays: [], end: never },
    { freq: 'weekly', weekdays: ['MO', 'WE'], end: never },
    { freq: 'weekly', weekdays: ['TU'], end: { type: 'count', count: 10 } },
    { freq: 'biweekly', weekdays: ['TU', 'TH'], end: { type: 'until', date: '2026-12-31' } },
    { freq: 'monthly', weekdays: [], end: never },
    { freq: 'monthly', weekdays: [], end: { type: 'until', date: '2027-03-28' } },
    { freq: 'daily', weekdays: [], end: { type: 'until', date: '2026-10-25' } },
  ]
  for (const model of cases) {
    it(`${model.freq} / ${JSON.stringify('end' in model ? model.end : null)}`, () => {
      expect(roundTrip(model)).toEqual(model)
    })
  }

  it('ganztägig mit UNTIL als Datum', () => {
    const model: Recurrence = {
      freq: 'weekly',
      weekdays: ['TU'],
      end: { type: 'until', date: '2026-11-03' },
    }
    expect(roundTrip(model, '2026-10-20')).toEqual(model)
  })

  it('EXDATE-Zeilen bleiben erhalten', () => {
    const lines = ['RRULE:FREQ=WEEKLY;BYDAY=TU', 'EXDATE;TZID=Europe/Berlin:20261027T090000']
    const model = fromRRule(lines, START)
    expect(model).toEqual({
      freq: 'weekly',
      weekdays: ['TU'],
      end: never,
      extraLines: ['EXDATE;TZID=Europe/Berlin:20261027T090000'],
    })
    expect(toRRule(model, START)).toEqual(lines)
  })
})

describe('fromRRule', () => {
  it('ohne Zeilen keine Wiederholung', () => {
    expect(fromRRule(undefined, START)).toEqual({ freq: 'none', weekdays: [], end: never })
    expect(fromRRule([], START).freq).toBe('none')
  })

  it('wöchentlich ohne BYDAY ergibt den Wochentag des Starts', () => {
    expect(fromRRule(['RRULE:FREQ=WEEKLY'], START)).toMatchObject({
      freq: 'weekly',
      weekdays: ['TU'],
    })
  })

  it('monatlich mit BYMONTHDAY = Starttag ist abbildbar', () => {
    expect(fromRRule(['RRULE:FREQ=MONTHLY;BYMONTHDAY=20'], START).freq).toBe('monthly')
  })

  const customCases: Record<string, string[]> = {
    jaehrlich: ['RRULE:FREQ=YEARLY'],
    BYSETPOS: ['RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1'],
    'Monat mit BYDAY': ['RRULE:FREQ=MONTHLY;BYDAY=1MO'],
    'INTERVAL 3': ['RRULE:FREQ=WEEKLY;INTERVAL=3;BYDAY=TU'],
    'taeglich INTERVAL 2': ['RRULE:FREQ=DAILY;INTERVAL=2'],
    'abweichender BYMONTHDAY': ['RRULE:FREQ=MONTHLY;BYMONTHDAY=15'],
    'Wochentag mit Ordnungszahl': ['RRULE:FREQ=WEEKLY;BYDAY=1MO'],
    'UNTIL und COUNT': ['RRULE:FREQ=DAILY;COUNT=3;UNTIL=20261231'],
    'unbekannter Parameter': ['RRULE:FREQ=DAILY;BYHOUR=9'],
    'WKST SU bei INTERVAL 2': ['RRULE:FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=TU'],
    'ungültiges WKST': ['RRULE:FREQ=DAILY;WKST=XX'],
    'ungültiges UNTIL': ['RRULE:FREQ=DAILY;UNTIL=morgen'],
    'zwei Regeln': ['RRULE:FREQ=DAILY', 'RRULE:FREQ=WEEKLY'],
    RDATE: ['RRULE:FREQ=DAILY', 'RDATE:20261101T070000Z'],
    'ungueltige Anzahl': ['RRULE:FREQ=DAILY;COUNT=0'],
  }
  for (const [name, lines] of Object.entries(customCases)) {
    it(`nicht abbildbar (${name}) ergibt custom mit Originalzeilen`, () => {
      expect(fromRRule(lines, START)).toEqual({ freq: 'custom', lines })
      expect(toRRule(fromRRule(lines, START), START)).toEqual(lines)
    })
  }
})

describe('weekdayOf', () => {
  it('liefert das Kürzel', () => {
    expect(weekdayOf('2026-10-19')).toBe('MO')
    expect(weekdayOf('2026-10-25')).toBe('SU')
  })
})
