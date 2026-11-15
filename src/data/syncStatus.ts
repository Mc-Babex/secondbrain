import { useSyncExternalStore } from 'react'
import { logError } from './errorLog'

export type SyncState =
  'nichtEingerichtet' | 'synchron' | 'laeuft' | 'ausstehend' | 'offline' | 'fehler'

export interface SyncStatus {
  state: SyncState
  /** Anzahl ungesendeter Änderungen (Outbox). */
  pending: number
  /** Zeitpunkt des letzten vollständigen Abgleichs (ISO) */
  lastSync: string | null
  /** Verständliche deutsche Meldung bei `offline` / `fehler`, sonst `null`. */
  message: string | null
}

const INITIAL: SyncStatus = {
  state: 'nichtEingerichtet',
  pending: 0,
  lastSync: null,
  message: null,
}

let current: SyncStatus = INITIAL
/** Letzter Zustand außer `laeuft`: Dauer-Offline soll nur einmal protokolliert werden. */
let lastSettled: SyncState = INITIAL.state
const listeners = new Set<() => void>()

export function getSyncStatus(): SyncStatus {
  return current
}

/** Setzt Teile des Status; Abonnenten werden nur bei tatsächlicher Änderung benachrichtigt. */
export function setSyncStatus(patch: Partial<SyncStatus>): void {
  const next = { ...current, ...patch }
  if (
    next.state === current.state &&
    next.pending === current.pending &&
    next.lastSync === current.lastSync &&
    next.message === current.message
  ) {
    return
  }
  if (next.message !== null && (next.state === 'fehler' || next.state === 'offline')) {
    const changed =
      next.state === 'offline'
        ? lastSettled !== 'offline'
        : current.state !== next.state || current.message !== next.message
    if (changed) logError('Sync', next.message)
  }
  if (next.state !== 'laeuft') lastSettled = next.state
  current = next
  for (const listener of [...listeners]) listener()
}

/** Zuletzt geprüfte `secondbrain.json`: `sha` (null = Datei fehlt) und Meldung, falls Schreiben gesperrt ist. */
interface FormatCheck {
  sha: string | null
  problem: string | null
}

let formatCheck: FormatCheck | null = null

export const getFormatCheck = (): FormatCheck | null => formatCheck

export function setFormatCheck(check: FormatCheck | null): void {
  formatCheck = check
}

/** Meldung, solange das Daten-Repo ein nicht unterstütztes Format hat; sonst `null`. */
export const getDataFormatProblem = (): string | null => formatCheck?.problem ?? null

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Setzt den Status zurück (für Tests). */
export function resetSyncStatus(): void {
  formatCheck = null
  setSyncStatus(INITIAL)
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus)
}
