import { useEffect, useState, useSyncExternalStore } from 'react'
import form from '../../components/Form.module.css'
import {
  disconnect,
  getAccountName,
  hasClientId,
  loadGoogleScript,
  subscribeAuth,
} from '../../google/auth'
import { useGoogleConnected } from '../../google/hooks'
import { connectGoogle, connectionError } from './googleConnect'
import { Section } from './Section'
import styles from './SettingsPage.module.css'

export function GoogleSection() {
  const connected = useGoogleConnected()
  const accountName = useSyncExternalStore(subscribeAuth, getAccountName)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const clientIdMissing = !hasClientId()

  // Skript vorab laden, damit die Token-Anfrage beim Klick noch im Nutzerkontext (Popup-Blocker) läuft.
  useEffect(() => {
    if (hasClientId()) loadGoogleScript().catch(() => undefined)
  }, [])

  const connect = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setError(await connectGoogle())
    setBusy(false)
  }

  const leave = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await disconnect()
    } catch (caught) {
      setError(connectionError(caught))
    } finally {
      setBusy(false)
    }
  }

  let status = 'Nicht verbunden'
  if (connected) status = accountName ? `Verbunden: ${accountName}` : 'Verbunden'

  return (
    <Section title="Google">
      <p role="status" aria-live="polite">
        {status}
      </p>
      {clientIdMissing && (
        <p className={styles.hint}>
          Google-Client-ID fehlt (VITE_GOOGLE_CLIENT_ID). Ohne sie ist keine Verbindung möglich.
        </p>
      )}
      {error && (
        <p className={form.error} role="alert">
          {error}
        </p>
      )}
      <div className={form.actions}>
        {connected && (
          <button
            type="button"
            className={`${form.button} ${form.danger}`}
            disabled={busy}
            onClick={() => void leave()}
          >
            Trennen
          </button>
        )}
        <button
          type="button"
          className={`${form.button} ${form.primary}`}
          disabled={busy || clientIdMissing}
          onClick={() => void connect()}
        >
          {connected ? 'Erneut verbinden' : 'Mit Google verbinden'}
        </button>
      </div>
    </Section>
  )
}
