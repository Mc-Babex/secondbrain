import { useMemo, useState } from 'react'
import { Dialog } from '../../../components/Dialog'
import form from '../../../components/Form.module.css'
import { ItemEditor } from '../../../components/ItemEditor'
import { NoteText } from '../../../components/NoteText'
import { useCategories, useItems, useProjects } from '../../../data/hooks'
import { deleteProject } from '../../../data/repository'
import type { Item } from '../../../data/types'
import { completeProjectWithEvents } from '../../../google/itemEvents'
import { projectProgress, projectSteps } from '../../../lib/gtd'
import { CompletionNotices } from '../CompletionNotices'
import { useStepCompletion } from '../useStepCompletion'
import { ProjectFormDialog } from './ProjectFormDialog'
import { ProjectSteps } from './ProjectSteps'
import { SeriesList } from './SeriesList'
import { userMessage } from './userMessage'
import styles from './ProjectView.module.css'

interface ProjectViewProps {
  projectId: string
  /** `aria-label` des Zurück-Pfeils, z. B. „Zurück zu den Aufgaben“. */
  backLabel: string
  /**
   * `note`: Hinweis, der nach dem Zurückgehen gezeigt werden soll (z. B. Termine, die bleiben). Wird das
   * Projekt gelöscht oder abgeschlossen, schließt die aufrufende Seite die Ansicht von selbst.
   */
  onBack: (note?: string | null) => void
}

type Confirm = 'complete' | 'delete' | null

/** Projektansicht (SPEC §6.3.3): Kopf, Schritte, Serien, Bearbeiten, Abschließen, Löschen. */
export function ProjectView({ projectId, backLabel, onBack }: ProjectViewProps) {
  const items = useItems()
  const projects = useProjects()
  const categories = useCategories()
  const completion = useStepCompletion(items, projects)
  const [editing, setEditing] = useState<Item | null>(null)
  const [editProject, setEditProject] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const project = projects.find((p) => p.id === projectId)

  const steps = useMemo(() => projectSteps(projectId, items), [projectId, items])
  const now = useMemo(() => new Date(), [])
  if (!project || project.status !== 'aktiv') return null

  const progress = projectProgress(project, items)
  const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)
  const category = categories.find((c) => c.id === project.categoryId)
  const hasSteps = items.some((i) => i.projectId === projectId)
  const openCount = steps.filter((s) => s.status === 'offen').length

  const finish = (action: Promise<string | null | void>): void => {
    setBusy(true)
    setError(null)
    action.then(
      (note) => onBack(note ?? null),
      (e: unknown) => {
        setBusy(false)
        setConfirm(null)
        setError(userMessage(e))
      },
    )
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          aria-label={backLabel}
          onClick={() => onBack()}
        >
          ←
        </button>
        <h1 className={styles.title}>{project.title}</h1>
      </header>
      <div className={styles.head}>
        {category && <p className={styles.category}>Ablage: {category.name}</p>}
        <NoteText text={project.notes} />
        <div className={styles.progress}>
          <span
            className={styles.bar}
            role="progressbar"
            aria-label={`Fortschritt ${project.title}`}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            aria-valuetext={`${progress.done} von ${progress.total} Schritten erledigt`}
          >
            <span className={styles.fill} style={{ width: `${percent}%` }} />
          </span>
          <span className={styles.count}>
            {progress.done}/{progress.total}
          </span>
        </div>
      </div>
      <CompletionNotices completion={completion} />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <ProjectSteps
        project={project}
        steps={steps}
        items={items}
        now={now}
        onComplete={completion.complete}
        onEdit={setEditing}
      />
      <SeriesList project={project} />
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={() => setEditProject(true)}>
          Projekt bearbeiten
        </button>
        <button type="button" className={styles.button} onClick={() => setConfirm('complete')}>
          Projekt abschließen
        </button>
        {!hasSteps && (
          <button
            type="button"
            className={`${styles.button} ${styles.danger}`}
            onClick={() => setConfirm('delete')}
          >
            Projekt löschen
          </button>
        )}
      </div>
      {editing && (
        <ItemEditor item={editing} categories={categories} onClose={() => setEditing(null)} />
      )}
      {editProject && (
        <ProjectFormDialog
          project={project}
          categories={categories}
          onClose={() => setEditProject(false)}
        />
      )}
      {confirm === 'complete' && (
        <Dialog title="Projekt abschließen?" onClose={() => setConfirm(null)}>
          <p className={styles.confirmText}>
            {openCount === 0
              ? 'Das Projekt wandert nach „Erledigt“.'
              : `${openCount} offene Schritte werden archiviert, das Projekt wandert nach „Erledigt“.`}{' '}
            Serien werden beendet. Du kannst es dort wiederherstellen.
          </p>
          <div className={form.actions}>
            <button type="button" className={form.button} onClick={() => setConfirm(null)}>
              Abbrechen
            </button>
            <button
              type="button"
              className={`${form.button} ${form.primary}`}
              disabled={busy}
              onClick={() => finish(completeProjectWithEvents(project.id, items))}
            >
              Ja, abschließen
            </button>
          </div>
        </Dialog>
      )}
      {confirm === 'delete' && (
        <Dialog title="Projekt löschen?" onClose={() => setConfirm(null)}>
          <p className={styles.confirmText}>
            „{project.title}“ wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.
          </p>
          <div className={form.actions}>
            <button type="button" className={form.button} onClick={() => setConfirm(null)}>
              Abbrechen
            </button>
            <button
              type="button"
              className={`${form.button} ${form.danger}`}
              disabled={busy}
              onClick={() => finish(deleteProject(project.id))}
            >
              Ja, löschen
            </button>
          </div>
        </Dialog>
      )}
    </section>
  )
}
