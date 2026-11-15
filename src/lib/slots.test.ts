import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../google/types'
import {
  busyFromEvents,
  dayStartFrom,
  findSlot,
  localToDate,
  nextFreeSlotFromDayStart,
  nextQuarter,
  type Interval,
} from './slots'
import { toIso } from './time'

const window = { start: '09:00', end: '19:00' }
const at = (iso: string): Date => new Date(iso)
const block = (start: string, end: string): Interval => ({ start: at(start), end: at(end) })
const iso = (d: Date | null): string | null => (d ? toIso(d) : null)

describe('localToDate', () => {
  it('nutzt +02:00 vor und +01:00 nach der Zeitumstellung', () => {
    expect(toIso(localToDate('2026-10-24', '09:00'))).toBe('2026-10-24T09:00:00+02:00')
    expect(toIso(localToDate('2026-10-26', '09:00'))).toBe('2026-10-26T09:00:00+01:00')
    expect(localToDate('2026-10-26', '09:00').toISOString()).toBe('2026-10-26T08:00:00.000Z')
  })
})

describe('nextQuarter', () => {
  it('rundet auf die nächste Viertelstunde auf', () => {
    expect(iso(nextQuarter(at('2026-10-21T14:05:00+02:00')))).toBe('2026-10-21T14:15:00+02:00')
    expect(iso(nextQuarter(at('2026-10-21T14:15:01+02:00')))).toBe('2026-10-21T14:30:00+02:00')
    expect(iso(nextQuarter(at('2026-10-21T14:59:00+02:00')))).toBe('2026-10-21T15:00:00+02:00')
  })

  it('behält eine Zeit genau auf der Viertelstunde', () => {
    expect(iso(nextQuarter(at('2026-10-21T14:15:00+02:00')))).toBe('2026-10-21T14:15:00+02:00')
  })
})

describe('dayStartFrom', () => {
  it('liefert heute, solange das Fenster noch nicht begonnen hat', () => {
    expect(iso(dayStartFrom(at('2026-10-21T07:30:00+02:00'), window))).toBe(
      '2026-10-21T09:00:00+02:00',
    )
  })

  it('liefert morgen, sobald das Fenster begonnen hat', () => {
    expect(iso(dayStartFrom(at('2026-10-21T14:05:00+02:00'), window))).toBe(
      '2026-10-22T09:00:00+02:00',
    )
    expect(iso(dayStartFrom(at('2026-10-21T09:00:00+02:00'), window))).toBe(
      '2026-10-22T09:00:00+02:00',
    )
  })

  it('rechnet über die Zeitumstellung mit dem neuen Offset', () => {
    expect(iso(dayStartFrom(at('2026-10-24T12:00:00+02:00'), window))).toBe(
      '2026-10-25T09:00:00+01:00',
    )
  })
})

describe('findSlot', () => {
  const from = at('2026-10-21T14:15:00+02:00')

  it('findet den ersten freien Start auf einer Viertelstunde', () => {
    const slot = findSlot({ busy: [], window, from, durationMin: 30 })
    expect(iso(slot)).toBe('2026-10-21T14:15:00+02:00')
  })

  it('erlaubt Berühren: Ende 10:30 und Beginn 10:30 sind frei', () => {
    const busy = [block('2026-10-22T09:00:00+02:00', '2026-10-22T10:30:00+02:00')]
    const slot = findSlot({ busy, window, from: at('2026-10-22T09:00:00+02:00'), durationMin: 15 })
    expect(iso(slot)).toBe('2026-10-22T10:30:00+02:00')
    const before = findSlot({
      busy: [block('2026-10-22T10:30:00+02:00', '2026-10-22T11:00:00+02:00')],
      window,
      from: at('2026-10-22T10:00:00+02:00'),
      durationMin: 30,
    })
    expect(iso(before)).toBe('2026-10-22T10:00:00+02:00')
  })

  it('überspringt Überschneidungen', () => {
    const busy = [block('2026-10-21T15:00:00+02:00', '2026-10-21T16:00:00+02:00')]
    expect(iso(findSlot({ busy, window, from, durationMin: 120 }))).toBe(
      '2026-10-21T16:00:00+02:00',
    )
  })

  it('verlangt, dass der Block vollständig im Fenster endet', () => {
    const late = at('2026-10-21T18:00:00+02:00')
    expect(iso(findSlot({ busy: [], window, from: late, durationMin: 60 }))).toBe(
      '2026-10-21T18:00:00+02:00',
    )
    expect(
      iso(findSlot({ busy: [], window, from: late, durationMin: 75, sameDayOnly: true })),
    ).toBeNull()
  })

  it('beginnt vor dem Fensterbeginn erst im Fenster', () => {
    const early = at('2026-10-21T06:00:00+02:00')
    expect(iso(findSlot({ busy: [], window, from: early, durationMin: 30 }))).toBe(
      '2026-10-21T09:00:00+02:00',
    )
  })

  it('wechselt auf den nächsten Tag, wenn der Tag voll ist', () => {
    const busy = [block('2026-10-21T09:00:00+02:00', '2026-10-21T19:00:00+02:00')]
    expect(iso(findSlot({ busy, window, from, durationMin: 30 }))).toBe('2026-10-22T09:00:00+02:00')
  })

  it('sucht mit sameDayOnly nur am Tag von from', () => {
    const busy = [block('2026-10-21T09:00:00+02:00', '2026-10-21T19:00:00+02:00')]
    expect(findSlot({ busy, window, from, durationMin: 30, sameDayOnly: true })).toBeNull()
  })

  it('gibt null zurück, wenn im Horizont nichts frei ist', () => {
    const busy = [block('2026-10-01T00:00:00+02:00', '2026-12-01T00:00:00+01:00')]
    expect(findSlot({ busy, window, from, durationMin: 30 })).toBeNull()
  })

  it('beachtet den Horizont (Standard 14 Tage)', () => {
    const lastDayFree = [block('2026-10-21T00:00:00+02:00', '2026-11-03T00:00:00+01:00')]
    expect(iso(findSlot({ busy: lastDayFree, window, from, durationMin: 30 }))).toBe(
      '2026-11-03T09:00:00+01:00',
    )
    const allBusy = [block('2026-10-21T00:00:00+02:00', '2026-11-04T00:00:00+01:00')]
    expect(findSlot({ busy: allBusy, window, from, durationMin: 30 })).toBeNull()
  })

  it('plant auch am Wochenende', () => {
    const slot = findSlot({
      busy: [],
      window,
      from: at('2026-10-24T10:00:00+02:00'),
      durationMin: 30,
    })
    expect(iso(slot)).toBe('2026-10-24T10:00:00+02:00')
  })
})

describe('busyFromEvents', () => {
  const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
    id: 'e',
    title: '',
    start: '2026-10-22T10:00:00+02:00',
    end: '2026-10-22T11:00:00+02:00',
    allDay: false,
    ...over,
  })

  it('übernimmt normale Termine und lässt ganztägige, freie, abgelehnte und eigene weg', () => {
    const busy = busyFromEvents(
      [
        ev({ id: 'a' }),
        ev({ id: 'b', allDay: true, start: '2026-10-22', end: '2026-10-23' }),
        ev({ id: 'c', transparent: true }),
        ev({ id: 'd', declined: true }),
        ev({ id: 'own' }),
      ],
      'own',
    )
    expect(busy).toHaveLength(1)
    expect(busy[0].start.toISOString()).toBe('2026-10-22T08:00:00.000Z')
  })
})

describe('busyFromEvents mit Serien-Vorkommen', () => {
  it('zählt Vorkommen einer Serie (singleEvents) als belegt', () => {
    const busy = busyFromEvents([
      {
        id: 'serie1_20261022T080000Z',
        title: 'Runde',
        start: '2026-10-22T10:00:00+02:00',
        end: '2026-10-22T11:00:00+02:00',
        allDay: false,
        recurringEventId: 'serie1',
      },
    ])
    expect(busy).toHaveLength(1)
    const slot = findSlot({
      busy,
      window,
      from: at('2026-10-22T10:00:00+02:00'),
      durationMin: 60,
      sameDayOnly: true,
    })
    expect(iso(slot)).toBe('2026-10-22T11:00:00+02:00')
  })
})

describe('nextFreeSlotFromDayStart', () => {
  const base = { window, durationMin: 15 }

  it('nimmt nach 14:05 morgen ab Fensterbeginn', () => {
    const slot = nextFreeSlotFromDayStart({
      ...base,
      now: at('2026-10-21T14:05:00+02:00'),
      busy: [],
    })
    expect(iso(slot)).toBe('2026-10-22T09:00:00+02:00')
  })

  it('nimmt vor Fensterbeginn heute ab Fensterbeginn', () => {
    const slot = nextFreeSlotFromDayStart({
      ...base,
      now: at('2026-10-21T06:00:00+02:00'),
      busy: [],
    })
    expect(iso(slot)).toBe('2026-10-21T09:00:00+02:00')
  })

  it('überspringt belegte Zeiträume', () => {
    const busy = [block('2026-10-22T09:00:00+02:00', '2026-10-22T09:45:00+02:00')]
    const slot = nextFreeSlotFromDayStart({ ...base, now: at('2026-10-21T14:05:00+02:00'), busy })
    expect(iso(slot)).toBe('2026-10-22T09:45:00+02:00')
  })

  it('liefert null, wenn 14 Tage lang nichts frei ist', () => {
    const busy = [block('2026-10-22T00:00:00+02:00', '2026-11-30T00:00:00+01:00')]
    const slot = nextFreeSlotFromDayStart({ ...base, now: at('2026-10-21T14:05:00+02:00'), busy })
    expect(slot).toBeNull()
  })
})

describe('findSlot mit Pause', () => {
  const pause = { start: '12:00', end: '13:00' }
  const from = at('2026-10-22T09:00:00+02:00')

  it('legt keinen Block in die Pause', () => {
    const busy = [block('2026-10-22T09:00:00+02:00', '2026-10-22T11:00:00+02:00')]
    expect(iso(findSlot({ busy, window, from, durationMin: 120 }))).toBe(
      '2026-10-22T11:00:00+02:00',
    )
    expect(iso(findSlot({ busy, window, pause, from, durationMin: 120 }))).toBe(
      '2026-10-22T13:00:00+02:00',
    )
  })

  it('erlaubt Blöcke, die genau an der Pause enden oder beginnen', () => {
    const busy = [block('2026-10-22T09:00:00+02:00', '2026-10-22T11:00:00+02:00')]
    expect(iso(findSlot({ busy, window, pause, from, durationMin: 60 }))).toBe(
      '2026-10-22T11:00:00+02:00',
    )
  })

  it('schiebt einen 15-Min.-Block, dessen erster freier Slot in der Pause läge, dahinter', () => {
    const busy = [block('2026-10-22T09:00:00+02:00', '2026-10-22T12:00:00+02:00')]
    expect(iso(findSlot({ busy, window, pause, from, durationMin: 15 }))).toBe(
      '2026-10-22T13:00:00+02:00',
    )
  })

  it('findet bei Freiraum nur um die Pause herum nichts (sameDayOnly)', () => {
    const busy = [
      block('2026-10-24T09:00:00+02:00', '2026-10-24T11:30:00+02:00'),
      block('2026-10-24T13:30:00+02:00', '2026-10-24T19:00:00+02:00'),
    ]
    const sat = at('2026-10-24T09:00:00+02:00')
    expect(
      iso(findSlot({ busy, window, pause, from: sat, durationMin: 90, sameDayOnly: true })),
    ).toBeNull()
    expect(iso(findSlot({ busy, window, from: sat, durationMin: 90, sameDayOnly: true }))).toBe(
      '2026-10-24T11:30:00+02:00',
    )
  })

  it('Überlänge (7 h > 6 h) darf über die Pause laufen, 6 h nicht', () => {
    const f = at('2026-10-27T09:00:00+01:00')
    expect(iso(findSlot({ busy: [], window, pause, from: f, durationMin: 420 }))).toBe(
      '2026-10-27T09:00:00+01:00',
    )
    expect(iso(findSlot({ busy: [], window, pause, from: f, durationMin: 360 }))).toBe(
      '2026-10-27T13:00:00+01:00',
    )
  })

  it('rechnet die Pause am Zeitumstellungstag (So 25.10.) in Ortszeit', () => {
    const f = at('2026-10-25T09:00:00+01:00')
    expect(iso(findSlot({ busy: [], window, pause, from: f, durationMin: 240 }))).toBe(
      '2026-10-25T13:00:00+01:00',
    )
    const busy = [block('2026-10-25T09:00:00+01:00', '2026-10-25T12:00:00+01:00')]
    expect(iso(findSlot({ busy, window, pause, from: f, durationMin: 15 }))).toBe(
      '2026-10-25T13:00:00+01:00',
    )
  })

  it('nextFreeSlotFromDayStart beachtet die Pause', () => {
    const busy = [block('2026-10-22T09:00:00+02:00', '2026-10-22T11:00:00+02:00')]
    expect(
      iso(
        nextFreeSlotFromDayStart({
          now: at('2026-10-21T14:05:00+02:00'),
          window,
          pause,
          busy,
          durationMin: 120,
        }),
      ),
    ).toBe('2026-10-22T13:00:00+02:00')
  })
})
