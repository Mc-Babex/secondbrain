import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeGithub } from '../test/fakeGithub'
import { getFile, getOutbox, resetDb, setSecret } from './localStore'
import {
  addInboxEntry,
  getCategories,
  getLastRun,
  getSettings,
  listInbox,
  listItems,
  listSuggestions,
} from './repository'
import { syncNow } from './sync'
import { getSyncStatus, resetSyncStatus } from './syncStatus'

const T = '2026-10-01T10:00:00+02:00'

const remoteFiles: Record<string, unknown> = {
  'inbox/i1.json': { id: 'i1', text: 'Milch', createdAt: T, source: 'text', inboxExtra: 1 },
  'items/a1.json': {
    id: 'a1',
    type: 'aufgabe',
    title: 'Größe äöüß€',
    notes: '',
    categoryId: 'privat',
    status: 'offen',
    important: false,
    durationMin: null,
    schedule: null,
    originalCategoryId: null,
    createdAt: T,
    updatedAt: T,
    completedAt: null,
    itemExtra: 'bleibt',
  },
  'suggestions/s1.json': {
    id: 's1',
    kind: 'neue-aufgabe',
    proposedItem: { type: 'aufgabe', title: 'x', categoryId: 'privat' },
    suggestionExtra: true,
  },
  'categories.json': {
    categories: [
      { id: 'privat', name: 'Privat', kind: 'normal', order: 1, description: 'p', catExtra: 1 },
    ],
    topExtra: 'x',
  },
  'settings.json': {
    planningWindow: { start: '08:00', end: '20:00' },
    timezone: 'Europe/Berlin',
    settingsExtra: 5,
  },
  'runs/last.json': { finishedAt: '2026-10-21T14:07:30+02:00', itemIds: ['a1'] },
  'unbekannt/datei.json': { irgendwas: true },
}

let fake: FakeGithub

beforeEach(async () => {
  await resetDb(true)
  resetSyncStatus()
  fake = new FakeGithub()
  vi.stubGlobal('fetch', fake.fetch)
  await setSecret('githubToken', 'ghp_testtoken')
  await setSecret('githubRepo', 'alex/daten')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Wiederherstellung aus dem Daten-Repo', () => {
  it('leere lokale Datenbank: nach einem Abgleich ist alles lokal lesbar, nichts wird geschrieben', async () => {
    for (const [path, data] of Object.entries(remoteFiles)) fake.set(path, data)
    const before = new Map(fake.files)

    await syncNow()

    expect(getSyncStatus()).toMatchObject({ state: 'synchron', pending: 0 })
    expect(await getOutbox()).toEqual([])
    expect(await listInbox()).toEqual([expect.objectContaining({ id: 'i1', inboxExtra: 1 })])
    expect(await listItems()).toEqual([
      expect.objectContaining({ id: 'a1', title: 'Größe äöüß€', itemExtra: 'bleibt' }),
    ])
    expect(await listSuggestions()).toEqual([
      expect.objectContaining({ id: 's1', suggestionExtra: true }),
    ])
    expect(await getCategories()).toEqual([expect.objectContaining({ id: 'privat', catExtra: 1 })])
    expect(await getSettings()).toMatchObject({ settingsExtra: 5, timezone: 'Europe/Berlin' })
    expect(await getLastRun()).toMatchObject({ itemIds: ['a1'] })
    expect((await getFile('categories.json'))?.data).toMatchObject({ topExtra: 'x' })

    expect(fake.requests.filter((r) => ['PUT', 'DELETE'].includes(r.method))).toEqual([])
    expect(fake.files).toEqual(before)
  })
})

describe('Offline mit vorhandenen lokalen Daten', () => {
  it('Lesen geht, Erfassen landet in der Outbox, nach Rückkehr des Netzes wird hochgeladen', async () => {
    for (const [path, data] of Object.entries(remoteFiles)) fake.set(path, data)
    await syncNow()

    fake.offline = true
    expect(await listItems()).toHaveLength(1)
    const entry = await addInboxEntry('offline erfasst', 'text')
    await syncNow()

    expect(getSyncStatus()).toMatchObject({ state: 'offline', pending: 1 })
    expect(await listItems()).toHaveLength(1)
    expect((await listInbox()).map((e) => e.id)).toContain(entry.id)
    expect(await getOutbox()).toHaveLength(1)

    fake.offline = false
    await syncNow()
    expect(getSyncStatus()).toMatchObject({ state: 'synchron', pending: 0 })
    expect(await getOutbox()).toEqual([])
    expect(fake.json(`inbox/${entry.id}.json`)).toMatchObject({ text: 'offline erfasst' })
  })
})
