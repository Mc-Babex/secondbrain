import type { Item, Project } from '../data/types'
import { nextStepOf, needsNextStep, projectProgress } from '../lib/gtd'
import styles from './ProjectCard.module.css'

interface ProjectCardProps {
  project: Project
  /** Alle Einträge; die Karte wählt die Schritte des Projekts selbst. */
  items: readonly Item[]
  /** Fehlt sie, ist die Karte nicht antippbar. */
  onOpen?: (project: Project) => void
}

/** Projekt mit Titel, Fortschritt x/y und nächstem Schritt bzw. Warnung (SPEC §3.12, §6.4). */
export function ProjectCard({ project, items, onOpen }: ProjectCardProps) {
  const { done, total } = projectProgress(project, items)
  const next = nextStepOf(project, items)
  const warn = needsNextStep(project, items)
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)

  const body = (
    <>
      <span className={styles.title}>{project.title}</span>
      <span className={styles.progress}>
        <span
          className={styles.bar}
          role="progressbar"
          aria-label={`Fortschritt ${project.title}`}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-valuetext={`${done} von ${total} Schritten erledigt`}
        >
          <span className={styles.fill} style={{ width: `${percent}%` }} />
        </span>
        <span className={styles.count}>
          {done}/{total}
        </span>
      </span>
      {warn ? (
        <span className={styles.warning}>⚠ Nächsten Schritt festlegen</span>
      ) : (
        next && <span className={styles.next}>Nächster Schritt: {next.title}</span>
      )}
    </>
  )

  return onOpen ? (
    <button type="button" className={styles.card} onClick={() => onOpen(project)}>
      {body}
    </button>
  ) : (
    <div className={styles.card}>{body}</div>
  )
}
