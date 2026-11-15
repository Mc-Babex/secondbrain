import { useMemo, useState } from 'react'
import { restoreItem } from '../../data/repository'
import type { Category, Item } from '../../data/types'
import { archiveItems } from '../../lib/categoryView'
import { formatDateTime } from '../../lib/format'
import { hasEnded } from '../../lib/pastAppointments'
import { GENERIC_ERROR } from './userMessage'
import styles from './ArchiveView.module.css'

interface ArchiveViewProps {
  category: Category
  categories: Category[]
  items: readonly Item[]
}

/** Archiv „Erledigt“ (SPEC §6.4): erledigte Einträge ansehen, suchen und wiederherstellen. */
export function ArchiveView({ category, categories, items }: ArchiveViewProps) {
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return archiveItems(items, category.id).filter(
      (item) =>
        needle === '' ||
        item.title.toLowerCase().includes(needle) ||
        item.notes.toLowerCase().includes(needle),
    )
  }, [items, category.id, query])

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

  const searching = query.trim() !== ''

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
      {visible.length === 0 ? (
        <p className={styles.empty}>
          {searching ? `Nichts gefunden für „${query.trim()}“.` : 'Noch nichts erledigt.'}
        </p>
      ) : (
        <ul className={styles.list}>
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
              <button type="button" className={styles.restore} onClick={() => onRestore(item)}>
                Wiederherstellen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
