import { useEffect, useRef, useState } from 'react'
import form from '../../components/Form.module.css'
import { getSecret } from '../../data/localStore'
import { setPendingAutoSort } from '../../data/pendingAutoSort'
import { syncNow } from '../../data/sync'
import { getSyncStatus } from '../../data/syncStatus'
import { useGoogleConnected } from '../../google/hooks'
import { useUnsavedWork } from '../../lib/unsavedWork'
import { AutoSortStep, GoogleStep, IntroStep, RepoStep } from './WelcomeSteps'
import styles from './Welcome.module.css'

const TITLES = ['Willkommen', 'Daten-Repo verbinden', 'Google-Kalender', 'Automatisch sortieren']

type Step = 1 | 2 | 3 | 4

interface WelcomeProps {
  onFinish: () => void
}

/** Geführte Ersteinrichtung (SPEC §6.5) mit vier Schritten, Vollbild statt der Seiten. */
export function Welcome({ onFinish }: WelcomeProps) {
  const [step, setStep] = useState<Step>(1)
  const [token, setToken] = useState<string | undefined>(undefined)
  const [dirty, setDirty] = useState(false)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const googleConnected = useGoogleConnected()
  const headingRef = useRef<HTMLHeadingElement>(null)
  useUnsavedWork('welcome', step === 2 && dirty)

  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  const go = (next: Step): void => {
    setStep(next)
  }

  const connected = (): void => {
    void getSecret('githubToken').then(setToken)
    setSyncNote(null)
    void syncNow()
      .then(() => {
        const status = getSyncStatus()
        if (status.state !== 'synchron') {
          setSyncNote(status.message ?? 'Der erste Abgleich war nicht erfolgreich.')
        }
      })
      .catch(() =>
        setSyncNote('Der erste Abgleich ist fehlgeschlagen. Du kannst ihn später wiederholen.'),
      )
    go(3)
  }

  // Die Wahl wird nur vorgemerkt und nach dem ersten erfolgreichen Abgleich geschrieben (pendingAutoSort).
  const choose = (autoSort: boolean): void => {
    setPendingAutoSort(autoSort)
    onFinish()
  }

  const skipLabel = (done: boolean): string => (done ? 'Weiter' : 'Später')

  return (
    <div className={styles.welcome}>
      <div className={styles.inner}>
        <p className={styles.progress}>Schritt {step} von 4</p>
        <h1 ref={headingRef} className={styles.heading} tabIndex={-1}>
          {TITLES[step - 1]}
        </h1>
        {step === 1 && <IntroStep />}
        {step === 2 && <RepoStep token={token} onConnected={connected} onDirtyChange={setDirty} />}
        {step === 3 && <GoogleStep />}
        {step === 4 && <AutoSortStep />}
        <div role="status" aria-live="polite">
          {syncNote && step >= 3 && <p className={styles.hint}>{syncNote}</p>}
        </div>
        <div className={styles.footer}>
          {step > 1 && (
            <button type="button" className={form.button} onClick={() => go((step - 1) as Step)}>
              Zurück
            </button>
          )}
          <div className={styles.footerEnd}>
            {step === 1 && (
              <button
                type="button"
                className={`${form.button} ${form.primary}`}
                onClick={() => go(2)}
              >
                Los geht’s
              </button>
            )}
            {step === 2 && (
              <button type="button" className={form.button} onClick={() => go(3)}>
                {skipLabel(token !== undefined)}
              </button>
            )}
            {step === 3 && (
              <button type="button" className={form.button} onClick={() => go(4)}>
                {skipLabel(googleConnected)}
              </button>
            )}
            {step === 4 && (
              <>
                <button type="button" className={form.button} onClick={() => choose(false)}>
                  Ohne Claude weiter
                </button>
                <button
                  type="button"
                  className={`${form.button} ${form.primary}`}
                  onClick={() => choose(true)}
                >
                  Ich richte Claude ein
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
