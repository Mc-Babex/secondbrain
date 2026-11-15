import { describe, expect, it } from 'vitest'
import { parseEvent, splitDescription } from './events'

const TIMED = {
  id: 'ev1',
  summary: 'Termin',
  start: { dateTime: '2026-10-20T14:00:00+02:00' },
  end: { dateTime: '2026-10-20T15:00:00+02:00' },
  organizer: { self: true },
}

describe('Beschreibung in HTML-Form', () => {
  const marker = 'Erstellt mit SecondBrain (Claude-Lauf)\nEintrag: 20261019-122438-3tnv'

  it('erkennt <br>, <br/>, <br />, &nbsp; und Absätze', () => {
    for (const html of [
      'Notiz<br><br>Erstellt mit SecondBrain (Claude-Lauf)<br>Eintrag: 20261019-122438-3tnv',
      'Notiz<br/><br/>Erstellt mit SecondBrain (Claude-Lauf)<br/>Eintrag: 20261019-122438-3tnv',
      'Notiz<br /><br />Erstellt mit SecondBrain (Claude-Lauf)<br />Eintrag: 20261019-122438-3tnv',
      '<p>Notiz</p><p>Erstellt mit SecondBrain (Claude-Lauf)&nbsp;<br>Eintrag: 20261019-122438-3tnv</p>',
      '<div>Notiz</div><div>Erstellt mit SecondBrain (Claude-Lauf)</div><div>Eintrag: 20261019-122438-3tnv</div>',
    ]) {
      expect(splitDescription(html)).toEqual({ note: 'Notiz', marker })
    }
  })

  it('nur Markierung in HTML ergibt leere Notiz', () => {
    expect(splitDescription('Erstellt mit SecondBrain')).toMatchObject({ note: '' })
    expect(splitDescription('<p>Erstellt mit SecondBrain</p>')).toEqual({
      note: '',
      marker: 'Erstellt mit SecondBrain',
    })
  })

  it('HTML ohne Markierung bleibt wortgetreu', () => {
    const html = '<p>Hallo&nbsp;Welt</p><br>\r\n  Ende  '
    expect(splitDescription(html)).toEqual({ note: html, marker: null })
  })
})

describe('Beschreibung: Trenner und Leerzeilen', () => {
  it('ohne Markierung kein trim und kein CRLF-Umbau', () => {
    const text = '  Zeile 1\r\n\r\nZeile 3  \n'
    expect(splitDescription(text)).toEqual({ note: text, marker: null })
  })

  it('Leerzeilen innerhalb der Notiz bleiben, nur der Trenner zur Markierung entfällt', () => {
    const split = splitDescription('Absatz 1\n\nAbsatz 2\n\nErstellt mit SecondBrain\nEintrag: x1')
    expect(split.note).toBe('Absatz 1\n\nAbsatz 2')
    expect(split.marker).toBe('Erstellt mit SecondBrain\nEintrag: x1')
  })
})

describe('parseEvent: Gäste und Ereignisart', () => {
  it('Ressourcen (Räume) zählen nicht als Gäste, Gruppen schon', () => {
    const room = parseEvent({
      ...TIMED,
      attendees: [{ email: 'raum@resource.calendar.google.com', resource: true }],
    })
    expect(room?.hasGuests).toBe(false)
    const group = parseEvent({ ...TIMED, attendees: [{ email: 'team@example.com' }] })
    expect(group?.hasGuests).toBe(true)
  })

  it('von Google verwaltete Ereignisarten sind nur lesbar', () => {
    for (const eventType of [
      'birthday',
      'fromGmail',
      'outOfOffice',
      'focusTime',
      'workingLocation',
    ]) {
      expect(parseEvent({ ...TIMED, eventType })?.editable).toBe(false)
    }
    expect(parseEvent({ ...TIMED, eventType: 'default' })?.editable).toBe(true)
  })
})
