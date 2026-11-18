import type { Item, Project, StepSeries } from '../data/types'
import {
  berlinDate,
  displayStatus,
  filterByTime,
  focusItems,
  focusOverLimit,
  followUpDue,
  isDueOverdue,
  isQuick,
  needsNextStep,
  nextSeriesOccurrence,
  nextStepOf,
  nextStepsSection,
  plannedLater,
  projectProgress,
  projectSteps,
  somedayItems,
  sortNextSteps,
  todayAndOverdue,
  waitingDays,
  waitingItems,
} from './gtd'

let counter = 0
function task(over: Partial<Item> = {}): Item {
  counter += 1
  return {
    id: `t${String(counter).padStart(3, '0')}`,
    type: 'aufgabe',
    title: `Aufgabe ${counter}`,
    notes: '',
    categoryId: 'privat',
    status: 'offen',
    important: false,
    durationMin: null,
    schedule: null,
    originalCategoryId: null,
    createdAt: '2026-11-01T10:00:00+01:00',
    updatedAt: '2026-11-01T10:00:00+01:00',
    completedAt: null,
    gtd: 'naechster-schritt',
    ...over,
  }
}

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1',
  title: 'Projekt',
  notes: '',
  categoryId: 'privat',
  status: 'aktiv',
  series: [],
  createdAt: '2026-11-01T10:00:00+01:00',
  updatedAt: '2026-11-01T10:00:00+01:00',
  completedAt: null,
  ...over,
})

// Montag, 16.11.2026, 12:00 in Berlin
const NOW = new Date('2026-11-16T11:00:00Z')
const sched = (start: string, durationMin = 30): Item['schedule'] => ({ start, durationMin })
const ids = (items: Item[]): string[] => items.map((i) => i.id)

describe('berlinDate – Zeitzone um Mitternacht', () => {
  it('nutzt den Berliner Kalendertag', () => {
    expect(berlinDate(new Date('2026-11-15T22:59:59Z'))).toBe('2026-11-15')
    expect(berlinDate(new Date('2026-11-15T23:00:00Z'))).toBe('2026-11-16')
    expect(berlinDate(new Date('2026-07-15T21:59:59Z'))).toBe('2026-07-15')
    expect(berlinDate(new Date('2026-07-15T22:00:00Z'))).toBe('2026-07-16')
  })
})

describe('displayStatus', () => {
  it('Termin bei schedule, sonst gtd; null für Nicht-Aufgaben und Erledigtes', () => {
    expect(
      displayStatus(task({ schedule: sched('2026-11-17T09:00:00+01:00'), gtd: 'warten' })),
    ).toBe('termin')
    expect(displayStatus(task({ gtd: 'warten' }))).toBe('warten')
    expect(displayStatus(task({ gtd: 'irgendwann' }))).toBe('irgendwann')
    expect(displayStatus(task({ gtd: undefined }))).toBe('naechster-schritt')
    expect(displayStatus(task({ type: 'notiz' }))).toBeNull()
    expect(displayStatus(task({ type: 'termin' }))).toBeNull()
    expect(displayStatus(task({ status: 'erledigt' }))).toBeNull()
  })
})

describe('isQuick', () => {
  it('⚡ bei höchstens 2 Minuten', () => {
    expect(isQuick(task({ durationMin: 1 }))).toBe(true)
    expect(isQuick(task({ durationMin: 2 }))).toBe(true)
    expect(isQuick(task({ durationMin: 3 }))).toBe(false)
    expect(isQuick(task({ durationMin: null }))).toBe(false)
  })
})

describe('isDueOverdue', () => {
  it('überfällig nur vor heute', () => {
    expect(isDueOverdue(task({ dueDate: '2026-11-15' }), NOW)).toBe(true)
    expect(isDueOverdue(task({ dueDate: '2026-11-16' }), NOW)).toBe(false)
    expect(isDueOverdue(task({ dueDate: '2026-11-17' }), NOW)).toBe(false)
    expect(isDueOverdue(task({ dueDate: null }), NOW)).toBe(false)
    expect(isDueOverdue(task({ dueDate: '2026-11-01', status: 'erledigt' }), NOW)).toBe(false)
  })

  it('wechselt um Mitternacht Europe/Berlin', () => {
    const item = task({ dueDate: '2026-11-15' })
    expect(isDueOverdue(item, new Date('2026-11-15T22:59:00Z'))).toBe(false)
    expect(isDueOverdue(item, new Date('2026-11-15T23:00:00Z'))).toBe(true)
  })
})

describe('followUpDue und waitingDays', () => {
  const waiting = (followUpOn: string | null, since = '2026-11-10'): Item =>
    task({ gtd: 'warten', waiting: { person: 'Anna', since, followUpOn } })

  it('Nachhaken gestern, heute: fällig; morgen, ohne Datum: nicht', () => {
    expect(followUpDue(waiting('2026-11-15'), NOW)).toBe(true)
    expect(followUpDue(waiting('2026-11-16'), NOW)).toBe(true)
    expect(followUpDue(waiting('2026-11-17'), NOW)).toBe(false)
    expect(followUpDue(waiting(null), NOW)).toBe(false)
    expect(followUpDue(task({ waiting: null }), NOW)).toBe(false)
  })

  it('Nachhaken wechselt um Mitternacht Berlin', () => {
    const item = waiting('2026-11-16')
    expect(followUpDue(item, new Date('2026-11-15T22:59:00Z'))).toBe(false)
    expect(followUpDue(item, new Date('2026-11-15T23:00:00Z'))).toBe(true)
  })

  it('zählt Tage seit „seit“, nie negativ', () => {
    expect(waitingDays(waiting(null, '2026-11-10'), NOW)).toBe(6)
    expect(waitingDays(waiting(null, '2026-11-16'), NOW)).toBe(0)
    expect(waitingDays(waiting(null, '2026-11-20'), NOW)).toBe(0)
    expect(waitingDays(task(), NOW)).toBe(0)
  })
})

describe('Projekte', () => {
  const steps = [
    task({ projectId: 'p1', projectOrder: 2, title: 'zwei' }),
    task({ projectId: 'p1', projectOrder: 1, title: 'eins', status: 'erledigt' }),
    task({ projectId: 'p1', projectOrder: 3, title: 'drei', gtd: 'warten' }),
    task({ projectId: 'p2', projectOrder: 1, title: 'fremd' }),
  ]

  it('sortiert Schritte nach projectOrder, ohne Wert hinten nach createdAt', () => {
    const late = task({ projectId: 'p1', createdAt: '2026-11-03T10:00:00+01:00' })
    const early = task({ projectId: 'p1', createdAt: '2026-11-02T10:00:00+01:00' })
    const sorted = projectSteps('p1', [late, ...steps, early])
    expect(sorted.map((s) => s.title)).toEqual(['eins', 'zwei', 'drei', early.title, late.title])
  })

  it('nächster Schritt = offener mit kleinstem projectOrder, gleich welcher Status', () => {
    expect(nextStepOf(project(), steps)?.title).toBe('zwei')
    expect(nextStepOf(project(), [steps[2]])?.title).toBe('drei')
    expect(nextStepOf(project(), [steps[1]])).toBeNull()
  })

  it('Fortschritt und Warnung', () => {
    expect(projectProgress(project(), steps)).toEqual({ done: 1, total: 3 })
    expect(needsNextStep(project(), steps)).toBe(false)
    expect(needsNextStep(project(), [steps[1]])).toBe(true)
    expect(needsNextStep(project({ status: 'erledigt' }), [steps[1]])).toBe(false)
    expect(needsNextStep(project(), [])).toBe(true)
  })
})

describe('sortNextSteps und filterByTime', () => {
  it('überfällig/fällig zuerst, ohne Datum zuletzt; dann Dauer (ohne zuletzt), dann createdAt', () => {
    const noDate = task({ durationMin: 5 })
    const overdue = task({ dueDate: '2026-11-01' })
    const dueLong = task({ dueDate: '2026-11-20', durationMin: 60 })
    const dueShort = task({ dueDate: '2026-11-20', durationMin: 10 })
    const dueNone = task({ dueDate: '2026-11-20' })
    const noDateOlder = task({ durationMin: 5, createdAt: '2026-10-01T10:00:00+02:00' })
    const sorted = sortNextSteps([noDate, dueNone, dueLong, noDateOlder, dueShort, overdue])
    expect(ids(sorted)).toEqual(ids([overdue, dueShort, dueLong, dueNone, noDateOlder, noDate]))
  })

  it('verändert die Eingabe nicht', () => {
    const list = [task({ dueDate: '2026-12-01' }), task({ dueDate: '2026-11-01' })]
    const copy = [...list]
    sortNextSteps(list)
    expect(list).toEqual(copy)
  })

  it('Zeitfilter blendet größere und fehlende Dauer aus', () => {
    const a = task({ durationMin: 10 })
    const b = task({ durationMin: 30 })
    const c = task({ durationMin: 45 })
    const d = task({ durationMin: null })
    const all = [a, b, c, d]
    expect(ids(filterByTime(all, 15))).toEqual(ids([a]))
    expect(ids(filterByTime(all, null))).toEqual(ids(all))
  })
})

describe('Abschnitte', () => {
  it('Fokus: ★ ohne Irgendwann, ohne Erledigtes; Warnung ab 6', () => {
    const f1 = task({ important: true, dueDate: '2026-11-20' })
    const f2 = task({ important: true, dueDate: '2026-11-18' })
    const someday = task({ important: true, gtd: 'irgendwann' })
    const done = task({ important: true, status: 'erledigt' })
    const note = task({ important: true, type: 'notiz' })
    expect(ids(focusItems([f1, f2, someday, done, note, task()]))).toEqual(ids([f2, f1]))
    const six = Array.from({ length: 6 }, () => task({ important: true }))
    expect(focusOverLimit(six.slice(0, 5))).toBe(false)
    expect(focusOverLimit(six)).toBe(true)
    expect(focusOverLimit([...six.slice(0, 5), someday])).toBe(false)
  })

  it('Heute/Überfällig und Eingeplant', () => {
    const today = task({ schedule: sched('2026-11-16T15:00:00+01:00') })
    const todayEarly = task({ schedule: sched('2026-11-16T08:00:00+01:00') })
    const overdue = task({ schedule: sched('2026-11-10T09:00:00+01:00') })
    const later = task({ schedule: sched('2026-11-17T09:00:00+01:00') })
    const noSchedule = task()
    const done = task({ schedule: sched('2026-11-16T09:00:00+01:00'), status: 'erledigt' })
    const all = [today, later, overdue, todayEarly, noSchedule, done]
    expect(ids(todayAndOverdue(all, NOW))).toEqual(ids([overdue, todayEarly, today]))
    expect(ids(plannedLater(all, NOW))).toEqual(ids([later]))
  })

  it('Heute wechselt um Mitternacht Berlin', () => {
    const item = task({ schedule: sched('2026-11-17T00:30:00+01:00') })
    expect(plannedLater([item], new Date('2026-11-16T22:00:00Z'))).toHaveLength(1)
    expect(todayAndOverdue([item], new Date('2026-11-16T22:00:00Z'))).toHaveLength(0)
    expect(todayAndOverdue([item], new Date('2026-11-16T23:00:00Z'))).toHaveLength(1)
  })

  it('Nächste Schritte: nur der nächste Schritt je Projekt, ohne Fokus/Termin/Warten', () => {
    const p = project()
    const s1 = task({ projectId: 'p1', projectOrder: 1 })
    const s2 = task({ projectId: 'p1', projectOrder: 2 })
    const loose = task()
    const focus = task({ important: true })
    const waiting = task({ gtd: 'warten' })
    const scheduled = task({ schedule: sched('2026-11-20T09:00:00+01:00') })
    const orphan = task({ projectId: 'weg', projectOrder: 1 })
    const result = nextStepsSection([s2, s1, loose, focus, waiting, scheduled, orphan], [p])
    expect(ids(result).sort()).toEqual(ids([s1, loose, orphan]).sort())
  })

  it('Nächste Schritte: ist der nächste Schritt „warten“, erscheint kein anderer des Projekts', () => {
    const s1 = task({ projectId: 'p1', projectOrder: 1, gtd: 'warten' })
    const s2 = task({ projectId: 'p1', projectOrder: 2 })
    expect(nextStepsSection([s1, s2], [project()])).toEqual([])
  })

  it('Warte auf: fällige zuerst, dann nach „seit“', () => {
    const w = (followUpOn: string | null, since: string): Item =>
      task({ gtd: 'warten', waiting: { person: 'x', since, followUpOn } })
    const noFollowOld = w(null, '2026-11-01')
    const noFollowNew = w(null, '2026-11-10')
    const soon = w('2026-11-20', '2026-11-12')
    const due = w('2026-11-15', '2026-11-14')
    const other = task()
    expect(ids(waitingItems([noFollowNew, soon, other, noFollowOld, due]))).toEqual(
      ids([due, soon, noFollowOld, noFollowNew]),
    )
  })

  it('Irgendwann: neueste zuerst', () => {
    const old = task({ gtd: 'irgendwann', createdAt: '2026-10-01T10:00:00+02:00' })
    const recent = task({ gtd: 'irgendwann', createdAt: '2026-11-10T10:00:00+01:00' })
    expect(ids(somedayItems([old, task(), recent]))).toEqual(ids([recent, old]))
  })
})

describe('Projekte mit Serie (SPEC §3.12)', () => {
  const series = (over: Partial<StepSeries> = {}): StepSeries => ({
    id: 's1',
    titlePattern: 'Übungsblatt {Nr}',
    every: 1,
    weekday: 1,
    startDate: '2026-10-26',
    endDate: null,
    count: 10,
    dueWeekday: null,
    durationMin: null,
    state: 'aktiv',
    skippedDates: [],
    lastNumber: 5,
    lastDate: '2026-11-23',
    ...over,
  })
  const proj = (s: StepSeries): Project => ({
    id: 'p1',
    title: 'Analysis',
    notes: '',
    categoryId: 'privat',
    status: 'aktiv',
    series: [s],
    createdAt: '2026-10-26T00:00:00+01:00',
    updatedAt: '2026-10-26T00:00:00+01:00',
    completedAt: null,
  })
  const done = (n: number): Item => ({
    id: `i${n}`,
    type: 'aufgabe',
    title: `Übungsblatt ${n}`,
    notes: '',
    categoryId: 'privat',
    status: 'erledigt',
    important: false,
    durationMin: null,
    schedule: null,
    originalCategoryId: null,
    createdAt: '2026-10-26T00:00:00+01:00',
    updatedAt: '2026-10-26T00:00:00+01:00',
    completedAt: null,
    projectId: 'p1',
    projectOrder: n,
  })
  const five = [1, 2, 3, 4, 5].map(done)

  it('count: Fortschritt 5/10, keine Warnung, nächster Termin', () => {
    const p = proj(series())
    expect(projectProgress(p, five)).toEqual({ done: 5, total: 10 })
    expect(needsNextStep(p, five)).toBe(false)
    expect(nextSeriesOccurrence(p)).toEqual({ date: '2026-11-30', title: 'Übungsblatt 6' })
  })

  it('endDate: y zählt Stichtage bis zum Ende ohne Ausfälle', () => {
    const p = proj(series({ count: null, endDate: '2026-12-21', skippedDates: ['2026-12-14'] }))
    // Stichtage nach 23.11.: 30.11., 07.12., 21.12. (14.12. fällt aus)
    expect(projectProgress(p, five)).toEqual({ done: 5, total: 8 })
  })

  it('Serie ohne Ende zählt nur angelegte Schritte', () => {
    const p = proj(series({ count: null }))
    expect(projectProgress(p, five)).toEqual({ done: 5, total: 5 })
    expect(needsNextStep(p, five)).toBe(false)
  })

  it('beendete Serie oder letzter Stichtag angelegt ⇒ Warnung', () => {
    expect(needsNextStep(proj(series({ state: 'beendet' })), five)).toBe(true)
    const last = proj(series({ lastNumber: 10, lastDate: '2026-12-28' }))
    expect(nextSeriesOccurrence(last)).toBeNull()
    expect(needsNextStep(last, five)).toBe(true)
  })

  it('pausierte Serie ⇒ Warnung, Fortschritt nur angelegte', () => {
    const p = proj(series({ state: 'pausiert' }))
    expect(needsNextStep(p, five)).toBe(true)
    expect(projectProgress(p, five)).toEqual({ done: 5, total: 5 })
  })

  it('mehrere Serien: frühester Termin', () => {
    const p = proj(series())
    p.series.push(
      series({
        id: 's2',
        titlePattern: 'Quiz {Nr}',
        lastNumber: 0,
        lastDate: null,
        startDate: '2026-11-24',
        weekday: 2,
      }),
    )
    expect(nextSeriesOccurrence(p)).toEqual({ date: '2026-11-24', title: 'Quiz 1' })
  })
})
