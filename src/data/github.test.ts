import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  decodeBase64,
  deleteFile,
  dispatchSort,
  encodeBase64,
  getFile,
  GithubError,
  listTree,
  loadGithubConfig,
  putFile,
  serializeJson,
  testConnection,
  type GithubConfig,
} from './github'
import { resetDb, setSecret } from './localStore'

const TOKEN = 'ghp_geheimerTestToken123'
const config: GithubConfig = { token: TOKEN, repo: 'alex/daten', branch: 'main' }

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers })

let fetchMock: ReturnType<typeof vi.fn>
let consoleSpies: ReturnType<typeof vi.spyOn>[]

beforeEach(async () => {
  await resetDb(true)
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => undefined),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function errorOf(promise: Promise<unknown>): Promise<GithubError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof GithubError) return error
    throw error
  }
  throw new Error('Fehler erwartet')
}

describe('Kodierung', () => {
  it('UTF-8-Roundtrip mit Umlauten und Euro', () => {
    const text = 'äöüß€ Größe'
    expect(decodeBase64(encodeBase64(text))).toBe(text)
  })

  it('dekodiert Base64 mit Zeilenumbrüchen', () => {
    const b64 = encodeBase64('äöüß€')
    expect(decodeBase64(`${b64.slice(0, 4)}\n${b64.slice(4)}`)).toBe('äöüß€')
  })

  it('serialisiert JSON mit 2 Leerzeichen und Zeilenumbruch', () => {
    expect(serializeJson({ a: 1 })).toBe('{\n  "a": 1\n}\n')
  })
})

describe('loadGithubConfig', () => {
  it('liefert null ohne Token oder bei ungültigem Repo, sonst die Konfiguration', async () => {
    expect(await loadGithubConfig()).toBeNull()
    await setSecret('githubToken', ` ${TOKEN} `)
    await setSecret('githubRepo', 'kein-gueltiges-repo')
    expect(await loadGithubConfig()).toBeNull()
    await setSecret('githubRepo', 'alex/daten')
    expect(await loadGithubConfig()).toEqual({ token: TOKEN, repo: 'alex/daten' })
  })
})

describe('testConnection', () => {
  it.each([
    [200, 'ok'],
    [401, 'unauthorized'],
    [404, 'notFound'],
    [500, 'error'],
  ] as const)('Status %i ergibt %s', async (status, expected) => {
    fetchMock.mockResolvedValue(json(status, {}))
    expect(await testConnection(config)).toBe(expected)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/alex/daten')
  })

  it('Netzwerkfehler ergibt offline', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await testConnection(config)).toBe('offline')
  })
})

describe('Anfragen', () => {
  it('sendet die vorgeschriebenen Header und cache: no-store', async () => {
    fetchMock.mockResolvedValue(json(200, { tree: [], truncated: false }))
    await listTree(config)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/alex/daten/git/trees/main?recursive=1')
    expect(init.cache).toBe('no-store')
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    })
    expect(url).not.toContain(TOKEN)
  })

  it('listTree liefert nur Blobs samt truncated-Flag; ohne Branch wird HEAD verwendet', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, {
        tree: [
          { type: 'blob', path: 'inbox/a.json', sha: 's1' },
          { type: 'tree', path: 'inbox', sha: 's2' },
          { type: 'blob', path: 'items/b.json', sha: 's3' },
        ],
        truncated: true,
      }),
    )
    expect(await listTree({ token: TOKEN, repo: 'alex/daten' })).toEqual({
      entries: [
        { path: 'inbox/a.json', sha: 's1' },
        { path: 'items/b.json', sha: 's3' },
      ],
      truncated: true,
    })
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/alex/daten/git/trees/HEAD?recursive=1',
    )
  })

  it('listTree erkennt mehr als 1000 Dateien vollständig', async () => {
    const tree = Array.from({ length: 1500 }, (_, i) => ({
      type: 'blob',
      path: `items/${i}.json`,
      sha: `s${i}`,
    }))
    fetchMock.mockResolvedValueOnce(json(200, { tree, truncated: false }))
    const result = await listTree(config)
    expect(result.entries).toHaveLength(1500)
    expect(result.truncated).toBe(false)
  })

  it('listTree: leeres Repo (409) ergibt leere Liste, 404 wirft notFound', async () => {
    fetchMock.mockResolvedValueOnce(json(409, { message: 'Git Repository is empty.' }))
    expect(await listTree(config)).toEqual({ entries: [], truncated: false })
    fetchMock.mockResolvedValueOnce(json(404, {}))
    expect((await errorOf(listTree(config))).kind).toBe('notFound')
  })

  it('getFile dekodiert UTF-8 und liefert sha; 404 ergibt null', async () => {
    const content = encodeBase64('{"t":"äöüß€"}\n').replace(/(.{8})/g, '$1\n')
    fetchMock.mockResolvedValueOnce(json(200, { content, sha: 'abc', encoding: 'base64' }))
    expect(await getFile(config, 'items/x.json')).toEqual({
      content: '{"t":"äöüß€"}\n',
      sha: 'abc',
    })
    fetchMock.mockResolvedValueOnce(json(404, {}))
    expect(await getFile(config, 'items/y.json')).toBeNull()
  })

  it('getFile lehnt unerwartete Antworten als Serverfehler ab', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { sha: 'abc' }))
    expect((await errorOf(getFile(config, 'a.json'))).kind).toBe('server')
  })

  it('putFile sendet UTF-8-Base64, sha und Branch und liefert die neue sha', async () => {
    fetchMock.mockResolvedValue(json(200, { content: { sha: 'neu' } }))
    const sha = await putFile(
      config,
      'items/x.json',
      { t: 'äöüß€' },
      'alt',
      'App: items/x.json geändert',
    )
    expect(sha).toBe('neu')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('PUT')
    const body = JSON.parse(String(init.body)) as Record<string, string>
    expect(body.sha).toBe('alt')
    expect(body.branch).toBe('main')
    expect(body.message).toBe('App: items/x.json geändert')
    expect(decodeBase64(body.content)).toBe('{\n  "t": "äöüß€"\n}\n')
  })

  it('putFile ohne sha legt neu an (kein sha-Feld)', async () => {
    fetchMock.mockResolvedValue(json(201, { content: { sha: 'neu' } }))
    await putFile({ token: TOKEN, repo: 'alex/daten' }, 'a.json', {}, null, 'm')
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as object
    expect(body).not.toHaveProperty('sha')
    expect(body).not.toHaveProperty('branch')
  })

  it('deleteFile sendet sha und Nachricht', async () => {
    fetchMock.mockResolvedValue(json(200, {}))
    await deleteFile(config, 'inbox/a.json', 's1', 'App: inbox/a.json gelöscht')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('DELETE')
    expect(JSON.parse(String(init.body))).toEqual({
      message: 'App: inbox/a.json gelöscht',
      sha: 's1',
      branch: 'main',
    })
  })
})

describe('Fehlerarten und Token-Schutz', () => {
  const cases: [string, () => Response | Promise<Response>, string][] = [
    ['401', () => json(401, { message: `Bad credentials ${TOKEN}` }), 'unauthorized'],
    ['403 ohne Limit', () => json(403, {}), 'unauthorized'],
    ['404', () => json(404, {}), 'notFound'],
    ['409', () => json(409, {}), 'conflict'],
    ['422', () => json(422, {}), 'conflict'],
    ['403 Ratelimit', () => json(403, {}, { 'x-ratelimit-remaining': '0' }), 'rateLimit'],
    ['429', () => json(429, {}), 'rateLimit'],
    ['500', () => json(500, {}), 'server'],
  ]

  it.each(cases)('PUT bei %s ergibt passenden Fehler ohne Token', async (_name, response, kind) => {
    fetchMock.mockImplementation(() => Promise.resolve(response()))
    const error = await errorOf(putFile(config, 'a.json', {}, 'x', 'm'))
    expect(error.kind).toBe(kind)
    expect(error.message).not.toContain(TOKEN)
    expect(error.message).not.toContain('alex/daten')
    expect(String(error.stack)).not.toContain(TOKEN)
  })

  it('Netzwerkfehler ergibt offline ohne Token oder Originalmeldung', async () => {
    fetchMock.mockRejectedValue(new TypeError(`Failed to fetch ${TOKEN}`))
    const error = await errorOf(deleteFile(config, 'a.json', 's', 'm'))
    expect(error.kind).toBe('offline')
    expect(error.message).not.toContain(TOKEN)
  })

  it('schreibt nie in die Konsole', async () => {
    fetchMock.mockResolvedValueOnce(json(401, {}))
    fetchMock.mockRejectedValueOnce(new TypeError('x'))
    fetchMock.mockResolvedValueOnce(json(200, { content: { sha: 'n' } }))
    await testConnection(config)
    await testConnection(config)
    await putFile(config, 'a.json', {}, null, 'm')
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled()
  })
})

describe('dispatchSort', () => {
  it('sendet POST an /dispatches mit event_type und requestId und erwartet 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await dispatchSort(config, '20261021-140000-r7k2')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/alex/daten/dispatches')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      event_type: 'sortieren',
      client_payload: { requestId: '20261021-140000-r7k2' },
    })
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(headers['Content-Type']).toBe('application/json')
  })

  it.each([
    [401, 'unauthorized'],
    [404, 'notFound'],
    [422, 'rejected'],
    [500, 'server'],
  ])('übersetzt Status %i in Fehlerart %s', async (status, kind) => {
    fetchMock.mockResolvedValue(json(status, {}))
    const error = await errorOf(dispatchSort(config, 'id'))
    expect(error.kind).toBe(kind)
    expect(error.message).not.toContain(TOKEN)
  })
})
