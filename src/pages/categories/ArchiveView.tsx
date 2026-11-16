import { useMemo, useState } from 'react'
import { useProjects } from '../../data/hooks'
import { restoreItem, restoreProject } from '../../data/repository'
import type { Category, Item, Project } from '../../data/types'
import { archivedStepsOf, archiveItems, completedProjects } from '../../lib/categoryView'
import { formatDateTime } from '../../lib/format'
import { hasEnded } from '../../lib/pastAppointments'
import { GENERIC_ERROR } from './userMessage'
import styles from './ArchiveView.module.css'

interface ArchiveViewProps {
  category: Category
  categories: Category[]
  items: readonly Item[]
  /** Projekte; ohne Angabe aus dem lokalen Speicher. */
  projects?: readonly Project[]
}

/** Archiv „Erledigt“ (SPEC §6.4): erledigte Einträge ansehen, suchen und wiederherstellen. */
export function ArchiveView({ category, categories, items, projects }: ArchiveViewProps) {
  const stored = useProjects()
  const allProjects = projects ?? stored
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return archiveItems(items, category.id, allProjects).filter(
      (item) =>
        needle === '' ||
        item.title.toLowerCase().includes(needle) ||
        item.notes.toLowerCase().includes(needle),
    )
  }, [items, category.id, query, allProjects])

  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matches = (text: string): boolean => text.toLowerCase().includes(needle)
    return completedProjects(allProjects)
      .map((project) => ({ project, steps: archivedStepsOf(project, items, category.id) }))
      .filter(
        ({ project, steps }) =>
          needle === '' ||
          matches(project.title) ||
          matches(project.notes) ||
          steps.some((s) => matches(s.title) || matches(s.notes)),
      )
  }, [items, category.id, query, allProjects])

  const originName = (item: Item): string =>
    categories.find((c) => c.id === item.originalCategoryId)?.name ?? 'Privat'

  const onRestore = (item: Item): void => {
    setNotice(null)
    setError(null)
    const keepsInCalendar = hasEnded(item, new Date())
    restoreItem(item.id).then(
      (restored) =>
        setNotice(
          `Zurück in ${categories.find((c) => c.id === restored.categoryId)?.name ?? 'Privat'}` +
            (keepsInCalendar ? '. Termin bleibt im Kalender.' : ''),
        ),
      () => setError(GENERIC_ERROR),
    )
  }

  const onRestoreProject = (project: Project): void => {
    setNotice(null)
    setError(null)
    restoreProject(project.id).then(
      () => setNotice(`Projekt „${project.title}“ ist wieder aktiv.`),
      () => setError(GENERIC_ERROR),
    )
  }

  const searching = query.trim() !== ''
  const showEmpty = visible.length === 0 && visibleProjects.length === 0

  return (
    <div>
      <input
        type="search"
        className={styles.search}
        aria-label={`In ${category.name} suchen`}
        placeholder={`In ${category.name} suchen`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {visibleProjects.length > 0 && (
        <section aria-label="Projekte">
          <h3 className={styles.heading}>Projekte</h3>
          <ul className={styles.list}>
            {visibleProjects.map(({ project, steps }) => (
              <li key={project.id} className={styles.project}>
                <div className={styles.row}>
                  <div className={styles.main}>
                    <span className={styles.title}>{project.title}</span>
                    <span className={styles.meta}>
                      Projekt
                      {project.completedAt &&
                        ` · abgeschlossen am ${formatDateTime(project.completedAt)}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.restore}
                    aria-label={`Projekt ${project.title} wiederherstellen`}
                    onClick={() => onRestoreProject(project)}
                  >
                    Wiederherstellen
                  </button>
                </div>
                {steps.length > 0 && (
                  <ul className={styles.steps} aria-label={`Schritte von ${project.title}`}>
                    {steps.map((step) => (
                      <li key={step.id} className={styles.step}>
                        {step.title}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {showEmpty && (
        <p className={styles.empty}>
          {searching ? `Nichts gefunden für „${query.trim()}“.` : 'Noch nichts erledigt.'}
        </p>
      )}
      {visible.length > 0 && (
        <ul className={`${styles.list} ${styles.entries}`}>
          {visible.map((item) => (
            <li key={item.id} className={styles.row}>
              <div className={styles.main}>
                <span className={styles.title}>{item.title}</span>
                <span className={styles.meta}>
                  {originName(item)}
                  {item.type === 'termin' && item.schedule
                    ? ` · Termin am ${formatDateTime(item.schedule.start)}`
                    : item.completedAt && ` · erledigt am ${formatDateTime(item.completedAt)}`}
                </span>
              </div>
              <button
                type="button"
                className={styles.restore}
                aria-label={`${item.title} wiederherstellen`}
                onClick={() => onRestore(item)}
              >
                Wiederherstellen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
