import { DATA_FORMAT_PATH, dataFormatProblem } from '../lib/dataFormat'
import { nowIso } from '../lib/time'
import { mergeCategoriesFile } from './categoriesMerge'
import { clearSeeded, getSeededTouched } from './categoriesOrigin'
import { getDeletedCategoryIds, releaseUploadedDeletions } from './categoryTombstones'
import {
  deleteFile,
  getFile as getRemoteFile,
  GithubError,
  listTree,
  loadGithubConfig,
  putFile,
  testConnection,
  type GithubConfig,
  type RemoteFile,
} from './github'
import {
  deleteFileFromRemoteIfClean,
  getFile as getLocalFile,
  getOutbox,
  listFiles,
  putFileFromRemoteIfClean,
  removeOutboxEntry,
  setRemoteSha,
  settleOutboxWithRemote,
  type OutboxEntry,
  type StoredFile,
} from './localStore'
import { notifyChange, subscribe } from './repository'
import { createDueSeriesInstances } from './seriesInstances'
import { getFormatCheck, getSyncStatus, setFormatCheck, setSyncStatus } from './syncStatus'
import { isObj } from './types'

const CATEGORIES_PATH = 'categories.json'
const SETTINGS_PATH = 'settings.json'
const LAST_RUN_PATH = 'runs/last.json'
const DIRS = ['inbox', 'items', 'suggestions', 'projects'] as const
const ROOT_FILES: readonly string[] = [CATEGORIES_PATH, SETTINGS_PATH]
/** Vom Claude-Lauf geschrieben; die App lädt sie nur herunter (nie hoch, nie in die Outbox). */
const READ_ONLY_FILES: readonly string[] = [LAST_RUN_PATH]

const DEBOUNCE_MS = 2000
const INTERVAL_MS = 5 * 60 * 1000

// --- Hilfsfunktionen -------------------------------------------------------

function parseJson(text: string): { value: unknown } | null {
  try {
    return { value: JSON.parse(text) as unknown }
  } catch {
    return null
  }
}

/** Zeitstempel für den Konfliktvergleich: `updatedAt`, ersatzweise `createdAt`. */
function stamp(data: unknown): number {
  if (!isObj(data)) return -Infinity
  const value = typeof data.updatedAt === 'string' ? data.updatedAt : data.createdAt
  const time = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isNaN(time) ? -Infinity : time
}

/** Lokal gewinnt bei categories/settings immer, sonst nur bei strikt neuerem Zeitstempel. */
function localWins(path: string, local: unknown, remote: unknown): boolean {
  if (ROOT_FILES.includes(path)) return true
  return stamp(local) > stamp(remote)
}

const isManaged = (path: string): boolean =>
  ROOT_FILES.includes(path) ||
  READ_ONLY_FILES.includes(path) ||
  (DIRS.some((dir) => path.startsWith(`${dir}/`)) && path.endsWith('.json'))

// --- Senden ----------------------------------------------------------------

/** Pfade, die im laufenden Sync hochgeladen wurden (Schutz gegen verzögerte Remote-Listen). */
const uploadedThisRun = new Set<string>()

async function finishUpload(entry: OutboxEntry, sha: string): Promise<void> {
  uploadedThisRun.add(entry.path)
  await setRemoteSha(entry.path, sha)
  await removeOutboxEntry(entry.path, entry.queuedAt)
}

async function sendPut(config: GithubConfig, entry: OutboxEntry): Promise<void> {
  const file = await getLocalFile(entry.path)
  if (!file) {
    await removeOutboxEntry(entry.path, entry.queuedAt)
    return
  }
  // Die lokale `remoteSha` ist die frischeste bekannte (auch nach eigenem Upload im selben Lauf).
  const sha = file.remoteSha ?? entry.baseSha
  const message = `App: ${entry.path} ${sha === null ? 'angelegt' : 'geändert'}`
  try {
    await finishUpload(entry, await putFile(config, entry.path, file.data, sha, message))
    if (entry.path === CATEGORIES_PATH) {
      await releaseUploadedDeletions(file.data)
      await clearSeededIfSettled()
    }
    return
  } catch (error) {
    if (!(error instanceof GithubError) || !['conflict', 'notFound'].includes(error.kind)) {
      throw error
    }
  }
  await resolvePutConflict(config, entry, file)
}

async function resolvePutConflict(
  config: GithubConfig,
  entry: OutboxEntry,
  file: StoredFile,
): Promise<void> {
  const remote = await getRemoteFile(config, entry.path)
  if (remote === null) {
    if (entry.path.startsWith('inbox/')) {
      // Nur verwerfen, wenn die Datei sicher einmal remote existierte und das Repo erreichbar ist
      // (vom Claude-Lauf einsortiert). Sonst Abbruch – nie lokale Erfassungen verlieren.
      const hadRemote = (file.remoteSha ?? entry.baseSha) !== null
      if (!hadRemote || (await testConnection(config)) !== 'ok') throw new GithubError('notFound')
      await settleOutboxWithRemote(entry.path, entry.queuedAt, null)
      return
    }
    await finishUpload(
      entry,
      await putFile(config, entry.path, file.data, null, `App: ${entry.path} angelegt`),
    )
    return
  }
  const parsed = parseJson(remote.content)
  if (parsed !== null && entry.path === CATEGORIES_PATH) {
    await mergeCategories(config, entry, file, { data: parsed.value, sha: remote.sha })
    return
  }
  if (parsed === null || localWins(entry.path, file.data, parsed.value)) {
    const sha = await putFile(
      config,
      entry.path,
      file.data,
      remote.sha,
      `App: ${entry.path} geändert`,
    )
    await finishUpload(entry, sha)
    return
  }
  await settleOutboxWithRemote(entry.path, entry.queuedAt, { data: parsed.value, sha: remote.sha })
}

/** Führt `categories.json` mit der Remote-Fassung zusammen (SPEC §3.5) und lädt das Ergebnis hoch. */
async function mergeCategories(
  config: GithubConfig,
  entry: OutboxEntry,
  file: StoredFile,
  remote: { data: unknown; sha: string },
): Promise<void> {
  const merged = mergeCategoriesFile(
    file.data,
    remote.data,
    await getDeletedCategoryIds(),
    await getSeededTouched(),
    await referencedCategoryIds(),
  )
  const sha = await putFile(config, entry.path, merged, remote.sha, `App: ${entry.path} geändert`)
  uploadedThisRun.add(entry.path)
  // Übernimmt die zusammengeführte Fassung lokal, sofern inzwischen keine neuere Änderung folgte.
  await settleOutboxWithRemote(entry.path, entry.queuedAt, { data: merged, sha })
  await releaseUploadedDeletions(merged)
  await clearSeededIfSettled()
}

/** IDs der Ablagen, auf die lokale Einträge und Projekte zeigen (aktuell oder als ursprüngliche Ablage). */
async function referencedCategoryIds(): Promise<Set<string>> {
  const ids = new Set<string>()
  for (const file of [...(await listFiles('items/')), ...(await listFiles('projects/'))]) {
    if (!isObj(file.data)) continue
    for (const key of ['categoryId', 'originalCategoryId'])
      if (typeof file.data[key] === 'string') ids.add(file.data[key])
  }
  return ids
}

/** Nach einem Abgleich mit Remote gilt die Standardwert-Herkunft nicht mehr (sofern nichts Neues wartet). */
async function clearSeededIfSettled(): Promise<void> {
  if (!(await getOutbox()).some((e) => e.path === CATEGORIES_PATH)) await clearSeeded()
}

async function sendDelete(config: GithubConfig, entry: OutboxEntry): Promise<void> {
  let sha = entry.baseSha
  if (sha === null) {
    const remote = await getRemoteFile(config, entry.path)
    if (remote === null) {
      await removeOutboxEntry(entry.path, entry.queuedAt)
      return
    }
    sha = remote.sha
  }
  try {
    await deleteFile(config, entry.path, sha, `App: ${entry.path} gelöscht`)
  } catch (error) {
    if (!(error instanceof GithubError)) throw error
    if (error.kind === 'notFound') {
      await removeOutboxEntry(entry.path, entry.queuedAt)
      return
    }
    if (error.kind !== 'conflict') throw error
    // Veraltete `sha`: Löschwunsch des Nutzers gilt, mit aktueller Remote-`sha` wiederholen.
    const remote = await getRemoteFile(config, entry.path)
    if (remote !== null) {
      await deleteFile(config, entry.path, remote.sha, `App: ${entry.path} gelöscht`)
    }
  }
  await removeOutboxEntry(entry.path, entry.queuedAt)
}

/**
 * Sendet die Outbox in `queuedAt`-Reihenfolge, auch Änderungen, die während des Laufs entstehen.
 * Vor dem ersten tatsächlichen Senden wird das Datenformat frisch geprüft; bei einem Problem wird
 * nichts gesendet und die Meldung zurückgegeben.
 */
async function sendOutbox(config: GithubConfig): Promise<string | null> {
  const handled = new Set<string>()
  let checked = false
  for (;;) {
    const entries = (await getOutbox()).sort((a, b) => (a.queuedAt < b.queuedAt ? -1 : 1))
    const entry = entries.find((e) => !handled.has(`${e.path}@${e.queuedAt}`))
    if (!entry) return null
    if (!checked) {
      const problem = await checkFormatFile(config)
      if (problem !== null) return problem
      checked = true
    }
    handled.add(`${entry.path}@${entry.queuedAt}`)
    if (entry.op === 'put') await sendPut(config, entry)
    else await sendDelete(config, entry)
  }
}

// --- Laden -----------------------------------------------------------------

interface RemoteListing {
  files: Map<string, string>
  /** `sha` von `secondbrain.json` (nur zum Lesen der Formatversion); `null`, wenn sie fehlt. */
  formatSha: string | null
  truncated: boolean
}

async function listRemote(config: GithubConfig): Promise<RemoteListing> {
  let tree
  try {
    tree = await listTree(config)
  } catch (error) {
    if (!(error instanceof GithubError) || error.kind !== 'notFound') throw error
    // 404: Repo fehlt/kein Zugriff – nur bei erreichbarem Repo bedeutet es "noch leer".
    const connection = await testConnection(config)
    if (connection === 'offline') throw new GithubError('offline')
    if (connection !== 'ok') throw error
    tree = { entries: [], truncated: false }
  }
  const files = new Map<string, string>()
  let formatSha: string | null = null
  for (const entry of tree.entries) {
    if (isManaged(entry.path)) files.set(entry.path, entry.sha)
    else if (entry.path === DATA_FORMAT_PATH) formatSha = entry.sha
  }
  return { files, formatSha, truncated: tree.truncated }
}

/** Meldung, wenn das Daten-Repo ein nicht unterstütztes Format hat; die Datei wird nur bei neuer `sha` gelesen. */
async function formatProblemFor(
  config: GithubConfig,
  sha: string | null,
  truncated: boolean,
): Promise<string | null> {
  // Fehlt die Datei in einer gekürzten Liste, ist das kein Beleg: direkt prüfen.
  if (sha === null && truncated) return checkFormatFile(config)
  const cached = getFormatCheck()
  if (cached !== null && cached.sha === sha) return cached.problem
  return sha === null ? remember(null, null) : checkFormatFile(config)
}

function remember(sha: string | null, problem: string | null): string | null {
  setFormatCheck({ sha, problem })
  return problem
}

/** Liest `secondbrain.json` direkt (ohne Dateiliste); fehlt sie, gilt Format 1. */
async function checkFormatFile(config: GithubConfig): Promise<string | null> {
  const file = await getRemoteFile(config, DATA_FORMAT_PATH)
  if (file === null) return remember(null, null)
  const parsed = parseJson(file.content)
  return remember(file.sha, dataFormatProblem(parsed === null ? null : parsed.value))
}

async function listLocal(): Promise<Map<string, StoredFile>> {
  const local = new Map<string, StoredFile>()
  for (const dir of DIRS) for (const file of await listFiles(`${dir}/`)) local.set(file.path, file)
  for (const path of [...ROOT_FILES, ...READ_ONLY_FILES]) {
    const file = await getLocalFile(path)
    if (file) local.set(path, file)
  }
  return local
}

async function downloadChanged(
  config: GithubConfig,
  remote: Map<string, string>,
  local: Map<string, StoredFile>,
  queued: Set<string>,
): Promise<void> {
  for (const [path, sha] of remote) {
    if (queued.has(path) || local.get(path)?.remoteSha === sha) continue
    const file: RemoteFile | null = await getRemoteFile(config, path)
    if (file === null) continue
    const parsed = parseJson(file.content)
    if (parsed === null) continue
    if (
      (await putFileFromRemoteIfClean(path, parsed.value, file.sha)) &&
      path === CATEGORIES_PATH
    ) {
      await clearSeeded()
    }
  }
}

/** Fehler, der den Abgleich mit einer eigenen Meldung abbricht, ohne Daten zu verändern. */
class SyncAbort extends Error {}

const TRUNCATED_MESSAGE =
  'Das Daten-Repo ist sehr groß; die Dateiliste ist unvollständig. Remote-Löschungen werden nicht übernommen.'

async function removeDeletedRemotely(
  config: GithubConfig,
  remote: Map<string, string>,
  local: Map<string, StoredFile>,
  queued: Set<string>,
): Promise<void> {
  // Im selben Lauf hochgeladene Dateien zählen nie als "remote gelöscht" (verzögerte Liste).
  const synced = [...local.values()].filter(
    (f) => f.remoteSha !== null && !uploadedThisRun.has(f.path),
  )
  // Wie bisher zählen lokale Root-Dateien mit; nur die read-only `runs/last.json` bleibt außen vor.
  const syncedCounted = synced.filter((f) => !READ_ONLY_FILES.includes(f.path))
  const remoteContent = [...remote.keys()].filter(
    (p) => !ROOT_FILES.includes(p) && !READ_ONLY_FILES.includes(p),
  )
  if (remoteContent.length === 0 && syncedCounted.length > 0) {
    throw new SyncAbort(
      'Daten-Repo wirkt leer – lokale Daten wurden nicht gelöscht. Repository prüfen.',
    )
  }
  const gone = synced.filter((f) => !remote.has(f.path) && !queued.has(f.path))
  if (gone.length === 0) return
  // Ein nicht erreichbares/falsches Repo darf nicht wie "alles gelöscht" wirken.
  const connection = await testConnection(config)
  if (connection === 'offline') throw new GithubError('offline')
  if (connection === 'unauthorized') throw new GithubError('unauthorized')
  if (connection === 'notFound') throw new GithubError('notFound')
  if (connection !== 'ok') throw new GithubError('server')
  for (const file of gone) await deleteFileFromRemoteIfClean(file.path)
}

interface ReceiveResult {
  note: string | null
  /** Gesetzt, wenn das Format des Daten-Repos nicht unterstützt wird (nur Lesen erlaubt). */
  formatProblem: string | null
}

/** Lädt Änderungen herunter; `note` ist eine Hinweismeldung, wenn der Abgleich nur eingeschränkt möglich war. */
async function receiveRemote(config: GithubConfig): Promise<ReceiveResult> {
  const listing = await listRemote(config)
  const formatProblem = await formatProblemFor(config, listing.formatSha, listing.truncated)
  const local = await listLocal()
  const queued = new Set((await getOutbox()).map((e) => e.path))
  await downloadChanged(config, listing.files, local, queued)
  if (listing.truncated) {
    console.warn('GitHub-Dateiliste unvollständig (truncated); lokale Löschungen übersprungen')
    return { note: TRUNCATED_MESSAGE, formatProblem }
  }
  await removeDeletedRemotely(config, listing.files, local, queued)
  return { note: null, formatProblem }
}

// --- Lauf und Status -------------------------------------------------------

async function countPending(): Promise<number> {
  return (await getOutbox()).length
}

function describeError(error: unknown): { state: 'offline' | 'fehler'; message: string } {
  if (error instanceof SyncAbort) return { state: 'fehler', message: error.message }
  if (error instanceof GithubError) {
    return { state: error.kind === 'offline' ? 'offline' : 'fehler', message: error.message }
  }
  return { state: 'fehler', message: 'Beim Abgleich ist ein unerwarteter Fehler aufgetreten.' }
}

let suppressChange = false

function notifyQuietly(): void {
  suppressChange = true
  try {
    notifyChange()
  } finally {
    suppressChange = false
  }
}

async function runSync(): Promise<void> {
  const config = await loadGithubConfig()
  if (config === null) {
    setSyncStatus({ state: 'nichtEingerichtet', pending: await countPending(), message: null })
    return
  }
  uploadedThisRun.clear()
  setSyncStatus({ state: 'laeuft', message: null })
  try {
    const blocked = await sendOutbox(config)
    const { note, formatProblem } = await receiveRemote(config)
    let problem = blocked ?? formatProblem
    // Serien-Instanzen (SPEC §3.12) nur nach vollständig erfolgreichem Senden und Herunterladen.
    if (problem === null && note === null && (await createDueSeriesInstances()) > 0) {
      problem = await sendOutbox(config)
    }
    const pending = await countPending()
    if (problem !== null) throw new SyncAbort(problem)
    setSyncStatus({
      state: pending > 0 ? 'ausstehend' : 'synchron',
      pending,
      lastSync: nowIso(),
      message: note,
    })
  } catch (error) {
    setSyncStatus({ ...describeError(error), pending: await countPending() })
  } finally {
    notifyQuietly()
  }
}

let running: Promise<void> | null = null
let rerunRequested = false

/**
 * Gleicht ab. Läuft bereits ein Sync, wird kein zweiter gestartet; stattdessen läuft nach dem
 * aktuellen genau ein weiterer. Der Promise endet nach allen anstehenden Läufen und wirft nie.
 */
export function syncNow(): Promise<void> {
  if (running) {
    rerunRequested = true
    return running
  }
  running = (async () => {
    try {
      do {
        rerunRequested = false
        await runSync()
      } while (rerunRequested)
    } catch (error) {
      setSyncStatus(describeError(error))
    } finally {
      running = null
    }
  })()
  return running
}

// --- Zeitsteuerung ---------------------------------------------------------

let stopHandlers: (() => void) | null = null

/** Startet Sync bei Start, Sichtbarkeit, `online`, Änderungen (entprellt) und alle 5 Minuten. */
export function startAutoSync(): void {
  if (stopHandlers) return
  let debounce: ReturnType<typeof setTimeout> | null = null

  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') void syncNow()
  }
  const onOnline = (): void => {
    void syncNow()
  }
  const unsubscribe = subscribe(() => {
    if (suppressChange) return
    void countPending().then((pending) => {
      const { state } = getSyncStatus()
      setSyncStatus({
        pending,
        ...(state === 'synchron' && pending > 0 ? { state: 'ausstehend' } : {}),
      })
    })
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => {
      debounce = null
      void syncNow()
    }, DEBOUNCE_MS)
  })
  const interval = setInterval(() => void syncNow(), INTERVAL_MS)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('online', onOnline)

  stopHandlers = () => {
    unsubscribe()
    clearInterval(interval)
    if (debounce) clearTimeout(debounce)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('online', onOnline)
  }
  void syncNow()
}

export function stopAutoSync(): void {
  stopHandlers?.()
  stopHandlers = null
}
