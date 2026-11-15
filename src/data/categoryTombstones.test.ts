import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  getDeletedCategoryIds,
  releaseUploadedDeletions,
  rememberDeletedCategory,
} from './categoryTombstones'
import { putFileLocal, resetDb } from './localStore'

beforeEach(() => resetDb(true))
afterAll(() => resetDb(true))

const uploaded = { categories: [{ id: 'privat' }] }

describe('releaseUploadedDeletions', () => {
  it('vergisst IDs, die in der hochgeladenen Fassung fehlen', async () => {
    await rememberDeletedCategory('studium')
    await releaseUploadedDeletions(uploaded)
    expect(await getDeletedCategoryIds()).toEqual([])
  })

  it('behält IDs, solange eine neuere categories.json-Änderung wartet', async () => {
    await rememberDeletedCategory('studium')
    await putFileLocal('categories.json', uploaded)
    await releaseUploadedDeletions(uploaded)
    expect(await getDeletedCategoryIds()).toEqual(['studium'])
  })

  it('behält IDs, die in der hochgeladenen Fassung noch vorkommen', async () => {
    await rememberDeletedCategory('privat')
    await releaseUploadedDeletions(uploaded)
    expect(await getDeletedCategoryIds()).toEqual(['privat'])
  })
})
