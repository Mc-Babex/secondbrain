import {
  completeItem,
  completeProject,
  restoreItem,
  deleteItem,
  removeCheckedShoppingItems,
  updateItem,
} from '../data/repository'
import type { Item } from '../data/types'
import { wasConnected } from './auth'
import { createEvent, deleteEvent, updateEventTime } from './calendar'
import { assertNotSeries, isSeriesEvent } from './seriesGuard'
import { GoogleError, googleErrorMessage } from './types'

export const EVENT_REMOVED_MESSAGE = 'Termin entfernt'
export const OFFLINE_DELETE_MESSAGE =
  'Offline – der Google-Termin kann gerade nicht gelöscht werden.'
const NOT_CONNECTED_REASON = 'Google nicht verbunden.'
const SERIES_REASON = 'Serientermin.'

function eventIdOf(item: Item): string | null {
  return item.schedule?.calendarEventId || null
}

/** Verständliche Meldung, wenn der Google-Termin beim Löschen nicht entfernt werden konnte. */
export function deleteEventErrorMessage(error: unknown): string {
  if (error instanceof GoogleError && error.kind === 'offline') {
    return OFFLINE_DELETE_MESSAGE
  }
  return googleErrorMessage(error)
}

/** Hat der Eintrag einen Google-Termin? */
export function hasCalendarEvent(item: Item): boolean {
  return eventIdOf(item) !== null
}

/**
 * Löscht den Eintrag samt Google-Termin (zuerst Google, dann lokal). Ohne Termin nur lokal.
 * Hängt der Eintrag an einer Serie, bleibt die Serie bestehen (nur der Eintrag wird gelöscht).
 * Google-Fehler werden weitergereicht und lassen den Eintrag unangetastet.
 */
export async function deleteItemWithEvent(item: Item): Promise<void> {
  const eventId = eventIdOf(item)
  if (eventId && !(await isSeriesEvent(eventId))) await deleteEvent(eventId)
  await deleteItem(item.id)
}

export const RESTORE_FAILED_MESSAGE =
  'Termin konnte nicht wiederhergestellt werden – über die Uhr neu planen.'

/** Termin, der beim Erledigen aus Google entfernt wurde (für „Rückgängig“). */
export interface RemovedSchedule {
  start: string
  durationMin: number
}

export interface CompleteResult {
  note: string | null
  removed: RemovedSchedule | null
}

/**
 * Erledigt den Eintrag. Liegt sein Termin in der Zukunft und ist Google verbunden, wird der Termin gelöscht
 * (`schedule: null`, in derselben lokalen Änderung wie das Erledigen). Wartet nie auf eine Anmeldung.
 */
export async function completeItemWithEvent(
  item: Item,
  now: Date = new Date(),
): Promise<CompleteResult> {
  const eventId = eventIdOf(item)
  const schedule = item.schedule
  const start = schedule ? Date.parse(schedule.start) : Number.NaN
  if (!eventId || !schedule || !(start > now.getTime())) {
    await completeItem(item.id)
    return { note: null, removed: null }
  }
  let reason: string | null = null
  if (!wasConnected()) {
    reason = NOT_CONNECTED_REASON
  } else {
    try {
      if (await isSeriesEvent(eventId, { interactive: false })) reason = SERIES_REASON
      else await deleteEvent(eventId, { interactive: false })
    } catch (error) {
      reason = googleErrorMessage(error)
    }
  }
  if (reason !== null) {
    await completeItem(item.id)
    return { note: `Termin bleibt im Kalender – ${reason}`, removed: null }
  }
  await completeItem(item.id, { clearSchedule: true })
  return {
    note: EVENT_REMOVED_MESSAGE,
    removed: { start: schedule.start, durationMin: schedule.durationMin },
  }
}

/**
 * Schließt ein Projekt ab (SPEC §6.6: je Schritt wie ✓ Erledigt): Für jeden offenen Schritt mit künftigem
 * Termin wird zuerst der Google-Termin gelöscht und `schedule` geleert; begonnene oder vergangene Termine
 * bleiben. Fehlt die Verbindung oder schlägt Google fehl, wird trotzdem abgeschlossen (die Termine bleiben)
 * und ein Hinweis zurückgegeben. Wartet nie auf eine Anmeldung.
 */
export async function completeProjectWithEvents(
  projectId: string,
  items: readonly Item[],
  now: Date = new Date(),
): Promise<string | null> {
  const upcoming = items.filter(
    (i) =>
      i.projectId === projectId &&
      i.type === 'aufgabe' &&
      i.status === 'offen' &&
      eventIdOf(i) !== null &&
      Date.parse(i.schedule?.start ?? '') > now.getTime(),
  )
  let reason: string | null = null
  let removed = 0
  if (upcoming.length > 0 && !wasConnected()) {
    reason = NOT_CONNECTED_REASON
  } else {
    for (const step of upcoming) {
      const eventId = eventIdOf(step)
      if (eventId === null) continue
      try {
        if (await isSeriesEvent(eventId, { interactive: false })) {
          reason = SERIES_REASON
          continue
        }
        await deleteEvent(eventId, { interactive: false })
        await updateItem(step.id, { schedule: null })
        removed += 1
      } catch (error) {
        reason = googleErrorMessage(error)
        break
      }
    }
  }
  await completeProject(projectId)
  const parts: string[] = []
  if (removed > 0) parts.push(removed === 1 ? EVENT_REMOVED_MESSAGE : 'Termine entfernt')
  if (reason !== null) parts.push(`Termin bleibt im Kalender – ${reason}`)
  return parts.length === 0 ? null : parts.join('. ')
}

/**
 * „Rückgängig“ nach dem Erledigen: stellt den Eintrag wieder her und legt einen beim Erledigen entfernten,
 * noch zukünftigen Termin neu an (ohne Popup). Scheitert das, bleibt der Eintrag wiederhergestellt und
 * ein Hinweis wird zurückgegeben.
 */
export async function restoreItemWithEvent(
  id: string,
  removed: RemovedSchedule | null,
  now: Date = new Date(),
): Promise<string | null> {
  const item = await restoreItem(id)
  if (!removed || !(Date.parse(removed.start) > now.getTime())) return null
  try {
    if (!wasConnected()) throw new Error('nicht verbunden')
    const eventId = await createEvent(
      { title: item.title, start: removed.start, durationMin: removed.durationMin, itemId: id },
      { interactive: false },
    )
    await updateItem(id, { schedule: { ...removed, calendarEventId: eventId } })
    return null
  } catch {
    return RESTORE_FAILED_MESSAGE
  }
}

/**
 * „Ausgewählte eingekauft“: löscht zuerst die Termine der abgehakten Artikel (Fehler verhindern das
 * Löschen nicht), danach die Artikel. Gibt einen Hinweis zurück, wenn Termine bleiben.
 */
export async function removeCheckedWithEvents(checked: readonly Item[]): Promise<string | null> {
  const withEvents = checked.map(eventIdOf).filter((id): id is string => id !== null)
  let reason: string | null = null
  if (withEvents.length > 0) {
    if (!wasConnected()) {
      reason = NOT_CONNECTED_REASON
    } else {
      for (const id of withEvents) {
        try {
          if (await isSeriesEvent(id, { interactive: false })) reason = SERIES_REASON
          else await deleteEvent(id, { interactive: false })
        } catch (error) {
          reason = googleErrorMessage(error)
          break
        }
      }
    }
  }
  await removeCheckedShoppingItems()
  return reason === null ? null : `Termin bleibt im Kalender – ${reason}`
}

/**
 * Legt den Termin an bzw. verschiebt ihn und speichert danach `schedule` am Item. Hängt der Eintrag an einer
 * Serie, wird nichts geändert (`GoogleError('series')`).
 */
export async function scheduleItem(item: Item, start: string, durationMin: number): Promise<void> {
  const create = (): Promise<string> =>
    createEvent({ title: item.title, start, durationMin, itemId: item.id })

  const existingId = eventIdOf(item)
  let eventId: string
  if (existingId) {
    await assertNotSeries(existingId)
    try {
      await updateEventTime(existingId, start, durationMin)
      eventId = existingId
    } catch (error) {
      if (!(error instanceof GoogleError) || error.kind !== 'notFound') throw error
      eventId = await create()
    }
  } else {
    eventId = await create()
  }
  await updateItem(item.id, {
    schedule: { ...item.schedule, start, durationMin, calendarEventId: eventId },
    durationMin,
  })
}

/**
 * Verschiebt den Termin eines Eintrags aus dem Bearbeiten-Dialog (ohne Anmeldefenster). Gibt einen
 * Hinweis zurück, wenn das nicht geklappt hat; dann bleiben Termin und `schedule` unverändert.
 */
export async function moveItemEvent(
  item: Item,
  start: string,
  durationMin: number,
): Promise<string | null> {
  if (!wasConnected()) return NOT_CONNECTED_REASON
  try {
    await scheduleItem(item, start, durationMin)
    return null
  } catch (error) {
    return googleErrorMessage(error)
  }
}
