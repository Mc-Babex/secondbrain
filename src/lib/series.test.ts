import { describe, expect, it } from 'vitest'
import type { Item, StepSeries } from '../data/types'
import {
  dueInstances,
  instanceId,
  instanceTitle,
  nextOccurrence,
  nextSkipDate,
  remainingOccurrences,
  nthOccurrence,
  occurrences,
  pausedOccurrences,
  previewNext,
  recomputeOpenInstances,
  upcomingOccurrences,
} from './series'

const series = (patch: Partial<StepSeries> = {}): StepSeries => ({
  id: 's1',
  titlePattern: 'Übungsblatt {Nr}',
  every: 1,
  weekday: 1,
  startDate: '2026-10-19',
  endDate: '2027-02-12',
  count: null,
  dueWeekday: 5,
  durationMin: 180,
  state: 'aktiv',
  skippedDates: [],
  lastNumber: 0,
  lastDate: null,
  ...patch,
})

const project = { id: 'p1', categoryId: 'studium' }

const item = (patch: Partial<Item>): Item => ({
  id: 'x',
  type: 'aufgabe',
  title: 'T',
  notes: '',
  categoryId: 'studium',
  status: 'offen',
  important: false,
  durationMin: null,
  schedule: null,
  originalCategoryId: null,
  createdAt: '2026-10-01T10:00:00+02:00',
  updatedAt: '2026-10-01T10:00:00+02:00',
  completedAt: null,
  ...patch,
})

/** Legt die Instanzen wie der Sync an und führt Nummer/Datum nach. */
function run(s: StepSeries, existing: Item[], today: string, max?: number) {
  const due = dueInstances(project, s, existing, today, max)
  return { due, next: { ...s, lastNumber: due.lastNumber, lastDate: due.lastDate } }
}

describe('occurrences', () => {
  it('erster Stichtag ist der erste Wochentag ab Start, dann wöchentlich', () => {
    const s = series({ startDate: '2026-10-20' }) // Dienstag
    expect(occurrences(s, null, '2026-11-09')).toEqual(['2026-10-26', '2026-11-02', '2026-11-09'])
  })

  it('Stichtag gleich Start zählt', () => {
    expect(occurrences(series(), null, '2026-10-19')).toEqual(['2026-10-19'])
  })

  it('fromExclusive ist ausgeschlossen, toInclusive eingeschlossen', () => {
    expect(occurrences(series(), '2026-10-19', '2026-11-02')).toEqual(['2026-10-26', '2026-11-02'])
  })

  it('alle 2 Wochen', () => {
    const s = series({ every: 2 })
    expect(occurrences(s, null, '2026-11-16')).toEqual(['2026-10-19', '2026-11-02', '2026-11-16'])
    expect(occurrences(s, '2026-10-26', '2026-11-16')).toEqual(['2026-11-02', '2026-11-16'])
  })

  it('endet am endDate (einschließlich) und nicht danach', () => {
    const all = occurrences(series(), null, '2027-12-31')
    expect(all.at(-1)).toBe('2027-02-08')
    expect(all).toHaveLength(17)
    expect(occurrences(series({ endDate: '2026-10-26' }), null, '2027-12-31')).toEqual([
      '2026-10-19',
      '2026-10-26',
    ])
  })

  it('count begrenzt die Nummern unter Berücksichtigung von lastNumber', () => {
    const s = series({ endDate: null, count: 3 })
    expect(occurrences(s, null, '2027-12-31')).toHaveLength(3)
    expect(occurrences({ ...s, lastNumber: 2 }, '2026-11-02', '2027-12-31')).toEqual(['2026-11-09'])
    expect(occurrences({ ...s, lastNumber: 3 }, '2026-11-09', '2027-12-31')).toEqual([])
  })

  it('ohne Ende, ungültiger Wochentag', () => {
    expect(occurrences(series({ endDate: null }), null, '2027-12-31').length).toBeGreaterThan(60)
    expect(occurrences(series({ weekday: 9 }), null, '2027-12-31')).toEqual([])
  })
})

describe('instanceTitle / instanceId / previewNext', () => {
  it('ersetzt {Nr} oder hängt die Nummer an', () => {
    expect(instanceTitle('Blatt {Nr} abgeben', 5)).toBe('Blatt 5 abgeben')
    expect(instanceTitle('Übungsblatt', 5)).toBe('Übungsblatt 5')
  })

  it('ID ist deterministisch und hat das Format laut SPEC', () => {
    const id = instanceId('p1', 's1', '2026-10-19')
    expect(id).toMatch(/^20261019-000000-[a-z0-9]{4}$/)
    expect(instanceId('p1', 's1', '2026-10-19')).toBe(id)
    expect(instanceId('p1', 's1', '2026-10-26')).not.toBe(id)
    expect(instanceId('p2', 's1', '2026-10-19')).not.toBe(id)
    expect(instanceId('p1', 's2', '2026-10-19')).not.toBe(id)
  })

  it('Vorschau der nächsten Instanzen', () => {
    const s = series({ lastNumber: 4, lastDate: '2026-11-09' })
    expect(previewNext(s)).toEqual([
      { number: 5, date: '2026-11-16', title: 'Übungsblatt 5', dueDate: '2026-11-20' },
      { number: 6, date: '2026-11-23', title: 'Übungsblatt 6', dueDate: '2026-11-27' },
      { number: 7, date: '2026-11-30', title: 'Übungsblatt 7', dueDate: '2026-12-04' },
    ])
    expect(previewNext(s, 1)).toHaveLength(1)
  })
})

describe('dueInstances', () => {
  it('Beispiel: Nr. 1 am Start, nichts am Dienstag, Nr. 2 am nächsten Montag', () => {
    const first = run(series(), [], '2026-10-19')
    expect(first.due.instances).toHaveLength(1)
    expect(first.due.instances[0]).toMatchObject({
      title: 'Übungsblatt 1',
      dueDate: '2026-10-23',
      durationMin: 180,
      categoryId: 'studium',
      projectId: 'p1',
      projectOrder: 1,
      seriesId: 's1',
      seriesNumber: 1,
      gtd: 'naechster-schritt',
      notes: '',
      status: 'offen',
      type: 'aufgabe',
    })
    expect(first.due.instances[0].id).toBe(instanceId('p1', 's1', '2026-10-19'))
    const tuesday = run(first.next, first.due.instances, '2026-10-20')
    expect(tuesday.due.instances).toEqual([])
    const second = run(tuesday.next, first.due.instances, '2026-10-26')
    expect(second.due.instances.map((i) => i.title)).toEqual(['Übungsblatt 2'])
    expect(second.due.instances[0].dueDate).toBe('2026-10-30')
  })

  it('kein Blatt nach dem Ende', () => {
    const { due } = run(series(), [], '2027-06-01', 100)
    expect(due.instances).toHaveLength(17)
    expect(due.instances.at(-1)?.title).toBe('Übungsblatt 17')
    expect(due.lastDate).toBe('2027-02-08')
  })

  it('holt versäumte Blätter fortlaufend nach, höchstens 10 je Aufruf', () => {
    const s = series({ lastNumber: 1, lastDate: '2026-10-19' })
    const three = run(s, [], '2026-11-09')
    expect(three.due.instances.map((i) => i.title)).toEqual([
      'Übungsblatt 2',
      'Übungsblatt 3',
      'Übungsblatt 4',
    ])
    expect(three.due.instances.map((i) => i.projectOrder)).toEqual([1, 2, 3])
    const many = run(series(), [], '2027-02-01')
    expect(many.due.instances).toHaveLength(10)
    const rest = run(many.next, many.due.instances, '2027-02-01')
    expect(rest.due.instances.map((i) => i.seriesNumber)).toEqual([11, 12, 13, 14, 15, 16])
  })

  it('Nummer und Datum aus vorhandenen Einträgen (auch archivierte) überwiegen die Serie', () => {
    const done = item({
      id: instanceId('p1', 's1', '2026-10-26'),
      projectId: 'p1',
      seriesId: 's1',
      seriesNumber: 2,
      status: 'erledigt',
      projectOrder: 7,
    })
    const { due } = run(series(), [done], '2026-11-02')
    expect(due.instances.map((i) => [i.seriesNumber, i.id.slice(0, 8), i.projectOrder])).toEqual([
      [3, '20261102', 8],
    ])
    expect(due.lastNumber).toBe(3)
  })

  it('erledigte oder gelöschte Instanz entsteht nicht neu', () => {
    const done = item({
      id: instanceId('p1', 's1', '2026-10-19'),
      projectId: 'p1',
      seriesId: 's1',
      seriesNumber: 1,
      status: 'erledigt',
    })
    expect(run(series(), [done], '2026-10-19').due.instances).toEqual([])
    // gelöscht: nur noch lastDate der Serie schützt
    const deleted = series({ lastNumber: 1, lastDate: '2026-10-19' })
    expect(run(deleted, [], '2026-10-19').due.instances).toEqual([])
  })

  it('Pausieren: keine Blätter, Fortsetzen ab gestern ohne Nummernlücke', () => {
    const s = series({ lastNumber: 1, lastDate: '2026-10-19', state: 'pausiert' })
    expect(run(s, [], '2026-11-02').due.instances).toEqual([])
    const resumed = { ...s, state: 'aktiv' as const, skippedDates: ['2026-10-26'] }
    const { due } = run(resumed, [], '2026-11-09')
    expect(due.instances.map((i) => [i.title, i.dueDate])).toEqual([
      ['Übungsblatt 2', '2026-11-06'],
      ['Übungsblatt 3', '2026-11-13'],
    ])
    expect(due.instances.map((i) => i.id.slice(0, 8))).toEqual(['20261102', '20261109'])
  })

  it('count begrenzt, auch bei alle 2 Wochen', () => {
    const s = series({ endDate: null, count: 2, every: 2 })
    const { due } = run(s, [], '2027-06-01', 100)
    expect(due.instances.map((i) => i.id.slice(0, 8))).toEqual(['20261019', '20261102'])
  })

  it('ohne dueWeekday keine Fälligkeit; Fälligkeit am selben Tag möglich', () => {
    expect(run(series({ dueWeekday: null }), [], '2026-10-19').due.instances[0].dueDate).toBeNull()
    expect(run(series({ dueWeekday: 1 }), [], '2026-10-19').due.instances[0].dueDate).toBe(
      '2026-10-19',
    )
  })

  it('Einträge anderer Projekte/Serien zählen nicht', () => {
    const other = item({
      id: '20261019-000000-zzzz',
      projectId: 'p2',
      seriesId: 's1',
      seriesNumber: 9,
    })
    expect(run(series(), [other], '2026-10-19').due.instances[0].seriesNumber).toBe(1)
  })

  it('beide Geräte erzeugen identische Instanzen', () => {
    const a = run(series(), [], '2026-10-26').due.instances
    const b = run(series(), [], '2026-10-26').due.instances
    expect(b).toEqual(a)
    expect(a[0].createdAt).toBe('2026-10-19T00:00:00+02:00')
    expect(
      run(series({ startDate: '2026-11-02' }), [], '2026-11-02').due.instances[0].createdAt,
    ).toBe('2026-11-02T00:00:00+01:00')
  })
})

describe('Ausfälle (skippedDates)', () => {
  const skipped = series({ skippedDates: ['2026-11-02'] })

  it('Stichtage überspringen ausgefallene Tage, die Nummerierung bleibt lückenlos', () => {
    expect(occurrences(skipped, null, '2026-11-16')).toEqual([
      '2026-10-19',
      '2026-10-26',
      '2026-11-09',
      '2026-11-16',
    ])
    const { due } = run(skipped, [], '2026-11-16')
    expect(due.instances.map((i) => [i.seriesNumber, i.id.slice(0, 8)])).toEqual([
      [1, '20261019'],
      [2, '20261026'],
      [3, '20261109'],
      [4, '20261116'],
    ])
  })

  it('Ende per Anzahl rückt mit, Ende per Datum bleibt', () => {
    const byCount = series({ endDate: null, count: 3, skippedDates: ['2026-10-26'] })
    expect(occurrences(byCount, null, '2027-01-01')).toEqual([
      '2026-10-19',
      '2026-11-02',
      '2026-11-09',
    ])
    const byDate = series({ endDate: '2026-11-09', skippedDates: ['2026-10-26'] })
    expect(occurrences(byDate, null, '2027-01-01')).toEqual([
      '2026-10-19',
      '2026-11-02',
      '2026-11-09',
    ])
    const byDateSkipLast = series({ endDate: '2026-11-09', skippedDates: ['2026-11-02'] })
    expect(occurrences(byDateSkipLast, null, '2027-01-01')).toHaveLength(3)
  })

  it('n-ter Stichtag ohne Ausfälle; null jenseits des Endes', () => {
    expect(nthOccurrence(skipped, 3)).toBe('2026-11-09')
    expect(nthOccurrence(series({ endDate: null, count: 2 }), 3)).toBeNull()
    expect(nthOccurrence(series({ endDate: '2026-10-26' }), 3)).toBeNull()
  })

  it('nächster Ausfall: erster Folgestichtag, der nicht schon ausfällt; every 2 ⇒ zwei Wochen', () => {
    expect(nextSkipDate(series(), '2026-11-23')).toBe('2026-11-30')
    expect(nextSkipDate(series({ skippedDates: ['2026-11-30'] }), '2026-11-23')).toBe('2026-12-07')
    expect(nextSkipDate(series({ every: 2 }), '2026-11-23')).toBe('2026-12-07')
  })

  it('Vorschau und Auswahl „Ausfall eintragen“ zeigen die künftigen Stichtage ohne Ausfälle', () => {
    const s = series({ lastNumber: 4, lastDate: '2026-11-09', skippedDates: ['2026-11-16'] })
    expect(upcomingOccurrences(s, 3)).toEqual(['2026-11-23', '2026-11-30', '2026-12-07'])
    expect(previewNext(s, 2).map((p) => [p.number, p.date])).toEqual([
      [5, '2026-11-23'],
      [6, '2026-11-30'],
    ])
  })

  it('Pause-Stichtage von lastDate (exklusiv) bis gestern', () => {
    const s = series({ lastNumber: 1, lastDate: '2026-10-19' })
    expect(pausedOccurrences(s, '2026-11-02')).toEqual(['2026-10-26', '2026-11-02'])
    expect(pausedOccurrences(s, '2026-10-25')).toEqual([])
  })
})

describe('dueInstances – nummernbasiert', () => {
  it('Nummer = Index des Stichtags, auch wenn lastDate vom Alt-Stand stammt', () => {
    // Start nach Bearbeiten eine Woche später; Blatt 1 erledigt (Alt-Stichtag 19.10.), Blatt 2 gelöscht.
    const s = series({ startDate: '2026-10-26', lastNumber: 2, lastDate: '2026-10-26' })
    const done = {
      ...item({ status: 'erledigt' }),
      id: instanceId('p1', 's1', '2026-10-19'),
      projectId: 'p1',
      seriesId: 's1',
      seriesNumber: 1,
    }
    const due = dueInstances(
      project,
      { ...s, lastNumber: 1, lastDate: '2026-10-19' },
      [done],
      '2026-11-03',
    )
    expect(due.instances.map((i) => [i.seriesNumber, i.id.slice(0, 8)])).toEqual([[2, '20261102']])
    expect(due).toMatchObject({ lastNumber: 2, lastDate: '2026-11-02' })
  })
})

describe('nextOccurrence / remainingOccurrences folgen der Nummer', () => {
  it('lastDate weicht von nthOccurrence(lastNumber) ab: nächster Stichtag = Nr lastNumber+1', () => {
    const s = series({ lastNumber: 2, lastDate: '2026-10-01' })
    expect(nextOccurrence(s)).toEqual({ date: '2026-11-02', title: 'Übungsblatt 3' })
  })

  it('zählt Nummern > lastNumber mit Stichtag; ohne Ende 0', () => {
    const s = series({ endDate: null, count: 5, lastNumber: 2, lastDate: '2026-10-01' })
    expect(remainingOccurrences(s)).toBe(3)
    expect(remainingOccurrences(series({ endDate: null, count: null }))).toBe(0)
    expect(remainingOccurrences(series({ endDate: '2026-11-02', lastNumber: 1 }))).toBe(2)
  })
})

describe('recomputeOpenInstances', () => {
  const make = (s: StepSeries, n: number, date: string, patch: Partial<Item> = {}): Item => ({
    ...item({}),
    id: instanceId(project.id, s.id, date),
    title: `Übungsblatt ${n}`,
    projectId: project.id,
    seriesId: s.id,
    seriesNumber: n,
    dueDate: '2026-01-01',
    ...patch,
  })

  it('verschiebt offene Blätter auf den n-ten Stichtag und lässt erledigte unverändert', () => {
    const old = series({ startDate: '2026-10-19' })
    const items = [
      make(old, 1, '2026-10-19', { status: 'erledigt' }),
      make(old, 2, '2026-10-26', {
        schedule: { start: 'x', durationMin: 1, calendarEventId: 'e' },
      }),
    ]
    const next = series({ startDate: '2026-10-26', lastNumber: 2, lastDate: '2026-10-26' })
    const plan = recomputeOpenInstances(project.id, next, items, '2026-11-20', { refreshDue: true })
    expect(plan.deleted).toEqual([])
    expect(plan.changes).toHaveLength(1)
    const { from, to } = plan.changes[0]
    expect(from.id).toBe(items[1].id)
    expect(to).toMatchObject({
      id: instanceId(project.id, 's1', '2026-11-02'),
      dueDate: '2026-11-06',
      title: 'Übungsblatt 2',
      schedule: { calendarEventId: 'e' },
      createdAt: items[1].createdAt,
    })
    expect(plan).toMatchObject({ lastNumber: 2, lastDate: '2026-11-02' })
  })

  it('löscht ein Blatt, dessen neuer Stichtag nach heute liegt', () => {
    const old = series()
    const items = [make(old, 1, '2026-10-19', { status: 'erledigt' }), make(old, 2, '2026-10-26')]
    const next = series({ startDate: '2026-10-26' })
    const plan = recomputeOpenInstances(project.id, next, items, '2026-10-27', { refreshDue: true })
    expect(plan.deleted.map((i) => i.id)).toEqual([items[1].id])
    expect(plan).toMatchObject({ lastNumber: 1, lastDate: '2026-10-26' })
  })
})

describe('recomputeOpenInstances – Fortschritt', () => {
  it('ohne Löschung bleibt der Fortschritt unverändert', () => {
    const s = series({ lastNumber: 3, lastDate: '2026-11-02' })
    const plan = recomputeOpenInstances(project.id, s, [], '2026-11-20', { refreshDue: true })
    expect(plan).toMatchObject({ lastNumber: 3, lastDate: '2026-11-02' })
  })

  it('Wochentag geändert ohne Löschung: lastDate ist der neue Stichtag von Nr lastNumber', () => {
    const s = series({ weekday: 3, lastNumber: 3, lastDate: '2026-11-02' })
    const plan = recomputeOpenInstances(project.id, s, [], '2026-11-20', { refreshDue: true })
    expect(plan).toMatchObject({ lastNumber: 3, lastDate: '2026-11-04' })
  })

  it('Löschung der Nr 1 setzt auf 0 / null', () => {
    const old = series()
    const one: Item = {
      ...item({}),
      id: instanceId(project.id, old.id, '2026-10-19'),
      projectId: project.id,
      seriesId: old.id,
      seriesNumber: 1,
    }
    const next = series({ startDate: '2026-10-26', lastNumber: 1, lastDate: '2026-10-19' })
    const plan = recomputeOpenInstances(project.id, next, [one], '2026-10-20', { refreshDue: true })
    expect(plan).toMatchObject({ lastNumber: 0, lastDate: null })
  })
})
