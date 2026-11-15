// @vitest-environment node
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { runAbschluss } from './abschluss'
import { validItem } from './fixtures'
import { git, gitText, maskCredentials, type GitRunner } from './git'
import {
  commitAndPush,
  createRepos,
  GIT_TEST_TIMEOUT,
  isolateGitConfig,
  put,
  putJson,
  readJson,
  sh,
  type Repos,
} from './gitFixtures'

const ITEM = `items/${validItem.id}.json`
const OTHER = 'items/20261017-100000-zzzz.json'
const lastRun = (errors: object[] = []) => ({
  startedAt: '2026-10-21T14:05:00+02:00',
  finishedAt: '2026-10-21T14:07:30+02:00',
  processed: 2,
  itemIds: [validItem.id],
  skipped: [{ inboxId: validItem.id, message: 'kein Slot' }],
  errors,
})

let restore: () => Promise<void>
let repos: Repos
beforeAll(async () => {
  restore = await isolateGitConfig()
})
afterAll(() => restore())
afterEach(() => repos.cleanup())

const setup = async () => {
  repos = await createRepos({
    '.gitignore': '.lauf/\n',
    [ITEM]: JSON.stringify(validItem),
    [OTHER]: JSON.stringify({ ...validItem, id: '20261017-100000-zzzz' }),
  })
}
const run = (runGit?: GitRunner) => runAbschluss({ argv: ['--daten', repos.lauf], env: {}, runGit })

describe('lauf:abschluss', () => {
  it(
    'meldet NICHTS ZU COMMITTEN ohne Änderungen (.lauf/ zählt nicht)',
    async () => {
      await setup()
      await put(repos.lauf, '.lauf/plan.json', '{}')
      expect(await run()).toEqual({ exitCode: 0, lines: ['NICHTS ZU COMMITTEN'] })
      expect(await repos.remoteSubjects()).toEqual(['Start'])
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'committet mit Zahlen aus runs/last.json und pusht',
    async () => {
      await setup()
      await putJson(repos.lauf, 'runs/last.json', lastRun([{ inboxId: null, message: 'x' }]))
      await put(repos.lauf, '.lauf/plan.json', '{}')
      const result = await run()
      expect(result.exitCode).toBe(0)
      expect(result.lines).toHaveLength(1)
      expect(result.lines[0]).toMatch(/^GEPUSHT [0-9a-f]{4,}$/)
      expect(await repos.remoteSubjects()).toEqual([
        'Lauf: 2 einsortiert, 1 übersprungen, 1 Fehler',
        'Start',
      ])
      expect(await sh(repos.remote, 'ls-tree', '-r', '--name-only', 'main')).not.toContain('.lauf')
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'lässt Null-Zähler in der Commit-Nachricht weg',
    async () => {
      await setup()
      await putJson(repos.lauf, 'runs/last.json', { ...lastRun(), processed: 1, skipped: [] })
      await run()
      expect((await repos.remoteSubjects())[0]).toBe('Lauf: 1 einsortiert')
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'rebased bei abgelehntem Push ohne Konflikt und pusht erneut',
    async () => {
      await setup()
      await putJson(repos.app, 'inbox/20261021-140100-a1b2.json', { id: 'x' })
      await commitAndPush(repos.app, 'App: neuer Eintrag')
      await putJson(repos.lauf, 'runs/last.json', lastRun())
      const result = await run()
      expect(result.exitCode).toBe(0)
      expect(result.lines[0]).toMatch(/^GEPUSHT /)
      expect(await repos.remoteSubjects()).toEqual([
        'Lauf: 2 einsortiert, 1 übersprungen',
        'App: neuer Eintrag',
        'Start',
      ])
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'behält bei Rebase-Konflikten die Fassung aus dem Repo und vermerkt sie in runs/last.json',
    async () => {
      await setup()
      await putJson(repos.app, ITEM, { ...validItem, title: 'Aus der App' })
      await sh(repos.app, 'rm', '-q', OTHER)
      await commitAndPush(repos.app, 'App: ändert und löscht')
      await putJson(repos.lauf, ITEM, { ...validItem, title: 'Vom Lauf' })
      await putJson(repos.lauf, OTHER, { ...validItem, id: '20261017-100000-zzzz', title: 'Lauf' })
      await putJson(repos.lauf, 'runs/last.json', lastRun())

      const result = await run()
      expect(result.exitCode).toBe(0)
      expect(result.lines.at(-1)).toMatch(/^GEPUSHT /)
      expect(await repos.remoteSubjects()).toEqual([
        'Lauf: Konflikte vermerkt',
        'Lauf: 2 einsortiert, 1 übersprungen',
        'App: ändert und löscht',
        'Start',
      ])
      expect(await readJson(repos.lauf, ITEM)).toMatchObject({ title: 'Aus der App' })
      expect(await sh(repos.remote, 'ls-tree', '-r', '--name-only', 'main')).not.toContain(OTHER)
      const pushed = JSON.parse(await sh(repos.remote, 'show', 'main:runs/last.json')) as {
        errors: unknown[]
      }
      expect(pushed.errors).toEqual([
        { inboxId: null, message: `Konflikt: ${ITEM} – Fassung aus der App behalten` },
        { inboxId: null, message: `Konflikt: ${OTHER} – Fassung aus der App behalten` },
      ])
      expect(await sh(repos.lauf, 'status', '--porcelain')).toBe('')
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'gibt nach 3 Fehlversuchen auf; der Commit bleibt lokal',
    async () => {
      await setup()
      await putJson(repos.lauf, 'runs/last.json', lastRun())
      const pushes = vi.fn()
      const failingPush: GitRunner = (dir, args) => {
        if (args[0] !== 'push') return git(dir, args)
        pushes()
        return Promise.resolve({ code: 1, stdout: '', stderr: 'rejected (Test)' })
      }
      const result = await run(failingPush)
      expect(result.exitCode).toBe(1)
      expect(result.lines.join('\n')).toContain('rejected (Test)')
      expect(pushes).toHaveBeenCalledTimes(3)
      expect(await repos.remoteSubjects()).toEqual(['Start'])
      expect(await sh(repos.lauf, 'log', '-1', '--format=%s')).toContain('Lauf: 2 einsortiert')
    },
    GIT_TEST_TIMEOUT,
  )

  it('führt mit --ohne-git keinen Git-Befehl aus', async () => {
    await setup()
    const runGit = vi.fn()
    const result = await runAbschluss({
      argv: ['--daten', repos.lauf, '--ohne-git'],
      env: {},
      runGit,
    })
    expect(result.exitCode).toBe(0)
    expect(runGit).not.toHaveBeenCalled()
  }, 30_000)

  it(
    'bricht einen gescheiterten Rebase ab, statt mittendrin stehen zu bleiben',
    async () => {
      await setup()
      await putJson(repos.app, ITEM, { ...validItem, title: 'Aus der App' })
      await commitAndPush(repos.app, 'App')
      await putJson(repos.lauf, ITEM, { ...validItem, title: 'Vom Lauf' })
      await putJson(repos.lauf, 'runs/last.json', lastRun())
      const failingContinue: GitRunner = (dir, args) =>
        args[0] === 'rebase' && args[1] !== '--abort'
          ? Promise.resolve({ code: 1, stdout: '', stderr: 'kaputt (Test)' })
          : git(dir, args)
      const result = await run(failingContinue)
      expect(result.exitCode).toBe(1)
      expect(await sh(repos.lauf, 'status')).not.toContain('rebase in progress')
      expect(existsSync(join(repos.lauf, '.git', 'rebase-merge'))).toBe(false)
      expect(await sh(repos.lauf, 'log', '-1', '--format=%s')).toContain('Lauf: 2 einsortiert')
    },
    GIT_TEST_TIMEOUT,
  )

  it('maskiert Zugangsdaten in URLs in Git-Ausgaben', async () => {
    expect(maskCredentials('fatal: unable to access https://ghp_abc123@github.com/o/r.git/')).toBe(
      'fatal: unable to access https://***@github.com/o/r.git/',
    )
    expect(maskCredentials('https://user:pw@host/x')).toBe('https://***@host/x')
    const text = gitText({ code: 1, stdout: '', stderr: 'remote https://tok@h.example/r' })
    expect(text).toBe('remote https://***@h.example/r')
  })

  it(
    'zeigt bei fehlgeschlagenem Push keine Zugangsdaten aus der Remote-URL',
    async () => {
      await setup()
      await sh(repos.lauf, 'remote', 'set-url', 'origin', 'http://geheimtoken@127.0.0.1:9/x.git')
      await putJson(repos.lauf, 'runs/last.json', lastRun())
      const result = await run()
      expect(result.exitCode).toBe(1)
      const text = result.lines.join('\n')
      expect(text).not.toContain('geheimtoken')
    },
    GIT_TEST_TIMEOUT,
  )
})
