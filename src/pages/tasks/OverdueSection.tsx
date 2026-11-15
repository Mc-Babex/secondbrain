import type { Item } from '../../data/types'
import { formatDateTime } from '../../lib/format'
import type { TaskSlots } from './slots'
import styles from './TasksPage.module.css'

interface OverdueSectionProps extends Pick<TaskSlots, 'renderOverdueActions'> {
  items: Item[]
  onComplete: (item: Item) => void
}

/** Bereich „Überfällig": Titel, ursprünglicher Termin, ✓ Erledigt und die Kalender-Knöpfe. */
export function OverdueSection({ items, onComplete, renderOverdueActions }: OverdueSectionProps) {
  if (items.length === 0) return null
  return (
    <section className={styles.section} aria-labelledby="tasks-overdue">
      <h2 id="tasks-overdue" className={styles.heading}>
        Überfällig
      </h2>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id} className={styles.card}>
            <div className={styles.cardMain}>
              <strong>{item.title}</strong>
              <p className={styles.muted}>
                {item.schedule ? formatDateTime(item.schedule.start) : ''}
              </p>
            </div>
            <div className={styles.buttons}>
              <button
                className={styles.textButton}
                aria-label="Erledigt"
                title="Erledigt"
                onClick={() => onComplete(item)}
              >
                ✓ Erledigt
              </button>
              {renderOverdueActions?.(item)}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
