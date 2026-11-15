import { useEffect, useState, type FormEvent } from 'react'
import form from '../../components/Form.module.css'
import { testConnection } from '../../data/github'
import { setSecret } from '../../data/localStore'
import { TOKEN_URL } from '../../lib/links'
import {
  connectionMessage,
  isValidRepo,
  looksLikeToken,
  pastedTokenHint,
  storedTokenHint,
} from './githubForm'
import styles from './SettingsPage.module.css'

const REPO_ERROR = 'Das Repository muss die Form „besitzer/name“ haben.'

interface SetupGithubStepProps {
  initialRepo: string
  storedToken: string | undefined
  onConnected: () => void
  /** Ersteinrichtung: Anleitung und Token-Link stehen schon im Schritt selbst. */
  hideGuide?: boolean
  /** Meldet, ob Eingaben (Repo geändert oder Token getippt) noch nicht gespeichert sind. */
  onDirtyChange?: (dirty: boolean) => void
}

/** Schritt ①: Repository wählen, Token über die Zwischenablage (oder verdecktes Feld) übernehmen. */
export function SetupGithubStep({
  initialRepo,
  storedToken,
  onConnected,
  hideGuide = false,
  onDirtyChange,
}: SetupGithubStepProps) {
  const [repo, setRepo] = useState(initialRepo)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string[]>([])
  const [fallback, setFallback] = useState(false)
  const [manualToken, setManualToken] = useState('')

  const dirty = storedToken === undefined && (repo !== initialRepo || manualToken !== '')
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const submit = async (raw: string): Promise<void> => {
    const token = raw.trim()
    if (!isValidRepo(repo)) {
      setError(REPO_ERROR)
      return
    }
    if (!looksLikeToken(token)) {
      setError(
        'Das sieht nicht nach einem GitHub-Token aus. Er beginnt mit „github_pat_“ und enthält keine Leerzeichen.',
      )
      return
    }
    setBusy(true)
    setError(null)
    const result = await testConnection({ token, repo: repo.trim() })
    if (result !== 'ok') {
      setError(connectionMessage(result))
      setBusy(false)
      return
    }
    try {
      await setSecret('githubRepo', repo.trim())
      await setSecret('githubToken', token)
    } catch {
      setError('Speichern fehlgeschlagen.')
      setBusy(false)
      return
    }
    const lines = [pastedTokenHint(token)]
    try {
      await navigator.clipboard.writeText('')
      lines.push('Die Zwischenablage wurde geleert.')
    } catch {
      // Leeren ist nur eine Vorsichtsmaßnahme.
    }
    setInfo(lines)
    setManualToken('')
    setFallback(false)
    setBusy(false)
    onConnected()
  }

  const paste = async (): Promise<void> => {
    if (!isValidRepo(repo)) {
      setError(REPO_ERROR)
      return
    }
    let text: string
    try {
      text = await navigator.clipboard.readText()
    } catch {
      setFallback(true)
      setError(
        'Die Zwischenablage ist nicht lesbar. Füge das Token unten ins Feld ein (lange auf das Feld drücken).',
      )
      return
    }
    await submit(text)
  }

  const submitManual = (event: FormEvent): void => {
    event.preventDefault()
    void submit(manualToken)
  }

  const done = storedToken !== undefined

  return (
    <div className={styles.stepBody}>
      {done ? (
        <p className={styles.hint}>{info[0] ?? storedTokenHint(storedToken)}</p>
      ) : (
        <>
          <label className={form.field}>
            Daten-Repository
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
          {!hideGuide && (
            <>
              <a
                className={styles.linkButton}
                href={TOKEN_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Token bei GitHub erstellen
              </a>
              <ul className={styles.stepList}>
                <li>Nur dein Daten-Repository auswählen.</li>
                <li>Berechtigung „Contents: Read and write“ setzen.</li>
                <li>Token kopieren und hier mit „Token einfügen“ übernehmen.</li>
              </ul>
              <p className={styles.hint}>
                Auf dem Handy ggf. in der Browser-Adressleiste „Desktop-Website anfordern“ wählen.
              </p>
            </>
          )}
          <div className={form.actions}>
            <button
              type="button"
              className={`${form.button} ${form.primary}`}
              disabled={busy}
              onClick={() => void paste()}
            >
              Token einfügen
            </button>
          </div>
          {fallback && (
            <form className={form.form} onSubmit={submitManual}>
              <label className={form.field}>
                Eingefügtes Token
                <input
                  className={form.input}
                  type="password"
                  value={manualToken}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={(event) => setManualToken(event.target.value)}
                />
              </label>
              <div className={form.actions}>
                <button type="submit" className={form.button} disabled={busy}>
                  Token übernehmen
                </button>
              </div>
            </form>
          )}
        </>
      )}
      <div role="status" aria-live="polite">
        {error && <p className={form.error}>{error}</p>}
        {info.slice(done ? 1 : 0).map((line) => (
          <p key={line} className={styles.ok}>
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}
