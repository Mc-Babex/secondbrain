import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MSG_DATA_FORMAT_INVALID, MSG_DATA_FORMAT_NEWER } from '../lib/dataFormat'
import { FakeGithub } from '../test/fakeGithub'
import {
  deleteFileLocal,
  getFile,
  getOutbox,
  putFileFromRemote,
  putFileLocal,
  resetDb,
  setSecret,
  updateFileLocal,
  deleteSecret,
} from './localStore'
import { addInboxEntry, createItem, deleteItem, getLastRun, updateItem } from './repository'
import { clearErrorLog, getErrorLog } from './errorLog'
import { startAutoSync, stopAutoSync, syncNow } from './sync'
import { getDataFormatProblem, getSyncStatus, resetSyncStatus } from './syncStatus'

const OLD = '2026-10-01T10:00:00+02:00'
const MID = '2026-10-02T10:00:00+02:00'
const NEW = '2026-10-03T10:00:00+02:00'

const item = (id: string, updatedAt: string, title = 'Aufgabe') => ({
  id,
  type: 'aufgabe',
  title,
  notes: '',
  categoryId: 'privat',
  status: 'offen',
  important: false,
  durationMin: null,
  schedule: null,
  originalCategoryId: null,
  createdAt: OLD,
  updatedAt,
  completedAt: null,
})

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
  stopAutoSync()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Legt lokal eine Änderung an, die eine veraltete `baseSha` hat (Konfliktausgangslage). */
async function seedConflict(path: string, local: unknown, remote: unknown): Promise<void> {
  fake.set(path, remote)
  await putFileFromRemote(path, remote, 'stale')
  await updateFileLocal(path, () => local)
}

describe('Outbox senden', () => {
  it('sendet put, aktualisiert remoteSha und leert die Outbox', async () => {
    const created = await createItem({
      type: 'aufgabe',
      title: 'Größe äöüß€',
      categoryId: 'privat',
    })
    const path = `items/${created.id}.json`
    await syncNow()
    expect(fake.json(path)).toEqual(created)
    expect(fake.files.get(path)?.content.endsWith('}\n')).toBe(true)
    expect((await getFile(path))?.remoteSha).toBe(fake.sha(path))
    expect(await getOutbox()).toEqual([])
    expect(getSyncStatus()).toMatchObject({ state: 'synchron', pending: 0, message: null })
    expect(getSyncStatus().lastSync).not.toBeNull()
  })

  it('sendet in queuedAt-Reihenfolge und löscht per delete', async () => {
    const a = await createItem({ type: 'aufgabe', title: 'A', categoryId: 'privat' })
    await syncNow()
    const b = await addInboxEntry('Hallo', 'text')
    await deleteItem(a.id)
    fake.requests = []
    await syncNow()
    expect(fake.files.has(`items/${a.id}.json`)).toBe(false)
    expect(fake.files.has(`inbox/${b.id}.json`)).toBe(true)
    const writes = fake.requests.filter((r) => r.method !== 'GET').map((r) => r.method)
    expect(writes).toEqual(['PUT', 'DELETE'])
    expect(await getOutbox()).toEqual([])
  })

  it('entfernt ein delete ohne baseSha, wenn remote nichts existiert', async () => {
    const entry = await addInboxEntry('Kurzlebig', 'text')
    await deleteFileLocal(`inbox/${entry.id}.json`)
    await syncNow()
    expect(fake.count('DELETE')).toBe(0)
    expect(fake.count('PUT')).toBe(0)
    expect(await getOutbox()).toEqual([])
  })
})

describe('Konflikte', () => {
  it('lokal neuer: Remote-sha wird verwendet, lokale Fassung gewinnt', async () => {
    const path = 'items/k1.json'
    await seedConflict(path, item('k1', NEW, 'lokal'), item('k1', OLD, 'remote'))
    await syncNow()
    expect(fake.json(path)).toMatchObject({ title: 'lokal' })
    expect(await getOutbox()).toEqual([])
    expect((await getFile(path))?.remoteSha).toBe(fake.sha(path))
  })

  it('remote neuer: Remote überschreibt lokal, Outbox-Eintrag entfällt', async () => {
    const path = 'items/k2.json'
    await seedConflict(path, item('k2', OLD, 'lokal'), item('k2', NEW, 'remote'))
    const before = fake.sha(path)
    await syncNow()
    expect(fake.sha(path)).toBe(before)
    expect((await getFile(path))?.data).toMatchObject({ title: 'remote' })
    expect(await getOutbox()).toEqual([])
  })

  it('Gleichstand: Remote gewinnt', async () => {
    const path = 'items/k3.json'
    await seedConflict(path, item('k3', MID, 'lokal'), item('k3', MID, 'remote'))
    await syncNow()
    expect((await getFile(path))?.data).toMatchObject({ title: 'remote' })
    expect(fake.json(path)).toMatchObject({ title: 'remote' })
    expect(await getOutbox()).toEqual([])
  })

  it('inbox remote gelöscht: lokale Änderung wird verworfen', async () => {
    const path = 'inbox/i1.json'
    const entry = { id: 'i1', text: 'alt', createdAt: OLD, source: 'text' }
    await putFileFromRemote(path, entry, 'gone')
    await updateFileLocal(path, () => ({ ...entry, text: 'geändert' }))
    await syncNow()
    expect(await getFile(path)).toBeUndefined()
    expect(fake.files.has(path)).toBe(false)
    expect(await getOutbox()).toEqual([])
  })

  it('items remote gelöscht: Datei wird neu angelegt', async () => {
    const path = 'items/k4.json'
    await putFileFromRemote(path, item('k4', OLD), 'gone')
    await updateFileLocal(path, () => item('k4', NEW, 'lokal'))
    await syncNow()
    expect(fake.json(path)).toMatchObject({ title: 'lokal' })
    expect(await getOutbox()).toEqual([])
  })

  it('categories.json: lokal gewinnt immer', async () => {
    const local = { categories: [{ id: 'a' }] }
    await seedConflict('categories.json', local, {
      categories: [{ id: 'a', name: 'remote' }],
      updatedAt: NEW,
    })
    await syncNow()
    expect((fake.json('categories.json') as { categories: unknown }).categories).toEqual(
      local.categories,
    )
    expect(await getOutbox()).toEqual([])
  })

  it('delete mit veralteter sha: Löschen wird mit aktueller sha wiederholt', async () => {
    const path = 'items/k5.json'
    fake.set(path, item('k5', OLD))
    await putFileFromRemote(path, item('k5', OLD), 'stale')
    await deleteFileLocal(path)
    await syncNow()
    expect(fake.files.has(path)).toBe(false)
    expect(await getOutbox()).toEqual([])
  })
})

describe('Remote laden', () => {
  it('übernimmt neue und geänderte Dateien, UTF-8 bleibt erhalten', async () => {
    fake.set('items/r1.json', item('r1', OLD, 'Größe äöüß€'))
    fake.set('suggestions/s1.json', {
      id: 's1',
      kind: 'neue-aufgabe',
      proposedItem: { type: 'aufgabe', title: 'x', categoryId: 'privat' },
      unbekannt: 42,
    })
    fake.set('categories.json', { categories: [] })
    await syncNow()
    expect((await getFile('items/r1.json'))?.data).toMatchObject({ title: 'Größe äöüß€' })
    expect((await getFile('suggestions/s1.json'))?.data).toMatchObject({ unbekannt: 42 })
    expect(await getFile('categories.json')).toMatchObject({
      remoteSha: fake.sha('categories.json'),
    })

    fake.set('items/r1.json', item('r1', NEW, 'neu'))
    await syncNow()
    expect((await getFile('items/r1.json'))?.data).toMatchObject({ title: 'neu' })
  })

  it('lädt nur Dateien mit abweichender sha nach', async () => {
    fake.set('items/r2.json', item('r2', OLD))
    await syncNow()
    fake.requests = []
    await syncNow()
    expect(fake.requests.filter((r) => r.path === 'items/r2.json')).toEqual([])
  })

  it('löscht lokal, was remote gelöscht wurde (mit remoteSha, ohne Outbox)', async () => {
    fake.set('inbox/g1.json', { id: 'g1', text: 't', createdAt: OLD })
    fake.set('inbox/g2.json', { id: 'g2', text: 't', createdAt: OLD })
    await syncNow()
    expect(await getFile('inbox/g1.json')).toBeDefined()
    fake.remove('inbox/g1.json')
    await syncNow()
    expect(await getFile('inbox/g1.json')).toBeUndefined()
  })

  it('überschreibt keine Datei mit offenem Outbox-Eintrag (Änderung während des Laufs)', async () => {
    const path = 'items/w1.json'
    fake.set(path, item('w1', OLD, 'remote'))
    await syncNow()
    fake.set(path, item('w1', NEW, 'remote neu'))
    let injected = false
    fake.beforeRequest = async (request) => {
      if (!injected && request.method === 'GET' && request.path === '') {
        injected = true
        await updateItem('w1', { title: 'lokal während Sync' })
      }
    }
    await syncNow()
    expect((await getFile(path))?.data).toMatchObject({ title: 'lokal während Sync' })
    // Die neue Änderung wurde im selben Lauf noch nicht gesendet, aber auch nicht verloren.
    expect((await getOutbox()).map((e) => e.path)).toContain(path)
    fake.beforeRequest = null
    await syncNow()
    expect(await getOutbox()).toEqual([])
    expect(fake.json(path)).toBeDefined()
  })

  it('eine Änderung während des Hochladens geht nicht verloren', async () => {
    const created = await createItem({ type: 'aufgabe', title: 'v1', categoryId: 'privat' })
    const path = `items/${created.id}.json`
    let injected = false
    fake.beforeRequest = async (request) => {
      if (!injected && request.method === 'PUT') {
        injected = true
        await updateItem(created.id, { title: 'v2' })
      }
    }
    await syncNow()
    expect(fake.json(path)).toMatchObject({ title: 'v2' })
    expect(await getOutbox()).toEqual([])
  })

  it('wertet ein nicht erreichbares Repo nicht als "alles gelöscht"', async () => {
    fake.set('items/z1.json', item('z1', OLD))
    await syncNow()
    fake.repoExists = false
    await syncNow()
    expect(await getFile('items/z1.json')).toBeDefined()
    expect(getSyncStatus().state).toBe('fehler')
  })
})

describe('runs/last.json', () => {
  const lastRun = { finishedAt: '2026-10-21T14:07:30+02:00', itemIds: ['a'] }

  it('wird heruntergeladen, aber nie hochgeladen', async () => {
    fake.set('runs/last.json', lastRun)
    fake.set('items/r1.json', item('r1', OLD))
    await syncNow()
    expect((await getFile('runs/last.json'))?.data).toEqual(lastRun)
    expect(await getOutbox()).toEqual([])
    expect(fake.requests.filter((r) => r.method === 'PUT')).toEqual([])
  })

  it('fehlende Datei ist kein Fehler', async () => {
    fake.set('items/r1.json', item('r1', OLD))
    await syncNow()
    expect(getSyncStatus().state).toBe('synchron')
    expect(await getFile('runs/last.json')).toBeUndefined()
  })

  it('ungültiger Inhalt ist kein Fehler: kein Lauf in der App', async () => {
    fake.set('runs/last.json', { finishedAt: 'kaputt' })
    fake.set('items/r1.json', item('r1', OLD))
    await syncNow()
    expect(getSyncStatus().state).toBe('synchron')
    expect(await getLastRun()).toBeNull()
  })

  it('wird lokal entfernt, wenn sie remote verschwindet', async () => {
    fake.set('runs/last.json', lastRun)
    fake.set('items/r1.json', item('r1', OLD))
    await syncNow()
    fake.remove('runs/last.json')
    await syncNow()
    expect(await getFile('runs/last.json')).toBeUndefined()
  })
})

describe('Datenverlust-Schutz', () => {
  it('nur Root-Dateien lokal synchronisiert, Remote leer: Abbruch, nichts gelöscht', async () => {
    await putFileFromRemote('categories.json', { categories: [] }, 'sha-c')
    await putFileFromRemote('settings.json', { timezone: 'Europe/Berlin' }, 'sha-s')
    await syncNow()
    expect(getSyncStatus().state).toBe('fehler')
    expect(await getFile('categories.json')).toBeDefined()
    expect(await getFile('settings.json')).toBeDefined()
  })

  it('frische Inbox-Erfassung bei falschem Repo bleibt mit Outbox erhalten', async () => {
    const entry = await addInboxEntry('wichtig', 'text')
    fake.repoExists = false
    await syncNow()
    expect(await getFile(`inbox/${entry.id}.json`)).toBeDefined()
    expect(await getOutbox()).toHaveLength(1)
    expect(getSyncStatus()).toMatchObject({ state: 'fehler', pending: 1 })
    expect(getSyncStatus().message).toContain('Repository nicht gefunden')
  })

  it('geänderte Inbox-Datei wird bei nicht erreichbarem Repo nicht verworfen', async () => {
    const path = 'inbox/v1.json'
    const entry = { id: 'v1', text: 'alt', createdAt: OLD, source: 'text' }
    await putFileFromRemote(path, entry, 'bekannt')
    await updateFileLocal(path, () => ({ ...entry, text: 'neu' }))
    fake.repoExists = false
    await syncNow()
    expect(await getFile(path)).toBeDefined()
    expect(await getOutbox()).toHaveLength(1)
    expect(getSyncStatus().state).toBe('fehler')
  })

  it('gekürzte Dateiliste (truncated): lädt, löscht aber nichts lokal', async () => {
    fake.set('items/t1.json', item('t1', OLD))
    fake.set('items/t2.json', item('t2', OLD))
    await syncNow()
    fake.remove('items/t2.json')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    // t2 fehlt remote: bei vollständiger Liste würde es lokal gelöscht
    fake.truncateAt = 1
    fake.set('items/t4.json', item('t4', OLD))
    await syncNow()
    expect(await getFile('items/t2.json')).toBeDefined()
    expect(await getFile('items/t1.json')).toBeDefined()
    expect(warn).toHaveBeenCalled()
    expect(getSyncStatus().state).toBe('synchron')
    expect(getSyncStatus().message).toContain('unvollständig')
    fake.truncateAt = null
    await syncNow()
    expect(await getFile('items/t2.json')).toBeUndefined()
    expect(getSyncStatus().message).toBeNull()
  })

  it('mehr als 1000 Remote-Dateien werden vollständig erkannt', async () => {
    for (let i = 0; i < 1100; i++)
      fake.set(`inbox/m${i}.json`, { id: `m${i}`, text: 't', createdAt: OLD })
    const fetchFile = fake.fetch
    vi.stubGlobal('fetch', fetchFile)
    await syncNow()
    expect(await getFile('inbox/m1099.json')).toBeDefined()
    fake.remove('inbox/m5.json')
    await syncNow()
    expect(await getFile('inbox/m5.json')).toBeUndefined()
  }, 60_000)

  it('leeres Repo (409) bei wenigen lokalen Dateien: leere Liste, kein Fehler', async () => {
    fake.emptyRepo = true
    await syncNow()
    expect(getSyncStatus().state).toBe('synchron')
  })

  it('Schutzschwelle: leeres Listing bei mindestens einer synchronisierten Datei löscht nichts', async () => {
    fake.set('items/p0.json', item('p0', OLD))
    await syncNow()
    fake.remove('items/p0.json')
    await syncNow()
    expect(await getFile('items/p0.json')).toBeDefined()
    expect(getSyncStatus().state).toBe('fehler')
    expect(getSyncStatus().message).toBe(
      'Daten-Repo wirkt leer – lokale Daten wurden nicht gelöscht. Repository prüfen.',
    )
  })

  it('im selben Lauf hochgeladene Dateien werden bei verzögertem Tree nicht lokal gelöscht', async () => {
    const created = await createItem({ type: 'aufgabe', title: 'neu', categoryId: 'privat' })
    fake.set('items/other.json', item('other', OLD))
    await syncNow()
    const path = `items/${created.id}.json`
    const second = await createItem({ type: 'aufgabe', title: 'zweit', categoryId: 'privat' })
    const delayed = fake.fetch
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await delayed(input, init)
      if (!String(input).includes('/git/trees/')) return response
      const body = (await response.json()) as { tree: { path: string }[] }
      body.tree = body.tree.filter((e) => e.path !== `items/${second.id}.json`)
      return new Response(JSON.stringify(body), { status: 200 })
    })
    await syncNow()
    expect(await getFile(path)).toBeDefined()
    expect(await getFile(`items/${second.id}.json`)).toBeDefined()
    expect(getSyncStatus().state).toBe('synchron')
  })
})

describe('Schreibreihenfolge', () => {
  it('delete, dann put desselben Pfads vor dem Sync (settings.json)', async () => {
    fake.set('settings.json', { planningWindow: { start: '09:00', end: '19:00' }, timezone: 'x' })
    await syncNow()
    await deleteFileLocal('settings.json')
    const next = { planningWindow: { start: '08:00', end: '17:00' }, timezone: 'Europe/Berlin' }
    await putFileLocal('settings.json', next)
    await syncNow()
    expect(fake.json('settings.json')).toEqual(next)
    expect((await getFile('settings.json'))?.data).toEqual(next)
    expect(await getOutbox()).toEqual([])
  })

  it('Edit während des Uploads bleibt erhalten und wird gesendet', async () => {
    const created = await createItem({ type: 'aufgabe', title: 'v1', categoryId: 'privat' })
    await syncNow()
    await updateItem(created.id, { title: 'v2' })
    let injected = false
    fake.beforeRequest = async (request) => {
      if (!injected && request.method === 'PUT') {
        injected = true
        await updateItem(created.id, { title: 'v3' })
      }
    }
    await syncNow()
    expect(fake.json(`items/${created.id}.json`)).toMatchObject({ title: 'v3' })
    expect((await getFile(`items/${created.id}.json`))?.remoteSha).toBe(
      fake.sha(`items/${created.id}.json`),
    )
    expect(await getOutbox()).toEqual([])
  })
})

describe('Parallelität', () => {
  it('startet keinen parallelen Lauf; Nachlauf genau einmal', async () => {
    const rootListings = (): number =>
      fake.requests.filter((r) => r.method === 'GET' && r.path === '').length
    await Promise.all([syncNow(), syncNow(), syncNow()])
    expect(rootListings()).toBe(2)
    await syncNow()
    expect(rootListings()).toBe(3)
  })
})

describe('Status', () => {
  it('ohne Token: nichtEingerichtet, kein Netzzugriff', async () => {
    await deleteSecret('githubToken')
    await addInboxEntry('lokal', 'text')
    await syncNow()
    expect(fake.requests).toEqual([])
    expect(getSyncStatus()).toMatchObject({ state: 'nichtEingerichtet', pending: 1 })
  })

  it('offline: Outbox bleibt, Status offline mit deutscher Meldung', async () => {
    await addInboxEntry('lokal', 'text')
    fake.offline = true
    await syncNow()
    expect(await getOutbox()).toHaveLength(1)
    const status = getSyncStatus()
    expect(status.state).toBe('offline')
    expect(status.pending).toBe(1)
    expect(status.message).toContain('Keine Verbindung')
    fake.offline = false
    await syncNow()
    expect(getSyncStatus()).toMatchObject({ state: 'synchron', pending: 0 })
  })

  it('Berechtigungsfehler ergibt Status fehler ohne Token im Text', async () => {
    await addInboxEntry('lokal', 'text')
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }))
    await syncNow()
    const status = getSyncStatus()
    expect(status.state).toBe('fehler')
    expect(status.message).not.toContain('ghp_testtoken')
    expect(await getOutbox()).toHaveLength(1)
  })
})

describe('Auto-Sync', () => {
  const runs = (): number => fake.requests.filter((r) => r.method === 'GET' && r.path === '').length
  const idle = (): Promise<void> =>
    vi.waitFor(() => expect(getSyncStatus().state).not.toBe('laeuft'))

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  })

  it('startet beim Start und ist idempotent', async () => {
    startAutoSync()
    startAutoSync()
    await vi.waitFor(() => expect(runs()).toBe(1))
    await idle()
    expect(runs()).toBe(1)
  })

  it('synchronisiert nach Änderungen entprellt nach 2 s – und löst sich nicht selbst aus', async () => {
    startAutoSync()
    await vi.waitFor(() => expect(runs()).toBe(1))
    await idle()
    await addInboxEntry('a', 'text')
    await addInboxEntry('b', 'text')
    await vi.advanceTimersByTimeAsync(1900)
    expect(runs()).toBe(1)
    await vi.advanceTimersByTimeAsync(200)
    await vi.waitFor(() => expect(runs()).toBe(2))
    await idle()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(runs()).toBe(2)
    expect(fake.count('PUT')).toBe(2)
  })

  it('synchronisiert alle 5 Minuten, bei Sichtbarkeit und bei online', async () => {
    startAutoSync()
    await vi.waitFor(() => expect(runs()).toBe(1))
    await idle()
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    await vi.waitFor(() => expect(runs()).toBe(2))
    await idle()

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await idle()
    expect(runs()).toBe(2)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(runs()).toBe(3))
    await idle()

    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(runs()).toBe(4))
    await idle()
  })

  it('stopAutoSync beendet alle Auslöser', async () => {
    startAutoSync()
    await vi.waitFor(() => expect(runs()).toBe(1))
    await idle()
    stopAutoSync()
    window.dispatchEvent(new Event('online'))
    await addInboxEntry('x', 'text')
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    expect(runs()).toBe(1)
  })
})

describe('fremde Pfade im Remote-Baum', () => {
  const foreign: Record<string, unknown> = {
    '.github/workflows/sortieren.yml': { x: 1 },
    '.github/scripts/dispatch.mjs': { x: 2 },
    'runs/started.json': { startedAt: OLD },
    'runs/trigger.json': { requestedAt: OLD },
  }

  it('werden nicht geladen, nicht gelöscht und zählen nicht als ausstehend', async () => {
    fake.set('items/f1.json', item('f1', OLD))
    for (const [path, data] of Object.entries(foreign)) fake.set(path, data)
    await syncNow()
    expect(getSyncStatus().state).toBe('synchron')
    expect(getSyncStatus().pending).toBe(0)
    expect(await getFile('items/f1.json')).toBeDefined()
    for (const path of Object.keys(foreign)) {
      expect(await getFile(path)).toBeUndefined()
      expect(fake.files.has(path)).toBe(true)
    }
    expect(fake.requests.filter((r) => r.method === 'GET' && r.path in foreign)).toEqual([])
    expect(fake.requests.filter((r) => r.method === 'DELETE')).toEqual([])
    expect(await getOutbox()).toEqual([])
  })
})

describe('Formatversion (secondbrain.json)', () => {
  const FORMAT_PATH = 'secondbrain.json'
  const formatRequests = () => fake.requests.filter((r) => r.path === FORMAT_PATH)

  it('verhält sich ohne secondbrain.json wie bisher', async () => {
    clearErrorLog()
    const created = await createItem({ type: 'aufgabe', title: 'A', categoryId: 'privat' })
    await syncNow()
    expect(fake.json(`items/${created.id}.json`)).toEqual(created)
    expect(getSyncStatus()).toMatchObject({ state: 'synchron', pending: 0, message: null })
    expect(getErrorLog()).toEqual([])
  })

  it('lädt bei {format:1} normal hoch', async () => {
    fake.set(FORMAT_PATH, { format: 1 })
    const created = await createItem({ type: 'aufgabe', title: 'A', categoryId: 'privat' })
    await syncNow()
    expect(fake.json(`items/${created.id}.json`)).toEqual(created)
    expect(getSyncStatus().state).toBe('synchron')
  })

  it('sendet bei {format:2} nichts, behält die Outbox, meldet Fehler und lädt weiter herunter', async () => {
    clearErrorLog()
    fake.set(FORMAT_PATH, { format: 2 })
    fake.set('items/r1.json', item('r1', OLD))
    const created = await createItem({ type: 'aufgabe', title: 'A', categoryId: 'privat' })
    const outbox = await getOutbox()
    await syncNow()
    expect(fake.requests.filter((r) => r.method === 'PUT' || r.method === 'DELETE')).toEqual([])
    expect(await getOutbox()).toEqual(outbox)
    expect(fake.files.has(`items/${created.id}.json`)).toBe(false)
    expect(getSyncStatus()).toMatchObject({
      state: 'fehler',
      pending: 1,
      message: MSG_DATA_FORMAT_NEWER,
    })
    expect(
      getErrorLog().some((e) => e.area === 'Sync' && e.message === MSG_DATA_FORMAT_NEWER),
    ).toBe(true)
    expect(await getFile('items/r1.json')).toBeDefined()
  })

  it('behandelt eine ungültige Datei wie ein höheres Format', async () => {
    fake.set(FORMAT_PATH, { format: '1' })
    await createItem({ type: 'aufgabe', title: 'A', categoryId: 'privat' })
    await syncNow()
    expect(fake.count('PUT')).toBe(0)
    expect(getSyncStatus()).toMatchObject({ state: 'fehler', message: MSG_DATA_FORMAT_INVALID })
  })

  it('lädt die Outbox beim nächsten Sync hoch, sobald die Datei wieder {format:1} hat', async () => {
    fake.set(FORMAT_PATH, { format: 2 })
    const created = await createItem({ type: 'aufgabe', title: 'A', categoryId: 'privat' })
    await syncNow()
    expect(getSyncStatus().state).toBe('fehler')
    fake.set(FORMAT_PATH, { format: 1 })
    await syncNow()
    expect(fake.json(`items/${created.id}.json`)).toEqual(created)
    expect(await getOutbox()).toEqual([])
    expect(getSyncStatus()).toMatchObject({ state: 'synchron', message: null })
  })

  it('liest die Datei ohne Outbox nur bei geänderter sha neu', async () => {
    fake.set(FORMAT_PATH, { format: 1 })
    await syncNow()
    await syncNow()
    expect(formatRequests().filter((r) => r.method === 'GET')).toHaveLength(1)
    fake.set(FORMAT_PATH, { format: 1, hinweis: 'neu' })
    await syncNow()
    expect(formatRequests().filter((r) => r.method === 'GET')).toHaveLength(2)
  })

  it('schreibt und löscht secondbrain.json nie und legt sie nicht lokal ab', async () => {
    fake.set(FORMAT_PATH, { format: 1 })
    await createItem({ type: 'aufgabe', title: 'A', categoryId: 'privat' })
    await syncNow()
    expect(formatRequests().every((r) => r.method === 'GET')).toBe(true)
    expect(fake.files.has(FORMAT_PATH)).toBe(true)
    expect(await getFile(FORMAT_PATH)).toBeUndefined()
  })

  it('Offline beim Lesen der Formatdatei: Status offline, Outbox bleibt, keine Sperre, danach Upload', async () => {
    fake.set(FORMAT_PATH, { format: 1 })
    const created = await createItem({ type: 'aufgabe', title: 'A', categoryId: 'privat' })
    const outbox = await getOutbox()
    fake.offline = true
    await syncNow()
    expect(getSyncStatus().state).toBe('offline')
    expect(getSyncStatus().message).toContain('Keine Verbindung')
    expect(await getOutbox()).toEqual(outbox)
    expect(getDataFormatProblem()).toBeNull()
    fake.offline = false
    await syncNow()
    expect(fake.json(`items/${created.id}.json`)).toEqual(created)
    expect(getSyncStatus().state).toBe('synchron')
  })

  it('Serverfehler (5xx) beim Lesen der Formatdatei: Status fehler, Outbox bleibt, keine Sperre', async () => {
    fake.set(FORMAT_PATH, { format: 1 })
    const created = await createItem({ type: 'aufgabe', title: 'A', categoryId: 'privat' })
    const outbox = await getOutbox()
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes(FORMAT_PATH)) return new Response('{}', { status: 503 })
      return fake.fetch(input, init)
    })
    await syncNow()
    expect(getSyncStatus().state).toBe('fehler')
    expect(getSyncStatus().message).not.toBe(MSG_DATA_FORMAT_NEWER)
    expect(await getOutbox()).toEqual(outbox)
    expect(getDataFormatProblem()).toBeNull()
    vi.stubGlobal('fetch', fake.fetch)
    await syncNow()
    expect(fake.json(`items/${created.id}.json`)).toEqual(created)
  })

  it('gekürzte Dateiliste ohne secondbrain.json im Baum: Datei wird direkt geprüft, Sperre bleibt', async () => {
    fake.set(FORMAT_PATH, { format: 2 })
    fake.truncateAt = 0
    await syncNow()
    expect(formatRequests().some((r) => r.method === 'GET')).toBe(true)
    expect(getDataFormatProblem()).toBe(MSG_DATA_FORMAT_NEWER)
  })

  it('Datei remote gelöscht: Cache aktualisiert, Sperre aufgehoben', async () => {
    fake.set(FORMAT_PATH, { format: 2 })
    await syncNow()
    expect(getDataFormatProblem()).toBe(MSG_DATA_FORMAT_NEWER)
    fake.remove(FORMAT_PATH)
    await syncNow()
    expect(getDataFormatProblem()).toBeNull()
    expect(getSyncStatus().state).toBe('synchron')
  })

  it('Eintrag, der während des Laufs entsteht, wird nicht ohne Prüfung gesendet', async () => {
    fake.set(FORMAT_PATH, { format: 2 })
    const orig = fake.fetch
    let injected = false
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!injected) {
        injected = true
        await createItem({ type: 'aufgabe', title: 'Spät', categoryId: 'privat' })
      }
      return orig(input, init)
    })
    await syncNow()
    expect(fake.requests.filter((r) => r.method === 'PUT')).toEqual([])
    expect(getSyncStatus().state).toBe('fehler')
  })
})
