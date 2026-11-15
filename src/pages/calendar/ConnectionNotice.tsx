import { useEffect, useState } from 'react'
import form from '../../components/Form.module.css'
import { getAccessToken, hasClientId, loadGoogleScript } from '../../google/auth'
import { googleErrorMessage } from '../../google/types'
import styles from './CalendarPage.module.css'

/** Hinweis bzw. Verbinden-Knopf, solange Google nicht verbunden ist. */
export function ConnectionNotice() {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const clientIdMissing = !hasClientId()

  // Skript vorab laden, damit die Token-Anfrage beim Klick noch im Nutzerkontext läuft.
  useEffect(() => {
    if (hasClientId()) loadGoogleScript().catch(() => undefined)
  }, [])

  if (clientIdMissing) {
    return (
      <p className={styles.hint}>
        Google-Client-ID fehlt (VITE_GOOGLE_CLIENT_ID). Ohne sie ist keine Verbindung möglich.
      </p>
    )
  }

  const connect = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await getAccessToken({ interactive: true })
    } catch (caught) {
      setError(googleErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.notice}>
      <p className={styles.hint}>Verbinde Google, um deine Termine zu sehen.</p>
      {error && (
        <p className={form.error} role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className={`${form.button} ${form.primary}`}
        disabled={busy}
        onClick={() => void connect()}
      >
        Mit Google verbinden
      </button>
    </div>
  )
}
