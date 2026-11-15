import { logError } from './errorLog'
import { newId } from './ids'
import { hasSortWork } from '../lib/sortWork'
import {
  isLockActive,
  isStartedRun,
  isTriggerAnswer,
  messageFor,
  MSG_FAILED,
  MSG_NOT_SET_UP,
  MSG_NOTHING,
  MSG_RUNNING,
} from '../lib/sortLock'
import { dispatchSort, getFile, GithubError, loadGithubConfig, type GithubConfig } from './github'
import { getOutbox, listFiles } from './localStore'
import { clearPendingSort, loadPendingSort, PENDING_MAX_MS, savePendingSort } from './pendingSort'
import { getSettings, listItems } from './repository'
import { syncNow } from './sync'
import { getDataFormatProblem } from './syncStatus'
import {
  isInboxEntry,
  parseLastRun,
  type LastRun,
  type StartedRun,
  isAutoSortEnabled,
  type TriggerAnswer,
} from './types'

export type SortPhase = 'idle' | 'pruefen' | 'warten' | 'laeuft'

export interface SortState {
  phase: SortPhase
  message: string | null
}

const STARTED_PATH = 'runs/started.json'
const TRIGGER_PATH = 'runs/trigger.json'
const LAST_RUN_PATH = 'runs/last.json'
const POLL_MS = 5000
const WATCH_MS = 30_000

export const MSG_OFFLINE = 'Offline – Sortieren braucht Internet.'
export const MSG_NO_TOKEN = 'GitHub in den Einstellungen verbinden.'
export const MSG_PENDING = 'Noch nicht alles hochgeladen – bitte gleich erneut versuchen.'
const MSG_GENERIC = 'Das hat nicht geklappt. Bitte versuche es erneut.'

/** Rohdaten statt normalisierter Einträge: ein ungültiges `sortError` zählt für den Lauf als vorhanden. */
async function hasLocalSortWork(): Promise<boolean> {
  const inbox = (await listFiles('inbox/')).map((file) => file.data).filter(isInboxEntry)
  return hasSortWork(inbox, await listItems())
}

async function readJson(config: GithubConfig, path: string): Promise<unknown> {
  const file = await getFile(config, path)
  if (file === null) return null
  try {
    return JSON.parse(file.content) as unknown
  } catch {
    return null
  }
}

async function readStarted(config: GithubConfig): Promise<StartedRun | null> {
  const value = await readJson(config, STARTED_PATH)
  return isStartedRun(value) ? value : null
}

async function readLastRun(config: GithubConfig): Promise<LastRun | null> {
  return parseLastRun(await readJson(config, LAST_RUN_PATH))
}

function errorMessage(error: unknown): string {
  if (error instanceof GithubError) {
    return error.kind === 'offline' ? MSG_OFFLINE : error.message
  }
  return MSG_GENERIC
}

/** Fehlt `settings.json` oder ist sie unlesbar, gilt das bisherige Verhalten (eingeschaltet). */
async function autoSortEnabled(): Promise<boolean> {
  try {
    return isAutoSortEnabled(await getSettings())
  } catch {
    return true
  }
}

const isOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine

export interface SortTrigger {
  getState: () => SortState
  subscribe: (listener: () => void) => () => void
  /** Startet die Sortierung; während Wiederherstellung, Prüfung, Warten, Lauf und offener Anfrage ohne Wirkung. */
  start: () => Promise<void>
  /** Stellt eine bestehende Sperre aus `runs/started.json` wieder her (nur online mit Token). */
  restore: () => Promise<void>
  dispose: () => void
}

export interface SortTriggerOptions {
  /** Startet in `pruefen`, bis die erste Wiederherstellung (`restore`) abgeschlossen ist. */
  restoring?: boolean
}

/** Ablauf laut SPEC §6.3 „Jetzt sortieren“. */
export function createSortTrigger(options: SortTriggerOptions = {}): SortTrigger {
  let awaitingRestore = options.restoring === true
  let state: SortState = { phase: awaitingRestore ? 'pruefen' : 'idle', message: null }
  let restored = false
  let disposed = false
  let watcher: ReturnType<typeof setInterval> | undefined
  const listeners = new Set<() => void>()

  const set = (phase: SortPhase, message: string | null): void => {
    if (disposed) return
    state = { phase, message }
    for (const listener of [...listeners]) listener()
  }
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

  /** Frei für Start bzw. Wiederherstellung: `idle` oder (vor der ersten Wiederherstellung) `pruefen`. */
  const isFree = (): boolean =>
    state.phase === 'idle' || (awaitingRestore && state.phase === 'pruefen')

  /** Wartet auf `runs/trigger.json` mit passender `requestId`; `null` bei Zeitüberschreitung. */
  async function awaitAnswer(config: GithubConfig, requestId: string, totalMs = PENDING_MAX_MS) {
    for (let waited = 0; waited < totalMs && !disposed; waited += POLL_MS) {
      await sleep(POLL_MS)
      if (disposed) return null
      try {
        const value = await readJson(config, TRIGGER_PATH)
        if (isTriggerAnswer(value) && value.requestId === requestId) return value
      } catch {
        // Kurzzeitiger Fehler: weiter versuchen, bis die 2 Minuten um sind.
      }
    }
    return null
  }

  /** Hält den Knopf gesperrt, bis `last.json` fertig meldet oder 20 Min. um sind. */
  function watch(config: GithubConfig, started: StartedRun): void {
    set('laeuft', state.message)
    clearInterval(watcher)
    const finish = (): void => {
      clearInterval(watcher)
      watcher = undefined
      void syncNow().finally(() => set('idle', state.message))
    }
    watcher = setInterval(() => {
      if (!isLockActive(started, null, new Date())) return finish()
      if (document.visibilityState !== 'visible') return
      readLastRun(config)
        .then((lastRun) => {
          if (!disposed && watcher !== undefined && !isLockActive(started, lastRun, new Date())) {
            finish()
          }
        })
        .catch(() => undefined)
    }, WATCH_MS)
  }

  /** Bei `laeuft`/`unklar`: Sperre frisch lesen und bei aktiver Sperre gesperrt bleiben. */
  async function holdIfLocked(config: GithubConfig, message: string): Promise<void> {
    try {
      const [started, lastRun] = [await readStarted(config), await readLastRun(config)]
      if (disposed) return
      if (started !== null && isLockActive(started, lastRun, new Date())) {
        set('laeuft', message)
        return watch(config, started)
      }
    } catch {
      // Lesen fehlgeschlagen: Knopf bleibt frei.
    }
    set('idle', message)
  }

  async function run(): Promise<void> {
    if (!(await autoSortEnabled())) return set('idle', MSG_NOT_SET_UP)
    if (!isOnline()) return set('idle', MSG_OFFLINE)
    const config = await loadGithubConfig()
    if (config === null) return set('idle', MSG_NO_TOKEN)

    await syncNow()
    const formatProblem = getDataFormatProblem()
    if (formatProblem !== null) return set('idle', formatProblem)
    if ((await getOutbox()).length > 0) return set('idle', MSG_PENDING)
    if (!(await hasLocalSortWork())) return set('idle', MSG_NOTHING)

    const [started, lastRun] = [await readStarted(config), await readLastRun(config)]
    if (started !== null && isLockActive(started, lastRun, new Date())) {
      set('laeuft', MSG_RUNNING)
      return watch(config, started)
    }

    const requestId = newId()
    await dispatchSort(config, requestId)
    savePendingSort({ requestId, sentAt: new Date().toISOString() })
    set('warten', null)
    const answer = await awaitAnswer(config, requestId)
    if (disposed) return
    clearPendingSort()
    if (answer === null) return set('idle', MSG_FAILED)
    return settle(config, requestId, answer)
  }

  /** Setzt den Zustand nach der Antwort der Action aus `runs/trigger.json`. */
  async function settle(config: GithubConfig, requestId: string, answer: TriggerAnswer) {
    const message = messageFor(answer, new Date())
    if (answer.result === 'laeuft' || answer.result === 'unklar') {
      return holdIfLocked(config, message)
    }
    if (answer.result !== 'gestartet') return set('idle', message)
    set('laeuft', message)
    const current = await readStarted(config).catch(() => null)
    watch(
      config,
      current?.requestId === requestId
        ? current
        : { requestId, startedAt: answer.at, status: 'gestartet' },
    )
  }

  /** Offene Anfrage (< 2 Min.) weiter abwarten, danach eine bestehende Sperre aus `started.json` übernehmen. */
  async function restoreState(): Promise<void> {
    if (!isOnline()) return
    try {
      const config = await loadGithubConfig()
      if (config === null || !isFree()) return
      const pending = loadPendingSort(new Date())
      if (pending !== null) {
        set('warten', null)
        const left = PENDING_MAX_MS - (Date.now() - new Date(pending.sentAt).getTime())
        const answer = await readAnswer(config, pending.requestId, left)
        if (disposed) return
        clearPendingSort()
        if (answer !== null) return settle(config, pending.requestId, answer)
        set('idle', null)
      }
      const [started, lastRun] = [await readStarted(config), await readLastRun(config)]
      if (disposed || !isFree()) return
      if (started !== null && isLockActive(started, lastRun, new Date())) watch(config, started)
    } catch {
      // Ohne Verbindung bleibt der Knopf frei; beim Antippen wird erneut geprüft.
    }
  }

  /** Prüft sofort, dann in Abständen auf die Antwort zur `requestId`. */
  async function readAnswer(config: GithubConfig, requestId: string, totalMs: number) {
    const now = await readJson(config, TRIGGER_PATH).catch(() => null)
    if (isTriggerAnswer(now) && now.requestId === requestId) return now
    return awaitAnswer(config, requestId, totalMs)
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async start() {
      if (state.phase !== 'idle') return
      if (loadPendingSort(new Date()) !== null) return set('idle', MSG_RUNNING)
      set('pruefen', null)
      try {
        await run()
      } catch (error) {
        const message = errorMessage(error)
        logError('Sortieren', message)
        set('idle', message)
      }
    },
    async restore() {
      if (restored || !isFree()) return
      restored = true
      try {
        await restoreState()
      } finally {
        if (awaitingRestore && state.phase === 'pruefen') set('idle', state.message)
        awaitingRestore = false
      }
    },
    dispose() {
      disposed = true
      clearInterval(watcher)
    },
  }
}

let shared: SortTrigger | null = null

/** Der eine Sortier-Zustand der ganzen App; überlebt Seitenwechsel und Unmount. */
export function getSortTrigger(): SortTrigger {
  shared ??= createSortTrigger({ restoring: true })
  return shared
}

/** Nur für Tests: verwirft den gemeinsamen Zustand (lokal gespeicherte Anfrage bleibt). */
export function resetSortTrigger(): void {
  shared?.dispose()
  shared = null
}
