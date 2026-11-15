import { logError } from '../../data/errorLog'
import { getAccessToken, setAccountName } from '../../google/auth'
import { getCalendarName } from '../../google/calendar'
import { GoogleError, googleErrorMessage } from '../../google/types'

/** Fehlermeldung; bei abgelaufenem Zugang mit Hinweis auf den Knopf. */
export function connectionError(caught: unknown): string {
  if (caught instanceof GoogleError && caught.kind === 'unauthorized') {
    return 'Google-Verbindung abgelaufen – bitte „Erneut verbinden“ wählen.'
  }
  return googleErrorMessage(caught)
}

/** Verbindet mit Google (nur aus einem Klick aufrufen); liefert `null` oder eine Fehlermeldung. */
export async function connectGoogle(): Promise<string | null> {
  try {
    await getAccessToken({ interactive: true })
    setAccountName(await getCalendarName())
    return null
  } catch (caught) {
    const message = connectionError(caught)
    logError('Google', message)
    return message
  }
}
