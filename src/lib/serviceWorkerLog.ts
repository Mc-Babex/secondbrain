import { logError } from '../data/errorLog'

/** Protokolliert Service-Worker-Wechsel und Seiten-Wiederherstellung aus dem Cache (Diagnose „Anzeige“). */
export function installDisplayLogging(): () => void {
  const onPageShow = (event: PageTransitionEvent): void => {
    if (event.persisted)
      logError('Anzeige', 'pageshow: Seite aus dem Zwischenspeicher wiederhergestellt')
  }
  const onController = (): void => logError('Anzeige', 'Service Worker: controllerchange')
  window.addEventListener('pageshow', onPageShow)
  navigator.serviceWorker?.addEventListener('controllerchange', onController)
  return () => {
    window.removeEventListener('pageshow', onPageShow)
    navigator.serviceWorker?.removeEventListener('controllerchange', onController)
  }
}

const STAMP_KEY = 'secondbrain.buildStamp'

/** Vergleicht den Build-Stempel mit dem zuletzt gemerkten und protokolliert einen Versionswechsel. */
export function logVersionChange(stamp: string): void {
  let previous: string | null
  try {
    previous = localStorage.getItem(STAMP_KEY)
  } catch {
    return
  }
  if (previous === stamp) return
  logError(
    'Anzeige',
    previous === null
      ? `Version ${stamp} (erster Start mit Protokoll)`
      : `Neue Version aktiv (${previous} → ${stamp})`,
  )
  try {
    localStorage.setItem(STAMP_KEY, stamp)
  } catch {
    // Speicher nicht verfügbar: Wechsel wird beim nächsten Start erneut gemeldet.
  }
}
