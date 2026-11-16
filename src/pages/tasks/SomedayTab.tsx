import { useEffect, useMemo, useRef, useState } from 'react'
import { activateItem } from '../../data/repository'
import type { Item } from '../../data/types'
import { somedayItems } from '../../lib/gtd'
import { groupByCategory } from '../../lib/taskGroups'
import { TaskRow } from './TaskRow'
import type { TaskListProps } from './taskListProps'
import styles from './TasksPage.module.css'

const NOTICE_MS = 5000

/** Reiter „Irgendwann“ (SPEC §6.3.1): nach Ablage gruppiert, neueste zuerst, mit „Aktivieren“. */
export function SomedayTab(props: TaskListProps) {
  const { items, categories, projects, now, recentIds, onComplete, onEdit, renderTaskActions } =
    props
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const groups = useMemo(
    () => groupByCategory(somedayItems(items), categories),
    [items, categories],
  )
  const projectNames = useMemo(() => new Map(projects.map((p) => [p.id, p.title])), [projects])

  const activate = (item: Item): void => {
    setError(null)
    activateItem(item.id).then(
      () => {
        setNotice('Aktiviert – steht jetzt unter Aktuell')
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setNotice(null), NOTICE_MS)
      },
      () => setError('Das hat nicht geklappt. Bitte versuche es erneut.'),
    )
  }

  const message = (
    <>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
    </>
  )

  if (groups.length === 0) {
    return (
      <>
        {message}
        <p className={styles.empty}>
          Nichts für irgendwann – Ideen landen hier über die Erfassung.
        </p>
      </>
    )
  }

  return (
    <>
      {message}
      {groups.map((group) => (
        <div key={group.id} role="group" aria-label={group.name} className={styles.group}>
          <h3 className={styles.subheading}>{group.name}</h3>
          <ul className={styles.list}>
            {group.items.map((item) => (
              <TaskRow
                key={item.id}
                item={item}
                now={now}
                isNew={recentIds.has(item.id)}
                projectName={item.projectId ? projectNames.get(item.projectId) : undefined}
                onComplete={onComplete}
                onEdit={onEdit}
                actions={
                  <>
                    <button className={styles.textButton} onClick={() => activate(item)}>
                      Aktivieren
                      <span className={styles.srOnly}>: {item.title}</span>
                    </button>
                    {renderTaskActions?.(item)}
                  </>
                }
              />
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}
