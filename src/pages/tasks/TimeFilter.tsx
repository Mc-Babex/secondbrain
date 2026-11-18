import type { TimeLimit } from '../../lib/gtd'
import styles from './TasksPage.module.css'

const OPTIONS: readonly { limit: TimeLimit; label: string }[] = [
  { limit: 15, label: '≤ 15 Min.' },
  { limit: null, label: 'alle' },
]

interface TimeFilterProps {
  value: TimeLimit
  onChange: (limit: TimeLimit) => void
}

/** Zeitfilter der Nächsten Schritte: ≤ 15 Min. · alle. */
export function TimeFilter({ value, onChange }: TimeFilterProps) {
  return (
    <div className={styles.segments} role="group" aria-label="Zeitfilter">
      {OPTIONS.map((option) => (
        <button
          key={option.label}
          type="button"
          className={
            option.limit === value ? `${styles.segment} ${styles.segmentOn}` : styles.segment
          }
          aria-pressed={option.limit === value}
          onClick={() => onChange(option.limit)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
