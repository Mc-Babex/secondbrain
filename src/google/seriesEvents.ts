import {
  skipSeriesInstance,
  updateSeriesRecomputing,
  type SeriesFields,
  type SkipResult,
} from '../data/repository'
import type { Item, Project } from '../data/types'
import { wasConnected } from './auth'
import { deleteEvent } from './calendar'
import { isSeriesEvent } from './seriesGuard'
import { googleErrorMessage } from './types'

/**
 * Entfernt die künftigen Google-Termine gelöschter Serien-Instanzen (wie SPEC §6.6, ohne Anmeldefenster).
 * Scheitert das, ist die Instanz trotzdem gelöscht; zurück kommt dann ein Hinweis.
 */
export async function removeFutureEvents(
  items: readonly Item[],
  now: Date = new Date(),
): Promise<string | null> {
  const upcoming = items.filter(
    (i) => i.schedule?.calendarEventId && Date.parse(i.schedule.start) > now.getTime(),
  )
  if (upcoming.length === 0) return null
  if (!wasConnected()) return 'Termin bleibt im Kalender – Google nicht verbunden.'
  for (const item of upcoming) {
    const eventId = item.schedule?.calendarEventId
    if (!eventId) continue
    try {
      if (await isSeriesEvent(eventId, { interactive: false })) {
        return 'Termin bleibt im Kalender – Serientermin.'
      }
      await deleteEvent(eventId, { interactive: false })
    } catch (error) {
      return `Termin bleibt im Kalender – ${googleErrorMessage(error)}`
    }
  }
  return null
}

/** Serie bearbeiten; offene Blätter werden neu berechnet, künftige Google-Termine gelöschter Blätter entfernt. */
export async function updateSeriesWithEvents(
  projectId: string,
  seriesId: string,
  fields: Partial<SeriesFields>,
): Promise<{ project: Project; note: string | null }> {
  const { project, removed } = await updateSeriesRecomputing(projectId, seriesId, fields)
  return { project, note: await removeFutureEvents(removed) }
}

/** „Fällt aus“ an einer Instanz; nachrückende, nun gelöschte künftige Blätter verlieren ihre Google-Termine. */
export async function skipInstanceWithEvents(
  itemId: string,
): Promise<{ result: SkipResult; note: string | null }> {
  const result = await skipSeriesInstance(itemId)
  return { result, note: await removeFutureEvents(result.removed) }
}
