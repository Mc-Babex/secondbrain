import { getSecret } from './localStore'
import { isObj } from './types'

export interface GithubConfig {
  token: string
  /** `besitzer/name` */
  repo: string
  /** Ohne Angabe wird der Standardzweig des Repos verwendet. */
  branch?: string
}

export type GithubErrorKind =
  'unauthorized' | 'notFound' | 'conflict' | 'rateLimit' | 'offline' | 'server' | 'rejected'

const MESSAGES: Record<GithubErrorKind, string> = {
  rejected:
    'GitHub hat die Anfrage abgelehnt, evtl. zu viele Anfragen. Bitte später erneut versuchen.',
  unauthorized: 'GitHub hat den Zugriff abgelehnt. Bitte Token und Berechtigungen prüfen.',
  notFound: 'Repository nicht gefunden oder kein Zugriff.',
  conflict: 'Die Datei wurde auf GitHub zwischenzeitlich geändert.',
  rateLimit: 'GitHub-Anfragelimit erreicht. Bitte später erneut versuchen.',
  offline: 'Keine Verbindung zu GitHub. Die Änderungen bleiben lokal gespeichert.',
  server: 'GitHub meldet einen Fehler. Bitte später erneut versuchen.',
}

/** Fehlertexte enthalten bewusst weder Token noch URL noch Serverantwort. */
export class GithubError extends Error {
  readonly kind: GithubErrorKind
  readonly status: number | null

  constructor(kind: GithubErrorKind, status: number | null = null) {
    super(MESSAGES[kind])
    this.name = 'GithubError'
    this.kind = kind
    this.status = status
  }
}

export type ConnectionResult = 'ok' | 'unauthorized' | 'notFound' | 'offline' | 'error'

export interface RemoteEntry {
  path: string
  sha: string
}

export interface RemoteFile {
  content: string
  sha: string
}

const API = 'https://api.github.com'
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

/** Liest Token und Repo aus dem lokalen Speicher; `null`, wenn nicht (gültig) eingerichtet. */
export async function loadGithubConfig(): Promise<GithubConfig | null> {
  const token = (await getSecret('githubToken'))?.trim()
  const repo = (await getSecret('githubRepo'))?.trim()
  if (!token || !repo || !REPO_PATTERN.test(repo)) return null
  return { token, repo }
}

// --- Kodierung -------------------------------------------------------------

export function encodeBase64(text: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function decodeBase64(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

/** JSON mit 2 Leerzeichen und abschließendem Zeilenumbruch (SPEC §3.1). */
export function serializeJson(data: unknown): string {
  return JSON.stringify(data, null, 2) + '\n'
}

// --- Anfragen --------------------------------------------------------------

function contentsUrl(config: GithubConfig, path: string, withRef: boolean): string {
  const segments = path
    .split('/')
    .filter((s) => s !== '')
    .map(encodeURIComponent)
  const suffix = segments.length > 0 ? `/${segments.join('/')}` : ''
  const ref = withRef && config.branch ? `?ref=${encodeURIComponent(config.branch)}` : ''
  return `${API}/repos/${config.repo}/contents${suffix}${ref}`
}

function errorFor(response: Response): GithubError {
  const { status } = response
  const limited =
    status === 429 ||
    (status === 403 &&
      (response.headers.get('x-ratelimit-remaining') === '0' ||
        response.headers.has('retry-after')))
  if (limited) return new GithubError('rateLimit', status)
  if (status === 401 || status === 403) return new GithubError('unauthorized', status)
  if (status === 404) return new GithubError('notFound', status)
  if (status === 409 || status === 422) return new GithubError('conflict', status)
  return new GithubError('server', status)
}

async function request(
  config: GithubConfig,
  method: 'GET' | 'PUT' | 'DELETE' | 'POST',
  url: string,
  body?: unknown,
): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    // Ursprüngliche Meldung bewusst verworfen (könnte URL-Details enthalten).
    throw new GithubError('offline')
  }
  if (!response.ok) throw errorFor(response)
  return response
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new GithubError('server', response.status)
  }
}

function shaFrom(value: unknown): string {
  if (isObj(value) && typeof value.sha === 'string') return value.sha
  throw new GithubError('server')
}

// --- Öffentliche API -------------------------------------------------------

export async function testConnection(config: GithubConfig): Promise<ConnectionResult> {
  try {
    await request(config, 'GET', `${API}/repos/${config.repo}`)
    return 'ok'
  } catch (error) {
    if (!(error instanceof GithubError)) return 'error'
    if (error.kind === 'unauthorized') return 'unauthorized'
    if (error.kind === 'notFound') return 'notFound'
    if (error.kind === 'offline') return 'offline'
    return 'error'
  }
}

export interface RemoteTree {
  /** Alle Dateien (Blobs) des Repos mit ihrer `sha` (identisch mit der Contents-`sha`). */
  entries: RemoteEntry[]
  /** `true`, wenn GitHub die Liste gekürzt hat – dann ist sie unvollständig. */
  truncated: boolean
}

/**
 * Alle Dateien des Repos in einer Anfrage (Git Trees API, rekursiv). Ein leeres Repo (409)
 * ergibt eine leere Liste; ein fehlendes Repo wirft `notFound`.
 */
export async function listTree(config: GithubConfig): Promise<RemoteTree> {
  const ref = encodeURIComponent(config.branch ?? 'HEAD')
  let json: unknown
  try {
    json = await readJson(
      await request(config, 'GET', `${API}/repos/${config.repo}/git/trees/${ref}?recursive=1`),
    )
  } catch (error) {
    if (error instanceof GithubError && error.kind === 'conflict') {
      return { entries: [], truncated: false }
    }
    throw error
  }
  if (!isObj(json) || !Array.isArray(json.tree)) throw new GithubError('server')
  const entries: RemoteEntry[] = []
  for (const item of json.tree) {
    if (
      isObj(item) &&
      item.type === 'blob' &&
      typeof item.path === 'string' &&
      typeof item.sha === 'string'
    ) {
      entries.push({ path: item.path, sha: item.sha })
    }
  }
  return { entries, truncated: json.truncated === true }
}

/** Dateiinhalt (UTF-8) samt `sha`; `null`, wenn die Datei nicht existiert. */
export async function getFile(config: GithubConfig, path: string): Promise<RemoteFile | null> {
  let json: unknown
  try {
    json = await readJson(await request(config, 'GET', contentsUrl(config, path, true)))
  } catch (error) {
    if (error instanceof GithubError && error.kind === 'notFound') return null
    throw error
  }
  if (!isObj(json) || typeof json.content !== 'string') throw new GithubError('server')
  try {
    return { content: decodeBase64(json.content), sha: shaFrom(json) }
  } catch (error) {
    if (error instanceof GithubError) throw error
    throw new GithubError('server')
  }
}

/** Legt die Datei an (`sha` = `null`) oder aktualisiert sie; liefert die neue `sha`. */
export async function putFile(
  config: GithubConfig,
  path: string,
  data: unknown,
  sha: string | null,
  message: string,
): Promise<string> {
  const response = await request(config, 'PUT', contentsUrl(config, path, false), {
    message,
    content: encodeBase64(serializeJson(data)),
    ...(sha === null ? {} : { sha }),
    ...(config.branch ? { branch: config.branch } : {}),
  })
  const json = await readJson(response)
  if (!isObj(json)) throw new GithubError('server')
  return shaFrom(json.content)
}

/**
 * Startet die Sortierung per `repository_dispatch` (SPEC §6.3); Erfolg ist 204 ohne Inhalt.
 * 422 bedeutet hier „abgelehnt“ (nicht „Datei geändert“).
 */
export async function dispatchSort(config: GithubConfig, requestId: string): Promise<void> {
  try {
    await request(config, 'POST', `${API}/repos/${config.repo}/dispatches`, {
      event_type: 'sortieren',
      client_payload: { requestId },
    })
  } catch (error) {
    if (error instanceof GithubError && error.status === 422) {
      throw new GithubError('rejected', 422)
    }
    throw error
  }
}

export async function deleteFile(
  config: GithubConfig,
  path: string,
  sha: string,
  message: string,
): Promise<void> {
  await request(config, 'DELETE', contentsUrl(config, path, false), {
    message,
    sha,
    ...(config.branch ? { branch: config.branch } : {}),
  })
}
