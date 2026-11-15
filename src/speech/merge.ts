/** Zusammenführen der `result`-Ereignisse der Web Speech API (Chrome/Edge und iOS). */

export interface MergeResult {
  readonly isFinal: boolean
  readonly transcript: string
}

export interface MergeUpdate {
  /** Neu bestätigte Textstücke in Reihenfolge. */
  readonly finals: string[]
  /** Aktueller vorläufiger Text (leer, wenn keiner). */
  readonly interim: string
}

export interface ResultMerger {
  /** Verarbeitet ein `result`-Ereignis (`results` komplett, ab `resultIndex` neu). */
  push(resultIndex: number, results: readonly MergeResult[]): MergeUpdate
  /** Bestätigt einen noch vorläufigen Text (bei `end`/`stop`). */
  flush(): string | null
}

interface Slot {
  index: number
  text: string
}

function words(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean)
}

function wordMatches(a: string, b: string): boolean {
  return a === b || a.startsWith(b) || b.startsWith(a)
}

/**
 * Gehört `next` zum selben Satz wie `previous` (Korrektur oder Verlängerung)?
 * Ja, wenn ein Text wortweise Präfix des anderen ist oder der gemeinsame Wortanfang mindestens
 * max(2, Länge des kürzeren Textes - 2) Wörter lang ist (typische iOS-Korrektur am Satzende).
 * Kurze Texte gelten dadurch nur bei echtem Präfix als gleich. Ein Doppel ist besser als ein
 * verlorener Satz.
 */
export function isSameUtterance(previous: string, next: string): boolean {
  const a = words(previous)
  const b = words(next)
  const common = Math.min(a.length, b.length)
  if (common === 0) return a.length === b.length
  const matches = (i: number) => wordMatches(a[i], b[i])
  let prefixLength = 0
  while (prefixLength < common && matches(prefixLength)) prefixLength++
  if (prefixLength === common) return true
  return prefixLength >= Math.max(2, common - 2)
}

export function createResultMerger(): ResultMerger {
  let pending: Slot | null = null
  let lastCommitted: Slot | null = null

  const commit = (finals: string[], slot: Slot) => {
    if (slot.text.trim() === '') return
    finals.push(slot.text)
    lastCommitted = slot
  }

  const settleFinal = (finals: string[], slot: Slot) => {
    const previous = pending
    if (previous) {
      pending = null
      if (previous.index !== slot.index && !isSameUtterance(previous.text, slot.text)) {
        commit(finals, previous)
      }
    }
    const done = lastCommitted
    if (done && done.index === slot.index && done.text.trim() === slot.text.trim()) return
    commit(finals, slot)
  }

  return {
    push(resultIndex, results) {
      const finals: string[] = []
      let interimText = ''
      let interimIndex = -1
      for (let i = resultIndex; i < results.length; i++) {
        const { isFinal, transcript } = results[i]
        if (isFinal) {
          settleFinal(finals, { index: i, text: transcript })
        } else {
          if (interimIndex < 0) interimIndex = i
          interimText += transcript
        }
      }
      if (interimIndex >= 0) {
        const previous = pending
        if (previous && !isSameUtterance(previous.text, interimText)) commit(finals, previous)
        pending = { index: interimIndex, text: interimText }
      } else if (resultIndex < results.length) {
        pending = null
      }
      return { finals, interim: pending?.text ?? '' }
    },
    flush() {
      const slot = pending
      pending = null
      if (!slot || slot.text.trim() === '') return null
      lastCommitted = slot
      return slot.text
    },
  }
}
