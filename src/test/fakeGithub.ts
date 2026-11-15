import { decodeBase64, encodeBase64 } from '../data/github'

interface FakeFile {
  content: string
  sha: string
}

export interface FakeRequest {
  method: string
  path: string
}

/** Minimaler In-Memory-Ersatz der GitHub Contents API für Tests (kein echtes Netz). */
export class FakeGithub {
  files = new Map<string, FakeFile>()
  requests: FakeRequest[] = []
  offline = false
  repoExists = true
  /** Repo ohne Commit: Tree-Abfrage liefert 409. */
  emptyRepo = false
  /** Tree-Antwort als gekürzt markieren und nach so vielen Einträgen abschneiden. */
  truncateAt: number | null = null
  /** Wird vor jeder Anfrage aufgerufen (z. B. um nebenläufige Änderungen zu simulieren). */
  beforeRequest: ((request: FakeRequest) => Promise<void> | void) | null = null
  private counter = 0

  private nextSha(): string {
    return `sha${++this.counter}`
  }

  set(path: string, data: unknown): string {
    const sha = this.nextSha()
    this.files.set(path, { content: JSON.stringify(data, null, 2) + '\n', sha })
    return sha
  }

  json(path: string): unknown {
    const file = this.files.get(path)
    return file ? (JSON.parse(file.content) as unknown) : undefined
  }

  sha(path: string): string | undefined {
    return this.files.get(path)?.sha
  }

  remove(path: string): void {
    this.files.delete(path)
  }

  count(method: string): number {
    return this.requests.filter((r) => r.method === method).length
  }

  readonly fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? 'GET'
    const url = new URL(String(input))
    const isTree = /\/git\/trees\//.test(url.pathname)
    const match = /^\/repos\/[^/]+\/[^/]+(?:\/contents\/?(.*))?$/.exec(url.pathname)
    const path = decodeURIComponent(match?.[1] ?? '')
    const request = { method, path }
    this.requests.push(request)
    await this.beforeRequest?.(request)
    if (this.offline) throw new TypeError('Failed to fetch')
    if (!this.repoExists) return reply(404, { message: 'Not Found' })
    if (isTree) return this.tree()
    if (!match) return reply(404, { message: 'Not Found' })
    if (match[1] === undefined) return reply(200, { full_name: 'o/r' })
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    if (method === 'GET') return this.get(path)
    if (method === 'PUT') return this.put(path, body)
    return this.del(path, body)
  }

  private tree(): Response {
    if (this.emptyRepo) return reply(409, { message: 'Git Repository is empty.' })
    let tree = [...this.files].map(([path, f]) => ({ path, type: 'blob', sha: f.sha }))
    const truncated = this.truncateAt !== null && tree.length > this.truncateAt
    if (truncated) tree = tree.slice(0, this.truncateAt ?? 0)
    return reply(200, { tree, truncated })
  }

  private get(path: string): Response {
    const file = this.files.get(path)
    if (file) {
      return reply(200, {
        type: 'file',
        path,
        sha: file.sha,
        content: encodeBase64(file.content).replace(/(.{60})/g, '$1\n'),
        encoding: 'base64',
      })
    }
    const prefix = path === '' ? '' : `${path}/`
    const children = [...this.files].filter(([p]) => p.startsWith(prefix))
    if (children.length === 0) return reply(404, { message: 'Not Found' })
    const listing = new Map<string, unknown>()
    for (const [p, f] of children) {
      const rest = p.slice(prefix.length)
      if (rest.includes('/'))
        listing.set(rest.split('/')[0], { type: 'dir', path: prefix + rest.split('/')[0] })
      else listing.set(rest, { type: 'file', path: p, sha: f.sha })
    }
    return reply(200, [...listing.values()])
  }

  private put(path: string, body: Record<string, unknown>): Response {
    const existing = this.files.get(path)
    if (existing && body.sha === undefined) return reply(422, { message: "sha wasn't supplied" })
    if (existing && body.sha !== existing.sha) return reply(409, { message: 'does not match' })
    if (!existing && body.sha !== undefined) return reply(404, { message: 'Not Found' })
    const sha = this.nextSha()
    this.files.set(path, { content: decodeBase64(String(body.content)), sha })
    return reply(200, { content: { sha } })
  }

  private del(path: string, body: Record<string, unknown>): Response {
    const existing = this.files.get(path)
    if (!existing) return reply(404, { message: 'Not Found' })
    if (body.sha !== existing.sha) return reply(409, { message: 'does not match' })
    this.files.delete(path)
    return reply(200, { commit: {} })
  }
}

function reply(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}
