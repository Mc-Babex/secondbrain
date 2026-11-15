import { describe, expect, it } from 'vitest'
import { joinDescription, parseEvent, seriesTimesFromOccurrence, splitDescription } from './events'

const TIMED = {
  id: 'ev1',
  summary: 'Zahnarzt',
  location: 'Praxis',
  description: 'Bitte Karte mitbringen',
  start: { dateTime: '2026-10-20T14:00:00+02:00' },
  end: { dateTime: '2026-10-20T15:00:00+02:00' },
  organizer: { self: true, email: 'me@example.com' },
}

describe('parseEvent', () => {
  it('liest einen vollständigen eigenen Termin', () => {
    expect(parseEvent(TIMED)).toEqual({
      id: 'ev1',
      title: 'Zahnarzt',
      start: '2026-10-20T14:00:00+02:00',
      end: '2026-10-20T15:00:00+02:00',
      allDay: false,
      location: 'Praxis',
      description: 'Bitte Karte mitbringen',
      organizerSelf: true,
      hasGuests: false,
      editable: true,
    })
  })

  it('liest ganztägige Termine mit startDate/endDate (Ende exklusiv)', () => {
    const event = parseEvent({
      id: 'u',
      summary: 'Urlaub',
      start: { date: '2026-10-20' },
      end: { date: '2026-10-22' },
    })
    expect(event).toMatchObject({
      allDay: true,
      start: '2026-10-20',
      end: '2026-10-22',
      startDate: '2026-10-20',
      endDate: '2026-10-22',
      organizerSelf: true,
      editable: true,
    })
  })

  it('liest die Serie mit Wiederholungszeilen', () => {
    const event = parseEvent({
      ...TIMED,
      id: 'serie1',
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TU', 'EXDATE:20261027T120000Z', 42],
    })
    expect(event?.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=TU', 'EXDATE:20261027T120000Z'])
    expect(event?.recurringEventId).toBeUndefined()
  })

  it('liest ein Vorkommen mit recurringEventId', () => {
    const event = parseEvent({
      ...TIMED,
      id: 'serie1_20261020T120000Z',
      recurringEventId: 'serie1',
      originalStartTime: { dateTime: '2026-10-20T14:00:00+02:00' },
    })
    expect(event?.recurringEventId).toBe('serie1')
    expect(event?.recurrence).toBeUndefined()
  })

  it('Einladung eines fremden Organisators ist nicht bearbeitbar', () => {
    const event = parseEvent({
      ...TIMED,
      organizer: { email: 'chef@example.com' },
      attendees: [
        { email: 'chef@example.com', organizer: true },
        { email: 'me@example.com', self: true },
      ],
    })
    expect(event).toMatchObject({ organizerSelf: false, editable: false, hasGuests: true })
  })

  it('Gäste: nur andere Teilnehmer zählen', () => {
    const own = parseEvent({ ...TIMED, attendees: [{ email: 'me@example.com', self: true }] })
    expect(own?.hasGuests).toBe(false)
    const guests = parseEvent({
      ...TIMED,
      attendees: [{ email: 'me@example.com', self: true }, { email: 'a@example.com' }],
    })
    expect(guests).toMatchObject({ hasGuests: true, organizerSelf: true })
  })

  it('freie und abgelehnte Termine werden markiert', () => {
    const event = parseEvent({
      ...TIMED,
      transparency: 'transparent',
      attendees: [{ self: true, responseStatus: 'declined' }],
    })
    expect(event).toMatchObject({ transparent: true, declined: true })
  })

  it('fehlerhafte Felder: sichere Standards bzw. verworfen', () => {
    expect(parseEvent(null)).toBeNull()
    expect(parseEvent('x')).toBeNull()
    expect(parseEvent([])).toBeNull()
    expect(parseEvent({ summary: 'ohne id' })).toBeNull()
    expect(parseEvent({ id: 5 })).toBeNull()
    expect(parseEvent({ ...TIMED, status: 'cancelled' })).toBeNull()
    const bad = parseEvent({
      id: 'x',
      summary: 7,
      location: 3,
      description: {},
      recurringEventId: 9,
      recurrence: 'RRULE:FREQ=DAILY',
      start: 'kaputt',
      end: null,
      organizer: 'ich',
      attendees: 'viele',
    })
    expect(bad).toEqual({
      id: 'x',
      title: '',
      start: '',
      end: '',
      allDay: false,
      organizerSelf: true,
      hasGuests: false,
      editable: true,
    })
  })
})

describe('Beschreibung trennen und zusammensetzen', () => {
  it('erkennt die aktuelle Form aus createEvent', () => {
    expect(splitDescription('Erstellt mit SecondBrain')).toEqual({
      note: '',
      marker: 'Erstellt mit SecondBrain',
    })
  })

  it('erkennt die Form mit Claude-Lauf und Eintrags-ID', () => {
    const description = 'Erstellt mit SecondBrain (Claude-Lauf)\nEintrag: 20261019-122438-3tnv'
    expect(splitDescription(description)).toEqual({ note: '', marker: description })
  })

  it('Notiz vor der Markierung; Markierung bleibt beim Bearbeiten erhalten', () => {
    const marker = 'Erstellt mit SecondBrain\nEintrag: abc-1'
    const split = splitDescription(`Mitbringen: Ausweis\n\n${marker}`)
    expect(split).toEqual({ note: 'Mitbringen: Ausweis', marker })
    expect(joinDescription('Neue Notiz', split.marker)).toBe(`Neue Notiz\n\n${marker}`)
    expect(joinDescription('', split.marker)).toBe(marker)
    expect(splitDescription(joinDescription('Neue Notiz', split.marker))).toEqual({
      note: 'Neue Notiz',
      marker,
    })
  })

  it('Markierung am Anfang wird erkannt', () => {
    expect(splitDescription('Erstellt mit SecondBrain\nText danach')).toEqual({
      note: 'Text danach',
      marker: 'Erstellt mit SecondBrain',
    })
  })

  it('Beschreibung ohne Markierung bleibt unverändert', () => {
    const split = splitDescription('Nur Text\nzweite Zeile')
    expect(split).toEqual({ note: 'Nur Text\nzweite Zeile', marker: null })
    expect(joinDescription(split.note, split.marker)).toBe('Nur Text\nzweite Zeile')
    expect(splitDescription(undefined)).toEqual({ note: '', marker: null })
  })

  it('ähnlicher Text ohne Markierungszeile zählt nicht', () => {
    expect(splitDescription('Das wurde Erstellt mit SecondBrain gemacht').marker).toBeNull()
  })
})

describe('seriesTimesFromOccurrence', () => {
  it('behält das Serienstart-Datum, übernimmt Uhrzeit und Dauer', () => {
    expect(
      seriesTimesFromOccurrence(
        '2026-09-01T09:00:00+02:00',
        '2026-09-15T10:30:00+02:00',
        '2026-09-15T11:30:00+02:00',
      ),
    ).toEqual({ start: '2026-09-01T10:30:00+02:00', end: '2026-09-01T11:30:00+02:00' })
  })

  it('Serie ab Sommerzeit, Änderung im Winter: Wanduhrzeit bleibt, Offset der Serie', () => {
    expect(
      seriesTimesFromOccurrence(
        '2026-09-01T09:00:00+02:00',
        '2026-11-10T10:00:00+01:00',
        '2026-11-10T11:00:00+01:00',
      ),
    ).toEqual({ start: '2026-09-01T10:00:00+02:00', end: '2026-09-01T11:00:00+02:00' })
  })

  it('Serie ab Winterzeit, Änderung im Sommer', () => {
    expect(
      seriesTimesFromOccurrence(
        '2026-02-03T09:00:00+01:00',
        '2026-07-14T08:15:00+02:00',
        '2026-07-14T09:00:00+02:00',
      ),
    ).toEqual({ start: '2026-02-03T08:15:00+01:00', end: '2026-02-03T09:00:00+01:00' })
  })
})
