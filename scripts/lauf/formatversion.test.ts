// @vitest-environment node
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MSG_DATA_FORMAT_INVALID, MSG_DATA_FORMAT_NEWER } from '../../src/lib/dataFormat'
import { runAbschluss } from './abschluss'
import { runAnwenden } from './anwenden'
import { validInbox } from './fixtures'
import type { GitRunner } from './git'
import { createRepos, GIT_TEST_TIMEOUT, isolateGitConfig, put, sh, type Repos } from './gitFixtures'
import { runPruefen } from './pruefen'
import { runStart } from './start'

const NOW = '2026-10-21T14:05:00+02:00'
const INBOX = `inbox/${validInbox.id}.json`
const FORMAT = 'secondbrain.json'

let restore: () => Promise<void>
let repos: Repos
beforeAll(async () => {
  restore = await isolateGitConfig()
})
afterAll(() => restore())
afterEach(() => repos.cleanup())

const setup = async (format: string | null) => {
  repos = await createRepos({
    '.gitignore': '.lauf/\n',
    [INBOX]: JSON.stringify(validInbox),
    ...(format === null ? {} : { [FORMAT]: format }),
  })
}
const argv = () => ['--daten', repos.lauf, '--jetzt', NOW]
const head = () => sh(repos.lauf, 'rev-parse', 'HEAD')
const status = () => sh(repos.lauf, 'status', '--porcelain', '--untracked-files=all')

describe('Formatversion in den Lauf-Skripten', () => {
  it(
    'lauf:start bricht bei {format:2} vor jeder Änderung ab',
    async () => {
      await setup('{"format":2}')
      const before = await head()
      const runGit = vi.fn<GitRunner>()
      const result = await runStart({ argv: argv(), env: {}, runGit })
      expect(result).toEqual({ exitCode: 1, lines: [MSG_DATA_FORMAT_NEWER] })
      expect(runGit).not.toHaveBeenCalled()
      expect(existsSync(join(repos.lauf, '.lauf'))).toBe(false)
      expect(await head()).toBe(before)
      expect(await status()).toBe('')
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'lauf:start bricht ab, wenn der Pull ein neueres Format bringt (ohne .lauf/ anzulegen)',
    async () => {
      await setup(null)
      await put(repos.app, FORMAT, '{"format":2}')
      await sh(repos.app, 'add', '-A')
      await sh(repos.app, 'commit', '-m', 'Format 2')
      await sh(repos.app, 'push')
      const result = await runStart({ argv: argv(), env: {} })
      expect(result).toEqual({ exitCode: 1, lines: [MSG_DATA_FORMAT_NEWER] })
      expect(existsSync(join(repos.lauf, '.lauf'))).toBe(false)
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'lauf:start läuft bei {format:1} normal',
    async () => {
      await setup('{"format":1}')
      expect((await runStart({ argv: argv(), env: {} })).exitCode).toBe(0)
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'lauf:anwenden bricht bei {format:2} ab und ändert nichts',
    async () => {
      await setup('{"format":2}')
      const result = await runAnwenden({ argv: argv(), env: {} })
      expect(result).toEqual({ exitCode: 1, lines: [MSG_DATA_FORMAT_NEWER] })
      expect(await status()).toBe('')
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'lauf:abschluss bricht bei {format:2} ab: kein Commit, kein Push',
    async () => {
      await setup('{"format":2}')
      await writeFile(join(repos.lauf, 'inbox', 'neu.json'), '{}')
      const before = await head()
      const result = await runAbschluss({ argv: argv(), env: {} })
      expect(result).toEqual({ exitCode: 1, lines: [MSG_DATA_FORMAT_NEWER] })
      expect(await head()).toBe(before)
      expect(await repos.remoteSubjects()).toEqual(['Start'])
      expect(await status()).toBe('?? inbox/neu.json')
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'ungültige secondbrain.json blockiert ebenfalls',
    async () => {
      await setup('{"format":"1"}')
      const result = await runAnwenden({ argv: argv(), env: {} })
      expect(result).toEqual({ exitCode: 1, lines: [MSG_DATA_FORMAT_INVALID] })
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'lauf:pruefen: {format:2} und ungültige Datei sind Fehler, {format:1} und fehlende Datei OK',
    async () => {
      const pruefen = () => runPruefen({ argv: ['--daten', repos.lauf], env: {} })
      await setup('{"format":2}')
      expect(await pruefen()).toEqual({ exitCode: 1, lines: [MSG_DATA_FORMAT_NEWER] })
      await writeFile(join(repos.lauf, FORMAT), '{kaputt')
      expect(await pruefen()).toEqual({ exitCode: 1, lines: [MSG_DATA_FORMAT_INVALID] })
      await writeFile(join(repos.lauf, FORMAT), '{"format":1,"zusatz":true}')
      expect((await pruefen()).exitCode).toBe(0)
      await repos.cleanup()
      await setup(null)
      expect((await pruefen()).exitCode).toBe(0)
    },
    GIT_TEST_TIMEOUT,
  )
})
