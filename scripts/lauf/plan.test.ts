// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { defaultCategories, defaultSettings } from '../../src/data/defaults'
import type { Category, Item } from '../../src/data/types'
import type { DecisionItem } from './files'
import { validItem } from './fixtures'
import { buildPlan, type BuildPlanInput } from './plan'

const NOW = new Date('2026-10-21T14:05:00+02:00')
const ID1 = '20261021-120000-aaaa'
const ID2 = '20261021-120100-bbbb'
const ID3 = '20261021-120200-cccc'

const inboxEntry = (id: string, minute: number) => ({
  id,
  createdAt: `2026-10-21T12:0${minute}:00+02:00`,
})

const decisionItem = (patch: Partial<DecisionItem> = {}): DecisionItem => ({
  type: 'aufgabe',
  title: 'Aufgabe',
  notes: '',
  categoryId: 'privat',
  important: false,
  durationMin: null,
  when: null,
  ...patch,
})

let counter = 0
const input = (patch: Partial<BuildPlanInput> = {}): BuildPlanInput => ({
  now: NOW,
  inbox: [inboxEntry(ID1, 0)],
  decisions: { decisions: [{ inboxId: ID1, newCategory: null, items: [decisionItem()] }] },
  events: { events: [] },
  categories: defaultCategories().categories,
  settings: defaultSettings(),
  existingItemIds: [],
  newId: () => `20261021-140500-x${String(counter++).padStart(3, '0')}`,
  ...patch,
})

const decisions = (...items: { id: string; list: DecisionItem[]; newCategory?: unknown }[]) => ({
  decisions: items.map((i) => ({
    inboxId: i.id,
    newCategory: i.newCategory ?? null,
    items: i.list,
  })),
})

function errorsOf(patch: Partial<BuildPlanInput>): string[] {
  const result = buildPlan(input(patch))
  if (result.ok) throw new Error('Fehler erwartet')
  return result.errors
}

function planOf(patch: Partial<BuildPlanInput> = {}) {
  const result = buildPlan(input(patch))
  if (!result.ok) throw new Error(result.errors.join('\n'))
  return result.plan
}

const single = (patch: Partial<DecisionItem>) => decisions({ id: ID1, list: [decisionItem(patch)] })
const startOf = (plan: ReturnType<typeof planOf>, index = 0): string | undefined =>
  plan.entries[index].items[0].schedule?.start
const busy = (start: string, end: string) => ({ title: 'x', start, end })

describe('Prüfregeln', () => {
  it('meldet eine ungültige Entscheidungsdatei', () => {
    const errors = errorsOf({ decisions: { decisions: [{ inboxId: 'x' }] } })
    expect(errors[0]).toMatch(/^entscheidungen\.json: decisions\[0\]: /)
  })

  it('meldet eine ungültige Terminedatei', () => {
    expect(errorsOf({ events: {} })).toEqual(['termine.json: Feld "events" fehlt.'])
  })

  it('meldet einen Inbox-Eintrag ohne Entscheidung', () => {
    const errors = errorsOf({ inbox: [inboxEntry(ID1, 0), inboxEntry(ID2, 1)] })
    expect(errors).toEqual([`Eintrag ${ID2}: Für diesen Eintrag fehlt eine Entscheidung.`])
  })

  it('meldet eine Entscheidung für einen unbekannten Eintrag', () => {
    const d = decisions({ id: ID1, list: [decisionItem()] }, { id: ID2, list: [decisionItem()] })
    expect(errorsOf({ decisions: d })).toEqual([
      `Entscheidung ${ID2}: Diesen Eintrag gibt es im Eingangskorb nicht.`,
    ])
  })

  it('meldet doppelte Entscheidungen', () => {
    const d = decisions({ id: ID1, list: [decisionItem()] }, { id: ID1, list: [decisionItem()] })
    expect(errorsOf({ decisions: d })).toEqual([
      `Entscheidung ${ID1}: Für diesen Eintrag gibt es mehrere Entscheidungen.`,
    ])
  })

  it('meldet eine Entscheidung für einen sortError-Eintrag, verlangt dort aber keine', () => {
    const inbox = [{ ...inboxEntry(ID1, 0), sortError: { message: 'x', at: 'y' } }]
    expect(errorsOf({ inbox })).toEqual([
      `Entscheidung ${ID1}: Der Eintrag hat einen sortError und darf nicht entschieden werden.`,
    ])
    const plan = planOf({ inbox, decisions: { decisions: [] } })
    expect(plan.entries).toEqual([])
  })

  it('meldet eine unbekannte Ablage', () => {
    expect(errorsOf({ decisions: single({ categoryId: 'sport' }) })).toEqual([
      `Entscheidung ${ID1}: Ablage „sport“ gibt es nicht.`,
    ])
  })

  it('verbietet die Archiv-Ablage', () => {
    expect(errorsOf({ decisions: single({ categoryId: 'erledigt' }) })).toEqual([
      `Entscheidung ${ID1}: Die Ablage „Erledigt“ ist das Archiv und nicht erlaubt.`,
    ])
  })

  it('verlangt für @neu eine newCategory', () => {
    expect(errorsOf({ decisions: single({ categoryId: '@neu' }) })[0]).toMatch(/@neu.*newCategory/)
  })

  it('meldet eine newCategory, die kein Eintrag nutzt', () => {
    const d = decisions({
      id: ID1,
      list: [decisionItem()],
      newCategory: { name: 'Fitness', description: '' },
    })
    expect(errorsOf({ decisions: d })).toEqual([
      `Entscheidung ${ID1}: newCategory ist gesetzt, aber kein Eintrag nutzt categoryId "@neu".`,
    ])
  })

  it('erlaubt in der Einkaufsliste nur Notizen', () => {
    const d = single({ categoryId: 'einkauf', title: 'Milch' })
    expect(errorsOf({ decisions: d })).toEqual([
      `Entscheidung ${ID1}: In der Ablage „Einkaufsliste“ sind nur Notizen erlaubt, „Milch“ ist aufgabe.`,
    ])
  })

  it('sammelt mehrere Fehler und plant dann nichts', () => {
    const d = decisions(
      { id: ID1, list: [decisionItem({ categoryId: 'a' })] },
      { id: ID2, list: [decisionItem({ categoryId: 'b' })] },
    )
    const errors = errorsOf({ inbox: [inboxEntry(ID1, 0), inboxEntry(ID2, 1)], decisions: d })
    expect(errors).toHaveLength(2)
  })

  it('meldet eine bereits vorhandene Eintrags-ID', () => {
    expect(errorsOf({ existingItemIds: [ID1] })).toEqual([
      `Entscheidung ${ID1}: Ein Eintrag mit dieser ID gibt es schon.`,
    ])
  })
})

describe('Ablagen', () => {
  const verein: Category = {
    id: 'verein',
    name: 'Verein',
    kind: 'normal',
    order: 6,
    description: '',
  }
  const withNew = (name: string, ...ids: string[]) =>
    decisions(
      ...ids.map((id) => ({
        id,
        list: [decisionItem({ categoryId: '@neu' })],
        newCategory: { name, description: 'Sport' },
      })),
    )

  it('nutzt eine vorhandene Ablage gleichen Namens (Groß/klein egal)', () => {
    const plan = planOf({
      categories: [...defaultCategories().categories, verein],
      decisions: withNew('VEREIN', ID1),
    })
    expect(plan.entries[0].newCategory).toBeNull()
    expect(plan.entries[0].items[0].categoryId).toBe('verein')
  })

  it('legt eine neue Ablage mit ID aus dem Namen und nächster order an', () => {
    const plan = planOf({ decisions: withNew('Fitness-Ziele', ID1) })
    expect(plan.entries[0].newCategory).toEqual({
      id: 'fitness-ziele',
      name: 'Fitness-Ziele',
      kind: 'normal',
      order: 5,
      description: 'Sport',
    })
    expect(plan.entries[0].items[0].categoryId).toBe('fitness-ziele')
  })

  it('vergibt bei ID-Kollision ein Suffix', () => {
    const categories = [
      ...defaultCategories().categories,
      { ...verein, id: 'fitness', name: 'Fit' },
    ]
    const plan = planOf({ categories, decisions: withNew('Fitness', ID1) })
    expect(plan.entries[0].newCategory?.id).toBe('fitness-2')
  })

  it('legt bei gleichem neuen Namen in zwei Entscheidungen nur eine Ablage an', () => {
    const plan = planOf({
      inbox: [inboxEntry(ID1, 0), inboxEntry(ID2, 1)],
      decisions: withNew('Fitness', ID1, ID2),
    })
    expect(plan.entries[0].newCategory?.id).toBe('fitness')
    expect(plan.entries[1].newCategory).toBeNull()
    expect(plan.entries.map((e) => e.items[0].categoryId)).toEqual(['fitness', 'fitness'])
  })

  it('meldet die neue Ablage beim ersten erfolgreichen Eintrag', () => {
    const newCategory = { name: 'Fitness', description: '' }
    const d = decisions(
      {
        id: ID1,
        list: [decisionItem({ categoryId: '@neu', when: { date: '2026-10-21', time: '09:00' } })],
        newCategory,
      },
      { id: ID2, list: [decisionItem({ categoryId: '@neu' })], newCategory },
    )
    const plan = planOf({ inbox: [inboxEntry(ID1, 0), inboxEntry(ID2, 1)], decisions: d })
    expect(plan.entries[0].result).toBe('sortError')
    expect(plan.entries[0].newCategory).toBeNull()
    expect(plan.entries[1].newCategory?.id).toBe('fitness')
  })
})

describe('Items', () => {
  it('vergibt die Inbox-ID zuerst und eindeutige neue IDs danach', () => {
    const shopping = (title: string) =>
      decisionItem({ type: 'notiz', categoryId: 'einkauf', title })
    let calls = 0
    const ids = [
      '20261021-140500-dupe',
      '20261021-140500-dupe',
      '20261021-140500-ok01',
      '20261021-140500-ok02',
    ]
    const plan = planOf({
      decisions: decisions({
        id: ID1,
        list: [shopping('Milch'), shopping('Eier'), shopping('Brot')],
      }),
      existingItemIds: ['20261021-140500-dupe'],
      newId: () => ids[calls++],
    })
    const items = plan.entries[0].items
    expect(items.map((i) => i.id)).toEqual([ID1, '20261021-140500-ok01', '20261021-140500-ok02'])
    expect(items.every((i) => i.checked === false)).toBe(true)
    expect(items[0]).toMatchObject({
      status: 'offen',
      originalCategoryId: null,
      completedAt: null,
      createdAt: '2026-10-21T12:00:00+02:00',
      updatedAt: '2026-10-21T14:05:00+02:00',
    })
  })

  it('setzt checked nur in der Einkaufsliste', () => {
    expect(planOf().entries[0].items[0]).not.toHaveProperty('checked')
  })
})

describe('Dauer', () => {
  const durationOf = (patch: Partial<DecisionItem>): number | null =>
    planOf({ decisions: single(patch) }).entries[0].items[0].durationMin

  it('rundet auf 15 Minuten, mindestens 15, höchstens Fensterlänge', () => {
    expect(durationOf({ durationMin: 20 })).toBe(15)
    expect(durationOf({ durationMin: 23 })).toBe(30)
    expect(durationOf({ durationMin: 1 })).toBe(15)
    expect(durationOf({ durationMin: 700 })).toBe(600)
  })

  it('nutzt Standardwerte je Fall', () => {
    expect(durationOf({})).toBeNull()
    expect(durationOf({ important: true })).toBe(30)
    expect(durationOf({ when: { date: '2026-10-23', time: null } })).toBe(90)
    expect(durationOf({ when: { date: '2026-10-23', time: '10:00' } })).toBe(60)
  })

  it('begrenzt auch Standardwerte auf die Fensterlänge', () => {
    const plan = planOf({
      settings: { ...defaultSettings(), planningWindow: { start: '09:00', end: '10:00' } },
      decisions: single({ when: { date: '2026-10-23', time: null }, durationMin: 600 }),
    })
    expect(plan.entries[0].items[0].durationMin).toBe(60)
  })
})

describe('Einplanen mit Pause', () => {
  const settings = (pause?: { start: string; end: string } | null) => ({
    ...defaultSettings(),
    pause,
  })
  const thuBusy = busy('2026-10-22T09:00:00+02:00', '2026-10-22T11:00:00+02:00')

  it('d) plant eine 2-h-Aufgabe nicht über die Pause (11:00 ohne, 13:00 mit Pause)', () => {
    const decide = single({ important: true, durationMin: 120 })
    const events = { events: [thuBusy] }
    expect(startOf(planOf({ events, decisions: decide, settings: settings(null) }))).toBe(
      '2026-10-22T11:00:00+02:00',
    )
    expect(startOf(planOf({ events, decisions: decide }))).toBe('2026-10-22T13:00:00+02:00')
  })

  it('c) legt eine 15-Min.-Aufgabe, deren erster freier Slot in der Pause läge, dahinter', () => {
    const events = { events: [busy('2026-10-22T09:00:00+02:00', '2026-10-22T12:00:00+02:00')] }
    const decide = single({ important: true, durationMin: 15 })
    expect(startOf(planOf({ events, decisions: decide, settings: settings(null) }))).toBe(
      '2026-10-22T12:00:00+02:00',
    )
    expect(startOf(planOf({ events, decisions: decide }))).toBe('2026-10-22T13:00:00+02:00')
  })

  it('b) 90 Min. an einem Tag mit Freiraum nur rund um die Pause ⇒ sortError', () => {
    const events = {
      events: [
        busy('2026-10-24T09:00:00+02:00', '2026-10-24T11:30:00+02:00'),
        busy('2026-10-24T13:30:00+02:00', '2026-10-24T19:00:00+02:00'),
      ],
    }
    const decide = single({ when: { date: '2026-10-24', time: null } })
    const withPause = planOf({ events, decisions: decide })
    expect(withPause.entries[0].result).toBe('sortError')
    expect(startOf(planOf({ events, decisions: decide, settings: settings(null) }))).toBe(
      '2026-10-24T11:30:00+02:00',
    )
  })

  it('a) feste Uhrzeit in der Pause bleibt genau erhalten', () => {
    const plan = planOf({
      decisions: single({ type: 'termin', when: { date: '2026-10-22', time: '12:15' } }),
    })
    expect(startOf(plan)).toBe('2026-10-22T12:15:00+02:00')
  })

  it('e) vorhandene wichtige Aufgabe läuft ebenfalls nicht in die Pause', () => {
    const existing: Item = {
      ...validItem,
      id: '20261020-090000-e001',
      type: 'aufgabe',
      important: true,
      durationMin: 120,
      schedule: null,
    }
    const plan = planOf({
      events: { events: [thuBusy] },
      decisions: { decisions: [] },
      inbox: [],
      existingItems: [existing],
      existingItemIds: [existing.id],
    })
    expect(plan.existing?.[0].start).toBe('2026-10-22T13:00:00+02:00')
  })

  it('Überlänge (7 h) darf über die Pause laufen', () => {
    const plan = planOf({
      decisions: single({ when: { date: '2026-10-27', time: null }, durationMin: 420 }),
    })
    expect(startOf(plan)).toBe('2026-10-27T09:00:00+01:00')
  })

  it('ungültige Pause wirkt wie keine Pause', () => {
    const events = { events: [thuBusy] }
    const decide = single({ important: true, durationMin: 120 })
    const bad = settings({ start: '13:00', end: '12:00' })
    expect(startOf(planOf({ events, decisions: decide, settings: bad }))).toBe(
      '2026-10-22T11:00:00+02:00',
    )
  })
})

describe('Einplanen', () => {
  it('a) plant genau zur Zeit, auch bei Überschneidung, und legt events an', () => {
    const plan = planOf({
      events: { events: [busy('2026-10-22T09:00:00+02:00', '2026-10-22T10:00:00+02:00')] },
      decisions: single({
        type: 'termin',
        title: 'Zahnarzt',
        when: { date: '2026-10-22', time: '09:00' },
      }),
    })
    expect(plan.entries[0].items[0].schedule).toEqual({
      start: '2026-10-22T09:00:00+02:00',
      durationMin: 60,
    })
    expect(plan.events).toEqual([
      {
        itemId: ID1,
        title: 'Zahnarzt',
        start: '2026-10-22T09:00:00+02:00',
        end: '2026-10-22T10:00:00+02:00',
        description: `Erstellt mit SecondBrain (Claude-Lauf)\nEintrag: ${ID1}`,
      },
    ])
  })

  it('a) Vergangenheit ⇒ sortError mit Meldung, kein event', () => {
    const plan = planOf({ decisions: single({ when: { date: '2026-10-21', time: '13:00' } }) })
    expect(plan.entries[0]).toMatchObject({
      result: 'sortError',
      message: 'Der Zeitpunkt Mi 21.10., 13:00 liegt in der Vergangenheit.',
      items: [],
    })
    expect(plan.events).toEqual([])
  })

  it('b) ohne freien Block ⇒ sortError mit Meldung', () => {
    const plan = planOf({
      events: { events: [busy('2026-10-23T09:00:00', '2026-10-23T18:00:00')] },
      decisions: single({ when: { date: '2026-10-23', time: null } }),
    })
    expect(plan.entries[0].message).toBe(
      'Am Fr 23.10. ist im Planungsfenster kein freier 90-Min-Block.',
    )
  })

  it('b) heute plant ab der nächsten Viertelstunde, vergangene Tage sind sortError', () => {
    const plan = planOf({
      inbox: [inboxEntry(ID1, 0), inboxEntry(ID2, 1)],
      decisions: decisions(
        { id: ID1, list: [decisionItem({ when: { date: '2026-10-21', time: null } })] },
        { id: ID2, list: [decisionItem({ when: { date: '2026-10-20', time: null } })] },
      ),
    })
    expect(startOf(plan)).toBe('2026-10-21T14:15:00+02:00')
    expect(plan.entries[1].message).toBe('Der Tag Di 20.10. liegt in der Vergangenheit.')
  })

  it('belegt nur echte Termine (ganztägig, frei, abgesagt zählen nicht; ohne Offset = Berlin)', () => {
    const wide = busy('2026-10-23T09:00:00+02:00', '2026-10-23T12:00:00+02:00')
    const plan = planOf({
      events: {
        events: [
          { title: 'a', allDay: true, date: '2026-10-23' },
          { ...wide, transparent: true },
          { ...wide, declined: true },
          busy('2026-10-23T09:00:00', '2026-10-23T09:30:00'),
          busy('2026-10-23T07:30:00Z', '2026-10-23T08:00:00Z'),
        ],
      },
      decisions: single({ when: { date: '2026-10-23', time: null }, durationMin: 30 }),
    })
    expect(startOf(plan)).toBe('2026-10-23T10:00:00+02:00')
  })

  it('belegt Vorkommen einer Serie (je Vorkommen eine Zeile in termine.json) wie normale Termine', () => {
    const occurrence = (day: string) => ({
      id: `vorlesung_${day.replaceAll('-', '')}T080000Z`,
      recurringEventId: 'vorlesung',
      title: 'Vorlesung',
      start: `${day}T09:00:00+01:00`,
      end: `${day}T10:30:00+01:00`,
    })
    const events = { events: [occurrence('2026-10-26'), occurrence('2026-10-28')] }
    const plan = planOf({
      events,
      decisions: single({ when: { date: '2026-10-26', time: null } }),
    })
    // 90 Min. am Mo 26.10.: 09:00 ist durch das Vorkommen belegt, frei ab 10:30 (endet vor der Pause).
    expect(startOf(plan)).toBe('2026-10-26T10:30:00+01:00')
    const without = planOf({ decisions: single({ when: { date: '2026-10-26', time: null } }) })
    expect(startOf(without)).toBe('2026-10-26T09:00:00+01:00')
  })

  it('akzeptiert recurringEventId in termine.json, lehnt aber einen Nicht-Text ab', () => {
    const bad = {
      events: [
        {
          title: 'x',
          start: '2026-10-26T09:00:00+01:00',
          end: '2026-10-26T10:00:00+01:00',
          recurringEventId: 5,
        },
      ],
    }
    expect(errorsOf({ events: bad })[0]).toBe(
      'termine.json: events[0]: Feld "recurringEventId" ist ungültig (erwartet: Text).',
    )
  })

  it('c) wichtig mit 15 Min. startet am Tagesanfang (Fenster hat schon begonnen ⇒ morgen)', () => {
    const plan = planOf({ decisions: single({ important: true, durationMin: 15 }) })
    expect(startOf(plan)).toBe('2026-10-22T09:00:00+02:00')
  })

  it('d) wichtig startet nie am laufenden Tag, sondern am Tagesanfang, und weicht Terminen aus', () => {
    const plan = planOf({
      events: { events: [busy('2026-10-22T09:00:00+02:00', '2026-10-22T10:00:00+02:00')] },
      decisions: single({ important: true, durationMin: 60 }),
    })
    expect(startOf(plan)).toBe('2026-10-22T10:00:00+02:00')
  })

  it('d) Lauf um 14:05 ⇒ wichtige 30-Min.-Aufgabe morgen ab Fensterbeginn, nach den c-Einträgen', () => {
    const plan = planOf({
      inbox: [inboxEntry(ID1, 0), inboxEntry(ID2, 1)],
      decisions: decisions(
        { id: ID1, list: [decisionItem({ important: true, durationMin: 30 })] },
        { id: ID2, list: [decisionItem({ important: true, durationMin: 15 })] },
      ),
    })
    expect(startOf(plan, 1)).toBe('2026-10-22T09:00:00+02:00')
    expect(startOf(plan, 0)).toBe('2026-10-22T09:15:00+02:00')
  })

  it('c und d: Lauf um 07:00 (vor Fensterbeginn) ⇒ heute ab 09:00, ohne Überschneidung', () => {
    const plan = planOf({
      now: new Date('2026-10-21T07:00:00+02:00'),
      inbox: [inboxEntry(ID1, 0), inboxEntry(ID2, 1), inboxEntry(ID3, 2)],
      decisions: decisions(
        { id: ID1, list: [decisionItem({ important: true, durationMin: 30 })] },
        { id: ID2, list: [decisionItem({ important: true, durationMin: 15 })] },
        { id: ID3, list: [decisionItem({ important: true, durationMin: 15 })] },
      ),
    })
    expect(plan.entries.map((_, i) => startOf(plan, i))).toEqual([
      '2026-10-21T09:30:00+02:00',
      '2026-10-21T09:00:00+02:00',
      '2026-10-21T09:15:00+02:00',
    ])
  })

  it('c/d ohne Slot in 14 Tagen ⇒ ohne schedule und Eintrag in errors', () => {
    const plan = planOf({
      events: { events: [busy('2026-10-21T00:00:00+02:00', '2026-11-10T00:00:00+01:00')] },
      decisions: single({ important: true }),
    })
    expect(plan.entries[0].result).toBe('ok')
    expect(plan.entries[0].items[0].schedule).toBeNull()
    expect(plan.errors).toHaveLength(1)
    expect(plan.errors[0].inboxId).toBe(ID1)
    expect(plan.events).toEqual([])
  })

  it('Reihenfolge a → b → c, vergebene Zeiten gelten als belegt', () => {
    const plan = planOf({
      inbox: [inboxEntry(ID1, 0), inboxEntry(ID2, 1), inboxEntry(ID3, 2)],
      decisions: decisions(
        { id: ID1, list: [decisionItem({ important: true, durationMin: 15 })] },
        { id: ID2, list: [decisionItem({ when: { date: '2026-10-22', time: null } })] },
        { id: ID3, list: [decisionItem({ when: { date: '2026-10-22', time: '09:00' } })] },
      ),
    })
    expect(plan.entries.map((_, i) => startOf(plan, i))).toEqual([
      '2026-10-22T11:30:00+02:00',
      '2026-10-22T10:00:00+02:00',
      '2026-10-22T09:00:00+02:00',
    ])
  })

  it('ein sortError-Eintrag gibt seine a-Zeiten wieder frei', () => {
    const plan = planOf({
      inbox: [inboxEntry(ID1, 0), inboxEntry(ID2, 1)],
      decisions: decisions(
        {
          id: ID1,
          list: [
            decisionItem({ when: { date: '2026-10-22', time: '09:00' } }),
            decisionItem({ when: { date: '2026-10-21', time: '10:00' } }),
          ],
        },
        { id: ID2, list: [decisionItem({ when: { date: '2026-10-22', time: null } })] },
      ),
    })
    expect(plan.entries[0].result).toBe('sortError')
    expect(startOf(plan, 1)).toBe('2026-10-22T09:00:00+02:00')
  })
})

describe('Einkaufsliste: gleiche Artikel (SPEC 3.9)', () => {
  const shop = (title: string): DecisionItem =>
    decisionItem({ title, type: 'notiz', categoryId: 'einkauf' })
  const existing = (title: string, id: string, checked = false): Item => ({
    ...validItem,
    id,
    type: 'notiz',
    title,
    categoryId: 'einkauf',
    schedule: null,
    checked,
  })
  const OLD = '20261020-090000-e001'

  it('lässt Artikel weg, die schon (auch abgehakt, anders geschrieben) auf der Liste stehen', () => {
    const plan = planOf({
      decisions: decisions({ id: ID1, list: [shop(' knoblauch'), shop('Milch')] }),
      existingItems: [existing('Knoblauch', OLD, true)],
    })
    expect(plan.entries[0].items.map((i) => i.title)).toEqual(['Milch'])
    expect(plan.entries[0].items[0].id).toBe(ID1)
    expect(plan.duplicates).toEqual([{ inboxId: ID1, title: ' knoblauch', existingItemId: OLD }])
  })

  it('hält „Knoblauchzehen“ für einen anderen Artikel', () => {
    const plan = planOf({
      decisions: decisions({ id: ID1, list: [shop('Knoblauchzehen')] }),
      existingItems: [existing('Knoblauch', OLD)],
    })
    expect(plan.entries[0].items).toHaveLength(1)
    expect(plan.duplicates).toEqual([])
  })

  it('lässt Dubletten innerhalb eines Laufs weg (früherer Eintrag gewinnt, auch im selben Eintrag)', () => {
    const plan = planOf({
      inbox: [inboxEntry(ID2, 1), inboxEntry(ID1, 0)],
      decisions: decisions(
        { id: ID2, list: [shop('Butter')] },
        { id: ID1, list: [shop('Butter'), shop('BUTTER ')] },
      ),
    })
    const byId = (id: string) => plan.entries.find((e) => e.inboxId === id)
    expect(byId(ID1)?.items).toHaveLength(1)
    expect(byId(ID2)?.items).toEqual([])
    expect(byId(ID2)?.result).toBe('ok')
    expect(plan.duplicates).toEqual([
      { inboxId: ID1, title: 'BUTTER ', existingItemId: null },
      { inboxId: ID2, title: 'Butter', existingItemId: null },
    ])
  })

  it('ignoriert gleiche Titel außerhalb der Einkaufsliste', () => {
    const plan = planOf({
      decisions: decisions({ id: ID1, list: [decisionItem({ title: 'Knoblauch' })] }),
      existingItems: [existing('Knoblauch', OLD)],
    })
    expect(plan.entries[0].items).toHaveLength(1)
  })
})
