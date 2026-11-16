import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { getFile, getOutbox, putFileFromRemote, resetDb } from './localStore'
import {
  activateItem,
  addProjectStep,
  answerReceived,
  completeItem,
  completeProject,
  createCategory,
  createItem,
  createProject,
  deleteCategory,
  deleteProject,
  listItems,
  listProjects,
  moveProjectStep,
  restoreItem,
  restoreProject,
  setChecked,
  setGtdStatus,
  updateItem,
  updateProject,
} from './repository'
import type { Item, Project } from './types'

beforeEach(() => resetDb(true))
afterAll(() => resetDb(true))

const OLD = '2026-10-01T10:00:00+02:00'

/** Legt eine Datei so ab, als käme sie aus dem Daten-Repo (keine Outbox). */
async function seed(path: string, data: unknown): Promise<void> {
  await putFileFromRemote(path, data, `sha-${path}`)
}

const legacyItem = (id: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  type: 'aufgabe',
  title: `Alt ${id}`,
  notes: '',
  categoryId: 'privat',
  status: 'offen',
  important: false,
  durationMin: 15,
  schedule: null,
  originalCategoryId: null,
  createdAt: OLD,
  updatedAt: OLD,
  completedAt: null,
  ...over,
})

async function stored(path: string): Promise<Record<string, unknown>> {
  const data = (await getFile(path))?.data
  if (typeof data !== 'object' || data === null) throw new Error('fehlt')
  return data as Record<string, unknown>
}

describe('Lesen alter Einträge (Migration)', () => {
  it('migriert beim Lesen, ohne zu schreiben (Outbox leer, Rohdaten unverändert)', async () => {
    for (let i = 0; i < 20; i++) await seed(`items/a${i}.json`, legacyItem(`a${i}`))
    const items = await listItems()
    expect(items).toHaveLength(20)
    expect(items.every((i) => i.gtd === 'naechster-schritt')).toBe(true)
    expect(await getOutbox()).toEqual([])
    expect(await stored('items/a0.json')).toEqual(legacyItem('a0'))
  })

  it('Termin-Aufgabe, ★, Notiz, Einkauf und Erledigtes', async () => {
    await seed('items/t.json', legacyItem('t', { schedule: { start: OLD, durationMin: 30 } }))
    await seed('items/f.json', legacyItem('f', { important: true }))
    await seed('items/n.json', legacyItem('n', { type: 'notiz' }))
    await seed('items/e.json', legacyItem('e', { status: 'erledigt', categoryId: 'erledigt' }))
    const byId = Object.fromEntries((await listItems()).map((i) => [i.id, i]))
    expect(byId.t.gtd).toBe('naechster-schritt')
    expect(byId.f).toMatchObject({ gtd: 'naechster-schritt', important: true })
    expect(byId.n.gtd).toBeUndefined()
    expect(byId.e.gtd).toBeUndefined()
  })

  it('ungültige neue Felder: Eintrag sichtbar, Felder „fehlt“, Rohdaten unverändert', async () => {
    const raw = legacyItem('x', { gtd: 'xyz', dueDate: 5 })
    await seed('items/x.json', raw)
    const [item] = await listItems()
    expect(item).toMatchObject({ id: 'x', gtd: 'naechster-schritt' })
    expect('dueDate' in item).toBe(false)
    expect(await stored('items/x.json')).toEqual(raw)
  })

  it('schreibt migrierte Form mit v: 2 erst bei einer Änderung', async () => {
    await seed('items/a.json', legacyItem('a'))
    await updateItem('a', { title: 'Neu' })
    expect(await stored('items/a.json')).toMatchObject({
      title: 'Neu',
      gtd: 'naechster-schritt',
      v: 2,
    })
    expect(await getOutbox()).toHaveLength(1)
  })
})

describe('Abwärtskompatibilität: kein Feldverlust', () => {
  const full = (): Record<string, unknown> =>
    legacyItem('k', {
      gtd: 'warten',
      dueDate: '2026-11-20',
      waiting: { person: 'Anna', since: '2026-11-10', followUpOn: '2026-11-18', extra: 1 },
      projectId: 'p1',
      projectOrder: 2.5,
      seriesId: 's1',
      seriesNumber: 4,
      archivedWithProject: true,
      v: 2,
      unbekannt: { a: [1, 2] },
    })

  it('updateItem, setChecked und completeItem behalten alle Felder', async () => {
    await seed('items/k.json', full())
    await updateItem('k', { title: 'Anderer Titel' })
    await setChecked('k', true)
    expect(await stored('items/k.json')).toMatchObject({
      ...full(),
      updatedAt: expect.any(String),
      title: 'Anderer Titel',
      checked: true,
    })
    await completeItem('k')
    expect(await stored('items/k.json')).toMatchObject({
      ...full(),
      completedAt: expect.any(String),
      originalCategoryId: 'privat',
      updatedAt: expect.any(String),
      title: 'Anderer Titel',
      status: 'erledigt',
      categoryId: 'erledigt',
    })
  })

  it('restoreItem behält alle Felder (außer dem entfallenden archivedWithProject)', async () => {
    await seed('items/k.json', full())
    await completeItem('k')
    await restoreItem('k')
    const { archivedWithProject: dropped, ...expected } = full()
    expect(dropped).toBe(true)
    expect(await stored('items/k.json')).toMatchObject({
      ...expected,
      updatedAt: expect.any(String),
      status: 'offen',
    })
    expect('archivedWithProject' in (await stored('items/k.json'))).toBe(false)
  })

  it('Ablage löschen behält alle Felder', async () => {
    await createCategory('Studium', '')
    await seed('items/k.json', { ...full(), categoryId: 'studium' })
    await deleteCategory('studium', 'privat')
    expect(await stored('items/k.json')).toMatchObject({
      ...full(),
      updatedAt: expect.any(String),
      categoryId: 'privat',
    })
  })
})

describe('v: 2', () => {
  it('neue Einträge, Projekte und alle Schreibwege setzen v: 2', async () => {
    const item = await createItem({ type: 'aufgabe', title: 'A', categoryId: 'privat' })
    expect(item).toMatchObject({ v: 2, gtd: 'naechster-schritt' })
    const note = await createItem({ type: 'notiz', title: 'N', categoryId: 'privat' })
    expect(note.v).toBe(2)
    expect(note.gtd).toBeUndefined()
    const project = await createProject({ title: 'P', categoryId: 'privat' })
    expect(project.v).toBe(2)
    expect(await stored(`projects/${project.id}.json`)).toMatchObject({ v: 2 })
    await seed('items/old.json', legacyItem('old'))
    await completeItem('old')
    expect(await stored('items/old.json')).toMatchObject({ v: 2 })
  })
})

describe('GTD-Status', () => {
  it('Wechsel auf „warten“ ohne Angabe: since = heute, person leer; weg von „warten“ ⇒ waiting null', async () => {
    const item = await createItem({ type: 'aufgabe', title: 'A', categoryId: 'privat' })
    const waiting = await setGtdStatus(item.id, 'warten')
    expect(waiting.gtd).toBe('warten')
    expect(waiting.waiting).toMatchObject({ person: '', followUpOn: null })
    expect(waiting.waiting?.since).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const filled = await setGtdStatus(item.id, 'warten', {
      person: 'Anna',
      followUpOn: '2026-12-01',
    })
    expect(filled.waiting).toMatchObject({ person: 'Anna', followUpOn: '2026-12-01' })
    expect(filled.waiting?.since).toBe(waiting.waiting?.since)
    const later = await setGtdStatus(item.id, 'irgendwann')
    expect(later).toMatchObject({ gtd: 'irgendwann', waiting: null })
  })

  it('Antwort erhalten: erledigen oder nächster Schritt; Aktivieren', async () => {
    const a = await createItem({ type: 'aufgabe', title: 'A', categoryId: 'privat', gtd: 'warten' })
    const b = await createItem({ type: 'aufgabe', title: 'B', categoryId: 'privat', gtd: 'warten' })
    const c = await createItem({
      type: 'aufgabe',
      title: 'C',
      categoryId: 'privat',
      gtd: 'irgendwann',
    })
    expect((await answerReceived(a.id, 'erledigt')).status).toBe('erledigt')
    expect(await answerReceived(b.id, 'naechster-schritt')).toMatchObject({
      gtd: 'naechster-schritt',
      waiting: null,
      status: 'offen',
    })
    expect((await activateItem(c.id)).gtd).toBe('naechster-schritt')
  })

  it('lehnt Nicht-Aufgaben ab', async () => {
    const note = await createItem({ type: 'notiz', title: 'N', categoryId: 'privat' })
    await expect(setGtdStatus(note.id, 'warten')).rejects.toThrow(/Aufgaben/)
  })
})

async function step(projectId: string, title: string): Promise<Item> {
  return addProjectStep(projectId, { title })
}

describe('Projekte', () => {
  it('anlegen, ändern, auflisten', async () => {
    const p = await createProject({ title: '  Analysis 1 ', categoryId: 'arbeit', notes: 'n' })
    expect(p).toMatchObject({ title: 'Analysis 1', status: 'aktiv', series: [], completedAt: null })
    const changed = await updateProject(p.id, { title: 'Analysis 2', notes: 'neu' })
    expect(changed).toMatchObject({ title: 'Analysis 2', notes: 'neu', v: 2 })
    expect((await listProjects()).map((x) => x.title)).toEqual(['Analysis 2'])
    await expect(createProject({ title: ' ', categoryId: 'privat' })).rejects.toThrow(/Titel/)
    await expect(createProject({ title: 'X', categoryId: 'erledigt' })).rejects.toThrow(/Ablage/)
  })

  it('unbekannte Felder und Serien bleiben beim Ändern erhalten', async () => {
    const raw = {
      id: 'p9',
      title: 'P',
      categoryId: 'privat',
      status: 'aktiv',
      createdAt: OLD,
      updatedAt: OLD,
      extra: [1],
      series: [
        { id: 's1', titlePattern: 'B {Nr}', every: 1, weekday: 1, startDate: '2026-10-19', x: 1 },
      ],
    }
    await seed('projects/p9.json', raw)
    await updateProject('p9', { notes: 'x' })
    expect(await stored('projects/p9.json')).toMatchObject({
      extra: [1],
      notes: 'x',
      v: 2,
      series: [{ id: 's1', x: 1, state: 'aktiv', lastNumber: 0 }],
    })
  })

  it('Schritt anhängen: projectOrder = größtes + 1, Ablage des Projekts', async () => {
    const p = await createProject({ title: 'P', categoryId: 'arbeit' })
    const s1 = await step(p.id, 'Eins')
    const s2 = await step(p.id, 'Zwei')
    expect(s1).toMatchObject({
      projectOrder: 1,
      categoryId: 'arbeit',
      gtd: 'naechster-schritt',
      v: 2,
    })
    expect(s2.projectOrder).toBe(2)
    await updateItem(s2.id, { projectOrder: 7.5 })
    expect((await step(p.id, 'Drei')).projectOrder).toBe(8.5)
    await expect(addProjectStep('weg', { title: 'x' })).rejects.toThrow()
  })

  it('↑/↓ tauscht die Reihenfolge und schreibt nur nötige Dateien', async () => {
    const p = await createProject({ title: 'P', categoryId: 'privat' })
    const [a, b, c] = [await step(p.id, 'A'), await step(p.id, 'B'), await step(p.id, 'C')]
    await moveProjectStep(c.id, 'up')
    const order = async (): Promise<string[]> =>
      (await listItems())
        .filter((i) => i.projectId === p.id)
        .sort((x, y) => (x.projectOrder ?? 0) - (y.projectOrder ?? 0))
        .map((i) => i.title)
    expect(await order()).toEqual(['A', 'C', 'B'])
    await moveProjectStep(a.id, 'up') // schon oben: nichts
    await moveProjectStep(b.id, 'down') // schon unten: nichts
    expect(await order()).toEqual(['A', 'C', 'B'])
    const items = await listItems()
    expect(items.find((i) => i.id === b.id)?.projectOrder).toBe(3)
    expect(items.find((i) => i.id === a.id)?.updatedAt).toBe(a.updatedAt)
  })

  it('↑/↓ nummeriert bei gleichen oder fehlenden projectOrder-Werten neu', async () => {
    const p = await createProject({ title: 'P', categoryId: 'privat' })
    await seed(
      'items/a.json',
      legacyItem('a', { projectId: p.id, createdAt: '2026-10-01T10:00:00+02:00' }),
    )
    await seed(
      'items/b.json',
      legacyItem('b', { projectId: p.id, createdAt: '2026-10-02T10:00:00+02:00' }),
    )
    await moveProjectStep('b', 'up')
    const items = (await listItems()).filter((i) => i.projectId === p.id)
    expect(items.find((i) => i.id === 'b')?.projectOrder).toBe(1)
    expect(items.find((i) => i.id === 'a')?.projectOrder).toBe(2)
  })

  it('löschen: nur ohne Schritte', async () => {
    const p = await createProject({ title: 'P', categoryId: 'privat' })
    const s = await step(p.id, 'A')
    await expect(deleteProject(p.id)).rejects.toThrow(/Schritte/)
    await completeProject(p.id)
    await expect(deleteProject(p.id)).rejects.toThrow(/Schritte/)
    const q = await createProject({ title: 'Q', categoryId: 'privat' })
    await deleteProject(q.id)
    expect((await listProjects()).map((x) => x.id)).toEqual([p.id])
    expect(s.projectId).toBe(p.id)
  })

  it('abschließen archiviert offene Schritte und beendet Serien; wiederherstellen kehrt genau diese um', async () => {
    const p = await createProject({ title: 'P', categoryId: 'arbeit' })
    await updateProject(p.id, {
      series: [
        {
          id: 's1',
          titlePattern: 'B {Nr}',
          every: 1,
          weekday: 1,
          startDate: '2026-10-19',
          endDate: null,
          count: null,
          dueWeekday: null,
          durationMin: null,
          state: 'aktiv',
          lastNumber: 0,
          lastDate: null,
        },
      ],
    })
    const alreadyDone = await step(p.id, 'schon erledigt')
    await completeItem(alreadyDone.id)
    const open1 = await step(p.id, 'offen 1')
    const open2 = await step(p.id, 'offen 2')

    const done = await completeProject(p.id)
    expect(done).toMatchObject({ status: 'erledigt', v: 2 })
    expect(done.completedAt).not.toBeNull()
    expect(done.series[0].state).toBe('beendet')
    const after = Object.fromEntries((await listItems()).map((i) => [i.id, i]))
    for (const s of [open1, open2]) {
      expect(after[s.id]).toMatchObject({
        status: 'erledigt',
        archivedWithProject: true,
        categoryId: 'erledigt',
        originalCategoryId: 'arbeit',
      })
    }
    expect(after[alreadyDone.id].archivedWithProject).toBeUndefined()

    const restored = await restoreProject(p.id)
    expect(restored).toMatchObject({ status: 'aktiv', completedAt: null })
    expect(restored.series[0].state).toBe('beendet')
    const back = Object.fromEntries((await listItems()).map((i) => [i.id, i]))
    for (const s of [open1, open2]) {
      expect(back[s.id]).toMatchObject({ status: 'offen', categoryId: 'arbeit', completedAt: null })
      expect('archivedWithProject' in back[s.id]).toBe(false)
    }
    expect(back[alreadyDone.id].status).toBe('erledigt')
  })

  it('Wiederherstellen eines einzelnen Schritts reaktiviert das erledigte Projekt', async () => {
    const p = await createProject({ title: 'P', categoryId: 'privat' })
    const s1 = await step(p.id, 'A')
    const s2 = await step(p.id, 'B')
    await completeProject(p.id)
    const restored = await restoreItem(s1.id)
    expect(restored).toMatchObject({ status: 'offen', v: 2 })
    expect('archivedWithProject' in restored).toBe(false)
    const [project] = await listProjects()
    expect(project).toMatchObject({ status: 'aktiv', completedAt: null })
    const other = (await listItems()).find((i) => i.id === s2.id)
    expect(other).toMatchObject({ status: 'erledigt', archivedWithProject: true })
  })

  it('Ablage löschen verschiebt auch Projekte (und nur die dieser Ablage)', async () => {
    await createCategory('Studium', '')
    const inStudium = await createProject({ title: 'S', categoryId: 'studium' })
    const inArbeit = await createProject({ title: 'A', categoryId: 'arbeit' })
    await deleteCategory('studium', 'privat')
    const byId = Object.fromEntries((await listProjects()).map((x: Project) => [x.id, x]))
    expect(byId[inStudium.id]).toMatchObject({ categoryId: 'privat', v: 2 })
    expect(byId[inArbeit.id].categoryId).toBe('arbeit')
  })

  it('unbekannte Serien überstehen updateProject, completeProject und restoreProject', async () => {
    const valid = {
      id: 's1',
      titlePattern: 'B {Nr}',
      every: 1,
      weekday: 1,
      startDate: '2026-10-19',
    }
    const unknown = { id: 'neu', kind: 'zukunft', nested: { a: [1] } }
    await seed('projects/px.json', {
      id: 'px',
      title: 'P',
      categoryId: 'privat',
      status: 'aktiv',
      createdAt: OLD,
      updatedAt: OLD,
      series: [valid, unknown],
    })
    await updateProject('px', { notes: 'n' })
    expect((await stored('projects/px.json')).series).toEqual([
      expect.objectContaining(valid),
      unknown,
    ])
    await completeProject('px')
    expect((await stored('projects/px.json')).series).toEqual([
      expect.objectContaining({ ...valid, state: 'beendet' }),
      unknown,
    ])
    await restoreProject('px')
    expect((await stored('projects/px.json')).series).toEqual([
      expect.objectContaining({ ...valid, state: 'beendet' }),
      unknown,
    ])
  })

  it('ungültige Rohwerte neuer Felder bleiben beim Schreiben erhalten, außer der Patch setzt sie', async () => {
    await seed('items/r.json', legacyItem('r', { dueDate: 5, gtd: 'xyz', projectOrder: 'a' }))
    await updateItem('r', { title: 'Neu' })
    expect(await stored('items/r.json')).toMatchObject({
      title: 'Neu',
      dueDate: 5,
      gtd: 'xyz',
      projectOrder: 'a',
      v: 2,
    })
    await completeItem('r')
    await restoreItem('r')
    expect(await stored('items/r.json')).toMatchObject({ dueDate: 5, gtd: 'xyz' })
    await updateItem('r', { dueDate: '2026-12-01' })
    expect(await stored('items/r.json')).toMatchObject({ dueDate: '2026-12-01', gtd: 'xyz' })
    await setGtdStatus('r', 'irgendwann')
    expect(await stored('items/r.json')).toMatchObject({ gtd: 'irgendwann', projectOrder: 'a' })
  })

  it('nur abgeleitetes gtd wird geschrieben, ein ungültiger Rohwert aber nicht überschrieben', async () => {
    await seed('items/m1.json', legacyItem('m1'))
    await updateItem('m1', { title: 'x' })
    expect(await stored('items/m1.json')).toMatchObject({ gtd: 'naechster-schritt' })
    await seed('items/m2.json', legacyItem('m2', { gtd: 'xyz' }))
    await updateItem('m2', { title: 'x' })
    expect(await stored('items/m2.json')).toMatchObject({ gtd: 'xyz' })
  })

  it('Ablage des Projekts ändern verschiebt offene Schritte und passt erledigte an', async () => {
    const p = await createProject({ title: 'P', categoryId: 'arbeit' })
    const done = await step(p.id, 'fertig')
    const open = await step(p.id, 'offen')
    await completeItem(done.id)
    await updateProject(p.id, { categoryId: 'privat' })
    const items = Object.fromEntries((await listItems()).map((i) => [i.id, i]))
    expect(items[open.id]).toMatchObject({ categoryId: 'privat', v: 2 })
    expect(items[done.id]).toMatchObject({ categoryId: 'erledigt', originalCategoryId: 'privat' })
    expect((await listProjects())[0].categoryId).toBe('privat')
  })

  it('↑/↓ nummeriert alle Schritte inklusive erledigter ohne Kollisionen', async () => {
    const p = await createProject({ title: 'P', categoryId: 'privat' })
    await seed(
      'items/d.json',
      legacyItem('d', { projectId: p.id, projectOrder: 1, status: 'erledigt' }),
    )
    await seed('items/a.json', legacyItem('a', { projectId: p.id, projectOrder: 1 }))
    await seed('items/b.json', legacyItem('b', { projectId: p.id, projectOrder: 2 }))
    await moveProjectStep('b', 'up')
    const orders = Object.fromEntries(
      (await listItems()).filter((i) => i.projectId === p.id).map((i) => [i.id, i.projectOrder]),
    )
    expect(new Set(Object.values(orders)).size).toBe(3)
    expect(orders.b).toBeLessThan(orders.a as number)
  })
})
