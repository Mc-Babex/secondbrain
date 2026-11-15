import { useEffect, useState, type FormEvent } from 'react'
import { Dialog } from '../../components/Dialog'
import form from '../../components/Form.module.css'
import { testConnection } from '../../data/github'
import { deleteSecret, getSecret, setSecret } from '../../data/localStore'
import { syncNow } from '../../data/sync'
import { setSyncStatus } from '../../data/syncStatus'
import { connectionMessage, isValidRepo, storedTokenHint } from './githubForm'
import { Section } from './Section'
import styles from './SettingsPage.module.css'

interface Message {
  kind: 'ok' | 'error'
  text: string
}

interface GithubSectionProps {
  /** Wird nach gespeichertem oder entferntem Token aufgerufen. */
  onChanged?: () => void
}

export function GithubSection({ onChanged }: GithubSectionProps) {
  const [repo, setRepo] = useState('')
  const [storedToken, setStoredToken] = useState<string | undefined>(undefined)
  const [tokenInput, setTokenInput] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  useEffect(() => {
    let active = true
    void Promise.all([getSecret('githubRepo'), getSecret('githubToken')]).then(
      ([savedRepo, savedToken]) => {
        if (!active) return
        setRepo((current) => (current === '' ? (savedRepo ?? '') : current))
        setStoredToken(savedToken)
      },
      () => {
        if (active)
          setMessage({ kind: 'error', text: 'Zugangsdaten konnten nicht gelesen werden.' })
      },
    )
    return () => {
      active = false
    }
  }, [])

  const effectiveToken = tokenInput.trim() || storedToken

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!isValidRepo(repo)) {
      setMessage({ kind: 'error', text: 'Das Repository muss die Form „besitzer/name“ haben.' })
      return
    }
    if (!effectiveToken) {
      setMessage({ kind: 'error', text: 'Bitte ein Token eingeben.' })
      return
    }
    setBusy(true)
    try {
      await setSecret('githubRepo', repo.trim())
      await setSecret('githubToken', effectiveToken)
      setRepo(repo.trim())
      setStoredToken(effectiveToken)
      setTokenInput('')
      setShowToken(false)
      setMessage({ kind: 'ok', text: 'Gespeichert.' })
      onChanged?.()
      void syncNow()
    } catch {
      setMessage({ kind: 'error', text: 'Speichern fehlgeschlagen.' })
    } finally {
      setBusy(false)
    }
  }

  const check = async (): Promise<void> => {
    if (!isValidRepo(repo) || !effectiveToken) {
      setMessage({ kind: 'error', text: 'Bitte Repository und Token angeben.' })
      return
    }
    setBusy(true)
    setMessage(null)
    const result = await testConnection({ token: effectiveToken, repo: repo.trim() })
    setMessage({ kind: result === 'ok' ? 'ok' : 'error', text: connectionMessage(result) })
    setBusy(false)
  }

  const remove = async (): Promise<void> => {
    setConfirmRemove(false)
    try {
      await deleteSecret('githubToken')
      await deleteSecret('githubRepo')
    } catch {
      setMessage({ kind: 'error', text: 'Token konnte nicht entfernt werden.' })
      return
    }
    setStoredToken(undefined)
    setTokenInput('')
    setRepo('')
    setSyncStatus({ state: 'nichtEingerichtet', message: null })
    setMessage({ kind: 'ok', text: 'Token entfernt.' })
    onChanged?.()
  }

  return (
    <Section title="GitHub">
      <form className={form.form} onSubmit={(event) => void save(event)}>
        <label className={form.field}>
          Repository
          <input
            className={form.input}
            value={repo}
            placeholder="dein-konto/secondbrain-daten"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) => setRepo(event.target.value)}
          />
        </label>
        <label className={form.field}>
          Token
          <input
            className={form.input}
            type={showToken ? 'text' : 'password'}
            value={tokenInput}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) => setTokenInput(event.target.value)}
          />
        </label>
        <label className={form.check}>
          <input
            type="checkbox"
            checked={showToken}
            onChange={(event) => setShowToken(event.target.checked)}
          />
          Token anzeigen
        </label>
        {storedToken && <p className={styles.hint}>{storedTokenHint(storedToken)}</p>}
        <div role="status" aria-live="polite">
          {message && (
            <p className={message.kind === 'ok' ? styles.ok : form.error}>{message.text}</p>
          )}
        </div>
        <div className={form.actions}>
          {storedToken && (
            <button
              type="button"
              className={`${form.button} ${form.danger}`}
              onClick={() => setConfirmRemove(true)}
            >
              Token entfernen
            </button>
          )}
          <button
            type="button"
            className={form.button}
            disabled={busy}
            onClick={() => void check()}
          >
            Verbindung testen
          </button>
          <button type="submit" className={`${form.button} ${form.primary}`} disabled={busy}>
            Speichern
          </button>
        </div>
      </form>
      <details className={styles.help}>
        <summary>Kurzanleitung: Token erstellen</summary>
        <ol>
          <li>
            Auf github.com unter Settings → Developer settings → Fine-grained tokens ein neues Token
            anlegen.
          </li>
          <li>Nur dein Daten-Repository auswählen.</li>
          <li>
            Berechtigung „Contents: Read and write“ setzen (Metadata: Read wird automatisch
            ergänzt).
          </li>
          <li>Ein Ablaufdatum wählen.</li>
          <li>Das Token hier einfügen. Es wird nur auf diesem Gerät gespeichert.</li>
        </ol>
      </details>
      {confirmRemove && (
        <Dialog title="Token entfernen?" onClose={() => setConfirmRemove(false)}>
          <p>Der Sync wird beendet, bis du erneut ein Token einträgst.</p>
          <div className={form.actions}>
            <button type="button" className={form.button} onClick={() => setConfirmRemove(false)}>
              Abbrechen
            </button>
            <button
              type="button"
              className={`${form.button} ${form.danger}`}
              onClick={() => void remove()}
            >
              Entfernen
            </button>
          </div>
        </Dialog>
      )}
    </Section>
  )
}
