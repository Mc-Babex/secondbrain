import { useEffect, useState, useSyncExternalStore } from 'react'
import form from '../../components/Form.module.css'
import { getAccountName, hasClientId, subscribeAuth } from '../../google/auth'
import { useGoogleConnected } from '../../google/hooks'
import { listInvalidPaths, subscribe } from '../../data/repository'
import { syncNow } from '../../data/sync'
import { useSyncStatus, type SyncState } from '../../data/syncStatus'
import { formatDateTime } from '../../lib/format'
import { Section } from './Section'
import styles from './SettingsPage.module.css'

const STATE_TEXTS: Record<SyncState, string> = {
  nichtEingerichtet: 'Nicht eingerichtet',
  synchron: 'Synchron',
  laeuft: 'Synchronisiere …',
  ausstehend: 'Änderungen ausstehend',
  offline: 'Offline',
  fehler: 'Fehler',
}

function googleStatusText(connected: boolean, account: string | null): string {
  if (connected) return account ? `Verbunden (${account})` : 'Verbunden'
  return hasClientId() ? 'Nicht verbunden' : 'Client-ID fehlt'
}

export function InfoSection() {
  const googleConnected = useGoogleConnected()
  const account = useSyncExternalStore(subscribeAuth, getAccountName)
  const status = useSyncStatus()
  const [, setTick] = useState(0)
  useEffect(() => subscribe(() => setTick((tick) => tick + 1)), [])
  const invalid = listInvalidPaths()

  return (
    <Section title="Info">
      <dl className={styles.info}>
        <dt>Version</dt>
        <dd>{`${__APP_VERSION__} · Build ${__BUILD_STAMP__}`}</dd>
        <dt>Sync-Status</dt>
        <dd>{STATE_TEXTS[status.state]}</dd>
        <dt>Google</dt>
        <dd>{googleStatusText(googleConnected, account)}</dd>
        <dt>Ausstehende Änderungen</dt>
        <dd>{status.pending}</dd>
        <dt>Letzter Sync</dt>
        <dd>{status.lastSync ? formatDateTime(status.lastSync) : 'noch nie'}</dd>
      </dl>
      {status.message && <p className={styles.hint}>{status.message}</p>}
      {invalid.length > 0 && (
        <div>
          <p className={form.error}>
            Diese Dateien haben ein ungültiges Format und werden nicht angezeigt. Sie bleiben
            unverändert erhalten.
          </p>
          <ul>
            {invalid.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </div>
      )}
      <div className={form.actions}>
        <button
          type="button"
          className={form.button}
          disabled={status.state === 'laeuft'}
          onClick={() => void syncNow()}
        >
          Jetzt synchronisieren
        </button>
      </div>
    </Section>
  )
}
