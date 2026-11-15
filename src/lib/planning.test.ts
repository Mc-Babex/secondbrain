import { describe, expect, it } from 'vitest'
import { effectivePause, pauseForDuration, suggestSlot, zonedToDate } from './planning'
import { toIso } from './time'

const WINDOW = { start: '08:00', end: '18:00' }
const slot = (iso: string, duration = 30, window = WINDOW): string =>
  toIso(suggestSlot(new Date(iso), window, duration))

describe('suggestSlot', () => {
  it('vor dem Fenster ergibt den Fensterbeginn', () => {
    expect(slot('2026-10-20T05:10:00+02:00')).toBe('2026-10-20T08:00:00+02:00')
  })

  it('im Fenster ergibt die nächste volle Viertelstunde', () => {
    expect(slot('2026-10-20T10:01:00+02:00')).toBe('2026-10-20T10:15:00+02:00')
    expect(slot('2026-10-20T10:15:00+02:00')).toBe('2026-10-20T10:15:00+02:00')
    expect(slot('2026-10-20T10:15:30+02:00')).toBe('2026-10-20T10:30:00+02:00')
    expect(slot('2026-10-20T10:46:00+02:00')).toBe('2026-10-20T11:00:00+02:00')
  })

  it('nach dem Fenster ergibt den nächsten Tag zum Fensterbeginn', () => {
    expect(slot('2026-10-20T19:20:00+02:00')).toBe('2026-10-21T08:00:00+02:00')
    expect(slot('2026-10-20T23:50:00+02:00')).toBe('2026-10-21T08:00:00+02:00')
  })

  it('wenn die Dauer heute nicht mehr passt, wird auf morgen verschoben', () => {
    expect(slot('2026-10-20T17:30:00+02:00', 60)).toBe('2026-10-21T08:00:00+02:00')
    expect(slot('2026-10-20T17:30:00+02:00', 30)).toBe('2026-10-20T17:30:00+02:00')
  })

  it('Umstellung auf Winterzeit (25.10.2026): Offset passt', () => {
    expect(slot('2026-10-24T19:00:00+02:00')).toBe('2026-10-25T08:00:00+01:00')
    expect(slot('2026-10-26T05:00:00+01:00', 30, { start: '00:00', end: '23:00' })).toBe(
      '2026-10-26T05:00:00+01:00',
    )
  })

  it('Umstellung auf Sommerzeit (29.03.2026): Offset passt', () => {
    expect(slot('2026-03-28T19:00:00+01:00')).toBe('2026-03-29T08:00:00+02:00')
    expect(slot('2026-03-29T09:10:00+02:00')).toBe('2026-03-29T09:15:00+02:00')
  })
})

describe('zonedToDate', () => {
  it('liefert den Zeitpunkt der Berliner Wanduhrzeit', () => {
    expect(zonedToDate(2026, 7, 1, 12, 0).toISOString()).toBe('2026-07-01T10:00:00.000Z')
    expect(zonedToDate(2026, 12, 1, 12, 0).toISOString()).toBe('2026-12-01T11:00:00.000Z')
  })
})

describe('effectivePause', () => {
  const planningWindow = { start: '09:00', end: '19:00' }
  it('fehlendes Feld ⇒ Standard 12:00–13:00', () => {
    expect(effectivePause({ planningWindow })).toEqual({ start: '12:00', end: '13:00' })
  })
  it('null ⇒ keine Pause', () => {
    expect(effectivePause({ planningWindow, pause: null })).toBeNull()
  })
  it('gültige Pause bleibt erhalten', () => {
    expect(effectivePause({ planningWindow, pause: { start: '12:30', end: '13:30' } })).toEqual({
      start: '12:30',
      end: '13:30',
    })
  })
  it.each([
    [{ start: '13:00', end: '12:00' }],
    [{ start: '12:00', end: '12:00' }],
    [{ start: '08:00', end: '09:30' }],
    [{ start: '18:30', end: '19:30' }],
    [{ start: 'x', end: '13:00' }],
    ['12:00'],
    [42],
  ])('ungültig %j ⇒ keine Pause', (pause) => {
    expect(effectivePause({ planningWindow, pause })).toBeNull()
  })
})

describe('pauseForDuration', () => {
  const w = { start: '09:00', end: '19:00' }
  const p = { start: '12:00', end: '13:00' }
  it('gilt bis zur Länge des längeren Fensterteils (6 h), danach nicht mehr', () => {
    expect(pauseForDuration(w, p, 360)).toEqual(p)
    expect(pauseForDuration(w, p, 375)).toBeNull()
    expect(pauseForDuration(w, null, 30)).toBeNull()
  })
})

describe('suggestSlot mit Pause', () => {
  const w = { start: '09:00', end: '19:00' }
  const p = { start: '12:00', end: '13:00' }
  it('springt hinter die Pause, wenn der Block hineinragt', () => {
    expect(toIso(suggestSlot(new Date('2026-10-21T11:35:00+02:00'), w, 60, p))).toBe(
      '2026-10-21T13:00:00+02:00',
    )
    expect(toIso(suggestSlot(new Date('2026-10-21T12:10:00+02:00'), w, 15, p))).toBe(
      '2026-10-21T13:00:00+02:00',
    )
  })
  it('lässt Blöcke vor der Pause und ohne Pause unverändert', () => {
    expect(toIso(suggestSlot(new Date('2026-10-21T10:50:00+02:00'), w, 60, p))).toBe(
      '2026-10-21T11:00:00+02:00',
    )
    expect(toIso(suggestSlot(new Date('2026-10-21T11:35:00+02:00'), w, 60, null))).toBe(
      '2026-10-21T11:45:00+02:00',
    )
  })
  it('wählt am Folgetag hinter der Pause, wenn der Block morgens nicht vor die Pause passt', () => {
    expect(toIso(suggestSlot(new Date('2026-10-21T18:30:00+02:00'), w, 240, p))).toBe(
      '2026-10-22T13:00:00+02:00',
    )
  })
  it('Überlänge darf über die Pause laufen', () => {
    expect(toIso(suggestSlot(new Date('2026-10-21T08:00:00+02:00'), w, 420, p))).toBe(
      '2026-10-21T09:00:00+02:00',
    )
  })
})
