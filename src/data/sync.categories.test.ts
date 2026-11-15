import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeGithub } from '../test/fakeGithub'
import { getFile, getOutbox, putFileFromRemote, resetDb, setSecret } from './localStore'
import { createCategory, deleteCategory, getCategories, updateCategory } from './repository'
import { stopAutoSync, syncNow } from './sync'
import { resetSyncStatus } from './syncStatus'

const cat = (id: string, name: string, order: number, extra: object = {}) => ({
  id,
  name,
  kind: 'normal',
  order,
  description: '',
  ...extra,
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

/** Ausgangslage: lokal und remote derselbe Stand, danach ändert der Claude-Lauf remote. */
async function seedSynced(): Promise<void> {
  const base = {
    categories: [
      cat('privat', 'Privat', 1),
      cat('studium', 'Studium', 2),
      { ...cat('einkauf', 'Einkauf', 3), kind: 'einkauf' },
      { ...cat('erledigt', 'Erledigt', 4), kind: 'archiv' },
    ],
  }
  const sha = fake.set('categories.json', base)
  fake.set('items/keep.json', {
    id: 'keep',
    type: 'aufgabe',
    title: 'x',
    categoryId: 'privat',
    status: 'offen',
    createdAt: '2026-10-01T10:00:00+02:00',
    updatedAt: '2026-10-01T10:00:00+02:00',
  })
  await putFileFromRemote('categories.json', base, sha)
}

describe('Konflikt bei categories.json', () => {
  it('behält neue Remote-Ablage und lokal umbenannte Ablage', async () => {
    await seedSynced()
    const remote = fake.json('categories.json') as { categories: unknown[] }
    fake.set('categories.json', {
      ...remote,
      categories: [...remote.categories, cat('garten', 'Garten', 9, { icon: 'baum' })],
    })
    await updateCategory('privat', { name: 'Persönlich', description: '' })

    await syncNow()

    const uploaded = (fake.json('categories.json') as { categories: { id: string }[] }).categories
    expect(uploaded.map((c) => c.id)).toEqual([
      'privat',
      'studium',
      'einkauf',
      'erledigt',
      'garten',
    ])
    expect(uploaded[0]).toMatchObject({ name: 'Persönlich' })
    expect(uploaded[4]).toMatchObject({ icon: 'baum' })
    expect((await getCategories()).map((c) => c.id)).toContain('garten')
    expect(await getOutbox()).toEqual([])
    expect((await getFile('categories.json'))?.remoteSha).toBe(fake.sha('categories.json'))
  })

  it('lokal gelöschte Ablage bleibt gelöscht, auch wenn remote noch vorhanden', async () => {
    await seedSynced()
    fake.set('categories.json', {
      ...(fake.json('categories.json') as object),
      note: 'bleibt',
    })
    await deleteCategory('studium', 'privat')

    await syncNow()

    const remote = fake.json('categories.json') as { categories: { id: string }[]; note: string }
    expect(remote.categories.map((c) => c.id)).not.toContain('studium')
    expect(remote.note).toBe('bleibt')
    expect((await getCategories()).map((c) => c.id)).not.toContain('studium')
  })

  it('merkt gelöschte IDs nur bis zum Upload', async () => {
    await seedSynced()
    await deleteCategory('studium', 'privat')
    await syncNow()
    // Eine später (z. B. vom Claude-Lauf) wieder angelegte Ablage mit gleicher ID bleibt erhalten.
    const remote = fake.json('categories.json') as { categories: unknown[] }
    fake.set('categories.json', {
      ...remote,
      categories: [...remote.categories, cat('studium', 'Studium neu', 7)],
    })
    await createCategory('Garten', '')
    await syncNow()
    const ids = (fake.json('categories.json') as { categories: { id: string }[] }).categories.map(
      (c) => c.id,
    )
    expect(ids).toContain('studium')
    expect(ids).toContain('garten')
  })

  it('Ablage während des Uploads gelöscht: Tombstone bleibt, sie ersteht beim Konflikt nicht auf', async () => {
    await seedSynced()
    await updateCategory('privat', { name: 'Persönlich', description: '' })
    let puts = 0
    fake.beforeRequest = async (request) => {
      if (request.method !== 'PUT' || request.path !== 'categories.json') return
      puts++
      if (puts === 1) await deleteCategory('studium', 'privat')
      if (puts === 2) {
        // Ein anderer Schreiber legt die Datei (mit der gelöschten Ablage) neu ab ⇒ Konflikt.
        const remote = fake.json('categories.json') as { categories: unknown[] }
        fake.set('categories.json', {
          categories: [...remote.categories, cat('studium', 'Studium', 2)],
        })
      }
    }
    await syncNow()
    const ids = (fake.json('categories.json') as { categories: { id: string }[] }).categories.map(
      (c) => c.id,
    )
    expect(puts).toBeGreaterThanOrEqual(3)
    expect(ids).not.toContain('studium')
    expect((await getCategories()).map((c) => c.id)).not.toContain('studium')
  })

  it('erhält ungültige Remote-only-Einträge roh', async () => {
    await seedSynced()
    const remote = fake.json('categories.json') as { categories: unknown[] }
    fake.set('categories.json', { ...remote, categories: [...remote.categories, { id: 'neu' }] })
    await updateCategory('privat', { name: 'Persönlich', description: '' })
    await syncNow()
    const uploaded = (fake.json('categories.json') as { categories: unknown[] }).categories
    expect(uploaded).toContainEqual({ id: 'neu' })
  })

  it('gleiche ID lokal und remote neu: die lokale Fassung gewinnt', async () => {
    await seedSynced()
    const remote = fake.json('categories.json') as { categories: unknown[] }
    fake.set('categories.json', {
      ...remote,
      categories: [...remote.categories, cat('garten', 'Garten (Lauf)', 8)],
    })
    await createCategory('Garten', 'lokal')
    await syncNow()
    const uploaded = (fake.json('categories.json') as { categories: { id: string }[] }).categories
    const gardens = uploaded.filter((c) => c.id === 'garten')
    expect(gardens).toEqual([expect.objectContaining({ name: 'Garten', description: 'lokal' })])
  })

  it('gelöschte und gleichnamig neu angelegte Ablage wird nicht blockiert', async () => {
    await seedSynced()
    await deleteCategory('studium', 'privat')
    await createCategory('Studium', 'neu')
    await syncNow()
    const uploaded = (fake.json('categories.json') as { categories: { id: string }[] }).categories
    expect(uploaded.filter((c) => c.id === 'studium')).toEqual([
      expect.objectContaining({ description: 'neu' }),
    ])
    expect((await getCategories()).map((c) => c.id)).toContain('studium')
  })
})

describe('Konflikt bei categories.json, wenn die lokale Datei aus Standardwerten entstand', () => {
  function seedRemoteOnly(): void {
    fake.set('categories.json', {
      categories: [
        cat('privat', 'Privat', 1, { description: 'Remote-Text' }),
        cat('arbeit', 'Arbeit', 2),
        cat('studium', 'Studium', 3),
        { ...cat('einkauf', 'Einkaufsliste', 4), kind: 'einkauf' },
        { ...cat('erledigt', 'Erledigt', 5), kind: 'archiv' },
      ],
    })
  }
  const uploaded = (): { id: string; name: string; description: string; order: number }[] =>
    (fake.json('categories.json') as { categories: never[] }).categories

  it('Standardwerte überschreiben keine Remote-Werte; neue Ablage bekommt freie order', async () => {
    seedRemoteOnly()
    await createCategory('Garten', '')
    await syncNow()
    const list = uploaded()
    expect(list.map((c) => c.id)).toEqual([
      'privat',
      'arbeit',
      'studium',
      'einkauf',
      'erledigt',
      'garten',
    ])
    expect(list.find((c) => c.id === 'privat')?.description).toBe('Remote-Text')
    expect(list.find((c) => c.id === 'garten')?.order).toBe(6)
    expect(new Set(list.map((c) => c.order)).size).toBe(list.length)
    expect((await getCategories()).map((c) => c.id)).toContain('studium')
    expect(await getOutbox()).toEqual([])
  })

  it('ausdrücklich lokal umbenannte Standard-Ablage gewinnt', async () => {
    seedRemoteOnly()
    await updateCategory('privat', { name: 'Persönlich', description: 'lokal' })
    await syncNow()
    const list = uploaded()
    expect(list.find((c) => c.id === 'privat')).toMatchObject({
      name: 'Persönlich',
      description: 'lokal',
      order: 1,
    })
    expect(list.map((c) => c.id)).toContain('studium')
    expect(list.find((c) => c.id === 'arbeit')?.name).toBe('Arbeit')
  })

  it('behält unberührte Einkaufs-/Archiv-Standard-Ablagen, wenn remote keine dieses Typs hat', async () => {
    fake.set('categories.json', { categories: [cat('privat', 'Privat', 1)] })
    await createCategory('Garten', '')
    await syncNow()
    const ids = uploaded().map((c) => c.id)
    expect(ids).toEqual(expect.arrayContaining(['privat', 'einkauf', 'erledigt', 'garten']))
    expect(ids).not.toContain('arbeit')
  })

  it('behält eine remote fehlende Standard-Ablage, auf die ein lokaler Eintrag zeigt', async () => {
    const item = {
      id: 'a',
      type: 'aufgabe',
      title: 'x',
      categoryId: 'arbeit',
      status: 'offen',
      createdAt: '2026-10-01T10:00:00+02:00',
      updatedAt: '2026-10-01T10:00:00+02:00',
    }
    await putFileFromRemote('items/a.json', item, fake.set('items/a.json', item))
    fake.set('categories.json', {
      categories: [
        cat('privat', 'Privat', 1),
        { ...cat('einkauf', 'Einkauf', 2), kind: 'einkauf' },
        { ...cat('erledigt', 'Erledigt', 3), kind: 'archiv' },
      ],
    })
    await createCategory('Garten', '')
    await syncNow()
    expect(uploaded().map((c) => c.id)).toContain('arbeit')
  })
})

describe('Herkunftsmarke der Standardwerte beim Sync', () => {
  const MARK = 'local/categories-seeded.json'

  it('ohne Remote-categories.json werden die Standard-Ablagen hochgeladen und die Marke gelöscht', async () => {
    await createCategory('Garten', '')
    expect(await getFile(MARK)).toBeDefined()
    await syncNow()
    const ids = (fake.json('categories.json') as { categories: { id: string }[] }).categories.map(
      (c) => c.id,
    )
    expect(ids).toEqual(
      expect.arrayContaining(['privat', 'arbeit', 'einkauf', 'erledigt', 'garten']),
    )
    expect(await getFile(MARK)).toBeUndefined()
  })

  it('nach erfolgreichem Merge ist die Marke weg; spätere Änderung: lokal gewinnt', async () => {
    fake.set('categories.json', {
      categories: [
        cat('privat', 'Privat', 1),
        { ...cat('einkauf', 'Einkauf', 2), kind: 'einkauf' },
        { ...cat('erledigt', 'Erledigt', 3), kind: 'archiv' },
      ],
    })
    await createCategory('Garten', '')
    await syncNow()
    expect(await getFile(MARK)).toBeUndefined()

    const remote = fake.json('categories.json') as { categories: unknown[] }
    fake.set('categories.json', {
      ...remote,
      categories: [...remote.categories, cat('neu', 'Neu', 20)],
    })
    await updateCategory('privat', { name: 'Persönlich', description: 'lokal' })
    await syncNow()
    const list = (fake.json('categories.json') as { categories: { id: string; name: string }[] })
      .categories
    expect(list.find((c) => c.id === 'privat')?.name).toBe('Persönlich')
    expect(list.map((c) => c.id)).toContain('neu')
    expect(await getFile(MARK)).toBeUndefined()
  })

  it('die Marke landet nie in Outbox oder Upload', async () => {
    await createCategory('Garten', '')
    expect((await getOutbox()).map((e) => e.path)).not.toContain(MARK)
    await syncNow()
    expect(fake.requests.some((r) => r.path.includes('categories-seeded'))).toBe(false)
    expect(fake.files.has(MARK)).toBe(false)
  })
})
