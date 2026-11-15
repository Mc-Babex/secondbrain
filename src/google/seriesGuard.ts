import { getEvent } from './calendar'
import { GoogleError } from './types'

/** Meldung, wenn ein Eintrag an einem Serientermin hängt und die App ihn nicht ändert. */
export const SERIES_HINT = 'Serientermin – im Kalender bearbeiten'

/**
 * Ist der Google-Termin eine Serie oder ein Serien-Vorkommen? Schützt davor, dass Aktionen eines Eintrags
 * (umbenennen, verschieben, löschen) stillschweigend die ganze Serie treffen. Ein nicht mehr vorhandener
 * Termin zählt als „keine Serie“; andere Fehler werden weitergereicht (dann bleibt der Termin unberührt).
 */
export async function isSeriesEvent(
  eventId: string,
  options: { interactive?: boolean } = {},
): Promise<boolean> {
  try {
    const event = await getEvent(eventId, options)
    return event.recurrence !== undefined || event.recurringEventId !== undefined
  } catch (error) {
    if (error instanceof GoogleError && error.kind === 'notFound') return false
    throw error
  }
}

/** Wirft `GoogleError('series')`, wenn der Termin zu einer Serie gehört. */
export async function assertNotSeries(
  eventId: string,
  options: { interactive?: boolean } = {},
): Promise<void> {
  if (await isSeriesEvent(eventId, options)) throw new GoogleError('series')
}
