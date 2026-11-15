import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Item } from '../../data/types'
import { moveEvent } from '../../google/eventActions'
import {
  GoogleError,
  googleErrorMessage,
  type CalendarEvent,
  type SendUpdates,
} from '../../google/types'
import { formatDateTime, formatDuration } from '../../lib/format'
import { toIso } from '../../lib/time'
import type { DragChange } from './useTileDrag'

export const UNDO_MS = 5000
const GENERIC_ERROR = 'Das hat nicht geklappt. Bitte versuche es erneut.'

/** Kurzmeldung unten mit optionalem „Rückgängig“. */
export interface MoveToast {
  text: string
  error: boolean
  undo: (() => void) | null
}

/** Verschieben/Dauer wartet auf die Antwort der Gäste-Rückfrage. */
export interface PendingMove {
  event: CalendarEvent
  change: DragChange
}

interface Place {
  start: string
  durationMin: number
}

const endIso = (place: Place): string =>
  toIso(new Date(Date.parse(place.start) + place.durationMin * 60_000))

function currentPlace(event: CalendarEvent): Place {
  return {
    start: event.start,
    durationMin: Math.round((Date.parse(event.end) - Date.parse(event.start)) / 60_000),
  }
}

function moveText(change: DragChange): string {
  return change.mode === 'resize'
    ? `Dauer: ${formatDuration(change.durationMin)}`
    : `Verschoben auf ${formatDateTime(change.start)}`
}

/**
 * Speichern, Rückgängig und Rückfrage für gezogene Termine (SPEC §6.2). Die Termine werden sofort an der neuen Stelle
 * gezeigt (`events`), bis die neu geladene Liste da ist; ein Fehler setzt sie zurück.
 */
export function useEventMoves(
  events: CalendarEvent[],
  itemFor: (event: CalendarEvent) => Item | null,
  reload: () => void,
) {
  // Vorläufig gezeigte Termine gelten nur für die Terminliste, bei der sie entstanden sind.
  const [overrides, setOverrides] = useState<{
    base: CalendarEvent[]
    byId: Record<string, CalendarEvent>
  }>({ base: events, byId: {} })
  const [toast, setToast] = useState<MoveToast | null>(null)
  const [pending, setPending] = useState<PendingMove | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef({ events, itemFor, reload })
  useEffect(() => {
    latest.current = { events, itemFor, reload }
  })
  useEffect(() => () => clearTimeout(timer.current), [])

  const shown = useMemo(
    () =>
      overrides.base === events ? events.map((event) => overrides.byId[event.id] ?? event) : events,
    [events, overrides],
  )

  const showToast = useCallback((next: MoveToast | null) => {
    clearTimeout(timer.current)
    setToast(next)
    if (next) timer.current = setTimeout(() => setToast(null), UNDO_MS)
  }, [])

  /** Speichert; gibt zurück, ob es geklappt hat. */
  const perform = useCallback(
    async (event: CalendarEvent, place: Place, sendUpdates: SendUpdates): Promise<boolean> => {
      const target = { ...event, start: place.start, end: endIso(place) }
      const base = latest.current.events
      setOverrides((prev) => ({
        base,
        byId: { ...(prev.base === base ? prev.byId : {}), [event.id]: target },
      }))
      try {
        await moveEvent(event, place, { sendUpdates, item: latest.current.itemFor(event) })
        latest.current.reload()
        return true
      } catch (error) {
        setOverrides((prev) => {
          const byId = { ...prev.byId }
          delete byId[event.id]
          return { ...prev, byId }
        })
        const text = error instanceof GoogleError ? googleErrorMessage(error) : GENERIC_ERROR
        showToast({ text, error: true, undo: null })
        return false
      }
    },
    [showToast],
  )

  const apply = useCallback(
    async (event: CalendarEvent, change: DragChange, sendUpdates: SendUpdates): Promise<void> => {
      const before = currentPlace(event)
      const place = { start: change.start, durationMin: change.durationMin }
      if (!(await perform(event, place, sendUpdates))) return
      const moved = { ...event, start: place.start, end: endIso(place) }
      showToast({
        text: moveText(change),
        error: false,
        undo: () => {
          showToast(null)
          void perform(moved, before, sendUpdates)
        },
      })
    },
    [perform, showToast],
  )

  const commit = useCallback(
    (event: CalendarEvent, change: DragChange): void => {
      if (event.hasGuests) setPending({ event, change })
      else void apply(event, change, 'none')
    },
    [apply],
  )

  const answer = useCallback(
    (sendUpdates: SendUpdates | null): void => {
      const current = pending
      setPending(null)
      if (current && sendUpdates) void apply(current.event, current.change, sendUpdates)
    },
    [apply, pending],
  )

  return { shown, commit, toast, pending, answer }
}
