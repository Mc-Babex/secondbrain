import { useMemo, useState } from 'react'
import { ItemEditor } from '../../components/ItemEditor'
import { NoteText } from '../../components/NoteText'
import type { Category, Item, ItemType } from '../../data/types'
import { completeItemWithEvent } from '../../google/itemEvents'
import { itemsOfCategory } from '../../lib/categoryView'
import { formatDateTime } from '../../lib/format'
import styles from './NormalCategoryView.module.css'

interface NormalCategoryViewProps {
  category: Category
  categories: Category[]
  items: readonly Item[]
}

const TYPE_LABELS: Record<ItemType, string> = {
  aufgabe: 'Aufgabe',
  notiz: 'Notiz',
  termin: 'Termin',
}

/** Inhalt einer normalen Ablage: Suche, offene Einträge, Bearbeiten und Erledigen (SPEC §6.4). */
export function NormalCategoryView({ category, categories, items }: NormalCategoryViewProps) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Item | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const visible = useMemo(
    () => itemsOfCategory(items, category.id, query),
    [items, category.id, query],
  )

  const onComplete = (item: Item): void => {
    setError(null)
    setNotice(null)
    completeItemWithEvent(item).then(
      (result) => setNotice(result.note),
      () => setError('Das hat nicht geklappt. Bitte versuche es erneut.'),
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
      {visible.length === 0 ? (
        <p className={styles.empty}>
          {searching
            ? `Nichts gefunden für „${query.trim()}“.`
            : `Noch nichts in ${category.name}.`}
        </p>
      ) : (
        <ul className={styles.list}>
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
                <span className={styles.meta}>
                  {TYPE_LABELS[item.type]}
                  {item.important && <strong className={styles.important}> · wichtig</strong>}
                  {item.schedule && ` · ${formatDateTime(item.schedule.start)}`}
                </span>
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
