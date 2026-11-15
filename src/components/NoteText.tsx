import { useState } from 'react'
import styles from './NoteText.module.css'

/** Ab dieser Länge bzw. Zeilenzahl erscheint „Mehr anzeigen“. */
const LONG_CHARS = 160
const LONG_LINES = 3

interface NoteTextProps {
  text: string
}

/** Notiztext mit Zeilenumbrüchen; lange Notizen erscheinen gekürzt und lassen sich aufklappen. */
export function NoteText({ text }: NoteTextProps) {
  const [expanded, setExpanded] = useState(false)
  if (text.trim() === '') return null
  const isLong = text.length > LONG_CHARS || text.split('\n').length > LONG_LINES
  return (
    <div className={styles.note}>
      <p className={`${styles.text} ${isLong && !expanded ? styles.clamped : ''}`}>{text}</p>
      {isLong && (
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}
        </button>
      )}
    </div>
  )
}
