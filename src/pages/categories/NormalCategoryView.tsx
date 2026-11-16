import { useMemo, useState } from 'react'
import { ItemEditor } from '../../components/ItemEditor'
import { NoteText } from '../../components/NoteText'
import { ProjectCard } from '../../components/ProjectCard'
import { StatusBadges } from '../../components/StatusBadges'
import { useProjects } from '../../data/hooks'
import type { Category, Item, ItemType, Project } from '../../data/types'
import { completeItemWithEvent } from '../../google/itemEvents'
import { activeProjectsOf, itemsOfCategory } from '../../lib/categoryView'
import { formatDateTime } from '../../lib/format'
import styles from './NormalCategoryView.module.css'

interface NormalCategoryViewProps {
  category: Category
  categories: Category[]
  items: readonly Item[]
  /** Projekte; ohne Angabe aus dem lokalen Speicher. */
  projects?: readonly Project[]
  /** Öffnet die Projektansicht; ohne sie sind die Projektkarten nicht antippbar. */
  onOpenProject?: (id: string) => void
}

const TYPE_LABELS: Record<ItemType, string> = {
  aufgabe: 'Aufgabe',
  notiz: 'Notiz',
  termin: 'Termin',
}

/** Inhalt einer normalen Ablage: Suche, offene Einträge, Bearbeiten und Erledigen (SPEC §6.4). */
export function NormalCategoryView({
  category,
  categories,
  items,
  projects,
  onOpenProject,
}: NormalCategoryViewProps) {
  const stored = useProjects()
  const allProjects = projects ?? stored
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Item | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const visible = useMemo(
    () => itemsOfCategory(items, category.id, query, allProjects),
    [items, category.id, query, allProjects],
  )
  const categoryProjects = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return activeProjectsOf(allProjects, category.id).filter(
      (p) =>
        needle === '' ||
        p.title.toLowerCase().includes(needle) ||
        p.notes.toLowerCase().includes(needle),
    )
  }, [allProjects, category.id, query])

  const onComplete = (item: Item): void => {
    setError(null)
    setNotice(null)
    completeItemWithEvent(item).then(
      (result) => setNotice(result.note),
      () => setError('Das hat nicht geklappt. Bitte versuche es erneut.'),
    )
  }

  const searching = query.trim() !== ''
  const showEmpty = visible.length === 0 && categoryProjects.length === 0

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
      {categoryProjects.length > 0 && (
        <section aria-label="Projekte">
          <h3 className={styles.heading}>Projekte</h3>
          <ul className={styles.list}>
            {categoryProjects.map((project) => (
              <li key={project.id}>
                <ProjectCard
                  project={project}
                  items={items}
                  onOpen={onOpenProject ? () => onOpenProject(project.id) : undefined}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {showEmpty && (
        <p className={styles.empty}>
          {searching
            ? `Nichts gefunden für „${query.trim()}“.`
            : `Noch nichts in ${category.name}.`}
        </p>
      )}
      {visible.length > 0 && (
        <ul className={`${styles.list} ${styles.tasks}`}>
          {visible.map((item) => (
            <li key={item.id} className={styles.row}>
              {item.type === 'aufgabe' && (
                <input
                  type="checkbox"
                  className={styles.check}
                  checked={false}
                  aria-label={`${item.title} erledigen`}
                  onChange={() => onComplete(item)}
                />
              )}
              <div className={styles.main}>
                <button type="button" className={styles.title} onClick={() => setEditing(item)}>
                  {item.title}
                </button>
                {item.type === 'aufgabe' ? (
                  <StatusBadges item={item} />
                ) : (
                  <span className={styles.meta}>
                    {TYPE_LABELS[item.type]}
                    {item.important && <strong className={styles.important}> · wichtig</strong>}
                    {item.schedule && ` · ${formatDateTime(item.schedule.start)}`}
                  </span>
                )}
                <NoteText text={item.notes} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <ItemEditor item={editing} categories={categories} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
