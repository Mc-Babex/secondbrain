import { ProjectCard } from '../../components/ProjectCard'
import { groupByCategory } from '../../lib/taskGroups'
import { somedayItems, waitingItems } from '../../lib/gtd'
import { TaskRow } from './TaskRow'
import type { TaskListProps } from './taskListProps'
import styles from './TasksPage.module.css'

function rows(props: TaskListProps, list: TaskListProps['items']) {
  return list.map((item) => (
    <TaskRow
      key={item.id}
      item={item}
      now={props.now}
      isNew={props.recentIds.has(item.id)}
      onComplete={props.onComplete}
      onEdit={props.onEdit}
      actions={props.renderTaskActions?.(item)}
    />
  ))
}

/** Reiter „Projekte“ (einfache Liste; Ausbau in Aufgabe 93). */
export function ProjectsTab({ items, projects }: TaskListProps) {
  const active = projects.filter((p) => p.status === 'aktiv')
  if (active.length === 0) {
    return <p className={styles.empty}>Keine aktiven Projekte. Neue Projekte legst du hier an.</p>
  }
  return (
    <ul className={styles.list}>
      {active.map((project) => (
        <li key={project.id}>
          <ProjectCard project={project} items={items} />
        </li>
      ))}
    </ul>
  )
}

/** Reiter „Warte auf“ (einfache Liste; Ausbau in Aufgabe 94). */
export function WaitingTab(props: TaskListProps) {
  const list = waitingItems(props.items)
  if (list.length === 0) return <p className={styles.empty}>Nichts, worauf du wartest.</p>
  return <ul className={styles.list}>{rows(props, list)}</ul>
}

/** Reiter „Irgendwann“ (einfache Liste nach Ablage; Ausbau in Aufgabe 94). */
export function SomedayTab(props: TaskListProps) {
  const groups = groupByCategory(somedayItems(props.items), props.categories)
  if (groups.length === 0) return <p className={styles.empty}>Nichts auf „Irgendwann“.</p>
  return (
    <>
      {groups.map((group) => (
        <div key={group.id} role="group" aria-label={group.name} className={styles.group}>
          <h3 className={styles.subheading}>{group.name}</h3>
          <ul className={styles.list}>{rows(props, group.items)}</ul>
        </div>
      ))}
    </>
  )
}
