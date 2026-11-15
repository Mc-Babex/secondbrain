import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultCategories } from './defaults'
import * as localStore from './localStore'
import { getFile, getOutbox, putFileFromRemote, resetDb } from './localStore'
import {
  addShoppingItem,
  completeItem,
  createCategory,
  createItem,
  deleteCategory,
  deletePreview,
  getCategories,
  listItems,
  removeCheckedShoppingItems,
  restoreItem,
  saveCategories,
  setChecked,
  updateCategory,
} from './repository'

vi.mock('./localStore', async (importOriginal) => {
  const original = await importOriginal<typeof import('./localStore')>()
  return { ...original, commitLocal: vi.fn(original.commitLocal) }
})

beforeEach(async () => {
  vi.mocked(localStore.commitLocal).mockClear()
  await resetDb(true)
})
afterAll(() => resetDb(true))

describe('createCategory', () => {
  it('leitet id aus dem Namen ab (Umlaute) und vergibt order', async () => {
    const created = await createCategory('  Größe Garten ', 'Beschreibung')
    expect(created).toEqual({
      id: 'groesse-garten',
      name: 'Größe Garten',
      kind: 'normal',
      order: 5,
      description: 'Beschreibung',
    })
    expect((await getCategories()).at(-1)).toEqual(created)
    expect(await getOutbox()).toHaveLength(1)
  })

  it('löst Kollisionen der id auf', async () => {
    expect((await createCategory('Garten', '')).id).toBe('garten')
    expect((await createCategory('Garten!', '')).id).toBe('garten-2')
  })

  it('lehnt leeren Namen und Dubletten ab', async () => {
    await expect(createCategory('   ', '')).rejects.toThrow('Der Name darf nicht leer sein.')
    await expect(createCategory('PRIVAT', '')).rejects.toThrow(
      'Eine Ablage mit diesem Namen gibt es schon.',
    )
  })
})

describe('updateCategory', () => {
  it('ändert Name und Beschreibung, nicht id/kind/order, erhält unbekannte Felder', async () => {
    await putFileFromRemote(
      'categories.json',
      {
        extra: 1,
        categories: [
          { id: 'privat', name: 'Privat', kind: 'normal', order: 1, description: '', color: 'rot' },
          { id: 'erledigt', name: 'Erledigt', kind: 'archiv', order: 2, description: '' },
        ],
      },
      's1',
    )
    const updated = await updateCategory('privat', { name: ' Persönlich ', description: 'neu' })
    expect(updated).toEqual({
      id: 'privat',
      name: 'Persönlich',
      kind: 'normal',
      order: 1,
      description: 'neu',
      color: 'rot',
    })
    expect((await getFile('categories.json'))?.data).toMatchObject({ extra: 1 })
  })

  it('erlaubt den eigenen Namen, lehnt Dubletten und unbekannte Ablagen ab', async () => {
    await expect(
      updateCategory('privat', { name: 'PRIVAT', description: 'x' }),
    ).resolves.toMatchObject({ id: 'privat', description: 'x' })
    await expect(updateCategory('privat', { name: 'arbeit', description: '' })).rejects.toThrow(
      'Eine Ablage mit diesem Namen gibt es schon.',
    )
    await expect(updateCategory('nix', { name: 'X', description: '' })).rejects.toThrow()
  })
})

describe('deleteCategory', () => {
  beforeEach(async () => {
    await putFileFromRemote(
      'categories.json',
      {
        categories: [
          ...defaultCategories().categories,
          { id: 'studium', name: 'Studium', kind: 'normal', order: 5, description: '' },
        ],
      },
      's0',
    )
  })

  it('verschiebt Einträge samt originalCategoryId in einem einzigen Commit', async () => {
    const a = await createItem({ type: 'aufgabe', title: 'A', categoryId: 'studium' })
    const b = await createItem({ type: 'aufgabe', title: 'B', categoryId: 'studium' })
    const c = await createItem({ type: 'aufgabe', title: 'C', categoryId: 'arbeit' })
    await completeItem(b.id)
    expect(await deletePreview('studium')).toBe(2)
    vi.mocked(localStore.commitLocal).mockClear()

    await deleteCategory('studium', 'privat')

    expect(localStore.commitLocal).toHaveBeenCalledTimes(1)
    const items = await listItems()
    expect(items.find((i) => i.id === a.id)).toMatchObject({ categoryId: 'privat' })
    expect(items.find((i) => i.id === b.id)).toMatchObject({
      categoryId: 'erledigt',
      originalCategoryId: 'privat',
    })
    expect(items.find((i) => i.id === c.id)?.categoryId).toBe('arbeit')
    expect((await getCategories()).map((x) => x.id)).not.toContain('studium')
    const paths = (await getOutbox()).map((e) => e.path)
    expect(paths).toContain('categories.json')
    expect(paths).toContain(`items/${a.id}.json`)
    expect(paths).toContain(`items/${b.id}.json`)
  })

  it('erlaubt, die gelöschte Ablage gleichnamig neu anzulegen', async () => {
    await deleteCategory('studium', 'privat')
    expect((await createCategory('Studium', '')).id).toBe('studium')
    expect((await getCategories()).map((c) => c.id)).toContain('studium')
  })

  it('lehnt Einkauf, Archiv und ungültige Ziele ab', async () => {
    await expect(deleteCategory('einkauf', 'privat')).rejects.toThrow()
    await expect(deleteCategory('erledigt', 'privat')).rejects.toThrow()
    await expect(deleteCategory('studium', 'studium')).rejects.toThrow()
    await expect(deleteCategory('studium', '')).rejects.toThrow()
    await expect(deleteCategory('studium', 'einkauf')).rejects.toThrow()
    await expect(deleteCategory('studium', 'erledigt')).rejects.toThrow()
    await expect(deleteCategory('studium', 'gibtsnicht')).rejects.toThrow()
    expect((await getCategories()).map((c) => c.id)).toContain('studium')
    expect(await getOutbox()).toHaveLength(0)
  })
})

describe('Einkaufsliste', () => {
  it('legt Artikel an, aber keine Dubletten', async () => {
    const first = await addShoppingItem(' Knoblauch ')
    expect(first.created).toBe(true)
    expect(first.item).toMatchObject({
      type: 'notiz',
      categoryId: 'einkauf',
      checked: false,
      title: 'Knoblauch',
    })
    await setChecked(first.item.id, true)
    const outbox = await getOutbox()
    const again = await addShoppingItem('KNOBLAUCH')
    expect(again.created).toBe(false)
    expect(again.item).toMatchObject({ id: first.item.id, checked: true })
    expect(await listItems()).toHaveLength(1)
    expect(await getOutbox()).toEqual(outbox)
    expect((await addShoppingItem('Knoblauchzehen')).created).toBe(true)
  })

  it('removeCheckedShoppingItems löscht nur abgehakte Einkaufsartikel', async () => {
    const milk = (await addShoppingItem('Milch')).item
    const bread = (await addShoppingItem('Brot')).item
    const task = await createItem({
      type: 'aufgabe',
      title: 'T',
      categoryId: 'privat',
      checked: true,
    })
    await setChecked(milk.id, true)
    expect(await removeCheckedShoppingItems()).toBe(1)
    const ids = (await listItems()).map((i) => i.id)
    expect(ids).toContain(bread.id)
    expect(ids).toContain(task.id)
    expect(ids).not.toContain(milk.id)
    expect(await removeCheckedShoppingItems()).toBe(0)
  })
})

describe('restoreItem Fallback', () => {
  it('fällt auf privat zurück, wenn die Ursprungsablage fehlt', async () => {
    await saveCategories([
      { id: 'a', name: 'A', kind: 'normal', order: 1, description: '' },
      { id: 'privat', name: 'Privat', kind: 'normal', order: 2, description: '' },
      { id: 'erledigt', name: 'Erledigt', kind: 'archiv', order: 3, description: '' },
    ])
    const item = await createItem({
      type: 'aufgabe',
      title: 'X',
      categoryId: 'erledigt',
      status: 'erledigt',
      originalCategoryId: 'weg',
    })
    expect((await restoreItem(item.id)).categoryId).toBe('privat')
  })
})
