import type { ViewMode } from '../../lib/calendarView'
import styles from './CalendarPage.module.css'

interface CalendarHeaderProps {
  label: string
  mode: ViewMode
  onMode: (mode: ViewMode) => void
  onShift: (step: -1 | 1) => void
  onToday: () => void
  onNew: () => void
}

export function CalendarHeader({
  label,
  mode,
  onMode,
  onShift,
  onToday,
  onNew,
}: CalendarHeaderProps) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{label}</h1>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.control}
          aria-label="Zurück"
          onClick={() => onShift(-1)}
        >
          ‹
        </button>
        <button type="button" className={styles.control} onClick={onToday}>
          Heute
        </button>
        <button
          type="button"
          className={styles.control}
          aria-label="Weiter"
          onClick={() => onShift(1)}
        >
          ›
        </button>
        <button
          type="button"
          className={`${styles.control} ${styles.add}`}
          aria-label="Neuer Termin"
          onClick={onNew}
        >
          +
        </button>
        <div className={styles.modes} role="group" aria-label="Ansicht">
          {(['tag', 'woche'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={styles.control}
              aria-pressed={mode === value}
              onClick={() => onMode(value)}
            >
              {value === 'tag' ? 'Tag' : 'Woche'}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
