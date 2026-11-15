// @vitest-environment node
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultCategories, defaultSettings } from '../../src/data/defaults'
import {
  deleteFile,
  readCategories,
  readDataRepo,
  readRepoFile,
  readSettings,
  writeJsonFile,
} from './dataRepo'
import { validInbox } from './fixtures'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sb-repo-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('dataRepo', () => {
  it('liefert Standardwerte, wenn categories.json und settings.json fehlen', async () => {
    expect(await readCategories(dir)).toEqual(defaultCategories())
    expect(await readSettings(dir)).toEqual(defaultSettings())
  })

  it('liest vorhandene settings.json', async () => {
    const settings = { planningWindow: { start: '08:00', end: '18:00' }, timezone: 'Europe/Berlin' }
    await writeJsonFile(dir, 'settings.json', settings)
    expect(await readSettings(dir)).toEqual(settings)
  })

  it('wirft bei ungültiger categories.json', async () => {
    await writeFile(join(dir, 'categories.json'), '{"categories": 5}')
    await expect(readCategories(dir)).rejects.toThrow('categories.json')
  })

  it('schreibt JSON mit 2 Leerzeichen und Zeilenende \\n', async () => {
    await writeJsonFile(dir, 'inbox/a.json', { a: 1 })
    expect(await readFile(join(dir, 'inbox', 'a.json'), 'utf-8')).toBe('{\n  "a": 1\n}\n')
  })

  it('erhält unbekannte Felder beim Lesen und Zurückschreiben', async () => {
    const path = 'inbox/20261017-093000-k3f9.json'
    const withExtra = { ...validInbox, zusatz: { x: [1, 2] } }
    await writeJsonFile(dir, path, withExtra)
    const file = await readRepoFile(dir, path)
    await writeJsonFile(dir, path, file?.data)
    expect((await readRepoFile(dir, path))?.data).toEqual(withExtra)
  })

  it('liest die Ordner sortiert und meldet kaputtes JSON sowie Fremddateien', async () => {
    await mkdir(join(dir, 'items'))
    await writeFile(join(dir, 'items', 'b.json'), '{kaputt')
    await writeFile(join(dir, 'items', 'a.txt'), 'x')
    const repo = await readDataRepo(dir)
    expect(repo.items.map((f) => f.path)).toEqual(['items/a.txt', 'items/b.json'])
    expect(repo.items[1].parseError).toBeDefined()
    expect(repo.inbox).toEqual([])
    expect(repo.categories).toBeNull()
  })

  it('löscht einzelne Dateien und verweigert Pfade außerhalb des Datenordners', async () => {
    await writeJsonFile(dir, 'inbox/a.json', {})
    await deleteFile(dir, 'inbox/a.json')
    expect(existsSync(join(dir, 'inbox', 'a.json'))).toBe(false)
    await expect(writeJsonFile(dir, '../boese.json', {})).rejects.toThrow('außerhalb')
  })
})
