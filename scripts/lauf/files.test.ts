// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  isDecisionsFile,
  isEventIdsFile,
  isEventsFile,
  isPlanFile,
  validateDecisionsFile,
  validateEventIdsFile,
  validateEventsFile,
  validatePlanFile,
} from './files'
import { validItem } from './fixtures'

const decisionItem = {
  type: 'aufgabe',
  title: 'Krankenkasse anrufen',
  notes: 'wegen Bescheinigung',
  categoryId: 'privat',
  important: true,
  durationMin: 15,
  when: null,
  plan: true,
  gtd: 'naechster-schritt',
  dueDate: null,
  projectId: null,
}
const decisions = {
  decisions: [{ inboxId: '20261021-140000-a1b2', newCategory: null, items: [decisionItem] }],
}

function withItem(patch: Record<string, unknown>) {
  return { decisions: [{ ...decisions.decisions[0], items: [{ ...decisionItem, ...patch }] }] }
}

describe('entscheidungen.json', () => {
  it('akzeptiert das Beispiel, when mit Datum und Zeit und neue Ablage', () => {
    expect(isDecisionsFile(decisions)).toBe(true)
    expect(isDecisionsFile(withItem({ when: { date: '2026-10-23', time: null } }))).toBe(true)
    expect(isDecisionsFile(withItem({ when: { date: '2026-10-23', time: '14:30' } }))).toBe(true)
    const neu = {
      decisions: [
        {
          inboxId: '20261021-140000-a1b2',
          newCategory: { name: 'Fitness', description: 'Sport' },
          items: [{ ...decisionItem, categoryId: '@neu' }],
        },
      ],
    }
    expect(isDecisionsFile(neu)).toBe(true)
  })

  it.each([
    ['inboxId', { decisions: [{ ...decisions.decisions[0], inboxId: 'x' }] }],
    ['newCategory', { decisions: [{ ...decisions.decisions[0], newCategory: { name: '' } }] }],
    ['items', { decisions: [{ ...decisions.decisions[0], items: [] }] }],
    ['type', withItem({ type: 'x' })],
    ['title', withItem({ title: '' })],
    ['notes', withItem({ notes: undefined })],
    ['categoryId', withItem({ categoryId: '' })],
    ['important', withItem({ important: 'ja' })],
    ['durationMin', withItem({ durationMin: 0 })],
    ['when', withItem({ when: { date: '2026-13-40', time: null } })],
    ['when', withItem({ when: { date: '2026-10-23', time: '25:00' } })],
    ['decisions', {}],
  ])('lehnt ungültiges %s ab', (field, value) => {
    const messages = validateDecisionsFile(value)
    expect(messages.length).toBeGreaterThan(0)
    expect(messages.join(' ')).toContain(field)
  })

  it('lehnt "@neu" ohne newCategory ab', () => {
    expect(validateDecisionsFile(withItem({ categoryId: '@neu' })).join(' ')).toContain('@neu')
  })

  describe('GTD-Felder (Phase 9)', () => {
    it.each([
      ['plan', { plan: undefined }],
      ['plan', { plan: 'ja' }],
      ['gtd', { gtd: undefined }],
      ['gtd', { gtd: 'bald' }],
      ['dueDate', { dueDate: undefined }],
      ['dueDate', { dueDate: '30.10.' }],
      ['projectId', { projectId: undefined }],
      ['projectId', { projectId: '' }],
    ])('verlangt bei Aufgaben ein gültiges %s', (field, patch) => {
      expect(validateDecisionsFile(withItem(patch)).join(' ')).toContain(`"${field}"`)
    })

    it('verlangt waiting bei "warten", prüft dessen Form', () => {
      expect(validateDecisionsFile(withItem({ gtd: 'warten' })).join(' ')).toContain('"waiting"')
      const waiting = { person: 'Becker', since: '2026-10-21', followUpOn: '2026-10-28' }
      expect(isDecisionsFile(withItem({ gtd: 'warten', waiting }))).toBe(true)
      expect(
        isDecisionsFile(withItem({ gtd: 'warten', waiting: { ...waiting, followUpOn: null } })),
      ).toBe(true)
      expect(
        validateDecisionsFile(withItem({ gtd: 'warten', waiting: { ...waiting, person: ' ' } })),
      ).not.toEqual([])
      expect(
        validateDecisionsFile(withItem({ gtd: 'warten', waiting: { ...waiting, since: 'x' } })),
      ).not.toEqual([])
    })

    it('Notizen und Termine brauchen die GTD-Felder nicht', () => {
      const bare = { type: 'notiz', title: 'x', notes: '', categoryId: 'privat' }
      const item = { ...bare, important: false, durationMin: null, when: null }
      expect(isDecisionsFile(withItem(item))).toBe(true)
      const noGtd = { ...item, plan: undefined, gtd: undefined, dueDate: undefined }
      expect(isDecisionsFile({ decisions: [{ ...decisions.decisions[0], items: [noGtd] }] })).toBe(
        true,
      )
    })

    it('newProject: Form und "@neu" nur zusammen', () => {
      const project = { title: 'Umzug', notes: 'Originaltext', categoryId: 'privat' }
      const withProject = (newProject: unknown, patch: Record<string, unknown> = {}) => ({
        decisions: [
          {
            ...decisions.decisions[0],
            newProject,
            items: [{ ...decisionItem, ...patch }],
          },
        ],
      })
      expect(isDecisionsFile(withProject(project, { projectId: '@neu' }))).toBe(true)
      expect(isDecisionsFile(withProject(null))).toBe(true)
      expect(validateDecisionsFile(withProject({ ...project, title: '' }))).not.toEqual([])
      expect(validateDecisionsFile(withProject({ ...project, notes: 5 }))).not.toEqual([])
      expect(validateDecisionsFile(withProject(null, { projectId: '@neu' })).join(' ')).toContain(
        'newProject',
      )
      expect(
        validateDecisionsFile(withProject({ ...project, categoryId: '@neu' })).join(' '),
      ).toContain('newCategory')
    })
  })
})

describe('termine.json', () => {
  const timed = {
    id: 'abc',
    title: 'Sprachkurs',
    start: '2026-10-22T09:00:00+02:00',
    end: '2026-10-22T10:30:00+02:00',
    allDay: false,
    date: null,
    transparent: false,
    declined: false,
  }

  it('akzeptiert zeitgebundene (auch ohne Offset), ganztägige und minimale Termine', () => {
    expect(isEventsFile({ events: [timed] })).toBe(true)
    expect(
      isEventsFile({
        events: [{ title: 'x', start: '2026-10-22T09:00:00', end: '2026-10-22T10:00:00' }],
      }),
    ).toBe(true)
    expect(isEventsFile({ events: [{ title: 'Urlaub', allDay: true, date: '2026-10-23' }] })).toBe(
      true,
    )
    expect(isEventsFile({ events: [] })).toBe(true)
  })

  it.each([
    ['events', {}],
    ['title', { events: [{ ...timed, title: 5 }] }],
    ['start', { events: [{ ...timed, start: 'morgen' }] }],
    ['end', { events: [{ ...timed, end: undefined }] }],
    ['date', { events: [{ title: 'x', allDay: true }] }],
    ['declined', { events: [{ ...timed, declined: 'nein' }] }],
    ['id', { events: [{ ...timed, id: 5 }] }],
  ])('lehnt ungültiges %s ab', (field, value) => {
    expect(validateEventsFile(value).join(' ')).toContain(field)
  })
})

describe('plan.json', () => {
  const plan = {
    now: '2026-10-21T14:05:00+02:00',
    entries: [
      {
        inboxId: '20261021-140000-a1b2',
        result: 'ok',
        message: null,
        newCategory: null,
        items: [validItem],
      },
      {
        inboxId: '20261021-140200-e5f6',
        result: 'sortError',
        message: 'Am Fr 23.10. kein Block.',
        newCategory: null,
        items: [],
      },
    ],
    events: [
      {
        itemId: validItem.id,
        title: 'Krankenkasse anrufen',
        start: '2026-10-18T09:00:00+02:00',
        end: '2026-10-18T09:15:00+02:00',
        description: `SecondBrain\n${validItem.id}`,
      },
    ],
    errors: [{ inboxId: '20261021-140300-c3d4', message: 'Fehler' }],
  }

  it('akzeptiert das Beispiel', () => {
    expect(validatePlanFile(plan)).toEqual([])
    expect(isPlanFile(plan)).toBe(true)
  })

  it('akzeptiert eine vollständige neue Ablage', () => {
    const entry = {
      ...plan.entries[0],
      newCategory: { id: 'fitness', name: 'Fitness', kind: 'normal', order: 6, description: '' },
    }
    expect(isPlanFile({ ...plan, entries: [entry] })).toBe(true)
  })

  it.each([
    ['now', { ...plan, now: '2026-10-21T14:05:00' }],
    ['entries', { ...plan, entries: 'x' }],
    ['inboxId', { ...plan, entries: [{ ...plan.entries[0], inboxId: 'x' }] }],
    ['result', { ...plan, entries: [{ ...plan.entries[0], result: 'maybe' }] }],
    ['message', { ...plan, entries: [{ ...plan.entries[1], message: null }] }],
    ['items', { ...plan, entries: [{ ...plan.entries[1], items: [validItem] }] }],
    ['newCategory', { ...plan, entries: [{ ...plan.entries[0], newCategory: { id: 'x' } }] }],
    ['title', { ...plan, entries: [{ ...plan.entries[0], items: [{ ...validItem, title: '' }] }] }],
    ['events', { ...plan, events: [{ ...plan.events[0], start: 'x' }] }],
    ['itemId', { ...plan, events: [{ ...plan.events[0], itemId: 'x' }] }],
    ['errors', { ...plan, errors: [{ inboxId: 'x', message: 'y' }] }],
  ])('lehnt ungültiges %s ab', (field, value) => {
    expect(validatePlanFile(value).join(' ')).toContain(field)
  })
})

describe('termin-ids.json', () => {
  const ids = {
    created: [{ itemId: '20261021-140100-a1b2', eventId: 'ev1' }],
    failed: [{ itemId: '20261021-140300-c3d4', message: 'Kalender nicht erreichbar' }],
  }

  it('akzeptiert das Beispiel', () => {
    expect(isEventIdsFile(ids)).toBe(true)
    expect(isEventIdsFile({ created: [], failed: [] })).toBe(true)
  })

  it.each([
    ['created', { ...ids, created: undefined }],
    ['failed', { ...ids, failed: 'x' }],
    ['itemId', { ...ids, created: [{ itemId: 'x', eventId: 'e' }] }],
    ['eventId', { ...ids, created: [{ itemId: '20261021-140100-a1b2', eventId: '' }] }],
    ['message', { ...ids, failed: [{ itemId: '20261021-140300-c3d4', message: '' }] }],
  ])('lehnt ungültiges %s ab', (field, value) => {
    expect(validateEventIdsFile(value).join(' ')).toContain(field)
  })
})
