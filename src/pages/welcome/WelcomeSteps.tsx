import { useState, type ReactNode } from 'react'
import form from '../../components/Form.module.css'
import { hasClientId } from '../../google/auth'
import { useGoogleConnected } from '../../google/hooks'
import { TEMPLATE_REPO_URL, TESTER_GUIDE_URL, TOKEN_URL } from '../../lib/links'
import { connectGoogle } from '../settings/googleConnect'
import { SetupGithubStep } from '../settings/SetupGithubStep'
import styles from './Welcome.module.css'

function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className={styles.link} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

export function IntroStep() {
  return (
    <>
      <p className={styles.text}>
        SecondBrain hilft dir, Gedanken sofort festzuhalten, sie in Ablagen zu sortieren und
        Aufgaben in deinen Kalender einzuplanen.
      </p>
      <p className={styles.text}>
        Deine Daten liegen in deinem eigenen privaten GitHub-Repo und auf diesem Gerät. Der
        Entwickler der App sieht sie nicht.
      </p>
      <p className={styles.text}>Die Einrichtung dauert nur wenige Minuten.</p>
    </>
  )
}

interface RepoStepProps {
  token: string | undefined
  onConnected: () => void
  onDirtyChange: (dirty: boolean) => void
}

export function RepoStep({ token, onConnected, onDirtyChange }: RepoStepProps) {
  return (
    <>
      <ol className={styles.list}>
        <li>
          <External href={TEMPLATE_REPO_URL}>Daten-Repo aus Vorlage anlegen</External>
          <p className={styles.hint}>Wähle dabei „Private“, damit nur du die Daten siehst.</p>
        </li>
        <li>
          <External href={TOKEN_URL}>Token erstellen</External>
          <p className={styles.hint}>
            Wähle unter „Repository access“ nur dieses Repo. Der Ablauf ist auf 11 Monate gesetzt.
          </p>
        </li>
        <li>Trage Repo und Token unten ein und teste die Verbindung.</li>
      </ol>
      <SetupGithubStep
        initialRepo=""
        storedToken={token}
        onConnected={onConnected}
        onDirtyChange={onDirtyChange}
        hideGuide
      />
    </>
  )
}

export function GoogleStep() {
  const connected = useGoogleConnected()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const clientIdMissing = !hasClientId()

  const connect = async (): Promise<void> => {
    setBusy(true)
    setError(await connectGoogle())
    setBusy(false)
  }

  return (
    <>
      <p className={styles.text}>
        Mit deinem Google-Konto plant die App Aufgaben als Termine in deinen Kalender ein und zeigt
        dort vorhandene Termine an.
      </p>
      <p className={styles.hint}>
        Google meldet im Testbetrieb „App nicht verifiziert“. Das ist normal: Wähle „Erweitert“ und
        dann „Weiter zu …“.
      </p>
      {clientIdMissing && (
        <p className={styles.hint}>
          Google-Client-ID fehlt (VITE_GOOGLE_CLIENT_ID). Ohne sie ist keine Verbindung möglich.
        </p>
      )}
      <div role="status" aria-live="polite">
        {connected && <p className={styles.ok}>Mit Google verbunden.</p>}
        {error && <p className={form.error}>{error}</p>}
      </div>
      {!connected && !clientIdMissing && (
        <div>
          <button
            type="button"
            className={`${form.button} ${form.primary}`}
            disabled={busy}
            onClick={() => void connect()}
          >
            Mit Google verbinden
          </button>
        </div>
      )}
    </>
  )
}

export function AutoSortStep() {
  return (
    <>
      <p className={styles.text}>
        Ohne Claude sortierst du neue Einträge selbst über „In Ablage…“.
      </p>
      <p className={styles.text}>
        Mit deinem eigenen Claude-Abo kann Claude den Eingangskorb für dich sortieren – du startest
        es mit „Jetzt sortieren“.
      </p>
      <p className={styles.text}>
        <External href={TESTER_GUIDE_URL}>Anleitung</External>
      </p>
    </>
  )
}
