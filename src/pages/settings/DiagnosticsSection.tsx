import { useEffect, useState, useSyncExternalStore } from 'react'
import form from '../../components/Form.module.css'
import { clearErrorLog, getErrorLog } from '../../data/errorLog'
import { loadGithubConfig } from '../../data/github'
import { listInvalidPaths } from '../../data/repository'
import { useSyncStatus } from '../../data/syncStatus'
import { subscribeAuth, wasConnected } from '../../google/auth'
import { buildDiagnosticsText, type DiagnosticsState } from '../../lib/diagnostics'
import { isStandalone } from '../../lib/platform'
import { isSpeechSupported } from '../../speech/recognizer'
import styles from './SettingsPage.module.css'

type Loaded = Pick<DiagnosticsState, 'githubRepo' | 'githubTokenPresent' | 'storage'>

const INITIAL: Loaded = {
  githubRepo: null,
  githubTokenPresent: false,
  storage: { persistent: null, usage: null, quota: null },
}

async function loadStorage(): Promise<Loaded['storage']> {
  const storage = navigator.storage as StorageManager | undefined
  try {
    const persistent = storage?.persisted ? await storage.persisted() : null
    const estimate = storage?.estimate ? await storage.estimate() : null
    return { persistent, usage: estimate?.usage ?? null, quota: estimate?.quota ?? null }
  } catch {
    return INITIAL.storage
  }
}

async function loadAsync(): Promise<Loaded> {
  const config = await loadGithubConfig().catch(() => null)
  return {
    githubRepo: config?.repo ?? null,
    githubTokenPresent: config !== null,
    storage: await loadStorage(),
  }
}

export function DiagnosticsSection() {
  const sync = useSyncStatus()
  const googleConnected = useSyncExternalStore(subscribeAuth, wasConnected)
  const [loaded, setLoaded] = useState<Loaded>(INITIAL)
  const [errors, setErrors] = useState(getErrorLog)
  const [feedback, setFeedback] = useState('')
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    let active = true
    void loadAsync().then((result) => {
      if (active) setLoaded(result)
    })
    return () => {
      active = false
    }
  }, [])

  const buildText = (entries: ReturnType<typeof getErrorLog>) =>
    buildDiagnosticsText({
      appVersion: __APP_VERSION__,
      buildStamp: __BUILD_STAMP__,
      standalone: isStandalone(),
      userAgent: navigator.userAgent,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      sync,
      invalidCount: listInvalidPaths().length,
      googleConnected,
      speechAvailable: isSpeechSupported(),
      errors: entries,
      ...loaded,
    })
  const text = buildText(errors)

  const copy = async () => {
    const fresh = getErrorLog()
    setErrors(fresh)
    try {
      await navigator.clipboard.writeText(buildText(fresh))
      setFallback(false)
      setFeedback('Kopiert')
    } catch {
      setFallback(true)
      setFeedback('Kopieren nicht möglich – Text unten markieren und kopieren.')
    }
  }

  const clear = () => {
    clearErrorLog()
    setErrors([])
    setFeedback('Fehlerliste geleert')
  }

  return (
    <details
      className={`${styles.section} ${styles.diagnostics}`}
      onToggle={() => setErrors(getErrorLog())}
    >
      <summary>Diagnose</summary>
      <pre className={styles.diagnosticsText}>{text}</pre>
      <div className={form.actions}>
        <button type="button" className={form.button} onClick={() => void copy()}>
          Kopieren
        </button>
        <button type="button" className={form.button} onClick={clear}>
          Fehlerliste leeren
        </button>
      </div>
      {feedback !== '' && (
        <p className={styles.hint} role="status">
          {feedback}
        </p>
      )}
      {fallback && (
        <textarea
          className={styles.diagnosticsField}
          readOnly
          rows={10}
          value={text}
          aria-label="Diagnosetext"
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </details>
  )
}
