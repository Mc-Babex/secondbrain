import { loadGithubConfig } from './github'
import { archivePastAppointments } from './repository'
import { getSyncStatus, subscribeSyncStatus } from './syncStatus'

const INTERVAL_MS = 5 * 60 * 1000
/** Längste Wartezeit auf den ersten Abgleich beim Start (falls der Sync hängt). */
const FIRST_SYNC_WAIT_MS = 30_000

let stopHandlers: (() => void) | null = null

/**
 * Wartet, bis der erste Abgleich beim Start einen Endzustand erreicht hat (Erfolg, offline oder
 * Fehler) oder `FIRST_SYNC_WAIT_MS` vergangen sind. Ohne Token endet das Warten sofort.
 */
function waitForFirstSync(onDone: () => void): () => void {
  let finished = false
  let unsubscribe: (() => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const finish = (): void => {
    if (finished) return
    finished = true
    unsubscribe?.()
    if (timer) clearTimeout(timer)
    onDone()
  }
  const settled = (): boolean => {
    const { state } = getSyncStatus()
    return (
      state === 'synchron' || state === 'ausstehend' || state === 'offline' || state === 'fehler'
    )
  }
  void loadGithubConfig().then(
    (config) => {
      if (finished) return
      if (config === null || settled()) return finish()
      unsubscribe = subscribeSyncStatus(() => {
        if (settled()) finish()
      })
      timer = setTimeout(finish, FIRST_SYNC_WAIT_MS)
    },
    () => finish(),
  )
  return () => {
    finished = true
    unsubscribe?.()
    if (timer) clearTimeout(timer)
  }
}

/**
 * Verschiebt vergangene Termine nach „Erledigt“. Der erste Lauf folgt erst auf den ersten Abgleich
 * beim Start (sonst würde ein auf einem anderen Gerät verschobener Termin aus veralteten Daten
 * archiviert); danach bei Rückkehr ins sichtbare Fenster und alle 5 Minuten. Rein lokal (kein
 * Token nötig); der Sync folgt über die Outbox.
 */
export function startPastAppointmentsArchiver(): void {
  if (stopHandlers) return
  let running = false
  let ready = false
  const run = (): void => {
    if (!ready || running) return
    running = true
    archivePastAppointments()
      .catch((error: unknown) => {
        console.warn('Vergangene Termine konnten nicht verschoben werden.', error)
      })
      .finally(() => {
        running = false
      })
  }
  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') run()
  }
  const cancelWait = waitForFirstSync(() => {
    ready = true
    run()
  })
  const interval = setInterval(run, INTERVAL_MS)
  document.addEventListener('visibilitychange', onVisibility)
  stopHandlers = () => {
    cancelWait()
    clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

export function stopPastAppointmentsArchiver(): void {
  stopHandlers?.()
  stopHandlers = null
}
