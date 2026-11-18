import { getFile, getOutbox, putFileFromRemote, resetDb } from './localStore'
import {
  acceptSuggestion,
  addInboxEntry,
  completeItem,
  createItem,
  createScheduledTask,
  deleteInboxEntry,
  deleteItem,
  fileInboxEntry,
  getCategories,
  getSettings,
  listInbox,
  listItems,
  listSuggestions,
  notifyChange,
  rejectSuggestion,
  restoreItem,
  saveCategories,
  saveSettings,
  subscribe,
  updateItem,
} from './repository'
import { defaultCategories, defaultSettings } from './defaults'
import { isInboxEntry, isItem } from './types'
import type { Suggestion } from './types'

beforeEach(() => resetDb(true))
afterAll(() => resetDb(true))

const suggestion: Suggestion = {
  id: '20261017-110000-p2x8',
  kind: 'neue-aufgabe',
  text: 'Antwort an Herrn Wagner',
  proposedItem: {
    type: 'aufgabe',
    title: 'Antwort senden',
    categoryId: 'arbeit',
    durationMin: 30,
  },
  reason: 'Mail',
  createdAt: '2026-10-17T11:00:00+02:00',
}

async function outboxOps(): Promise<Record<string, string>> {
  return Object.fromEntries((await getOutbox()).map((e) => [e.path, e.op]))
}

describe('createScheduledTask', () => {
  const schedule = {
    start: '2026-10-20T09:00:00+02:00',
    durationMin: 60,
    calendarEventId: 'ev-1',
  }

  it('legt eine Aufgabe mit Termin an und trägt put in die Outbox ein', async () => {
    const item = await createScheduledTask({
      title: 'Zahnarzt',
      notes: 'Bitte pünktlich',
      categoryId: 'privat',
      schedule,
    })
    expect(item).toMatchObject({
      type: 'aufgabe',
      title: 'Zahnarzt',
      notes: 'Bitte pünktlich',
      gtd: 'naechster-schritt',
      categoryId: 'privat',
      schedule,
    })
    expect(item.projectId).toBeUndefined()
    expect(await outboxOps()).toEqual({ [`items/${item.id}.json`]: 'put' })
  })

  it('mit Projekt: projectId gesetzt, projectOrder hinten angehängt', async () => {
    const first = await createScheduledTask({
      title: 'A',
      notes: '',
      categoryId: 'privat',
      projectId: 'p1',
      schedule,
    })
    const second = await createScheduledTask({
      title: 'B',
      notes: '',
      categoryId: 'privat',
      projectId: 'p1',
      schedule,
    })
    expect(first.projectId).toBe('p1')
    expect(second.projectOrder).toBe((first.projectOrder ?? 0) + 1)
  })
})

describe('Eingangskorb', () => {
  it('legt einen Eintrag an und trägt put in die Outbox ein', async () => {
    const entry = await addInboxEntry('  Milch kaufen  ', 'text')
    expect(isInboxEntry(entry)).toBe(true)
    expect(entry.text).toBe('Milch kaufen')
    expect((await getFile(`inbox/${entry.id}.json`))?.data).toEqual(entry)
    expect(await outboxOps()).toEqual({ [`inbox/${entry.id}.json`]: 'put' })
    expect(await listInbox()).toEqual([entry])
  })

  it('lehnt leeren Text ab', async () => {
    await expect(addInboxEntry('   ', 'text')).rejects.toThrow()
    expect(await getOutbox()).toHaveLength(0)
  })

  it('Löschen direkt nach Anlegen ergibt einen delete-Eintrag', async () => {
    const entry = await addInboxEntry('x', 'sprache')
    await deleteInboxEntry(entry.id)
    expect(await listInbox()).toEqual([])
    const outbox = await getOutbox()
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ op: 'delete', baseSha: null })
  })

  it('fileInboxEntry erzeugt Item mit derselben id und löscht den Eintrag', async () => {
    const entry = await addInboxEntry('Steuer', 'text')
    const item = await fileInboxEntry(entry.id, {
      type: 'aufgabe',
      title: 'Steuer machen',
      categoryId: 'privat',
    })
    expect(item.id).toBe(entry.id)
    expect(item).toMatchObject({
      type: 'aufgabe',
      title: 'Steuer machen',
      categoryId: 'privat',
      status: 'offen',
      notes: '',
      schedule: null,
      completedAt: null,
      createdAt: entry.createdAt,
    })
    expect(isItem((await getFile(`items/${entry.id}.json`))?.data)).toBe(true)
    expect(await getFile(`inbox/${entry.id}.json`)).toBeUndefined()
    expect(await outboxOps()).toEqual({
      [`items/${entry.id}.json`]: 'put',
      [`inbox/${entry.id}.json`]: 'delete',
    })
  })

  it('fileInboxEntry übernimmt notes', async () => {
    const entry = await addInboxEntry('Titel\nDetails', 'text')
    const item = await fileInboxEntry(entry.id, {
      type: 'notiz',
      title: 'Titel',
      notes: 'Details',
      categoryId: 'privat',
    })
    expect(item.notes).toBe('Details')
  })

  it('fileInboxEntry mit unbekannter id wirft', async () => {
    await expect(
      fileInboxEntry('nope', { type: 'notiz', title: 'x', categoryId: 'privat' }),
    ).rejects.toThrow()
  })
})

describe('Einträge', () => {
  it('createItem, updateItem (updatedAt) und deleteItem', async () => {
    const item = await createItem({ type: 'aufgabe', title: 'A', categoryId: 'arbeit' })
    expect(await listItems()).toEqual([item])
    await updateItem(item.id, { title: 'B', important: true })
    const stored = (await listItems())[0]
    expect(stored).toMatchObject({ title: 'B', important: true })
    expect(stored.updatedAt >= item.updatedAt).toBe(true)
    expect(await getOutbox()).toHaveLength(1)
    await deleteItem(item.id)
    expect(await listItems()).toEqual([])
    expect((await getOutbox())[0]).toMatchObject({ op: 'delete' })
  })

  it('updateItem auf unbekannte id wirft', async () => {
    await expect(updateItem('nope', { title: 'x' })).rejects.toThrow()
  })

  it('updateItem erhält unbekannte Felder', async () => {
    const item = await createItem({ type: 'aufgabe', title: 'A', categoryId: 'arbeit' })
    await putFileFromRemote(`items/${item.id}.json`, { ...item, futureField: { a: 1 } }, 'sha1')
    await updateItem(item.id, { title: 'Neu' })
    const data = (await getFile(`items/${item.id}.json`))?.data
    expect(data).toMatchObject({ title: 'Neu', futureField: { a: 1 } })
  })

  it('listItems ist nach id sortiert', async () => {
    await createItem({ id: 'b', type: 'notiz', title: 'b', categoryId: 'privat' })
    await createItem({ id: 'a', type: 'notiz', title: 'a', categoryId: 'privat' })
    expect((await listItems()).map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('completeItem archiviert, restoreItem stellt wieder her', async () => {
    const item = await createItem({ type: 'aufgabe', title: 'A', categoryId: 'arbeit' })
    const done = await completeItem(item.id)
    expect(done).toMatchObject({
      status: 'erledigt',
      categoryId: 'erledigt',
      originalCategoryId: 'arbeit',
    })
    expect(done.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*[+-]\d{2}:\d{2}$/)
    const back = await restoreItem(item.id)
    expect(back).toMatchObject({
      status: 'offen',
      categoryId: 'arbeit',
      completedAt: null,
    })
    expect(await getOutbox()).toHaveLength(1)
  })

  it('completeItem nutzt die Archiv-Ablage aus categories', async () => {
    await saveCategories([
      { id: 'a', name: 'A', kind: 'normal', order: 1, description: '' },
      { id: 'arch', name: 'Archiv', kind: 'archiv', order: 2, description: '' },
    ])
    const item = await createItem({ type: 'aufgabe', title: 'A', categoryId: 'a' })
    expect((await completeItem(item.id)).categoryId).toBe('arch')
  })

  it('restoreItem fällt auf erste normale Ablage zurück, wenn das Original fehlt', async () => {
    const item = await createItem({
      type: 'aufgabe',
      title: 'A',
      categoryId: 'erledigt',
      status: 'erledigt',
      originalCategoryId: 'geloescht',
    })
    expect((await restoreItem(item.id)).categoryId).toBe('privat')
  })
})

describe('Vorschläge', () => {
  async function seed(): Promise<void> {
    await putFileFromRemote(`suggestions/${suggestion.id}.json`, suggestion, 'sha1')
  }

  it('listSuggestions liest vorhandene Vorschläge', async () => {
    await seed()
    expect(await listSuggestions()).toEqual([suggestion])
  })

  it('acceptSuggestion legt Item an und löscht den Vorschlag', async () => {
    await seed()
    const item = await acceptSuggestion(suggestion.id)
    expect(item).toMatchObject({
      type: 'aufgabe',
      title: 'Antwort senden',
      categoryId: 'arbeit',
      durationMin: 30,
      status: 'offen',
    })
    expect(await listSuggestions()).toEqual([])
    expect(await listItems()).toEqual([item])
    expect(await outboxOps()).toEqual({
      [`items/${item.id}.json`]: 'put',
      [`suggestions/${suggestion.id}.json`]: 'delete',
    })
    expect((await getOutbox()).find((e) => e.op === 'delete')?.baseSha).toBe('sha1')
  })

  it('rejectSuggestion löscht den Vorschlag ohne Item', async () => {
    await seed()
    await rejectSuggestion(suggestion.id)
    expect(await listSuggestions()).toEqual([])
    expect(await listItems()).toEqual([])
    expect(await outboxOps()).toEqual({ [`suggestions/${suggestion.id}.json`]: 'delete' })
  })
})

describe('Ablagen und Einstellungen', () => {
  it('liefern Standardwerte ohne Outbox-Eintrag', async () => {
    expect(await getCategories()).toEqual(defaultCategories().categories)
    expect(await getSettings()).toEqual(defaultSettings())
    expect(await getOutbox()).toHaveLength(0)
    expect(await getFile('categories.json')).toBeUndefined()
  })

  it('speichern lokal und tragen put in die Outbox ein', async () => {
    const cats = [{ id: 'x', name: 'X', kind: 'normal' as const, order: 1, description: '' }]
    await saveCategories(cats)
    const settings = { planningWindow: { start: '08:00', end: '18:00' }, timezone: 'Europe/Berlin' }
    await saveSettings(settings)
    expect(await getCategories()).toEqual(cats)
    expect(await getSettings()).toEqual(settings)
    expect(await outboxOps()).toEqual({ 'categories.json': 'put', 'settings.json': 'put' })
  })

  it('erhalten unbekannte Felder der Datei', async () => {
    await putFileFromRemote('settings.json', { ...defaultSettings(), extra: true }, 's')
    await saveSettings({
      planningWindow: { start: '10:00', end: '12:00' },
      timezone: 'Europe/Berlin',
    })
    expect((await getFile('settings.json'))?.data).toMatchObject({ extra: true })
  })
})

describe('Pause in den Einstellungen', () => {
  it('bleibt beim Lesen und Zurückschreiben (auch von älteren Ständen) erhalten', async () => {
    await putFileFromRemote(
      'settings.json',
      {
        planningWindow: { start: '09:00', end: '19:00' },
        pause: { start: '12:30', end: '13:30' },
        timezone: 'Europe/Berlin',
        extra: 1,
      },
      's',
    )
    const settings = await getSettings()
    expect(settings.pause).toEqual({ start: '12:30', end: '13:30' })
    await saveSettings({ ...settings, planningWindow: { start: '08:00', end: '19:00' } })
    expect((await getFile('settings.json'))?.data).toMatchObject({
      pause: { start: '12:30', end: '13:30' },
      extra: 1,
    })
  })

  it('speichert null (Pause aus) und liest es wieder als null', async () => {
    await saveSettings({ ...defaultSettings(), pause: null })
    expect((await getSettings()).pause).toBeNull()
  })

  it('ohne Feld bleibt pause undefiniert (Standard gilt erst in effectivePause)', async () => {
    await putFileFromRemote(
      'settings.json',
      { planningWindow: { start: '09:00', end: '19:00' }, timezone: 'Europe/Berlin' },
      's',
    )
    expect((await getSettings()).pause).toBeUndefined()
  })
})

describe('Ereignis', () => {
  it('benachrichtigt Abonnenten bei Änderungen und meldet sich ab', async () => {
    let calls = 0
    const unsubscribe = subscribe(() => {
      calls += 1
    })
    await addInboxEntry('x', 'text')
    expect(calls).toBe(1)
    notifyChange()
    expect(calls).toBe(2)
    unsubscribe()
    notifyChange()
    expect(calls).toBe(2)
  })
})
