import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { logError } from '../data/errorLog'
import { usePageVisible } from '../lib/pageActive'
import { subscribeAuth, wasConnected } from './auth'
import { listEvents } from './calendar'
import { GoogleError, googleErrorMessage, type CalendarEvent } from './types'

/** „War verbunden" laut lokalem Flag (reagiert auf Verbinden/Trennen). */
export function useGoogleConnected(): boolean {
  return useSyncExternalStore(subscribeAuth, wasConnected)
}

export type CalendarStatus = 'idle' | 'laedt' | 'bereit' | 'fehler'

export interface CalendarEventsState {
  events: CalendarEvent[]
  status: CalendarStatus
  error: string | null
  /** `interactive: true` nur aus einem Klick (darf dann ein Google-Fenster öffnen). */
  reload: (options?: { interactive?: boolean }) => void
}

const REFRESH_MS = 5 * 60_000
const RECONNECT_TEXT = 'Google-Verbindung abgelaufen – bitte „Erneut verbinden“ wählen.'

function errorText(error: unknown, interactive: boolean): string {
  if (!interactive && error instanceof GoogleError && error.kind === 'unauthorized') {
    return RECONNECT_TEXT
  }
  return googleErrorMessage(error)
}

/** Termine des primären Kalenders im Zeitraum; lädt nie interaktiv ohne Nutzeraktion. */
export function useCalendarEvents(
  range: { timeMin: string; timeMax: string } | null,
): CalendarEventsState {
  const connected = useGoogleConnected()
  // Abfragen laufen nur auf der sichtbaren Seite bei sichtbarem Dokument.
  const visible = usePageVisible()
  const timeMin = range?.timeMin
  const timeMax = range?.timeMax
  const key = timeMin && timeMax && connected ? `${timeMin}|${timeMax}` : null
  const [state, setState] = useState<{
    key: string | null
    events: CalendarEvent[]
    status: CalendarStatus
    error: string | null
  }>({ key: null, events: [], status: 'idle', error: null })
  const requestId = useRef(0)
  const interactiveId = useRef(0)

  const fetchEvents = useCallback(
    (interactive: boolean, background = false) => {
      if (!key || !timeMin || !timeMax) return
      if (
        background &&
        interactiveId.current !== 0 &&
        interactiveId.current === requestId.current
      ) {
        return
      }
      const id = ++requestId.current
      interactiveId.current = interactive ? id : 0
      listEvents(timeMin, timeMax, { interactive })
        .then((events) => {
          if (id === interactiveId.current) interactiveId.current = 0
          if (id === requestId.current) setState({ key, events, status: 'bereit', error: null })
        })
        .catch((error: unknown) => {
          if (id === interactiveId.current) interactiveId.current = 0
          if (id !== requestId.current) return
          const message = errorText(error, interactive)
          logError('Kalender', message)
          setState((prev) => ({
            key,
            events: prev.key === key ? prev.events : [],
            status: 'fehler',
            error: message,
          }))
        })
    },
    [key, timeMin, timeMax],
  )

  useEffect(() => {
    if (!key) {
      requestId.current++
      return undefined
    }
    if (!visible) return undefined
    fetchEvents(false)
    const refresh = (): void => fetchEvents(false, true)
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(refresh, REFRESH_MS)
    return () => {
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [key, visible, fetchEvents])

  const reload = useCallback(
    (options?: { interactive?: boolean }) => {
      if (!key) return
      setState((prev) => ({
        key,
        events: prev.key === key ? prev.events : [],
        status: 'laedt',
        error: null,
      }))
      fetchEvents(options?.interactive === true)
    },
    [key, fetchEvents],
  )

  if (!key) return { events: [], status: 'idle', error: null, reload }
  if (state.key !== key) return { events: [], status: 'laedt', error: null, reload }
  return { events: state.events, status: state.status, error: state.error, reload }
}
