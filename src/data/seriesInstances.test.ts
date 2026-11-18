import { openDB } from 'idb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { instanceId } from '../lib/series'
import { FakeGithub } from '../test/fakeGithub'
import { getFile, getOutbox, resetDb, setSecret } from './localStore'
import {
  completeItem,
  createProject,
  deleteItem,
  endSeries,
  listItems,
  listProjects,
  pauseSeries,
  resumeSeries,
  addSeries,
  updateSeries,
} from './repository'
import { createDueSeriesInstances } from './seriesInstances'
import { stopAutoSync, syncNow } from './sync'
import { getSyncStatus, resetSyncStatus } from './syncStatus'
import { validSeries, type Project } from './types'

const FIELDS = {
  titlePattern: 'Übungsblatt {Nr}',
  every: 1,
  weekday: 1,
  startDate: '2026-10-19',
  endDate: '2027-02-12',
  count: null,
  dueWeekday: 5,
  durationMin: 180,
}

let fake: FakeGithub

/** Zustand eines Geräts (IndexedDB) zum Umschalten zwischen zwei „Geräten“. */
interface Snapshot {
  files: unknown[]
  outbox: unknown[]
  secrets: [string, string][]
}

async function snapshot(): Promise<Snapshot> {
  await resetDb()
  const db = await openDB('secondbrain', 1)
  const secrets: [string, string][] = []
  for (const key of await db.getAllKeys('secrets')) {
    secrets.push([String(key), (await db.get('secrets', key)) as string])
  }
  const result = { files: await db.getAll('files'), outbox: await db.getAll('outbox'), secrets }
  db.close()
  return result
}

async function restore(state: Snapshot): Promise<void> {
  await resetDb(true)
  const db = await openDB('secondbrain', 1, {
    upgrade(d) {
      d.createObjectStore('files', { keyPath: 'path' })
      d.createObjectStore('outbox', { keyPath: 'path' })
      d.createObjectStore('secrets')
    },
  })
  for (const f of state.files) await db.put('files', f)
  for (const o of state.outbox) await db.put('outbox', o)
  for (const [k, v] of state.secrets) await db.put('secrets', v, k)
  db.close()
}

/** Setzt die Systemzeit (nur `Date`) auf einen Berliner Zeitpunkt. */
const at = (iso: string): void => {
  vi.setSystemTime(new Date(iso))
}

const instanceFiles = (): string[] =>
  [...fake.files.keys()].filter((p) => p.startsWith('items/')).sort()

async function newProject(): Promise<Project> {
  return createProject({ title: 'Analysis 1', categoryId: 'privat' })
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at('2026-10-16T10:00:00+02:00')
  await resetDb(true)
  resetSyncStatus()
  fake = new FakeGithub()
  vi.stubGlobal('fetch', fake.fetch)
  await setSecret('githubToken', 'ghp_testtoken')
  await setSecret('githubRepo', 'alex/daten')
})

afterEach(() => {
  stopAutoSync()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Anlage von Serien-Instanzen im Sync', () => {
  it('Beispiel: Nr. 1 am Montag, nichts am Dienstag, Nr. 2 eine Woche später, kein Blatt nach dem Ende', async () => {
    const project = await newProject()
    await addSeries(project.id, FIELDS)
    at('2026-10-19T08:00:00+02:00')
    await syncNow()
    expect((await listItems()).map((i) => [i.title, i.dueDate])).toEqual([
      ['Übungsblatt 1', '2026-10-23'],
    ])
    expect(instanceFiles()).toHaveLength(1)
    at('2026-10-20T08:00:00+02:00')
    await syncNow()
    expect(instanceFiles()).toHaveLength(1)
    at('2026-10-26T08:00:00+01:00')
    await syncNow()
    expect((await listItems()).map((i) => i.title)).toEqual(['Übungsblatt 1', 'Übungsblatt 2'])
    const stored = fake.json(`projects/${project.id}.json`) as Project
    expect(validSeries(stored)[0]).toMatchObject({ lastNumber: 2, lastDate: '2026-10-26' })
    at('2027-06-01T08:00:00+02:00')
    await syncNow()
    await syncNow()
    expect((await listItems()).at(-1)?.title).toBe('Übungsblatt 17')
    expect(instanceFiles()).toHaveLength(17)
    expect(await getOutbox()).toEqual([])
    expect(getSyncStatus().state).toBe('synchron')
  })

  it('holt nach 3 Wochen die fehlenden Blätter fortlaufend nach', async () => {
    const project = await newProject()
    await addSeries(project.id, FIELDS)
    at('2026-10-19T08:00:00+02:00')
    await syncNow()
    at('2026-11-09T08:00:00+01:00')
    await syncNow()
    expect((await listItems()).map((i) => i.seriesNumber)).toEqual([1, 2, 3, 4])
    expect((await listItems()).map((i) => i.projectOrder)).toEqual([1, 2, 3, 4])
  })

  it('höchstens 10 Instanzen je Sync, Rest beim nächsten', async () => {
    const project = await newProject()
    await addSeries(project.id, FIELDS)
    at('2027-02-12T08:00:00+01:00')
    await createDueSeriesInstances()
    expect(await listItems()).toHaveLength(10)
    await createDueSeriesInstances()
    expect(await listItems()).toHaveLength(17)
  })

  it('Outbox: Instanzen vor der Projektdatei', async () => {
    const project = await newProject()
    await addSeries(project.id, FIELDS)
    await syncNow()
    at('2026-11-02T08:00:00+01:00')
    await createDueSeriesInstances()
    const queue = (await getOutbox()).sort((a, b) => (a.queuedAt < b.queuedAt ? -1 : 1))
    expect(queue.at(-1)?.path).toBe(`projects/${project.id}.json`)
    expect(queue.slice(0, -1).every((e) => e.path.startsWith('items/'))).toBe(true)
    expect(queue).toHaveLength(4)
  })

  it('erledigte und gelöschte Instanzen entstehen nicht neu', async () => {
    const project = await newProject()
    await addSeries(project.id, FIELDS)
    at('2026-10-26T08:00:00+01:00')
    await syncNow()
    const [first, second] = await listItems()
    await completeItem(first.id)
    await deleteItem(second.id)
    await syncNow()
    await syncNow()
    expect(await listItems()).toHaveLength(1)
    expect(instanceFiles()).toEqual([`items/${first.id}.json`])
  })

  it('Pausieren über zwei Wochen und Fortsetzen: keine Pausen-Blätter, keine Nummernlücke', async () => {
    const project = await newProject()
    const series = await addSeries(project.id, FIELDS)
    at('2026-10-19T08:00:00+02:00')
    await syncNow()
    await pauseSeries(project.id, series.id)
    at('2026-11-02T08:00:00+01:00')
    await syncNow()
    expect(await listItems()).toHaveLength(1)
    at('2026-11-03T08:00:00+01:00')
    await resumeSeries(project.id, series.id)
    await syncNow()
    expect(await listItems()).toHaveLength(1)
    at('2026-11-09T08:00:00+01:00')
    await syncNow()
    expect((await listItems()).map((i) => i.seriesNumber)).toEqual([1, 2])
    expect((await listItems()).map((i) => i.id.slice(0, 8))).toEqual(['20261019', '20261109'])
  })

  it('Beenden und Bearbeiten: keine Instanzen für beendete Serien, Zähler bleiben', async () => {
    const project = await newProject()
    const series = await addSeries(project.id, FIELDS)
    at('2026-10-19T08:00:00+02:00')
    await syncNow()
    await updateSeries(project.id, series.id, { titlePattern: 'Blatt {Nr}', dueWeekday: 4 })
    at('2026-10-26T08:00:00+01:00')
    await syncNow()
    expect((await listItems()).map((i) => [i.title, i.dueDate])).toEqual([
      ['Übungsblatt 1', '2026-10-22'],
      ['Blatt 2', '2026-10-29'],
    ])
    await endSeries(project.id, series.id)
    at('2026-11-09T08:00:00+01:00')
    await syncNow()
    expect(await listItems()).toHaveLength(2)
    const stored = (await listProjects())[0]
    expect(validSeries(stored)[0]).toMatchObject({ state: 'beendet', lastNumber: 2 })
  })

  it('unbekannte Serien-Objekte bleiben beim Schreiben unverändert', async () => {
    const project = await newProject()
    await addSeries(project.id, FIELDS)
    const unknown = { id: 'neu', zukunft: { x: 1 } }
    const path = `projects/${project.id}.json`
    const current = (await getFile(path))?.data as Project
    const { updateFileLocal } = await import('./localStore')
    await updateFileLocal(path, () => ({ ...current, series: [...current.series, unknown] }))
    at('2026-10-19T08:00:00+02:00')
    await syncNow()
    const stored = fake.json(path) as Project
    expect(stored.series).toContainEqual(unknown)
    expect(validSeries(stored)[0].lastNumber).toBe(1)
  })

  it('Projekt ohne aktiven Status bekommt keine Instanzen', async () => {
    const project = await newProject()
    await addSeries(project.id, FIELDS)
    const { completeProject } = await import('./repository')
    await completeProject(project.id)
    at('2026-10-26T08:00:00+01:00')
    expect(await createDueSeriesInstances()).toBe(0)
  })
})

describe('Anlage nur nach erfolgreichem Herunterladen', () => {
  async function prepare(): Promise<void> {
    const project = await newProject()
    await addSeries(project.id, FIELDS)
    await syncNow()
    at('2026-10-26T08:00:00+01:00')
  }

  it('offline: nichts angelegt', async () => {
    await prepare()
    fake.offline = true
    await syncNow()
    expect(await listItems()).toEqual([])
  })

  it('ohne Token: nichts angelegt', async () => {
    await prepare()
    const { deleteSecret } = await import('./localStore')
    await deleteSecret('githubToken')
    await syncNow()
    expect(await listItems()).toEqual([])
  })

  it('Herunterladen fehlgeschlagen: nichts angelegt', async () => {
    await prepare()
    fake.beforeRequest = (request) => {
      if (request.path === '' || request.path.includes('trees')) throw new TypeError('Failed')
    }
    fake.beforeRequest = (request) => {
      if (request.method === 'GET') throw new TypeError('Failed to fetch')
    }
    await syncNow()
    expect(await listItems()).toEqual([])
  })
})

describe('Zwei Geräte', () => {
  async function setup(): Promise<{ a: Snapshot; b: Snapshot; projectId: string }> {
    const project = await newProject()
    await addSeries(project.id, FIELDS)
    await syncNow()
    const base = await snapshot()
    await restore(base)
    return { a: base, b: base, projectId: project.id }
  }

  const expectOneFilePerSheet = (count: number): void => {
    const files = instanceFiles()
    expect(files).toHaveLength(count)
    const ids = files.map((p) => p.slice(6, 14))
    expect(new Set(ids).size).toBe(count)
    const numbers = files.map((p) => (fake.json(p) as { seriesNumber: number }).seriesNumber)
    expect(numbers.sort()).toEqual(Array.from({ length: count }, (_, i) => i + 1))
  }

  it('nacheinander: A legt an und lädt hoch, B lädt herunter und legt nichts doppelt an', async () => {
    const { b } = await setup()
    at('2026-10-19T08:00:00+02:00')
    await syncNow()
    const a = await snapshot()
    await restore(b)
    await syncNow()
    expectOneFilePerSheet(1)
    expect((await listItems()).map((i) => i.title)).toEqual(['Übungsblatt 1'])
    expect(a.outbox).toEqual([])
    expect(await getOutbox()).toEqual([])
  })

  it('verschränkt: A legt an, B lädt vor der Projektdatei herunter, dann lädt A das Projekt hoch', async () => {
    const { b, projectId } = await setup()
    at('2026-10-19T08:00:00+02:00')
    // A: nur Instanz und Projektdatei lokal anlegen, die Instanz hochladen, Projekt noch nicht
    await createDueSeriesInstances()
    const [instance] = await listItems()
    const instancePath = `items/${instance.id}.json`
    fake.beforeRequest = (request) => {
      if (request.method === 'PUT' && request.path === `projects/${projectId}.json`) {
        throw new TypeError('Failed to fetch')
      }
    }
    await syncNow()
    fake.beforeRequest = null
    expect(fake.json(instancePath)).toBeDefined()
    const a = await snapshot()
    // B: lädt herunter (sieht Instanz, alte Projektdatei)
    await restore(b)
    await syncNow()
    expectOneFilePerSheet(1)
    // A: lädt danach die Projektdatei hoch
    await restore(a)
    await syncNow()
    expectOneFilePerSheet(1)
    const stored = fake.json(`projects/${projectId}.json`) as Project
    expect(validSeries(stored)[0]).toMatchObject({ lastNumber: 1, lastDate: '2026-10-19' })
    await restore(b)
    await syncNow()
    expect(await listItems()).toHaveLength(1)
    expect(getSyncStatus().state).toBe('synchron')
    expect(getSyncStatus().message).toBeNull()
  })

  it('gleichzeitig: beide legen an, beide laden hoch ⇒ genau eine Datei, keine Fehlermeldung', async () => {
    const { a, b, projectId } = await setup()
    at('2026-10-26T08:00:00+01:00')
    // Beide Geräte legen offline an (ohne Netz), erst danach laden beide hoch.
    const create = async (state: Snapshot): Promise<Snapshot> => {
      await restore(state)
      expect(await createDueSeriesInstances()).toBe(2)
      return snapshot()
    }
    const doneA = await create(a)
    const doneB = await create(b)
    const upload = async (state: Snapshot): Promise<Snapshot> => {
      await restore(state)
      await syncNow()
      expect(getSyncStatus().state).toBe('synchron')
      expect(getSyncStatus().message).toBeNull()
      return snapshot()
    }
    const afterA = await upload(doneA)
    const afterB = await upload(doneB)
    expectOneFilePerSheet(2)
    await upload(afterA)
    await restore(afterB)
    await syncNow()
    expectOneFilePerSheet(2)
    expect((await listItems()).map((i) => i.seriesNumber)).toEqual([1, 2])
    const stored = fake.json(`projects/${projectId}.json`) as Project
    expect(validSeries(stored)[0]).toMatchObject({ lastNumber: 2, lastDate: '2026-10-26' })
  })

  it('beide synchronisieren am selben Montag nacheinander', async () => {
    const { a, b } = await setup()
    at('2026-10-19T08:00:00+02:00')
    await restore(a)
    await syncNow()
    const afterA = await snapshot()
    await restore(b)
    await syncNow()
    await restore(afterA)
    await syncNow()
    expectOneFilePerSheet(1)
    const [series] = validSeries((await listProjects())[0])
    expect(instanceFiles()[0]).toContain(instanceId(projectIdOf(), series.id, '2026-10-19'))
  })

  function projectIdOf(): string {
    const key = [...fake.files.keys()].find((p) => p.startsWith('projects/'))
    return (key ?? '').slice('projects/'.length, -'.json'.length)
  }
})

describe('Zeitzone', () => {
  it('Montag zählt ab 00:00 Berlin, auch wenn UTC noch Sonntag ist', async () => {
    const project = await newProject()
    await addSeries(project.id, FIELDS)
    at('2026-10-18T21:59:59Z') // Sonntag 23:59:59 Berlin
    expect(await createDueSeriesInstances()).toBe(0)
    at('2026-10-18T22:00:00Z') // Montag 00:00:00 Berlin, UTC noch Sonntag
    expect(await createDueSeriesInstances()).toBe(1)
  })
})
