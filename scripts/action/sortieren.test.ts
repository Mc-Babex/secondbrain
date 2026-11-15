// @vitest-environment node
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MSG_DATA_FORMAT_NEWER } from '../../src/lib/dataFormat'
import { hasSortWork } from '../../src/lib/sortWork'
import type { Item } from '../../src/data/types'
import { validInbox, validItem } from '../lauf/fixtures'
import {
  createRepos,
  GIT_TEST_TIMEOUT,
  isolateGitConfig,
  putJson,
  readJson,
  sh,
  type Repos,
} from '../lauf/gitFixtures'
import {
  berlinTimestamp,
  defaultGit,
  hasWork,
  lockActive,
  run,
  type GitRunner,
  type RunOptions,
} from './sortieren'

const REQUEST_ID = '20261021-140000-r7k2'
const NOW = new Date('2026-10-21T12:05:00Z') // 14:05 Berlin
const SECRET_URL = 'https://secret-host.invalid/v1/routines/ROUTINEID-XYZ/fire'
const SECRET_TOKEN = 'TOKEN-GEHEIM-12345'

let restoreGit: () => Promise<void>
beforeAll(async () => {
  restoreGit = await isolateGitConfig()
})
afterAll(async () => {
  await restoreGit()
})

let repos: Repos | null = null
afterEach(async () => {
  await repos?.cleanup()
  repos = null
})

const inboxEntry = { ...validInbox }
const workFiles = (): Record<string, string> => ({
  'inbox/a.json': JSON.stringify(inboxEntry),
})

async function setup(files: Record<string, string> = workFiles()): Promise<Repos> {
  repos = await createRepos(files)
  return repos
}

function okResponse(status = 200, headers: Record<string, string> = {}, body = '{}'): Response {
  return new Response(body, { status, headers })
}

function options(dir: string, over: Partial<RunOptions> = {}): RunOptions & { logs: string[] } {
  const logs: string[] = []
  return {
    dir,
    requestId: REQUEST_ID,
    fireUrl: SECRET_URL,
    fireToken: SECRET_TOKEN,
    now: () => NOW,
    log: (message) => logs.push(message),
    logs,
    ...over,
  }
}

const mockFetch = (impl: () => Promise<Response>) => vi.fn<typeof fetch>(impl)

async function remoteFile(r: Repos, path: string): Promise<unknown> {
  return JSON.parse(await sh(r.remote, 'show', `main:${path}`)) as unknown
}

describe('hasWork', () => {
  it('Inbox ohne sortError, Inbox mit sortError, Aufgaben nach §8.4 e', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sb-work-'))
    try {
      expect(await hasWork(dir)).toBe(false)
      await putJson(dir, 'inbox/a.json', { ...inboxEntry, sortError: { message: 'm', at: 'x' } })
      expect(await hasWork(dir)).toBe(false)
      await putJson(dir, 'inbox/b.json', inboxEntry)
      expect(await hasWork(dir)).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('unlesbare JSON-Dateien zählen nicht', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sb-work-'))
    try {
      const { put } = await import('../lauf/gitFixtures')
      await put(dir, 'inbox/kaputt.json', '{ nicht json')
      expect(await hasWork(dir)).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('stimmt mit hasSortWork überein (gemeinsame Beispieldaten)', async () => {
    const task = (over: Partial<Item>): Item => ({
      ...validItem,
      type: 'aufgabe',
      status: 'offen',
      important: true,
      schedule: null,
      ...over,
    })
    const sortError = { message: 'm', at: 'x' }
    const cases: { inbox: { id: string; sortError?: unknown }[]; items: Item[] }[] = [
      { inbox: [], items: [] },
      { inbox: [{ id: 'a' }], items: [] },
      { inbox: [{ id: 'a', sortError }], items: [] },
      { inbox: [{ id: 'a', sortError: null }], items: [] },
      { inbox: [], items: [task({})] },
      { inbox: [], items: [task({ important: false })] },
      { inbox: [], items: [task({ status: 'erledigt' })] },
      { inbox: [], items: [task({ type: 'termin' })] },
      {
        inbox: [],
        items: [
          task({
            schedule: {
              start: '2026-10-22T10:00:00+02:00',
              durationMin: 30,
              calendarEventId: null,
            },
          }),
        ],
      },
    ]
    for (const [index, c] of cases.entries()) {
      const dir = await mkdtemp(join(tmpdir(), 'sb-work-'))
      try {
        for (const [i, entry] of c.inbox.entries()) await putJson(dir, `inbox/${i}.json`, entry)
        for (const [i, item] of c.items.entries()) await putJson(dir, `items/${i}.json`, item)
        expect(await hasWork(dir), `Fall ${index}`).toBe(hasSortWork(c.inbox, c.items))
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    }
  })
})

describe('lockActive', () => {
  const started = (status: string, startedAt = '2026-10-21T14:00:00+02:00') => ({
    requestId: REQUEST_ID,
    startedAt,
    status,
  })

  it('gestartet/unklar innerhalb von 20 Minuten ist aktiv', () => {
    expect(lockActive(started('gestartet'), undefined, NOW)).toBe(true)
    expect(lockActive(started('unklar'), undefined, NOW)).toBe(true)
  })

  it('genau 20 Minuten und älter: frei', () => {
    const at20 = new Date('2026-10-21T12:20:00Z')
    expect(lockActive(started('gestartet'), undefined, new Date(at20.getTime() - 1))).toBe(true)
    expect(lockActive(started('gestartet'), undefined, at20)).toBe(false)
  })

  it('abgelehnt, fehlend oder ungültig: frei', () => {
    expect(lockActive(started('abgelehnt'), undefined, NOW)).toBe(false)
    expect(lockActive(undefined, undefined, NOW)).toBe(false)
    expect(lockActive({ status: 'gestartet', startedAt: 'kaputt' }, undefined, NOW)).toBe(false)
    expect(lockActive('text', undefined, NOW)).toBe(false)
  })

  it('last.json: finishedAt > startedAt gibt frei, ≤ nicht', () => {
    const s = started('gestartet')
    expect(lockActive(s, { finishedAt: '2026-10-21T14:03:00+02:00' }, NOW)).toBe(false)
    expect(lockActive(s, { finishedAt: '2026-10-21T14:00:00+02:00' }, NOW)).toBe(true)
    expect(lockActive(s, { finishedAt: '2026-10-21T13:00:00+02:00' }, NOW)).toBe(true)
    expect(lockActive(s, { finishedAt: 'kaputt' }, NOW)).toBe(true)
  })
})

describe('berlinTimestamp', () => {
  it('Sommer- und Winterzeit mit Offset', () => {
    expect(berlinTimestamp(new Date('2026-10-21T12:05:07Z'))).toBe('2026-10-21T14:05:07+02:00')
    expect(berlinTimestamp(new Date('2026-12-01T12:05:07Z'))).toBe('2026-12-01T13:05:07+01:00')
    expect(berlinTimestamp(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01T00:30:00+01:00')
  })
})

describe('run', () => {
  it(
    'keine Arbeit: kein fetch, trigger nichts',
    async () => {
      const r = await setup({ 'items/.gitkeep': '' })
      const fetchMock = mockFetch(async () => okResponse())
      const outcome = await run(options(r.lauf, { fetch: fetchMock }))
      expect(outcome).toEqual({ result: 'nichts', exitCode: 0 })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(await remoteFile(r, 'runs/trigger.json')).toMatchObject({
        requestId: REQUEST_ID,
        result: 'nichts',
        at: '2026-10-21T14:05:00+02:00',
      })
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'Sperre aktiv: kein fetch, trigger laeuft',
    async () => {
      const r = await setup({
        ...workFiles(),
        'runs/started.json': JSON.stringify({
          requestId: '20261021-135900-zzzz',
          startedAt: '2026-10-21T14:00:00+02:00',
          status: 'unklar',
        }),
      })
      const fetchMock = mockFetch(async () => okResponse())
      const outcome = await run(options(r.lauf, { fetch: fetchMock }))
      expect(outcome.result).toBe('laeuft')
      expect(fetchMock).not.toHaveBeenCalled()
      expect(await remoteFile(r, 'runs/trigger.json')).toMatchObject({ result: 'laeuft' })
      expect(await remoteFile(r, 'runs/started.json')).toMatchObject({ status: 'unklar' })
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'abgeschlossene, abgelaufene oder abgelehnte Sperre erlaubt den Start',
    async () => {
      const cases: Record<string, string>[] = [
        {
          'runs/started.json': JSON.stringify({
            requestId: 'x',
            startedAt: '2026-10-21T14:00:00+02:00',
            status: 'gestartet',
          }),
          'runs/last.json': JSON.stringify({ finishedAt: '2026-10-21T14:03:00+02:00' }),
        },
        {
          'runs/started.json': JSON.stringify({
            requestId: 'x',
            startedAt: '2026-10-21T13:40:00+02:00',
            status: 'gestartet',
          }),
        },
        {
          'runs/started.json': JSON.stringify({
            requestId: 'x',
            startedAt: '2026-10-21T14:04:00+02:00',
            status: 'abgelehnt',
          }),
        },
        { 'runs/started.json': '{ kaputt' },
      ]
      for (const extra of cases) {
        const r = await setup({ ...workFiles(), ...extra })
        const fetchMock = mockFetch(async () => okResponse())
        const outcome = await run(options(r.lauf, { fetch: fetchMock }))
        expect(outcome.result).toBe('gestartet')
        expect(fetchMock).toHaveBeenCalledTimes(1)
        await r.cleanup()
        repos = null
      }
    },
    GIT_TEST_TIMEOUT * 2,
  )

  it(
    'Erfolg: genau 1 fetch mit Headern und {}, beide Dateien auf main',
    async () => {
      const r = await setup()
      const fetchMock = mockFetch(async () => okResponse(200))
      const opts = options(r.lauf, { fetch: fetchMock })
      const outcome = await run(opts)
      expect(outcome).toEqual({ result: 'gestartet', exitCode: 0 })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] ?? []
      expect(url).toBe(SECRET_URL)
      expect(init?.method).toBe('POST')
      expect(init?.headers).toEqual({
        Authorization: `Bearer ${SECRET_TOKEN}`,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      })
      expect(init?.body).toBe('{}')
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      expect(await remoteFile(r, 'runs/started.json')).toEqual({
        requestId: REQUEST_ID,
        startedAt: '2026-10-21T14:05:00+02:00',
        status: 'gestartet',
      })
      expect(await remoteFile(r, 'runs/trigger.json')).toMatchObject({
        result: 'gestartet',
        message: '',
      })
      expect(await r.remoteSubjects()).toEqual([
        'Sortieren: gestartet',
        'Sortieren: Lauf gestartet',
        'Start',
      ])
      expect(await sh(r.remote, 'log', 'main', '-1', '--format=%an <%ae>')).toBe(
        'github-actions[bot] <41898283+github-actions[bot]@users.noreply.github.com>',
      )
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'Push-Konflikt: pull --rebase und erneuter Versuch',
    async () => {
      const r = await setup()
      await putJson(r.app, 'items/neu.json', { id: 'x' })
      await sh(r.app, 'add', '-A')
      await sh(r.app, 'commit', '-m', 'App')
      await sh(r.app, 'push')
      const fetchMock = mockFetch(async () => okResponse())
      const outcome = await run(options(r.lauf, { fetch: fetchMock }))
      expect(outcome.result).toBe('gestartet')
      expect(await remoteFile(r, 'runs/started.json')).toMatchObject({ status: 'gestartet' })
      expect(await sh(r.remote, 'show', 'main:items/neu.json')).toContain('"x"')
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    '429 mit Retry-After: abgelehnt + retryAfter, Sperre frei',
    async () => {
      const r = await setup()
      const fetchMock = mockFetch(async () =>
        okResponse(
          429,
          { 'Retry-After': '90' },
          JSON.stringify({ error: { type: 'rate_limit_error' } }),
        ),
      )
      const outcome = await run(options(r.lauf, { fetch: fetchMock }))
      expect(outcome.result).toBe('abgelehnt')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const trigger = await remoteFile(r, 'runs/trigger.json')
      expect(trigger).toMatchObject({
        result: 'abgelehnt',
        message: 'HTTP 429 (rate_limit_error)',
        retryAfter: '2026-10-21T14:06:30+02:00',
      })
      const started = await remoteFile(r, 'runs/started.json')
      expect(started).toMatchObject({ status: 'abgelehnt' })
      expect(lockActive(started, undefined, NOW)).toBe(false)
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    '500: abgelehnt, kein zweiter Aufruf, kein retryAfter',
    async () => {
      const r = await setup()
      const fetchMock = mockFetch(async () => okResponse(500, {}, 'kein json'))
      const outcome = await run(options(r.lauf, { fetch: fetchMock }))
      expect(outcome.result).toBe('abgelehnt')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const trigger = await remoteFile(r, 'runs/trigger.json')
      expect(trigger).toMatchObject({ result: 'abgelehnt', message: 'HTTP 500' })
      expect(trigger).not.toHaveProperty('retryAfter')
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'Netzfehler: unklar, Sperre bleibt, Fehlermeldung nicht ausgegeben',
    async () => {
      const r = await setup()
      const fetchMock = mockFetch(async () => {
        throw new TypeError(`fetch failed ${SECRET_URL} ${SECRET_TOKEN}`)
      })
      const opts = options(r.lauf, { fetch: fetchMock })
      const outcome = await run(opts)
      expect(outcome.result).toBe('unklar')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(await remoteFile(r, 'runs/trigger.json')).toMatchObject({ result: 'unklar' })
      const started = await remoteFile(r, 'runs/started.json')
      expect(started).toMatchObject({ status: 'unklar' })
      expect(lockActive(started, undefined, NOW)).toBe(true)
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'Push von started.json scheitert: kein fetch, fehler, keine falsche Sperre',
    async () => {
      const r = await setup()
      await sh(r.lauf, 'remote', 'set-url', 'origin', join(r.root, 'gibt-es-nicht.git'))
      const fetchMock = mockFetch(async () => okResponse())
      const opts = options(r.lauf, { fetch: fetchMock })
      const outcome = await run(opts)
      expect(outcome).toEqual({ result: 'fehler', exitCode: 1 })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(await readJson(r.lauf, 'runs/trigger.json')).toMatchObject({ result: 'fehler' })
      expect(await sh(r.lauf, 'log', '--format=%s')).not.toContain('Lauf gestartet')
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'Push scheitert und Aufräumen scheitert: kein fetch, kein trigger.json, Exit 1',
    async () => {
      const r = await setup()
      await sh(r.lauf, 'remote', 'set-url', 'origin', join(r.root, 'gibt-es-nicht.git'))
      const git: GitRunner = (args, cwd) =>
        args[0] === 'reset' ? Promise.reject(new Error('reset kaputt')) : defaultGit(args, cwd)
      const fetchMock = mockFetch(async () => okResponse())
      const opts = options(r.lauf, { fetch: fetchMock, git })
      const outcome = await run(opts)
      expect(outcome).toEqual({ result: 'fehler', exitCode: 1 })
      expect(fetchMock).not.toHaveBeenCalled()
      await expect(readJson(r.lauf, 'runs/trigger.json')).rejects.toThrow()
      await expect(sh(r.remote, 'show', 'main:runs/started.json')).rejects.toThrow()
      expect(opts.logs.join('\n')).not.toContain(SECRET_TOKEN)
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'ungültige REQUEST_ID: kein fetch, nichts geschrieben',
    async () => {
      const r = await setup()
      for (const requestId of [undefined, '', 'abc', '20261021-140000-R7K2', `${REQUEST_ID}; rm`]) {
        const fetchMock = mockFetch(async () => okResponse())
        const outcome = await run(options(r.lauf, { fetch: fetchMock, requestId }))
        expect(outcome).toEqual({ result: 'ungueltig', exitCode: 1 })
        expect(fetchMock).not.toHaveBeenCalled()
      }
      expect(await sh(r.lauf, 'status', '--porcelain')).toBe('')
      expect(await r.remoteSubjects()).toEqual(['Start'])
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'fehlende Secrets: nicht-eingerichtet, kein fetch, keine Sperre',
    async () => {
      for (const over of [{ fireUrl: undefined }, { fireToken: '' }]) {
        const r = await setup()
        const fetchMock = mockFetch(async () => okResponse())
        const outcome = await run(options(r.lauf, { fetch: fetchMock, ...over }))
        expect(outcome).toEqual({ result: 'nicht-eingerichtet', exitCode: 0 })
        expect(fetchMock).not.toHaveBeenCalled()
        expect(await remoteFile(r, 'runs/trigger.json')).toMatchObject({
          result: 'nicht-eingerichtet',
        })
        await expect(sh(r.remote, 'show', 'main:runs/started.json')).rejects.toThrow()
        await r.cleanup()
      }
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'nicht unterstütztes Format: fehler mit Meldung, keine Sperre, kein Start',
    async () => {
      const r = await setup({ ...workFiles(), 'secondbrain.json': '{ "format": 2 }' })
      const fetchMock = mockFetch(async () => okResponse())
      const outcome = await run(options(r.lauf, { fetch: fetchMock }))
      expect(outcome).toEqual({ result: 'fehler', exitCode: 0 })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(await remoteFile(r, 'runs/trigger.json')).toMatchObject({
        result: 'fehler',
        message: MSG_DATA_FORMAT_NEWER,
      })
      await expect(sh(r.remote, 'show', 'main:runs/started.json')).rejects.toThrow()
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'Format 1 oder fehlende Datei: normaler Start',
    async () => {
      const r = await setup({ ...workFiles(), 'secondbrain.json': '{ "format": 1 }' })
      const fetchMock = mockFetch(async () => okResponse())
      const outcome = await run(options(r.lauf, { fetch: fetchMock }))
      expect(outcome.result).toBe('gestartet')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'Token und URL erscheinen nirgends',
    async () => {
      const scenarios: (() => Promise<Response>)[] = [
        async () => okResponse(200),
        async () =>
          okResponse(
            500,
            {},
            JSON.stringify({ error: { type: 'api_error', message: SECRET_URL } }),
          ),
        async () => {
          throw new Error(`${SECRET_URL} ${SECRET_TOKEN}`)
        },
      ]
      for (const impl of scenarios) {
        const r = await setup()
        const opts = options(r.lauf, { fetch: mockFetch(impl) })
        await run(opts)
        const everything = [
          opts.logs.join('\n'),
          await sh(r.remote, 'log', 'main', '-p', '--format=%H%n%an%n%ae%n%B'),
          await sh(r.lauf, 'log', '-p', '--format=%B'),
        ].join('\n')
        for (const secret of [SECRET_URL, SECRET_TOKEN, 'ROUTINEID-XYZ', 'secret-host']) {
          expect(everything).not.toContain(secret)
        }
        await r.cleanup()
        repos = null
      }
    },
    GIT_TEST_TIMEOUT * 3,
  )
})

describe('Einstiegspunkt', () => {
  const script = join(import.meta.dirname, 'sortieren.ts')
  const exec = (args: string[], env: NodeJS.ProcessEnv) =>
    new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
      execFile(
        process.execPath,
        [script, ...args],
        { env, windowsHide: true },
        (error, stdout, stderr) => {
          const code = error && typeof error.code === 'number' ? error.code : 0
          resolve({ code, stdout, stderr })
        },
      )
    })
  const cleanEnv = (): NodeJS.ProcessEnv => {
    const env = { ...process.env }
    delete env.REQUEST_ID
    delete env.ROUTINE_FIRE_URL
    delete env.ROUTINE_FIRE_TOKEN
    return env
  }

  it('ohne Umgebungswerte: sofort Exit 1, ohne Build und Netz', async () => {
    const result = await exec([], cleanEnv())
    expect(result.code).toBe(1)
    expect(result.stdout).toContain('REQUEST_ID')
  }, 30_000)

  it('--help: Exit 0', async () => {
    const result = await exec(['--help'], cleanEnv())
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('REQUEST_ID')
  }, 30_000)
})
