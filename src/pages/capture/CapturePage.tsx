import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { logError } from '../../data/errorLog'
import { addInboxEntry } from '../../data/repository'
import { useInbox, useLastRun } from '../../data/hooks'
import { createRecognizer, isSpeechSupported, type Recognizer } from '../../speech/recognizer'
import { formatLastSorted } from '../../lib/lastRun'
import { usePageActive } from '../../lib/pageActive'
import { useUnsavedWork } from '../../lib/unsavedWork'
import { dictationHint, isIos } from '../../lib/platform'
import { loadDraft, saveDraft } from './draft'
import styles from './CapturePage.module.css'

const MAX_HEIGHT_PX = 152
const CONFIRM_MS = 2000
const END_WAIT_MS = 1500

function appendText(base: string, addition: string): string {
  const part = addition.trim()
  if (part === '') return base
  if (base === '' || /\s$/.test(base)) return base + part
  return `${base} ${part}`
}

export function CapturePage() {
  const inbox = useInbox()
  const lastRun = useLastRun()
  const [text, setText] = useState(loadDraft)
  const [interim, setInterim] = useState('')
  const [recording, setRecording] = useState(false)
  const [speechDenied, setSpeechDenied] = useState(false)
  const [stalled, setStalled] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const usedSpeech = useRef(false)
  const textRef = useRef(text)
  const interimRef = useRef('')
  const endResolver = useRef<(() => void) | null>(null)
  const recognizer = useRef<Recognizer | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const confirmTimer = useRef<number | undefined>(undefined)
  const speechAvailable = isSpeechSupported() && !speechDenied
  const ios = isIos()
  const pageActive = usePageActive()
  const showHint = !speechAvailable || stalled
  useUnsavedWork('capture-text', text.trim() !== '')
  useUnsavedWork('capture-speech', recording)

  const updateText = useCallback((next: string) => {
    textRef.current = next
    setText(next)
  }, [])

  useEffect(() => saveDraft(text), [text])

  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`
  }, [text])

  useEffect(
    () => () => {
      recognizer.current?.abort()
      recognizer.current = null
      window.clearTimeout(confirmTimer.current)
    },
    [],
  )

  const resetRecording = useCallback(() => {
    recognizer.current = null
    setRecording(false)
    setInterim('')
  }, [])

  const stopRecording = useCallback(() => {
    recognizer.current?.stop()
    resetRecording()
  }, [resetRecording])

  const startRecording = () => {
    const created = createRecognizer({
      lang: 'de-DE',
      onInterim: (value) => {
        interimRef.current = value
        setInterim(value)
      },
      onFinal: (finalText) => {
        usedSpeech.current = true
        updateText(appendText(textRef.current, finalText))
      },
      onEnd: () => {
        resetRecording()
        endResolver.current?.()
      },
      onStalled: () => {
        logError('Sprache', 'Spracherkennung hängt (kein Ergebnis)')
        resetRecording()
        setStalled(true)
        inputRef.current?.focus()
      },
      onError: (kind) => {
        logError('Sprache', `Spracherkennung: ${kind}`)
        if (kind === 'denied') setSpeechDenied(true)
        else setError('Spracherkennung fehlgeschlagen. Bitte erneut versuchen.')
        resetRecording()
      },
    })
    if (!created) return
    setError('')
    setStalled(false)
    interimRef.current = ''
    try {
      created.start()
      recognizer.current = created
      setRecording(true)
    } catch {
      logError('Sprache', 'Spracherkennung konnte nicht gestartet werden')
      setError('Spracherkennung konnte nicht gestartet werden.')
    }
  }

  /** Beendet die Aufnahme und wartet auf späte Ergebnisse (`onEnd`, sonst Zeitlimit). */
  const finishRecording = useCallback(
    async (active: Recognizer): Promise<void> => {
      let timer: number | undefined
      await new Promise<void>((resolve) => {
        endResolver.current = resolve
        timer = window.setTimeout(resolve, END_WAIT_MS)
        active.stop()
      })
      window.clearTimeout(timer)
      endResolver.current = null
      active.abort()
      resetRecording()
    },
    [resetRecording],
  )

  /** Beendet eine laufende Aufnahme; erkannter, noch nicht bestätigter Text bleibt im Textfeld. */
  const flushRecording = useCallback(async () => {
    const active = recognizer.current
    if (!active) return
    await finishRecording(active)
    if (interimRef.current.trim() !== '') {
      usedSpeech.current = true
      updateText(appendText(textRef.current, interimRef.current))
    }
    interimRef.current = ''
  }, [finishRecording, updateText])

  // Seite verlassen (Wischen, Punkte, Pfeiltasten): Spracherkennung stoppt.
  useEffect(() => {
    if (!pageActive) void flushRecording()
  }, [pageActive, flushRecording])

  const submit = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    await flushRecording()
    const value = textRef.current.trim()
    if (value === '') {
      setSaving(false)
      return
    }
    try {
      await addInboxEntry(value, usedSpeech.current ? 'sprache' : 'text')
      usedSpeech.current = false
      updateText('')
      setConfirmed(true)
      window.clearTimeout(confirmTimer.current)
      confirmTimer.current = window.setTimeout(() => setConfirmed(false), CONFIRM_MS)
      inputRef.current?.focus()
    } catch {
      setError('Speichern fehlgeschlagen. Der Text bleibt erhalten.')
    } finally {
      setSaving(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <section className={styles.page}>
      <h1 className={styles.visuallyHidden}>Erfassung</h1>
      <div className={styles.spacer} aria-hidden="true" />
      <button
        type="button"
        className={`${styles.mic} ${recording ? styles.recording : ''} ${
          ios && !speechAvailable ? styles.unavailable : ''
        }`}
        aria-label={recording ? 'Spracheingabe beenden' : 'Spracheingabe starten'}
        aria-pressed={recording}
        aria-describedby={showHint ? 'capture-dictation-hint' : undefined}
        disabled={!speechAvailable && !ios}
        aria-disabled={!speechAvailable && ios ? true : undefined}
        onClick={
          !speechAvailable
            ? () => inputRef.current?.focus()
            : recording
              ? stopRecording
              : startRecording
        }
      >
        <span aria-hidden="true">🎤</span>
      </button>
      <div className={styles.lower}>
        <div className={styles.messages}>
          {showHint && (
            <p id="capture-dictation-hint" className={styles.hint}>
              {dictationHint(ios)}
            </p>
          )}
          {recording && interim !== '' && <p className={styles.interim}>{interim}</p>}
          <p className={styles.success} role="status">
            {confirmed ? 'Im Eingangskorb' : ''}
          </p>
          {error !== '' && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
        <div className={styles.bar}>
          <textarea
            ref={inputRef}
            className={styles.input}
            aria-label="Text"
            rows={1}
            value={text}
            onChange={(event) => updateText(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            className={styles.submit}
            disabled={(text.trim() === '' && interim.trim() === '') || saving}
            onClick={() => void submit()}
          >
            Ablegen
          </button>
        </div>
        <p className={styles.counter}>{inbox.length} im Eingangskorb</p>
        {lastRun && (
          <p className={styles.counter}>{formatLastSorted(lastRun.finishedAt, new Date())}</p>
        )}
      </div>
    </section>
  )
}
