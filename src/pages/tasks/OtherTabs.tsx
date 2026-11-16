import { ProjectCard } from '../../components/ProjectCard'
import type { TaskListProps } from './taskListProps'
import styles from './TasksPage.module.css'

/** Reiter „Projekte“ (einfache Liste; Ausbau in Aufgabe 94). */
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
