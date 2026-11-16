import type { ReactNode } from 'react'
import { StatusBadges } from '../../components/StatusBadges'
import type { Item } from '../../data/types'
import { formatDuration } from '../../lib/format'
import styles from './TasksPage.module.css'

interface TaskRowProps {
  item: Item
  now: Date
  /** Aufgabe aus dem letzten Lauf (24 h). */
  isNew: boolean
  /** Name des Projekts, wenn die Aufgabe dessen nächster Schritt ist. */
  projectName?: string
  /** Fokus-Kante (nur im Reiter „Aktuell“). */
  focus?: boolean
  /** Zusätzlicher Knopf „✓ Erledigt“ (überfällige Termine). */
  doneButton?: boolean
  onComplete: (item: Item) => void
  onEdit: (item: Item) => void
  /** Uhr-Symbol bzw. Kalender-Aktionen (Slots, siehe `slots.ts`). */
  actions?: ReactNode
}

/** Aufgabenzeile: Checkbox, Titel (antippen ⇒ Bearbeiten), Kennzeichen, Kalender-Aktionen. */
export function TaskRow({
  item,
  now,
  isNew,
  projectName,
  focus = false,
  doneButton = false,
  onComplete,
  onEdit,
  actions,
}: TaskRowProps) {
  return (
    <li className={focus ? `${styles.task} ${styles.focusRow}` : styles.task}>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={false}
        aria-label={`${item.title} erledigt`}
        onChange={() => onComplete(item)}
      />
      <div className={styles.cardMain}>
        <button className={styles.titleButton} onClick={() => onEdit(item)}>
          {item.title}
        </button>
        <div className={styles.meta}>
          {isNew && <span className={styles.badgeNew}>neu</span>}
          <StatusBadges item={item} now={now} />
          {item.durationMin !== null && <span>{formatDuration(item.durationMin)}</span>}
          {projectName !== undefined && <span>Projekt: {projectName}</span>}
        </div>
      </div>
      <div className={styles.buttons}>
        {doneButton && (
          <button
            className={styles.textButton}
            aria-label="Erledigt"
            title="Erledigt"
            onClick={() => onComplete(item)}
          >
            ✓ Erledigt
          </button>
        )}
        {actions}
      </div>
    </li>
  )
}
