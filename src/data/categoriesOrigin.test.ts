import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { clearSeeded, getSeededTouched, markSeeded, touchSeeded } from './categoriesOrigin'
import { getFile, putFileFromRemote, resetDb } from './localStore'

const PATH = 'local/categories-seeded.json'

beforeEach(() => resetDb(true))
afterAll(() => resetDb(true))

describe('categoriesOrigin', () => {
  it('ohne Marke ist der Stand null und touch bleibt wirkungslos', async () => {
    expect(await getSeededTouched()).toBeNull()
    await touchSeeded('privat')
    expect(await getSeededTouched()).toBeNull()
  })

  it('setzt die Marke mit leerer Liste und überschreibt sie nicht erneut', async () => {
    await markSeeded()
    expect(await getSeededTouched()).toEqual([])
    await touchSeeded('privat')
    await markSeeded()
    expect(await getSeededTouched()).toEqual(['privat'])
  })

  it('touch merkt IDs ohne Duplikate', async () => {
    await markSeeded()
    await touchSeeded('privat')
    await touchSeeded('privat')
    await touchSeeded('garten')
    expect(await getSeededTouched()).toEqual(['privat', 'garten'])
  })

  it('eine kaputte Marke gilt als nicht vorhanden (normaler Merge)', async () => {
    await putFileFromRemote(PATH, { touched: 'kaputt' }, 'local')
    expect(await getSeededTouched()).toBeNull()
    await putFileFromRemote(PATH, 'text', 'local')
    expect(await getSeededTouched()).toBeNull()
  })

  it('ignoriert Nicht-Strings in der Liste', async () => {
    await putFileFromRemote(PATH, { touched: ['a', 3, null] }, 'local')
    expect(await getSeededTouched()).toEqual(['a'])
  })

  it('löschen entfernt die Marke', async () => {
    await markSeeded()
    await clearSeeded()
    expect(await getSeededTouched()).toBeNull()
    expect(await getFile(PATH)).toBeUndefined()
  })
})
