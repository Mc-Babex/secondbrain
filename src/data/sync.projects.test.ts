import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeGithub } from '../test/fakeGithub'
import {
  getFile,
  getOutbox,
  putFileFromRemote,
  resetDb,
  setSecret,
  updateFileLocal,
} from './localStore'
import {
  completeItem,
  createProject,
  deleteCategory,
  listItems,
  listProjects,
  restoreItem,
  setChecked,
  updateItem,
  updateProject,
} from './repository'
import { stopAutoSync, syncNow } from './sync'
import { resetSyncStatus } from './syncStatus'

const OLD = '2026-10-01T10:00:00+02:00'
const NEW = '2026-10-03T10:00:00+02:00'

const project = (id: string, updatedAt: string, title = 'Projekt') => ({
  id,
  title,
  notes: '',
  categoryId: 'privat',
  status: 'aktiv',
  series: [],
  createdAt: OLD,
  updatedAt,
  completedAt: null,
  v: 2,
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
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Sync von projects/', () => {
  it('lädt Projekte herunter', async () => {
    fake.set('projects/p1.json', project('p1', OLD))
    fake.set('items/i1.json', {
      id: 'i1',
      type: 'aufgabe',
      title: 'A',
      categoryId: 'privat',
      status: 'offen',
      createdAt: OLD,
      updatedAt: OLD,
    })
    await syncNow()
    expect((await listProjects()).map((p) => p.id)).toEqual(['p1'])
    expect((await getFile('projects/p1.json'))?.remoteSha).toBe(fake.sha('projects/p1.json'))
  })

  it('lädt neue Projekte hoch und leert die Outbox', async () => {
    const created = await createProject({ title: 'Neu', categoryId: 'privat' })
    await syncNow()
    expect(fake.json(`projects/${created.id}.json`)).toEqual(created)
    expect(await getOutbox()).toEqual([])
  })

  it('Konflikt: lokal neuer gewinnt, remote neuer gewinnt, Gleichstand: Remote', async () => {
    const seed = async (id: string, local: string, remote: string): Promise<void> => {
      const path = `projects/${id}.json`
      fake.set(path, project(id, remote, 'remote'))
      await putFileFromRemote(path, project(id, remote, 'remote'), 'stale')
      await updateFileLocal(path, () => project(id, local, 'lokal'))
    }
    await seed('l', NEW, OLD)
    await seed('r', OLD, NEW)
    await seed('g', NEW, NEW)
    await syncNow()
    expect(fake.json('projects/l.json')).toMatchObject({ title: 'lokal' })
    expect((await getFile('projects/r.json'))?.data).toMatchObject({ title: 'remote' })
    expect((await getFile('projects/g.json'))?.data).toMatchObject({ title: 'remote' })
    expect(await getOutbox()).toEqual([])
  })

  it('remote gelöschtes Projekt verschwindet lokal', async () => {
    fake.set('projects/p1.json', project('p1', OLD))
    fake.set('projects/p2.json', project('p2', OLD))
    await syncNow()
    fake.remove('projects/p2.json')
    await syncNow()
    expect((await listProjects()).map((p) => p.id)).toEqual(['p1'])
  })

  it('Projekte zählen als Verweis auf ihre Ablage (kein Entfernen beim Zusammenführen)', async () => {
    const created = await createProject({ title: 'Neu', categoryId: 'arbeit' })
    await syncNow()
    expect(fake.json(`projects/${created.id}.json`)).toMatchObject({ categoryId: 'arbeit' })
  })
})

describe('Sync-Hin-und-Rückweg ohne Feldverlust', () => {
  it('alle neuen Felder samt unbekanntem Feld überstehen Änderungen und Sync', async () => {
    const full = {
      id: 'k',
      type: 'aufgabe',
      title: 'Voll',
      notes: '',
      categoryId: 'privat',
      status: 'offen',
      important: true,
      durationMin: 2,
      schedule: null,
      originalCategoryId: null,
      createdAt: OLD,
      updatedAt: OLD,
      completedAt: null,
      gtd: 'warten',
      dueDate: '2026-11-20',
      waiting: { person: 'Anna', since: '2026-11-10', followUpOn: null },
      projectId: 'p1',
      projectOrder: 1.5,
      seriesId: 's1',
      seriesNumber: 2,
      v: 2,
      unbekannt: { x: [1] },
    }
    fake.set('items/k.json', full)
    await syncNow()
    await updateItem('k', { title: 'Geändert' })
    await setChecked('k', true)
    await completeItem('k')
    await restoreItem('k')
    await syncNow()
    expect(fake.json('items/k.json')).toMatchObject({
      ...full,
      title: 'Geändert',
      checked: true,
      updatedAt: expect.any(String),
    })
    expect((await listItems())[0]).toMatchObject({ gtd: 'warten', unbekannt: { x: [1] } })
  })

  it('Projekt: Ändern und Ablage löschen behalten unbekannte Felder im Repo', async () => {
    fake.set('projects/p1.json', { ...project('p1', OLD), extra: { a: 1 }, categoryId: 'arbeit' })
    await syncNow()
    await updateProject('p1', { notes: 'x' })
    await deleteCategory('arbeit', 'privat')
    await syncNow()
    expect(fake.json('projects/p1.json')).toMatchObject({
      extra: { a: 1 },
      notes: 'x',
      categoryId: 'privat',
      v: 2,
    })
  })
})
