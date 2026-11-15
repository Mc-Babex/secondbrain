// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { defaultCategories } from '../../src/data/defaults'
import { validInbox, validItem } from './fixtures'
import {
  validateCategoriesFile,
  validateDataRepo,
  validateInboxFields,
  validateItemFields,
  validateLastRunFile,
  validateSettingsFile,
  validateSuggestionFields,
  type DataRepoFiles,
  type RepoFile,
} from './validate'

const ids = new Set(defaultCategories().categories.map((c) => c.id))
const file = (path: string, data: unknown): RepoFile => ({ path, data })

function repo(partial: Partial<DataRepoFiles> = {}): DataRepoFiles {
  return {
    inbox: [],
    items: [],
    suggestions: [],
    categories: null,
    settings: null,
    lastRun: null,
    ...partial,
  }
}

describe('Eintrag (items)', () => {
  it('akzeptiert einen gültigen Eintrag samt Zusatzfeldern und checked', () => {
    expect(validateItemFields({ ...validItem, extra: 1, checked: true }, ids)).toEqual([])
    expect(validateItemFields({ ...validItem, schedule: null, durationMin: null }, ids)).toEqual([])
  })

  it.each([
    ['fehlendes Pflichtfeld', { ...validItem, notes: undefined }, 'notes'],
    ['leerer Titel', { ...validItem, title: '  ' }, 'title'],
    ['unbekannter Typ', { ...validItem, type: 'foo' }, 'type'],
    ['unbekannter Status', { ...validItem, status: 'x' }, 'status'],
    ['Zeitstempel ohne Offset', { ...validItem, createdAt: '2026-10-17T09:30:00' }, 'createdAt'],
    ['Dauer 0', { ...validItem, durationMin: 0 }, 'durationMin'],
    ['Dauer keine ganze Zahl', { ...validItem, durationMin: 1.5 }, 'durationMin'],
    [
      'schedule ohne Offset',
      { ...validItem, schedule: { start: '2026-10-18T09:00:00', durationMin: 15 } },
      'schedule',
    ],
    [
      'schedule-Dauer 0',
      { ...validItem, schedule: { start: '2026-10-18T09:00:00+02:00', durationMin: 0 } },
      'schedule',
    ],
    ['checked kein boolean', { ...validItem, checked: 'ja' }, 'checked'],
    ['ID-Format', { ...validItem, id: 'abc' }, 'id'],
  ])('lehnt ab: %s', (_name, item, field) => {
    const messages = validateItemFields(item, ids)
    expect(messages.some((m) => m.includes(`"${field}"`))).toBe(true)
  })

  it('lehnt eine unbekannte categoryId ab', () => {
    const messages = validateItemFields({ ...validItem, categoryId: 'nix' }, ids)
    expect(messages).toEqual(['Ablage "nix" existiert nicht in categories.json.'])
  })

  it('lehnt eine erledigte Notiz ab, erlaubt eine offene', () => {
    expect(validateItemFields({ ...validItem, type: 'notiz', status: 'erledigt' }, ids)).toEqual([
      'Notizen sind immer "offen" (status "erledigt" ist nicht erlaubt).',
    ])
    expect(validateItemFields({ ...validItem, type: 'notiz' }, ids)).toEqual([])
  })
})

describe('Eingangskorb (inbox)', () => {
  it('akzeptiert gültige Einträge inkl. sortError', () => {
    expect(validateInboxFields(validInbox)).toEqual([])
    const withError = {
      ...validInbox,
      sortError: { message: 'Kein Block frei.', at: '2026-10-21T14:05:00+02:00' },
    }
    expect(validateInboxFields(withError)).toEqual([])
  })

  it.each([
    ['source fehlt', { ...validInbox, source: undefined }, 'source'],
    ['leerer Text', { ...validInbox, text: '' }, 'text'],
    [
      'sortError ohne Meldung',
      { ...validInbox, sortError: { message: '', at: '2026-10-21T14:05:00+02:00' } },
      'sortError',
    ],
    [
      'sortError ohne Offset',
      { ...validInbox, sortError: { message: 'x', at: '2026-10-21T14:05:00' } },
      'sortError',
    ],
    ['sortError kein Objekt', { ...validInbox, sortError: 'x' }, 'sortError'],
  ])('lehnt ab: %s', (_name, entry, field) => {
    expect(validateInboxFields(entry).some((m) => m.includes(`"${field}"`))).toBe(true)
  })
})

describe('Ablagen, Einstellungen, Protokoll, Vorschläge', () => {
  it('akzeptiert die Standard-Ablagen', () => {
    expect(validateCategoriesFile(defaultCategories())).toEqual([])
  })

  it('lehnt doppelte IDs, zwei einkauf-Ablagen und fehlendes archiv ab', () => {
    const [privat, ...rest] = defaultCategories().categories
    const dup = { categories: [privat, privat, ...rest] }
    expect(validateCategoriesFile(dup).join(' ')).toContain('mehrfach')
    const twoShop = {
      categories: [...rest, { ...privat, id: 'einkauf2', kind: 'einkauf' }],
    }
    expect(validateCategoriesFile(twoShop).join(' ')).toContain('"einkauf"')
    const noArchive = { categories: rest.filter((c) => c.kind !== 'archiv') }
    expect(validateCategoriesFile(noArchive).join(' ')).toContain('"archiv"')
  })

  it('lehnt eine Ablage mit falscher order ab', () => {
    const bad = { categories: defaultCategories().categories.map((c) => ({ ...c, order: '1' })) }
    expect(validateCategoriesFile(bad).join(' ')).toContain('order')
  })

  it('prüft Einstellungen: HH:MM und Beginn vor Ende', () => {
    const ok = { planningWindow: { start: '09:00', end: '19:00' }, timezone: 'Europe/Berlin' }
    expect(validateSettingsFile(ok)).toEqual([])
    expect(
      validateSettingsFile({ ...ok, planningWindow: { start: '9:00', end: '19:00' } }),
    ).not.toEqual([])
    expect(
      validateSettingsFile({ ...ok, planningWindow: { start: '19:00', end: '09:00' } }),
    ).not.toEqual([])
    expect(
      validateSettingsFile({ ...ok, planningWindow: { start: '09:00', end: '24:00' } }),
    ).not.toEqual([])
    expect(validateSettingsFile({ planningWindow: ok.planningWindow })).not.toEqual([])
  })

  it('toleriert pause (Objekt, null, fehlend, auch ungültig) ohne Fehler', () => {
    const ok = { planningWindow: { start: '09:00', end: '19:00' }, timezone: 'Europe/Berlin' }
    expect(validateSettingsFile({ ...ok, pause: { start: '12:00', end: '13:00' } })).toEqual([])
    expect(validateSettingsFile({ ...ok, pause: null })).toEqual([])
    expect(validateSettingsFile({ ...ok, pause: { start: '13:00', end: '12:00' } })).toEqual([])
  })

  const lastRun = {
    startedAt: '2026-10-21T14:05:00+02:00',
    finishedAt: '2026-10-21T14:07:30+02:00',
    processed: 3,
    itemIds: ['20261021-140100-a1b2'],
    skipped: [{ inboxId: '20261021-140200-e5f6', message: 'Kein Block.' }],
    errors: [{ inboxId: null, message: 'Fehler.' }],
  }

  it('prüft runs/last.json', () => {
    expect(validateLastRunFile(lastRun)).toEqual([])
    expect(validateLastRunFile({ ...lastRun, processed: -1 })).not.toEqual([])
    expect(validateLastRunFile({ ...lastRun, itemIds: ['x'] })).not.toEqual([])
    expect(
      validateLastRunFile({ ...lastRun, skipped: [{ inboxId: null, message: 'x' }] }),
    ).not.toEqual([])
    expect(validateLastRunFile({ ...lastRun, startedAt: '2026-10-21T14:05:00' })).not.toEqual([])
  })

  const suggestion = {
    id: '20261017-110000-p2x8',
    kind: 'neue-aufgabe',
    text: 'Antwort an Herrn Wagner',
    proposedItem: { type: 'aufgabe', title: 'Antwort', categoryId: 'arbeit', durationMin: 30 },
    reason: 'Mail vom 17.10.',
    createdAt: '2026-10-17T11:00:00+02:00',
  }

  it('prüft Vorschläge', () => {
    expect(validateSuggestionFields(suggestion, ids)).toEqual([])
    expect(validateSuggestionFields({ ...suggestion, kind: 'x' }, ids)).not.toEqual([])
    expect(validateSuggestionFields({ ...suggestion, proposedItem: 5 }, ids)).not.toEqual([])
    const unknownCat = {
      ...suggestion,
      proposedItem: { ...suggestion.proposedItem, categoryId: 'nix' },
    }
    expect(validateSuggestionFields(unknownCat, ids).join(' ')).toContain('nix')
  })
})

describe('validateDataRepo', () => {
  it('akzeptiert ein gültiges Repo; fehlende categories/settings gelten als Standard', () => {
    const files = repo({
      inbox: [file(`inbox/${validInbox.id}.json`, validInbox)],
      items: [file(`items/${validItem.id}.json`, validItem)],
    })
    expect(validateDataRepo(files)).toEqual([])
  })

  it('meldet ID ungleich Dateiname', () => {
    const errors = validateDataRepo(
      repo({ items: [file('items/20261017-093000-zzzz.json', validItem)] }),
    )
    expect(errors).toEqual([
      {
        path: 'items/20261017-093000-zzzz.json',
        message: 'ID "20261017-093000-k3f9" stimmt nicht mit dem Dateinamen überein.',
      },
    ])
  })

  it('meldet Dateinamen ohne ID-Format, Nicht-JSON-Dateien und kaputtes JSON', () => {
    const errors = validateDataRepo(
      repo({
        items: [
          file('items/foo.json', { ...validItem, id: 'foo' }),
          { path: 'items/notiz.txt', data: undefined },
          {
            path: 'inbox/20261017-093000-k3f9.json',
            data: undefined,
            parseError: 'Unexpected token',
          },
        ],
      }),
    )
    const text = errors.map((e) => `${e.path}: ${e.message}`).join('\n')
    expect(text).toContain('items/foo.json: Dateiname ist keine gültige ID')
    expect(text).toContain('items/notiz.txt: Nur .json-Dateien')
    expect(text).toContain('Kein gültiges JSON')
  })

  it('prüft categoryId gegen die vorhandene categories.json', () => {
    const custom = {
      categories: [
        ...defaultCategories().categories,
        { id: 'fitness', name: 'Fitness', kind: 'normal', order: 6, description: '' },
      ],
    }
    const item = { ...validItem, categoryId: 'fitness' }
    const files = repo({ items: [file(`items/${item.id}.json`, item)] })
    expect(validateDataRepo(files)).not.toEqual([])
    expect(validateDataRepo({ ...files, categories: file('categories.json', custom) })).toEqual([])
  })

  it('meldet Fehler in categories.json, settings.json und runs/last.json mit Pfad', () => {
    const errors = validateDataRepo(
      repo({
        categories: file('categories.json', { categories: [] }),
        settings: file('settings.json', {}),
        lastRun: file('runs/last.json', []),
      }),
    )
    expect(new Set(errors.map((e) => e.path))).toEqual(
      new Set(['categories.json', 'settings.json', 'runs/last.json']),
    )
  })
})
