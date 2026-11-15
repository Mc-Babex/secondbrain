import type { LastRun } from '../../data/types'
import { isRecent } from '../../lib/lastRun'
import styles from './TasksPage.module.css'

const MAX_ERRORS = 5

interface LastRunHintsProps {
  lastRun: LastRun | null
  now: Date
}

/** Bereich „Hinweise vom letzten Lauf": Fehlermeldungen des Laufs, solange er höchstens 24 h her ist. */
export function LastRunHints({ lastRun, now }: LastRunHintsProps) {
  if (lastRun === null || !isRecent(lastRun, now) || lastRun.errors.length === 0) return null
  return (
    <section className={styles.section} aria-labelledby="tasks-hints">
      <h2 id="tasks-hints" className={styles.heading}>
        Hinweise vom letzten Lauf
      </h2>
      <ul className={styles.runErrors}>
        {lastRun.errors.slice(0, MAX_ERRORS).map((error, index) => (
          <li key={index}>{error.message}</li>
        ))}
        {lastRun.errors.length > MAX_ERRORS && <li>…</li>}
      </ul>
    </section>
  )
}
