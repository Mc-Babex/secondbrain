import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../google/types'
import {
  allDayEvents,
  layoutDay,
  nowMinutes,
  rangeLabel,
  shiftAnchor,
  viewRange,
} from './calendarView'
import { toIso } from './time'

const at = (iso: string): Date => new Date(iso)

function ev(id: string, start: string, end: string, allDay = false): CalendarEvent {
  return { id, title: id, start, end, allDay }
}

describe('viewRange', () => {
  it('Tag: Kalendertag des Ankers in Berlin', () => {
    const range = viewRange(at('2026-10-17T10:00:00+02:00'), 'tag')
    expect(range).toEqual({
      days: ['2026-10-17'],
      timeMin: '2026-10-17T00:00:00+02:00',
      timeMax: '2026-10-18T00:00:00+02:00',
    })
  })

  it('verwendet den Berliner Tag, nicht den UTC-Tag', () => {
    const range = viewRange(at('2026-10-17T23:30:00+02:00'), 'tag')
    expect(range.days).toEqual(['2026-10-17'])
  })

  it('Woche: Montag bis Sonntag', () => {
    const range = viewRange(at('2026-10-17T10:00:00+02:00'), 'woche')
    expect(range.days[0]).toBe('2026-10-12')
    expect(range.days[6]).toBe('2026-10-18')
    expect(range.days).toHaveLength(7)
    expect(range.timeMin).toBe('2026-10-12T00:00:00+02:00')
    expect(range.timeMax).toBe('2026-10-19T00:00:00+02:00')
  })

  it('Woche mit Anker am Sonntag ist die Woche davor ab Montag', () => {
    const range = viewRange(at('2026-10-18T12:00:00+02:00'), 'woche')
    expect(range.days[0]).toBe('2026-10-12')
    expect(range.days[6]).toBe('2026-10-18')
  })

  it('Woche über die Zeitumstellung (25.10.2026) hat die richtigen Offsets', () => {
    const range = viewRange(at('2026-10-22T12:00:00+02:00'), 'woche')
    expect(range.days[0]).toBe('2026-10-19')
    expect(range.days[6]).toBe('2026-10-25')
    expect(range.timeMin).toBe('2026-10-19T00:00:00+02:00')
    expect(range.timeMax).toBe('2026-10-26T00:00:00+01:00')
    const next = viewRange(at('2026-10-28T12:00:00+01:00'), 'woche')
    expect(next.days[0]).toBe('2026-10-26')
    expect(next.days[6]).toBe('2026-11-01')
    expect(next.timeMin).toBe('2026-10-26T00:00:00+01:00')
    expect(next.timeMax).toBe('2026-11-02T00:00:00+01:00')
  })
})

describe('shiftAnchor', () => {
  it('springt um einen Tag', () => {
    expect(viewRange(shiftAnchor(at('2026-10-17T10:00:00+02:00'), 'tag', 1), 'tag').days).toEqual([
      '2026-10-18',
    ])
    expect(viewRange(shiftAnchor(at('2026-10-17T10:00:00+02:00'), 'tag', -1), 'tag').days).toEqual([
      '2026-10-16',
    ])
  })

  it('springt um sieben Tage, auch über die Zeitumstellung', () => {
    const forward = shiftAnchor(at('2026-10-22T10:00:00+02:00'), 'woche', 1)
    expect(viewRange(forward, 'woche').days[0]).toBe('2026-10-26')
    const back = shiftAnchor(at('2026-10-28T10:00:00+01:00'), 'woche', -1)
    expect(viewRange(back, 'woche').days[0]).toBe('2026-10-19')
    expect(toIso(shiftAnchor(at('2026-10-24T23:30:00+02:00'), 'tag', 1)).slice(0, 10)).toBe(
      '2026-10-25',
    )
    expect(toIso(shiftAnchor(at('2026-10-25T23:30:00+01:00'), 'tag', -1)).slice(0, 10)).toBe(
      '2026-10-24',
    )
  })
})

describe('rangeLabel', () => {
  it('Tag', () => {
    const range = viewRange(at('2026-10-17T10:00:00+02:00'), 'tag')
    expect(rangeLabel(range, 'tag')).toBe('Samstag, 17. Oktober 2026')
  })

  it('Woche innerhalb eines Monats', () => {
    const range = viewRange(at('2026-10-17T10:00:00+02:00'), 'woche')
    expect(rangeLabel(range, 'woche')).toBe('12.–18. Oktober 2026')
  })

  it('Woche über einen Monatswechsel', () => {
    const range = viewRange(at('2026-10-28T10:00:00+01:00'), 'woche')
    expect(rangeLabel(range, 'woche')).toBe('26. Oktober – 1. November 2026')
  })

  it('Woche über einen Jahreswechsel', () => {
    const range = viewRange(at('2026-12-30T10:00:00+01:00'), 'woche')
    expect(rangeLabel(range, 'woche')).toBe('28. Dezember 2026 – 3. Januar 2027')
  })
})

describe('layoutDay', () => {
  const DAY = '2026-10-17'

  it('nicht überlappende Termine bekommen je eine Spalte', () => {
    const result = layoutDay(
      [
        ev('b', '2026-10-17T11:00:00+02:00', '2026-10-17T12:00:00+02:00'),
        ev('a', '2026-10-17T09:00:00+02:00', '2026-10-17T10:00:00+02:00'),
      ],
      DAY,
    )
    expect(result.map((r) => [r.event.id, r.startMin, r.endMin, r.column, r.columns])).toEqual([
      ['a', 540, 600, 0, 1],
      ['b', 660, 720, 0, 1],
    ])
  })

  it('zwei überlappende Termine liegen nebeneinander', () => {
    const result = layoutDay(
      [
        ev('a', '2026-10-17T09:00:00+02:00', '2026-10-17T10:30:00+02:00'),
        ev('b', '2026-10-17T10:00:00+02:00', '2026-10-17T11:00:00+02:00'),
      ],
      DAY,
    )
    expect(result.map((r) => [r.column, r.columns])).toEqual([
      [0, 2],
      [1, 2],
    ])
  })

  it('drei überlappende Termine bekommen verschiedene Spalten; späterer Termin nutzt Spalte wieder', () => {
    const result = layoutDay(
      [
        ev('a', '2026-10-17T09:00:00+02:00', '2026-10-17T12:00:00+02:00'),
        ev('b', '2026-10-17T09:30:00+02:00', '2026-10-17T10:30:00+02:00'),
        ev('c', '2026-10-17T10:00:00+02:00', '2026-10-17T11:00:00+02:00'),
        ev('d', '2026-10-17T13:00:00+02:00', '2026-10-17T14:00:00+02:00'),
      ],
      DAY,
    )
    const byId = Object.fromEntries(result.map((r) => [r.event.id, r]))
    expect(new Set([byId.a.column, byId.b.column, byId.c.column]).size).toBe(3)
    expect([byId.a.columns, byId.b.columns, byId.c.columns]).toEqual([3, 3, 3])
    expect([byId.d.column, byId.d.columns]).toEqual([0, 1])
  })

  it('schneidet Termine über Mitternacht ab', () => {
    const night = ev('n', '2026-10-17T22:00:00+02:00', '2026-10-18T02:00:00+02:00')
    expect(layoutDay([night], '2026-10-17')[0]).toMatchObject({ startMin: 1320, endMin: 1440 })
    expect(layoutDay([night], '2026-10-18')[0]).toMatchObject({ startMin: 0, endMin: 120 })
  })

  it('lässt Termine eines anderen Tages und Ganztagstermine weg', () => {
    const result = layoutDay(
      [
        ev('x', '2026-10-18T09:00:00+02:00', '2026-10-18T10:00:00+02:00'),
        ev('g', '2026-10-17', '2026-10-18', true),
        ev('ende', '2026-10-16T23:00:00+02:00', '2026-10-17T00:00:00+02:00'),
      ],
      DAY,
    )
    expect(result).toEqual([])
  })

  it('Dauer 0 bekommt eine Mindesthöhe von 15 Minuten', () => {
    const [item] = layoutDay(
      [ev('z', '2026-10-17T09:00:00+02:00', '2026-10-17T09:00:00+02:00')],
      DAY,
    )
    expect(item.startMin).toBe(540)
    expect(item.endMin).toBe(555)
  })
})

describe('allDayEvents', () => {
  const events = [
    ev('urlaub', '2026-10-19', '2026-10-22', true),
    ev('eintag', '2026-10-20', '2026-10-21', true),
    ev('zeit', '2026-10-20T09:00:00+02:00', '2026-10-20T10:00:00+02:00'),
  ]

  it('deckt mehrtägige Termine ab, Ende exklusiv', () => {
    const ids = (day: string): string[] => allDayEvents(events, day).map((e) => e.id)
    expect(ids('2026-10-18')).toEqual([])
    expect(ids('2026-10-19')).toEqual(['urlaub'])
    expect(ids('2026-10-20')).toEqual(['urlaub', 'eintag'])
    expect(ids('2026-10-21')).toEqual(['urlaub'])
    expect(ids('2026-10-22')).toEqual([])
  })
})

describe('nowMinutes', () => {
  it('liefert Minuten seit Tagesbeginn oder null', () => {
    expect(nowMinutes(at('2026-10-17T09:30:00+02:00'), '2026-10-17')).toBe(570)
    expect(nowMinutes(at('2026-10-17T09:30:00+02:00'), '2026-10-18')).toBeNull()
  })
})
