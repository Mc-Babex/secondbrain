import { useEffect, useState } from 'react'
import form from '../../components/Form.module.css'
import { getSecret } from '../../data/localStore'
import { requestPersistentStorage, type PersistResult } from '../../data/persistentStorage'
import { listItems } from '../../data/repository'
import { syncNow } from '../../data/sync'
import { getSyncStatus } from '../../data/syncStatus'
import { hasClientId, wasConnected } from '../../google/auth'
import { useGoogleConnected } from '../../google/hooks'
import { connectGoogle } from './googleConnect'
import { Section } from './Section'
import { SetupGithubStep } from './SetupGithubStep'
import { isSetupSyncDone, markSetupSyncDone } from './setupState'
import styles from './SettingsPage.module.css'

const PERSIST_TEXTS: Record<PersistResult, string> = {
  persistent: 'Daten werden dauerhaft gespeichert.',
  volatile:
    'iOS kann den Speicher leeren – deine Daten liegen sicher im GitHub-Repo und werden neu geladen.',
  unsupported: 'Dauerhafter Speicher wird auf diesem Gerät nicht unterstützt.',
}

interface SetupSectionProps {
  /** Wird nach gespeichertem Token aufgerufen, damit der GitHub-Abschnitt neu lädt. */
  onGithubSaved: () => void
}

function StepHeading({ number, title, state }: { number: string; title: string; state: string }) {
  return (
    <h3 className={styles.stepTitle}>
      <span>
        {number} {title}
      </span>
      <span className={styles.stepState}>{state}</span>
    </h3>
  )
}

/** Geführte Einrichtung (SPEC §6.5): erscheint, solange GitHub, Google oder der erste Abgleich fehlen. */
export function SetupSection({ onGithubSaved }: SetupSectionProps) {
  const googleConnected = useGoogleConnected()
  const [loaded, setLoaded] = useState(false)
  const [repo, setRepo] = useState('')
  const [token, setToken] = useState<string | undefined>(undefined)
  const [syncDone, setSyncDone] = useState(isSetupSyncDone)
  const [latched, setLatched] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncMessage, setSyncMessage] = useState<{ ok: boolean; lines: string[] } | null>(null)

  useEffect(() => {
    let active = true
    void Promise.all([getSecret('githubRepo'), getSecret('githubToken')]).then(
      ([savedRepo, savedToken]) => {
        if (!active) return
        if (savedRepo) setRepo(savedRepo)
        setToken(savedToken)
        // Bestandsgerät: GitHub und Google sind schon eingerichtet, die Einrichtung gilt als erledigt.
        if (savedToken && wasConnected() && !isSetupSyncDone()) {
          markSetupSyncDone()
          setSyncDone(true)
        }
        setLoaded(true)
      },
      () => {
        if (active) setLoaded(true)
      },
    )
    return () => {
      active = false
    }
  }, [])

  const incomplete = !token || !googleConnected || !syncDone
  // Einmal sichtbar, bleibt der Abschnitt bis zum Schließen der Seite, damit das Ergebnis lesbar bleibt.
  if (loaded && incomplete && !latched) setLatched(true)

  const runSync = async (): Promise<void> => {
    setSyncBusy(true)
    setSyncMessage(null)
    try {
      await syncNow()
      const status = getSyncStatus()
      if (status.state !== 'synchron') {
        setSyncMessage({
          ok: false,
          lines: [status.message ?? 'Der Abgleich war nicht erfolgreich.'],
        })
        return
      }
      const count = (await listItems()).length
      const persisted = await requestPersistentStorage()
      markSetupSyncDone()
      setSyncDone(true)
      setSyncMessage({
        ok: true,
        lines: [
          count === 1 ? '1 Eintrag geladen.' : `${count} Einträge geladen.`,
          PERSIST_TEXTS[persisted],
        ],
      })
    } catch {
      setSyncMessage({
        ok: false,
        lines: ['Der Abgleich ist fehlgeschlagen. Bitte versuche es erneut.'],
      })
    } finally {
      setSyncBusy(false)
    }
  }

  const onConnected = (): void => {
    void getSecret('githubToken').then((saved) => {
      setToken(saved)
      onGithubSaved()
      void runSync()
    })
  }

  const connect = async (): Promise<void> => {
    setGoogleBusy(true)
    setGoogleError(await connectGoogle())
    setGoogleBusy(false)
  }

  if (!loaded || (!incomplete && !latched)) return null

  const clientIdMissing = !hasClientId()
  let syncState = 'offen'
  if (syncDone) syncState = 'erledigt ✓'
  else if (syncMessage && !syncMessage.ok) syncState = 'Fehler'

  return (
    <Section title="Einrichtung">
      <ol className={styles.steps}>
        <li>
          <StepHeading number="①" title="GitHub" state={token ? 'erledigt ✓' : 'offen'} />
          <SetupGithubStep initialRepo={repo} storedToken={token} onConnected={onConnected} />
        </li>
        <li>
          <StepHeading number="②" title="Google" state={googleConnected ? 'erledigt ✓' : 'offen'} />
          <div className={styles.stepBody}>
            {clientIdMissing && (
              <p className={styles.hint}>
                Google-Client-ID fehlt (VITE_GOOGLE_CLIENT_ID). Ohne sie ist keine Verbindung
                möglich.
              </p>
            )}
            <div role="status" aria-live="polite">
              {googleConnected && <p className={styles.ok}>Mit Google verbunden.</p>}
              {googleError && <p className={form.error}>{googleError}</p>}
            </div>
            {!googleConnected && (
              <div className={form.actions}>
                <button
                  type="button"
                  className={`${form.button} ${form.primary}`}
                  disabled={googleBusy || clientIdMissing}
                  onClick={() => void connect()}
                >
                  Mit Google verbinden
                </button>
              </div>
            )}
          </div>
        </li>
        <li>
          <StepHeading number="③" title="Erster Abgleich" state={syncState} />
          <div className={styles.stepBody}>
            <div role="status" aria-live="polite">
              {syncMessage?.lines.map((line) => (
                <p key={line} className={syncMessage.ok ? styles.ok : form.error}>
                  {line}
                </p>
              ))}
            </div>
            <div className={form.actions}>
              <button
                type="button"
                className={form.button}
                disabled={syncBusy || !token}
                onClick={() => void runSync()}
              >
                Jetzt abgleichen
              </button>
            </div>
          </div>
        </li>
      </ol>
    </Section>
  )
}
