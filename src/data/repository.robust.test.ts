import { getFile, getOutbox, putFileFromRemote, resetDb } from './localStore'
import {
  acceptSuggestion,
  completeItem,
  deleteInboxEntry,
  deleteItem,
  getCategories,
  getSettings,
  listInbox,
  listInvalidPaths,
  listItems,
  listSuggestions,
  rejectSuggestion,
  restoreItem,
  saveCategories,
  saveSettings,
  updateItem,
} from './repository'
import { defaultCategories } from './defaults'

beforeEach(async () => {
  await resetDb(true)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => vi.restoreAllMocks())
afterAll(() => resetDb(true))

const minimal = {
  id: 'm1',
  type: 'aufgabe',
  title: 'Minimal',
  categoryId: 'arbeit',
  status: 'offen',
  createdAt: '2026-10-17T09:00:00+02:00',
  updatedAt: '2026-10-17T09:00:00+02:00',
  futureField: 7,
}

describe('tolerantes Lesen', () => {
  it('listItems ergänzt Defaults und erhält unbekannte Felder', async () => {
    await putFileFromRemote('items/m1.json', minimal, 's')
    const [item] = await listItems()
    expect(item).toMatchObject({
      notes: '',
      important: false,
      durationMin: null,
      schedule: null,
      originalCategoryId: null,
      completedAt: null,
      futureField: 7,
    })
  })

  it('updateItem, completeItem und restoreItem funktionieren mit Minimal-Items', async () => {
    await putFileFromRemote('items/m1.json', minimal, 's')
    expect(await updateItem('m1', { title: 'Neu' })).toMatchObject({ title: 'Neu', notes: '' })
    const done = await completeItem('m1')
    expect(done).toMatchObject({ status: 'erledigt', originalCategoryId: 'arbeit' })
    const back = await restoreItem('m1')
    expect(back).toMatchObject({ status: 'offen', categoryId: 'arbeit', futureField: 7 })
    expect((await getFile('items/m1.json'))?.remoteSha).toBe('s')
  })

  it('Inbox ohne source bekommt "text"', async () => {
    await putFileFromRemote('inbox/i.json', { id: 'i', text: 'x', createdAt: 'c' }, 's')
    expect((await listInbox())[0].source).toBe('text')
  })

  it('Vorschlag mit minimalem proposedItem lässt sich annehmen', async () => {
    await putFileFromRemote(
      'suggestions/s.json',
      {
        id: 's',
        kind: 'neue-aufgabe',
        proposedItem: { type: 'aufgabe', title: 'T', categoryId: 'privat' },
      },
      'sha',
    )
    expect((await listSuggestions())[0]).toMatchObject({ text: '', reason: '' })
    expect(await acceptSuggestion('s')).toMatchObject({ title: 'T', status: 'offen' })
  })
})

describe('ungültige Dateien', () => {
  it('werden gemeldet, übersprungen und per listInvalidPaths angezeigt', async () => {
    await putFileFromRemote('items/bad.json', { id: 'bad', type: 'x' }, 's')
    await putFileFromRemote('items/m1.json', minimal, 's')
    expect(await listItems()).toHaveLength(1)
    expect(listInvalidPaths()).toContain('items/bad.json')
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('items/bad.json'))
    const calls = JSON.stringify(vi.mocked(console.warn).mock.calls)
    expect(calls).not.toContain('"type":"x"')
  })
})

describe('Ablagen und Einstellungen aus ungültigen Dateien', () => {
  it('Kategorien: ungültige Einträge werden verworfen, gültige bleiben', async () => {
    const good = defaultCategories().categories[0]
    await putFileFromRemote(
      'categories.json',
      { categories: [good, { id: 'kaputt' }], extra: 1 },
      's',
    )
    expect(await getCategories()).toEqual([good])
    expect(listInvalidPaths()).toContain('categories.json')
  })

  it('Kategorien: nichts Gültiges wirft statt Defaults zu liefern', async () => {
    await putFileFromRemote('categories.json', { categories: [{ id: 'kaputt' }] }, 's')
    await expect(getCategories()).rejects.toThrow()
    await putFileFromRemote('categories.json', 'quatsch', 's')
    await expect(getCategories()).rejects.toThrow()
  })

  it('saveCategories erhält fremde Top-Level-Felder', async () => {
    await putFileFromRemote('categories.json', { categories: [], version: 3 }, 's')
    await saveCategories(defaultCategories().categories)
    expect((await getFile('categories.json'))?.data).toMatchObject({ version: 3 })
  })

  it('Settings: fehlende Felder werden ergänzt, unbekannte erhalten', async () => {
    await putFileFromRemote('settings.json', { planningWindow: { start: '08:00' }, extra: 1 }, 's')
    expect(await getSettings()).toEqual({
      planningWindow: { start: '08:00', end: '19:00' },
      timezone: 'Europe/Berlin',
      extra: 1,
    })
    await saveSettings({
      planningWindow: { start: '07:00', end: '12:00' },
      timezone: 'Europe/Berlin',
    })
    expect((await getFile('settings.json'))?.data).toMatchObject({ extra: 1 })
  })

  it('Settings: Nicht-Objekt wirft', async () => {
    await putFileFromRemote('settings.json', [], 's')
    await expect(getSettings()).rejects.toThrow()
  })
})

describe('Löschen nicht vorhandener IDs', () => {
  it('ist ein No-op ohne Outbox-Eintrag', async () => {
    await deleteItem('nope')
    await deleteInboxEntry('nope')
    await rejectSuggestion('nope')
    expect(await getOutbox()).toHaveLength(0)
  })
})
