// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataDirError, resolveDataDir } from './dataDir'

let root: string
let argDir: string
let envDir: string
let defaultDir: string
let codeRoot: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sb-dir-'))
  argDir = join(root, 'arg')
  envDir = join(root, 'env')
  defaultDir = join(root, 'secondbrain-daten')
  codeRoot = join(root, 'code')
  for (const d of [argDir, envDir, defaultDir, codeRoot]) mkdirSync(d)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('resolveDataDir', () => {
  it('bevorzugt das Argument vor Umgebungsvariable und Standard', () => {
    const dir = resolveDataDir({
      argv: ['--daten', argDir],
      env: { SECONDBRAIN_DATEN: envDir },
      codeRoot,
    })
    expect(dir).toBe(argDir)
  })

  it('nimmt die Umgebungsvariable vor dem Standard', () => {
    const dir = resolveDataDir({ argv: [], env: { SECONDBRAIN_DATEN: envDir }, codeRoot })
    expect(dir).toBe(envDir)
  })

  it('fällt auf ../secondbrain-daten zurück', () => {
    expect(resolveDataDir({ argv: [], env: {}, codeRoot })).toBe(defaultDir)
  })

  it('erkennt einen Nachbarordner mit secondbrain.json vor ../secondbrain-daten', () => {
    const mine = join(root, 'mein-daten-repo')
    mkdirSync(mine)
    writeFileSync(join(mine, 'secondbrain.json'), '{"format":1}')
    expect(resolveDataDir({ argv: [], env: {}, codeRoot })).toBe(mine)
    expect(resolveDataDir({ argv: [], env: { SECONDBRAIN_DATEN: envDir }, codeRoot })).toBe(envDir)
  })

  it('zählt das Code-Repo selbst nicht als Daten-Repo', () => {
    writeFileSync(join(codeRoot, 'secondbrain.json'), '{"format":1}')
    expect(resolveDataDir({ argv: [], env: {}, codeRoot })).toBe(defaultDir)
  })

  it('meldet mehrere Nachbarordner mit secondbrain.json verständlich', () => {
    for (const name of ['a-daten', 'b-daten']) {
      mkdirSync(join(root, name))
      writeFileSync(join(root, name, 'secondbrain.json'), '{"format":1}')
    }
    expect(() => resolveDataDir({ argv: [], env: {}, codeRoot })).toThrow(/Mehrere.*--daten/)
  })

  it('erkennt einen Nachbarordner, der ein Symlink auf einen Ordner ist', () => {
    const real = mkdtempSync(join(tmpdir(), 'sb-real-'))
    try {
      writeFileSync(join(real, 'secondbrain.json'), '{"format":1}')
      const link = join(root, 'verknuepft')
      symlinkSync(real, link, 'junction')
      expect(resolveDataDir({ argv: [], env: {}, codeRoot })).toBe(link)
    } finally {
      rmSync(real, { recursive: true, force: true })
    }
  })

  it('meldet einen nicht lesbaren Elternordner verständlich statt mit rohem Fehler', () => {
    const lonely = join(root, 'gibt-es-nicht', 'code')
    try {
      resolveDataDir({ argv: [], env: {}, codeRoot: lonely })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(DataDirError)
      expect((error as DataDirError).exitCode).toBe(2)
      expect((error as DataDirError).message).toMatch(/nicht lesbar.*--daten/)
    }
  })

  it('meldet einen fehlenden Ordner mit Exit-Code 2', () => {
    const missing = join(root, 'gibt-es-nicht')
    try {
      resolveDataDir({ argv: ['--daten', missing], env: {}, codeRoot })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(DataDirError)
      expect((error as DataDirError).exitCode).toBe(2)
      expect((error as DataDirError).message).toContain('Datenordner nicht gefunden')
      expect((error as DataDirError).message).toContain('SECONDBRAIN_DATEN')
      expect((error as DataDirError).message).toContain('secondbrain.json')
    }
  })
})
