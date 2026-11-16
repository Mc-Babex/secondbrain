import { useMemo } from 'react'
import type { Item } from '../../data/types'
import {
  filterByTime,
  focusItems,
  focusOverLimit,
  nextStepsSection,
  plannedLater,
  todayAndOverdue,
  type TimeLimit,
} from '../../lib/gtd'
import { groupByCategory, isOverdue } from '../../lib/taskGroups'
import { TaskRow } from './TaskRow'
import type { TaskListProps } from './taskListProps'
import { TimeFilter } from './TimeFilter'
import styles from './TasksPage.module.css'

interface CurrentTabProps extends TaskListProps {
  timeLimit: TimeLimit
  onTimeLimit: (limit: TimeLimit) => void
}

/** Reiter „Aktuell“ (SPEC §6.3.1): Fokus, Heute/Überfällig, Nächste Schritte, Eingeplant. */
export function CurrentTab(props: CurrentTabProps) {
  const { items, categories, projects, now, recentIds, timeLimit, onTimeLimit } = props
  const { onComplete, onEdit, renderOverdueActions, renderTaskActions } = props

  const sections = useMemo(() => {
    const today = todayAndOverdue(items, now)
    // Jede Aufgabe steht nur einmal: Heute/Überfällig vor Fokus vor Eingeplant.
    const shown = new Set(today.map((i) => i.id))
    const focus = focusItems(items).filter((i) => !shown.has(i.id))
    focus.forEach((i) => shown.add(i.id))
    const planned = plannedLater(items, now).filter((i) => !shown.has(i.id))
    const next = nextStepsSection(items, projects)
    return { today, focus, planned, next }
  }, [items, projects, now])

  const projectNames = useMemo(() => new Map(projects.map((p) => [p.id, p.title])), [projects])
  const nextGroups = useMemo(
    () => groupByCategory(filterByTime(sections.next, timeLimit), categories),
    [sections.next, timeLimit, categories],
  )

  const row = (
    item: Item,
    extra: { focus?: boolean; overdue?: boolean; project?: boolean } = {},
  ) => (
    <TaskRow
      key={item.id}
      item={item}
      now={now}
      isNew={recentIds.has(item.id)}
      projectName={extra.project && item.projectId ? projectNames.get(item.projectId) : undefined}
      focus={extra.focus ?? (item.important && item.gtd !== 'irgendwann')}
      doneButton={extra.overdue}
      onComplete={onComplete}
      onEdit={onEdit}
      actions={extra.overdue ? renderOverdueActions?.(item) : renderTaskActions?.(item)}
    />
  )

  const { today, focus, planned, next } = sections
  if (today.length + focus.length + planned.length + next.length === 0) {
    return (
      <p className={styles.empty}>Keine nächsten Schritte. Neues über die Erfassung anlegen.</p>
    )
  }

  return (
    <>
      {focus.length > 0 && (
        <section className={styles.section} aria-labelledby="tasks-focus">
          <h2 id="tasks-focus" className={styles.heading}>
            <span aria-hidden="true">★ </span>Fokus
          </h2>
          {focusOverLimit(items) && (
            <p className={styles.hint}>
              Mehr als 5 Aufgaben im Fokus – was davon ist wirklich wichtig?
            </p>
          )}
          <ul className={styles.list}>{focus.map((item) => row(item, { focus: true }))}</ul>
        </section>
      )}
      {today.length > 0 && (
        <section className={styles.section} aria-labelledby="tasks-today">
          <h2 id="tasks-today" className={styles.heading}>
            Heute / Überfällig
          </h2>
          <ul className={styles.list}>
            {today.map((item) => row(item, { overdue: isOverdue(item, now) }))}
          </ul>
        </section>
      )}
      {next.length > 0 && (
        <section className={styles.section} aria-labelledby="tasks-next">
          <h2 id="tasks-next" className={styles.heading}>
            Nächste Schritte
          </h2>
          <TimeFilter value={timeLimit} onChange={onTimeLimit} />
          {nextGroups.length === 0 && (
            <p className={styles.empty}>Keine nächsten Schritte in dieser Zeit.</p>
          )}
          {nextGroups.map((group) => (
            <div key={group.id} role="group" aria-label={group.name} className={styles.group}>
              <h3 className={styles.subheading}>{group.name}</h3>
              <ul className={styles.list}>
                {group.items.map((item) => row(item, { project: true }))}
              </ul>
            </div>
          ))}
        </section>
      )}
      {planned.length > 0 && (
        <details className={styles.section}>
          <summary className={styles.summary}>Eingeplant ({planned.length})</summary>
          <ul className={styles.list}>{planned.map((item) => row(item))}</ul>
        </details>
      )}
    </>
  )
}
