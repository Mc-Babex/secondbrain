import { createResultMerger, type MergeResult } from './merge'

/** Minimale Typen der Web Speech API (nicht in lib.dom enthalten). */
interface RecognitionAlternative {
  transcript: string
}

interface RecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: RecognitionAlternative
}

interface RecognitionEvent {
  readonly resultIndex: number
  readonly results: { readonly length: number; [index: number]: RecognitionResult }
}

interface RecognitionErrorEvent {
  readonly error: string
}

interface RecognitionInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onaudiostart: (() => void) | null
  onstart: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type RecognitionConstructor = new () => RecognitionInstance

type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionConstructor
  webkitSpeechRecognition?: RecognitionConstructor
}

/** Zeit bis zum `start`-Ereignis; großzügig, da auf iOS der Mikrofon-Freigabedialog offen sein kann. */
export const START_WAIT_MS = 20000
/** Zeit nach `start`, binnen der `audiostart`, ein Ergebnis oder ein Fehler eintreffen muss. */
export const START_TIMEOUT_MS = 6000

export type SpeechErrorKind = 'denied' | 'other'

export interface RecognizerOptions {
  lang?: string
  onInterim: (text: string) => void
  onFinal: (text: string) => void
  onEnd: () => void
  onError: (kind: SpeechErrorKind) => void
  /** Der Erkenner kam nicht in Gang (Zeitlimits `START_WAIT_MS`/`START_TIMEOUT_MS`): abgebrochen. */
  onStalled?: () => void
}

export interface Recognizer {
  start(): void
  /** Beendet die Aufnahme; späte Ergebnisse und `onEnd` treffen noch ein. */
  stop(): void
  /** Bricht ab und löst alle Handler: danach folgen keine Rückrufe mehr. */
  abort(): void
}

function getConstructor(): RecognitionConstructor | undefined {
  const w = window as SpeechWindow
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export function isSpeechSupported(): boolean {
  return getConstructor() !== undefined
}

/** Erzeugt einen Erkenner; `null`, wenn der Browser keine Spracherkennung bietet. */
export function createRecognizer(options: RecognizerOptions): Recognizer | null {
  const Ctor = getConstructor()
  if (!Ctor) return null
  const recognition = new Ctor()
  recognition.lang = options.lang ?? 'de-DE'
  recognition.continuous = true
  recognition.interimResults = true

  const merger = createResultMerger()
  let stallTimer: number | undefined
  const clearStall = () => {
    window.clearTimeout(stallTimer)
    stallTimer = undefined
  }
  const armStall = (ms: number) => {
    window.clearTimeout(stallTimer)
    if (!options.onStalled) return
    stallTimer = window.setTimeout(() => {
      abort()
      options.onStalled?.()
    }, ms)
  }

  recognition.onresult = (event) => {
    clearStall()
    const results: MergeResult[] = []
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i]
      results.push({ isFinal: result.isFinal, transcript: result[0]?.transcript ?? '' })
    }
    const update = merger.push(event.resultIndex, results)
    for (const text of update.finals) options.onFinal(text)
    options.onInterim(update.interim)
  }
  recognition.onstart = () => armStall(START_TIMEOUT_MS)
  recognition.onaudiostart = clearStall
  recognition.onerror = (event) => {
    clearStall()
    options.onError(event.error === 'not-allowed' ? 'denied' : 'other')
  }
  recognition.onend = () => {
    clearStall()
    const rest = merger.flush()
    if (rest !== null) {
      options.onFinal(rest)
      options.onInterim('')
    }
    options.onEnd()
  }

  const abort = () => {
    clearStall()
    recognition.onresult = null
    recognition.onerror = null
    recognition.onend = null
    recognition.onaudiostart = null
    recognition.onstart = null
    recognition.abort()
  }

  return {
    start: () => {
      recognition.start()
      armStall(START_WAIT_MS)
    },
    stop: () => {
      // Der Watchdog läuft bewusst weiter: Fehlt `end` nach `stop`, greift er nach spätestens 20 s.
      recognition.stop()
    },
    abort,
  }
}
