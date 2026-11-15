import { updateItem } from '../../data/repository'
import type { Item } from '../../data/types'
import { deleteEvent, listEvents } from '../../google/calendar'
import { scheduleItem } from '../../google/itemEvents'
import { isSeriesEvent } from '../../google/seriesGuard'
import type { PlanningWindow } from '../../lib/planning'
import { busyFromEvents, dayStartFrom, nextFreeSlotFromDayStart } from '../../lib/slots'
import { toIso } from '../../lib/time'

const HORIZON_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_DURATION_MIN = 30

export const SERIES_STAYS_MESSAGE = 'Serie bleibt im Kalender'

/**
 * Entfernt den Termin aus dem Kalender und danach aus dem Item. Hängt der Eintrag an einer Serie, wird bei
 * Google nichts gelöscht; nur der Eintrag verliert `schedule` (Rückgabe: Hinweis „Serie bleibt im Kalender“).
 */
export async function unscheduleItem(item: Item): Promise<string | null> {
  const eventId = item.schedule?.calendarEventId
  let note: string | null = null
  if (eventId) {
    if (await isSeriesEvent(eventId)) note = SERIES_STAYS_MESSAGE
    else await deleteEvent(eventId)
  }
  await updateItem(item.id, { schedule: null })
  return note
}

/**
 * „Nicht erledigt“: verschiebt den Termin in den ersten freien Slot ab dem Tagesanfang (nie in die Pause).
 * Gibt den neuen Start (ISO) zurück oder `null`, wenn in 14 Tagen nichts frei ist (nichts geändert).
 */
export async function rescheduleAutomatically(
  item: Item,
  planningWindow: PlanningWindow,
  now: Date,
  pause: PlanningWindow | null = null,
): Promise<string | null> {
  const durationMin = item.schedule?.durationMin ?? item.durationMin ?? DEFAULT_DURATION_MIN
  const from = dayStartFrom(now, planningWindow)
  const until = new Date(from.getTime() + (HORIZON_DAYS + 1) * DAY_MS)
  const events = await listEvents(toIso(from), toIso(until))
  const busy = busyFromEvents(events, item.schedule?.calendarEventId)
  const slot = nextFreeSlotFromDayStart({
    now,
    window: planningWindow,
    pause,
    busy,
    durationMin,
  })
  if (slot === null) return null
  const start = toIso(slot)
  await scheduleItem(item, start, durationMin)
  return start
}
