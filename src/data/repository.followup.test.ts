import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { getFile, getOutbox, resetDb } from './localStore'
import {
  addInboxEntry,
  addSeries,
  assignItemToProject,
  createItem,
  createProject,
  fileInboxEntry,
  listInbox,
  listItems,
  updateItem,
  updateSeries,
  type SeriesFields,
} from './repository'

beforeEach(() => resetDb(true))
afterAll(() => resetDb(true))

const SERIES: SeriesFields = {
  titlePattern: 'Woche {Nr}',
  every: 1,
  weekday: 1,
  startDate: '2026-10-19',
  endDate: null,
  count: null,
  dueWeekday: null,
  durationMin: null,
}

describe('fileInboxEntry mit GTD-Feldern', () => {
  it('schreibt Item und löscht den Eintrag in einem Commit (eine Outbox-Runde)', async () => {
    const project = await createProject({ title: 'Umzug', categoryId: 'privat' })
    await createItem({
      type: 'aufgabe',
      title: 'A',
      categoryId: 'privat',
      projectId: project.id,
      projectOrder: 4,
    })
    const entry = await addInboxEntry('Kartons', 'text')
    const item = await fileInboxEntry(entry.id, {
      type: 'aufgabe',
      title: 'Kartons',
      categoryId: 'privat',
      gtd: 'warten',
      important: true,
      dueDate: '2026-12-24',
      durationMin: 10,
      waiting: { person: 'Nachbar', since: '2026-11-01', followUpOn: null },
      projectId: project.id,
    })
    expect(item).toMatchObject({
      gtd: 'warten',
      important: true,
      dueDate: '2026-12-24',
      durationMin: 10,
      projectId: project.id,
      projectOrder: 5,
    })
    expect(await listInbox()).toHaveLength(0)
    expect((await getFile(`items/${item.id}.json`))?.data).toMatchObject({ projectOrder: 5 })
    const outbox = await getOutbox()
    expect(outbox.find((e) => e.path === `inbox/${entry.id}.json`)?.op).toBe('delete')
    expect(outbox.find((e) => e.path === `items/${item.id}.json`)?.op).toBe('put')
  })
})

describe('assignItemToProject', () => {
  it('ordnet hinten an und löst wieder (projectOrder entfällt)', async () => {
    const project = await createProject({ title: 'P', categoryId: 'privat' })
    await createItem({
      type: 'aufgabe',
      title: 'A',
      categoryId: 'privat',
      projectId: project.id,
      projectOrder: 3,
    })
    const item = await createItem({ type: 'aufgabe', title: 'B', categoryId: 'privat' })
    const assigned = await assignItemToProject(item.id, project.id)
    expect(assigned).toMatchObject({ projectId: project.id, projectOrder: 4 })
    const same = await assignItemToProject(item.id, project.id)
    expect(same.projectOrder).toBe(4)
    const freed = await assignItemToProject(item.id, null)
    expect(freed.projectId).toBeNull()
    expect('projectOrder' in freed).toBe(false)
    const stored = (await listItems()).find((i) => i.id === item.id)
    expect(stored?.projectOrder).toBeUndefined()
  })
})

describe('updateItem entfernt Felder mit undefined', () => {
  it('projectOrder: undefined löscht das Feld', async () => {
    const item = await createItem({
      type: 'aufgabe',
      title: 'A',
      categoryId: 'privat',
      projectId: 'x',
      projectOrder: 2,
    })
    const updated = await updateItem(item.id, { projectId: null, projectOrder: undefined })
    expect('projectOrder' in updated).toBe(false)
  })
})

describe('Serien: ID und Daten', () => {
  it('vergibt zufällige IDs (s + 6 Zeichen), eindeutig im Projekt', async () => {
    const project = await createProject({ title: 'P', categoryId: 'privat' })
    const a = await addSeries(project.id, SERIES)
    const b = await addSeries(project.id, SERIES)
    expect(a.id).toMatch(/^s[a-z0-9]{6}$/)
    expect(b.id).toMatch(/^s[a-z0-9]{6}$/)
    expect(a.id).not.toBe(b.id)
  })

  it('lehnt ungültige Start- und Enddaten ab', async () => {
    const project = await createProject({ title: 'P', categoryId: 'privat' })
    await expect(addSeries(project.id, { ...SERIES, startDate: '19.10.2026' })).rejects.toThrow(
      'Startdatum',
    )
    await expect(addSeries(project.id, { ...SERIES, startDate: '2026-02-30' })).rejects.toThrow(
      'Startdatum',
    )
    await expect(addSeries(project.id, { ...SERIES, endDate: 'morgen' })).rejects.toThrow(
      'Enddatum',
    )
    const series = await addSeries(project.id, SERIES)
    expect(() => updateSeries(project.id, series.id, { endDate: '2026-13-01' })).toThrow('Enddatum')
  })
})
