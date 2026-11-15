import {
  isCategoriesFile,
  isInboxEntry,
  isItem,
  isAutoSortEnabled,
  isSettings,
  isSuggestion,
  normalizeInboxEntry,
  normalizeItem,
  normalizeSuggestion,
  parseLastRun,
  type Item,
} from './types'

const item: Item = {
  id: '20261017-093000-k3f9',
  type: 'aufgabe',
  title: 'Krankenkasse anrufen',
  notes: '',
  categoryId: 'privat',
  status: 'offen',
  important: true,
  durationMin: 15,
  schedule: { start: '2026-10-18T09:00:00+02:00', durationMin: 15, calendarEventId: 'abc' },
  originalCategoryId: null,
  createdAt: '2026-10-17T09:30:00+02:00',
  updatedAt: '2026-10-17T10:00:00+02:00',
  completedAt: null,
}

const minimal = {
  id: 'a',
  type: 'notiz',
  title: 'T',
  categoryId: 'privat',
  status: 'offen',
  createdAt: 'c',
  updatedAt: 'u',
}

describe('isInboxEntry', () => {
  const ok = { id: 'a', text: 't', createdAt: 'x', source: 'sprache' }
  it('akzeptiert gültige Einträge, source ist optional', () => {
    expect(isInboxEntry(ok)).toBe(true)
    expect(isInboxEntry({ ...ok, source: 'text', extra: 1 })).toBe(true)
    expect(isInboxEntry({ id: 'a', text: 't', createdAt: 'x' })).toBe(true)
  })
  it('lehnt ungültige ab', () => {
    expect(isInboxEntry(null)).toBe(false)
    expect(isInboxEntry({ ...ok, source: 'mail' })).toBe(false)
    expect(isInboxEntry({ ...ok, text: 5 })).toBe(false)
    expect(isInboxEntry({ id: 'a' })).toBe(false)
  })
  it('normalisiert source auf "text"', () => {
    expect(normalizeInboxEntry({ id: 'a', text: 't', createdAt: 'x' }).source).toBe('text')
  })
})

describe('isItem', () => {
  it('akzeptiert vollständige Einträge', () => {
    expect(isItem(item)).toBe(true)
    expect(isItem({ ...item, schedule: null, checked: true, unknown: 1 })).toBe(true)
  })
  it('akzeptiert Minimal-Items und normalisiert sie', () => {
    expect(isItem(minimal)).toBe(true)
    const raw: unknown = { ...minimal, extra: 1 }
    if (!isItem(raw)) throw new Error('ungültig')
    const n = normalizeItem(raw)
    expect(n).toMatchObject({
      notes: '',
      important: false,
      durationMin: null,
      schedule: null,
      originalCategoryId: null,
      completedAt: null,
      extra: 1,
    })
  })
  it('lehnt ungültige ab', () => {
    expect(isItem([])).toBe(false)
    expect(isItem({ ...item, type: 'foo' })).toBe(false)
    expect(isItem({ ...item, status: 'fertig' })).toBe(false)
    expect(isItem({ ...item, important: 'ja' })).toBe(false)
    expect(isItem({ ...item, schedule: { start: 'x' } })).toBe(false)
    expect(isItem({ ...item, durationMin: 'x' })).toBe(false)
    expect(isItem({ ...item, title: undefined })).toBe(false)
    expect(isItem({ ...minimal, updatedAt: undefined })).toBe(false)
  })
})

describe('isSuggestion', () => {
  const ok = {
    id: 's',
    kind: 'neue-aufgabe',
    text: 't',
    proposedItem: { type: 'aufgabe', title: 'x', categoryId: 'studium', durationMin: 30 },
    reason: 'r',
    createdAt: 'c',
  }
  it('akzeptiert gültige', () => expect(isSuggestion(ok)).toBe(true))
  it('akzeptiert Minimalform und normalisiert', () => {
    const min = { id: 's', kind: 'neue-aufgabe', proposedItem: ok.proposedItem }
    expect(isSuggestion(min)).toBe(true)
    if (!isSuggestion(min)) throw new Error('ungültig')
    expect(normalizeSuggestion(min)).toMatchObject({
      text: '',
      reason: '',
      createdAt: '',
    })
  })
  it('lehnt ungültige ab', () => {
    expect(isSuggestion({ ...ok, kind: 'andere' })).toBe(false)
    expect(isSuggestion({ ...ok, proposedItem: { type: 'aufgabe' } })).toBe(false)
    expect(isSuggestion({ ...ok, proposedItem: null })).toBe(false)
  })
})

describe('isCategoriesFile', () => {
  const cat = { id: 'a', name: 'A', kind: 'normal', order: 1, description: '' }
  it('akzeptiert gültige', () => expect(isCategoriesFile({ categories: [cat] })).toBe(true))
  it('lehnt ungültige ab', () => {
    expect(isCategoriesFile({})).toBe(false)
    expect(isCategoriesFile({ categories: [{ ...cat, kind: 'x' }] })).toBe(false)
    expect(isCategoriesFile({ categories: [{ ...cat, order: '1' }] })).toBe(false)
  })
})

describe('isSettings', () => {
  it('akzeptiert gültige', () =>
    expect(
      isSettings({ planningWindow: { start: '09:00', end: '19:00' }, timezone: 'Europe/Berlin' }),
    ).toBe(true))
  it('akzeptiert pause als Objekt, null oder fehlend', () => {
    const base = { planningWindow: { start: '09:00', end: '19:00' }, timezone: 'Europe/Berlin' }
    expect(isSettings({ ...base, pause: { start: '12:00', end: '13:00' } })).toBe(true)
    expect(isSettings({ ...base, pause: null })).toBe(true)
    expect(isSettings(base)).toBe(true)
    expect(isSettings({ ...base, pause: 5 })).toBe(false)
  })
  it('akzeptiert autoSort false, true oder fehlend; anderer Typ zählt als fehlend (= an)', () => {
    const base = { planningWindow: { start: '09:00', end: '19:00' }, timezone: 'Europe/Berlin' }
    expect(isSettings({ ...base, autoSort: false })).toBe(true)
    expect(isSettings({ ...base, autoSort: true })).toBe(true)
    expect(isSettings(base)).toBe(true)
    expect(isSettings({ ...base, autoSort: 'nein' })).toBe(true)
    expect(isAutoSortEnabled({ autoSort: false })).toBe(false)
    expect(isAutoSortEnabled({ autoSort: true })).toBe(true)
    expect(isAutoSortEnabled({})).toBe(true)
    expect(isAutoSortEnabled({ autoSort: 'nein' as unknown as boolean })).toBe(true)
  })
  it('lehnt ungültige ab', () => {
    expect(isSettings({ timezone: 'x' })).toBe(false)
    expect(isSettings({ planningWindow: { start: '09:00' }, timezone: 'x' })).toBe(false)
  })
})

describe('sortError am Eingangskorb-Eintrag', () => {
  const entry = { id: 'a', text: 't', createdAt: 'x' }
  const sortError = { message: 'Kein freier Block.', at: '2026-10-21T14:05:00+02:00' }
  it('akzeptiert Einträge mit und ohne sortError und erhält ihn', () => {
    expect(isInboxEntry(entry)).toBe(true)
    expect(isInboxEntry({ ...entry, sortError })).toBe(true)
    expect(isInboxEntry({ ...entry, sortError: { message: 1 } })).toBe(true)
    expect(normalizeInboxEntry({ ...entry, sortError: { message: 1 } })).not.toHaveProperty(
      'sortError',
    )
    if (isInboxEntry({ ...entry, sortError })) {
      expect(normalizeInboxEntry({ ...entry, sortError })).toMatchObject({ sortError })
    }
  })
})

describe('parseLastRun', () => {
  const run = {
    startedAt: '2026-10-21T14:05:00+02:00',
    finishedAt: '2026-10-21T14:07:30+02:00',
    processed: 2,
    itemIds: ['a', 'b'],
    skipped: [{ inboxId: 'c', message: 'm' }],
    errors: [{ inboxId: null, message: 'e' }],
  }
  it('liest ein gültiges Protokoll', () => expect(parseLastRun(run)).toEqual(run))
  it('ist tolerant gegenüber fehlenden Feldern', () => {
    expect(parseLastRun({ finishedAt: run.finishedAt })).toMatchObject({
      itemIds: [],
      errors: [],
      skipped: [],
    })
  })
  it('liefert null bei Ungültigem', () => {
    expect(parseLastRun(undefined)).toBeNull()
    expect(parseLastRun('x')).toBeNull()
    expect(parseLastRun({ finishedAt: 'kaputt' })).toBeNull()
    expect(parseLastRun({ itemIds: [] })).toBeNull()
  })
})
