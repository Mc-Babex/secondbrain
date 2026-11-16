import { describe, expect, it } from 'vitest'
import {
  isDateString,
  isItem,
  isProject,
  normalizeItem,
  normalizeProject,
  type Item,
  validSeries,
} from './types'

const legacy = {
  id: 'a',
  type: 'aufgabe',
  title: 'T',
  categoryId: 'privat',
  status: 'offen',
  createdAt: '2026-10-01T10:00:00+02:00',
  updatedAt: '2026-10-02T23:30:00+02:00',
}

function parse(raw: unknown): Item {
  if (!isItem(raw)) throw new Error('ungültig')
  return normalizeItem(raw)
}

describe('normalizeItem – GTD-Felder', () => {
  it('migriert eine offene Aufgabe ohne gtd und behält ★ und unbekannte Felder', () => {
    const n = parse({ ...legacy, important: true, extra: { x: 1 } })
    expect(n).toMatchObject({ gtd: 'naechster-schritt', important: true, extra: { x: 1 } })
    expect('v' in n).toBe(false)
  })

  it('lässt Notizen, Termine und Erledigtes ohne gtd', () => {
    expect(parse({ ...legacy, type: 'notiz' }).gtd).toBeUndefined()
    expect(parse({ ...legacy, type: 'termin' }).gtd).toBeUndefined()
    expect(parse({ ...legacy, status: 'erledigt' }).gtd).toBeUndefined()
  })

  it('ungültige neue Felder machen den Eintrag nicht ungültig, sondern gelten als fehlt', () => {
    const raw = {
      ...legacy,
      gtd: 'xyz',
      dueDate: 5,
      waiting: 'x',
      projectId: 7,
      projectOrder: 'a',
      seriesId: 1,
      seriesNumber: 'b',
      archivedWithProject: 'ja',
      v: 'zwei',
    }
    expect(isItem(raw)).toBe(true)
    const n = parse(raw)
    expect(n.gtd).toBe('naechster-schritt')
    for (const key of [
      'dueDate',
      'waiting',
      'projectId',
      'projectOrder',
      'seriesId',
      'seriesNumber',
      'archivedWithProject',
      'v',
    ]) {
      expect(key in n).toBe(false)
    }
  })

  it('übernimmt gültige Felder', () => {
    const n = parse({
      ...legacy,
      gtd: 'irgendwann',
      dueDate: '2026-11-20',
      projectId: 'p1',
      projectOrder: 1.5,
      seriesId: 's1',
      seriesNumber: 3,
      archivedWithProject: true,
      v: 2,
    })
    expect(n).toMatchObject({
      gtd: 'irgendwann',
      dueDate: '2026-11-20',
      projectId: 'p1',
      projectOrder: 1.5,
      seriesId: 's1',
      seriesNumber: 3,
      archivedWithProject: true,
      v: 2,
    })
  })

  it('ergänzt waiting bei „warten“ mit dem Datum von updatedAt', () => {
    expect(parse({ ...legacy, gtd: 'warten' }).waiting).toEqual({
      person: '',
      since: '2026-10-02',
      followUpOn: null,
    })
    const given = { person: 'Anna', since: '2026-11-01', extra: 1 }
    expect(parse({ ...legacy, gtd: 'warten', waiting: given }).waiting).toEqual({
      ...given,
      followUpOn: null,
    })
  })

  it('akzeptiert jede ganze Dauer ≥ 1', () => {
    expect(parse({ ...legacy, durationMin: 2 }).durationMin).toBe(2)
    expect(parse({ ...legacy, durationMin: 7 }).durationMin).toBe(7)
  })
})

describe('isDateString', () => {
  it('prüft das Format und den Kalendertag', () => {
    expect(isDateString('2026-11-16')).toBe(true)
    expect(isDateString('2026-02-30')).toBe(false)
    expect(isDateString('16.11.2026')).toBe(false)
    expect(isDateString(5)).toBe(false)
  })
})

describe('Projekt', () => {
  const raw = {
    id: 'p1',
    title: 'Analysis 1',
    categoryId: 'studium',
    status: 'aktiv',
    createdAt: '2026-11-16T09:00:00+01:00',
    updatedAt: '2026-11-16T09:00:00+01:00',
  }

  it('akzeptiert die Minimalform und ergänzt Standardwerte', () => {
    expect(isProject(raw)).toBe(true)
    if (!isProject(raw)) throw new Error('ungültig')
    expect(normalizeProject(raw)).toEqual({ ...raw, notes: '', completedAt: null, series: [] })
  })

  it('lehnt ungültige Projekte ab', () => {
    expect(isProject({ ...raw, status: 'fertig' })).toBe(false)
    expect(isProject({ ...raw, title: 3 })).toBe(false)
    expect(isProject({ ...raw, series: 'x' })).toBe(false)
    expect(isProject(null)).toBe(false)
  })

  it('erhält unbekannte Felder (auch in Serien), ergänzt Serien-Standardwerte, behält unbekannte Serien-Objekte', () => {
    const withSeries = {
      ...raw,
      extra: 1,
      v: 2,
      series: [
        {
          id: 's1',
          titlePattern: 'Blatt {Nr}',
          every: 1,
          weekday: 1,
          startDate: '2026-10-19',
          x: 9,
        },
        { id: 'kaputt' },
      ],
    }
    if (!isProject(withSeries)) throw new Error('ungültig')
    const n = normalizeProject(withSeries)
    expect(n).toMatchObject({ extra: 1, v: 2 })
    expect(n.series).toEqual([
      {
        id: 's1',
        titlePattern: 'Blatt {Nr}',
        every: 1,
        weekday: 1,
        startDate: '2026-10-19',
        x: 9,
        endDate: null,
        count: null,
        dueWeekday: null,
        durationMin: null,
        state: 'aktiv',
        lastNumber: 0,
        lastDate: null,
      },
      { id: 'kaputt' },
    ])
    expect(validSeries(n).map((x) => x.id)).toEqual(['s1'])
  })
})
