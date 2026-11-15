// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readRepoFile } from './dataRepo'
import { runTestdaten } from './testdaten'
import { loadTestSpec, type TestSet } from './testspec'

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sb-testdaten-'))
})
afterEach(() => rm(root, { recursive: true, force: true }))

describe.each<TestSet>([1, 2])('lauf:testdaten Satz %i', (set) => {
  it('schreibt die Ablagen ausdrücklich aus dem Testsatz (inkl. studium und Archiv)', async () => {
    const dir = join(root, 'daten')
    const result = await runTestdaten({ argv: ['--ziel', dir, '--satz', String(set)] })
    expect(result.exitCode).toBe(0)
    const spec = loadTestSpec(undefined, set)
    const file = await readRepoFile(dir, 'categories.json')
    expect(file?.data).toEqual({ categories: spec.categories })
    const ids = spec.categories.map((c) => c.id)
    expect(ids).toEqual(
      expect.arrayContaining(['privat', 'arbeit', 'studium', 'einkauf', 'erledigt']),
    )
  })
})
