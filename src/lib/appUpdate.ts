import { useSyncExternalStore } from 'react'
import { logError } from '../data/errorLog'
import { hasUnsavedWork, installFocusGuard } from './unsavedWork'

/** Mindestabstand zwischen zwei Prüfungen auf eine neue Version. */
export const CHECK_INTERVAL_MS = 60_000
/** Zeitfenster des Schleifenschutzes: danach zählt dieselbe Version wieder als neuer Versuch. */
export const LOOP_WINDOW_MS = 5 * 60_000
/** Neuladen wegen derselben Version: erster Versuch plus höchstens ein weiterer. */
export const MAX_RELOADS_PER_VERSION = 2

const ATTEMPT_KEY = 'secondbrain.updateAttempt'
/** Nach dieser Zeit gilt ein stilles Scheitern des Neuladens als erledigt; der Knopf wirkt dann erneut. */
export const RELOAD_RESET_MS = 10_000

export type UpdateDecision = 'reload' | 'notice'

/** Sofort neu laden, wenn nichts ungespeichert ist und der Schleifenschutz es erlaubt; sonst nur Hinweis. */
export function decideUpdate(input: { unsaved: boolean; reloadAllowed: boolean }): UpdateDecision {
  return !input.unsaved && input.reloadAllowed ? 'reload' : 'notice'
}

export interface ReloadAttempt {
  version: string
  count: number
  at: number
}

function inWindow(attempt: ReloadAttempt | null, version: string, now: number): boolean {
  return attempt !== null && attempt.version === version && now - attempt.at < LOOP_WINDOW_MS
}

/** Schleifenschutz: Ist für diese Version noch ein (weiteres) Neuladen erlaubt? */
export function isReloadAllowed(
  attempt: ReloadAttempt | null,
  version: string,
  now: number,
): boolean {
  return !inWindow(attempt, version, now) || (attempt?.count ?? 0) < MAX_RELOADS_PER_VERSION
}

export function nextAttempt(
  attempt: ReloadAttempt | null,
  version: string,
  now: number,
): ReloadAttempt {
  if (attempt && inWindow(attempt, version, now)) return { ...attempt, count: attempt.count + 1 }
  return { version, count: 1, at: now }
}

/** Typprüfung für `version.json` (externe Daten). */
export function parseVersionFile(value: unknown): { version: string; build: string } | null {
  if (typeof value !== 'object' || value === null) return null
  const { version, build } = value as Record<string, unknown>
  return typeof version === 'string' && typeof build === 'string' ? { version, build } : null
}

function loadAttempt(): ReloadAttempt | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(ATTEMPT_KEY) ?? 'null')
    if (typeof raw !== 'object' || raw === null) return null
    const { version, count, at } = raw as Record<string, unknown>
    return typeof version === 'string' && typeof count === 'number' && typeof at === 'number'
      ? { version, count, at }
      : null
  } catch {
    return null
  }
}

function saveAttempt(attempt: ReloadAttempt): void {
  try {
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify(attempt))
  } catch {
    // Ohne Speicher gibt es keinen Schleifenschutz über das Neuladen hinweg.
  }
}

/* Hinweis „Neue Version“ (Zustand für die Oberfläche) */
let noticeVisible = false
const noticeListeners = new Set<() => void>()

function setNotice(visible: boolean): void {
  if (noticeVisible === visible) return
  noticeVisible = visible
  for (const listener of [...noticeListeners]) listener()
}

function subscribeNotice(listener: () => void): () => void {
  noticeListeners.add(listener)
  return () => {
    noticeListeners.delete(listener)
  }
}

export function useUpdateNotice(): boolean {
  return useSyncExternalStore(subscribeNotice, () => noticeVisible)
}

export interface UpdateDeps {
  /** Eigener Build-Stempel. */
  currentBuild: string
  /** Build-Stempel aus `version.json` auf dem Server; `null` bei Offline/Fehler/ungültiger Datei. */
  fetchBuild: () => Promise<string | null>
  /** Stößt die Service-Worker-Prüfung an (autoUpdate: ein neuer Worker aktiviert sich selbst). */
  updateServiceWorker: () => Promise<void>
  reload: () => void
  now: () => number
}

export interface AppUpdater {
  /** Start/Rückkehr in die App: prüft (höchstens alle 60 s) und entscheidet, auch über eine schon erkannte Version. */
  check: () => Promise<void>
  /** Ein neuer Service Worker hat sich aktiviert. */
  serviceWorkerUpdated: () => void
  /** Knopf im Hinweis: sofort neu laden. */
  reloadNow: () => void
}

/** Erkennung neuer Versionen und Entscheidung „sofort neu laden“ oder „Hinweis“ (SPEC §6.8). */
export function createAppUpdater(deps: UpdateDeps): AppUpdater {
  let pendingVersion: string | null = null
  let lastCheck: number | null = null
  let errorLogged = false
  let reloading = false
  setNotice(false)

  const showNotice = (): void => {
    if (!noticeVisible) logError('Anzeige', 'Neue Version erkannt, Hinweis gezeigt')
    setNotice(true)
  }

  const startReload = (): void => {
    reloading = true
    window.setTimeout(() => {
      reloading = false
    }, RELOAD_RESET_MS)
    deps.reload()
  }

  const performReload = (version: string): void => {
    if (reloading) return
    saveAttempt(nextAttempt(loadAttempt(), version, deps.now()))
    logError('Anzeige', `Neue Version (${version}), Seite wird neu geladen`)
    startReload()
  }

  const decide = (): void => {
    if (pendingVersion === null) return
    const version = pendingVersion
    const decision = decideUpdate({
      unsaved: hasUnsavedWork(),
      reloadAllowed: isReloadAllowed(loadAttempt(), version, deps.now()),
    })
    if (decision === 'notice') showNotice()
    else performReload(version)
  }

  const runCheck = async (): Promise<void> => {
    const now = deps.now()
    if (lastCheck !== null && now - lastCheck < CHECK_INTERVAL_MS) return
    lastCheck = now
    try {
      const [, build] = await Promise.all([deps.updateServiceWorker(), deps.fetchBuild()])
      if (build !== null && build !== deps.currentBuild) {
        pendingVersion = build
        logError('Anzeige', `Neue Version erkannt (${deps.currentBuild} → ${build})`)
      }
    } catch {
      if (!errorLogged) {
        errorLogged = true
        logError('Anzeige', 'Prüfung auf neue Version fehlgeschlagen (offline?)')
      }
    }
  }

  return {
    check: async () => {
      await runCheck()
      decide()
    },
    serviceWorkerUpdated: () => {
      pendingVersion ??= 'service-worker'
      logError('Anzeige', 'Service Worker: neue Version aktiv')
      decide()
    },
    reloadNow: () => {
      if (reloading) return
      logError('Anzeige', 'Neue Version: Neuladen über den Hinweis')
      startReload()
    },
  }
}

async function fetchRemoteBuild(): Promise<string | null> {
  try {
    const response = await fetch('/version.json', { cache: 'no-store' })
    if (!response.ok) return null
    const file = parseVersionFile(await response.json())
    return file?.build ?? null
  } catch {
    return null
  }
}

function realDeps(): UpdateDeps {
  const registration = (): Promise<ServiceWorkerRegistration | undefined> =>
    navigator.serviceWorker?.getRegistration() ?? Promise.resolve(undefined)
  return {
    currentBuild: __BUILD_STAMP__,
    fetchBuild: fetchRemoteBuild,
    updateServiceWorker: async () => {
      await (await registration())?.update()
    },
    reload: () => window.location.reload(),
    now: () => Date.now(),
  }
}

let active: AppUpdater | null = null

/** Knopf im Hinweis. */
export function reloadForUpdate(): void {
  active?.reloadNow()
}

/** Startet die Prüfung (nach dem ersten Rendern) und die Rückkehr-Prüfung; liefert den Callback für den Service Worker. */
export function startAppUpdates(): { serviceWorkerUpdated: () => void } {
  installFocusGuard()
  const updater = createAppUpdater(realDeps())
  active = updater
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void updater.check()
  })
  window.requestAnimationFrame(() => void updater.check())
  return { serviceWorkerUpdated: updater.serviceWorkerUpdated }
}
