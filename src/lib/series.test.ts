import { describe, expect, it } from 'vitest'
import type { Item, StepSeries } from '../data/types'
import { dueInstances, instanceId, instanceTitle, occurrences, previewNext } from './series'

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
    const resumed = { ...s, state: 'aktiv' as const, lastDate: '2026-11-01' }
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
