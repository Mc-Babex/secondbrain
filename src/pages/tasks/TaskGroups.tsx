import type { Item } from '../../data/types'
import { formatDateTime, formatDuration } from '../../lib/format'
import type { TaskGroup } from '../../lib/taskGroups'
import type { TaskSlots } from './slots'
import styles from './TasksPage.module.css'

interface TaskGroupsProps extends Pick<TaskSlots, 'renderTaskActions'> {
  groups: TaskGroup[]
  recentIds: ReadonlySet<string>
  onComplete: (item: Item) => void
  onEdit: (item: Item) => void
}

/** Offene Aufgaben, nach Ablage gruppiert. */
export function TaskGroups({
  groups,
  recentIds,
  onComplete,
  onEdit,
  renderTaskActions,
}: TaskGroupsProps) {
  return (
    <>
      {groups.map((group) => (
        <section
          key={group.id}
          className={styles.section}
          aria-labelledby={`tasks-group-${group.id}`}
        >
          <h2 id={`tasks-group-${group.id}`} className={styles.heading}>
            {group.name}
          </h2>
          <ul className={styles.list}>
            {group.items.map((item) => (
              <li key={item.id} className={styles.task}>
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
                  <p className={styles.meta}>
                    {recentIds.has(item.id) && <span className={styles.badgeNew}>neu</span>}
                    {item.important && <span className={styles.important}>wichtig</span>}
                    {item.durationMin !== null && <span>{formatDuration(item.durationMin)}</span>}
                    {item.schedule && <span>{formatDateTime(item.schedule.start)}</span>}
                  </p>
                </div>
                {/* Slot für Aufgabe 07: Uhr-Symbol zum Einplanen (siehe slots.ts). */}
                {renderTaskActions?.(item)}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}
