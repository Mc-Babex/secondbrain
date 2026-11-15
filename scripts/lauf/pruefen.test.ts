// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeJsonFile } from './dataRepo'
import { validInbox, validItem } from './fixtures'
import { runPruefen } from './pruefen'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sb-cli-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('lauf:pruefen', () => {
  it('gültiges Daten-Repo ergibt Exit 0 und OK', async () => {
    await writeJsonFile(dir, `inbox/${validInbox.id}.json`, validInbox)
    await writeJsonFile(dir, `items/${validItem.id}.json`, validItem)
    const result = await runPruefen({ argv: ['--daten', dir], env: {} })
    expect(result).toEqual({ exitCode: 0, lines: ['OK (2 Dateien)'] })
  })

  it('ungültiges Daten-Repo ergibt Exit 1 und eine Fehlerzeile mit Pfad', async () => {
    await writeJsonFile(dir, `items/${validItem.id}.json`, { ...validItem, categoryId: 'nix' })
    const result = await runPruefen({ argv: ['--daten', dir], env: {} })
    expect(result.exitCode).toBe(1)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]).toMatch(/^items\/20261017-093000-k3f9\.json: .*nix/)
  })

  it('fehlender Datenordner ergibt Exit 2', async () => {
    const result = await runPruefen({ argv: ['--daten', join(dir, 'weg')], env: {} })
    expect(result.exitCode).toBe(2)
  })
})
