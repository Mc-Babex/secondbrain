import { useMemo, useState, type FormEvent } from 'react'
import { Dialog } from '../../components/Dialog'
import form from '../../components/Form.module.css'
import { ItemEditor } from '../../components/ItemEditor'
import { addShoppingItem, setChecked } from '../../data/repository'
import type { Category, Item } from '../../data/types'
import { removeCheckedWithEvents } from '../../google/itemEvents'
import { GENERIC_ERROR } from './userMessage'
import styles from './ShoppingView.module.css'

interface ShoppingViewProps {
  category: Category
  categories: Category[]
  items: readonly Item[]
}

function created(item: Item): number {
  const value = Date.parse(item.createdAt)
  return Number.isNaN(value) ? 0 : value
}

/** Einkaufsliste (SPEC §6.4): Artikel hinzufügen, abhaken, Abgehakte entfernen. */
export function ShoppingView({ category, categories, items }: ShoppingViewProps) {
  const [text, setText] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Item | null>(null)
  const [confirming, setConfirming] = useState(false)

  const { open, done } = useMemo(() => {
    const own = items
      .filter((item) => item.categoryId === category.id)
      .sort((a, b) => created(a) - created(b))
    return {
      open: own.filter((item) => item.checked !== true),
      done: own.filter((item) => item.checked === true),
    }
  }, [items, category.id])

  const onAdd = (event: FormEvent): void => {
    event.preventDefault()
    const title = text.trim()
    if (title === '') return
    setNotice(null)
    setError(null)
    addShoppingItem(title).then(
      (result) => {
        if (result.created) setText('')
        else setNotice(`${title} steht schon auf der Liste.`)
      },
      () => setError(GENERIC_ERROR),
    )
  }

  const onToggle = (item: Item): void => {
    setError(null)
    setChecked(item.id, item.checked !== true).catch(() => setError(GENERIC_ERROR))
  }

  const onRemove = (): void => {
    setError(null)
    setNotice(null)
    removeCheckedWithEvents(done).then(
      (hint) => {
        setConfirming(false)
        setNotice(hint)
      },
      () => {
        setConfirming(false)
        setError(GENERIC_ERROR)
      },
    )
  }

  const row = (item: Item) => (
    <li key={item.id} className={styles.row}>
      <label className={`${styles.label} ${item.checked === true ? styles.done : ''}`}>
        <input
          type="checkbox"
          className={styles.check}
          checked={item.checked === true}
          onChange={() => onToggle(item)}
        />
        <span>{item.title}</span>
      </label>
      <button
        type="button"
        className={styles.edit}
        aria-label={`${item.title} bearbeiten`}
        onClick={() => setEditing(item)}
      >
        ✎
      </button>
    </li>
  )

  return (
    <div>
      <form className={styles.add} onSubmit={onAdd}>
        <input
          className={styles.input}
          aria-label="Artikel hinzufügen"
          placeholder="Artikel hinzufügen"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className={`${form.button} ${form.primary}`}>
          Hinzufügen
        </button>
      </form>
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
      {open.length + done.length === 0 ? (
        <p className={styles.empty}>Die Einkaufsliste ist leer.</p>
      ) : (
        <ul className={styles.list}>
          {open.map(row)}
          {done.map(row)}
        </ul>
      )}
      {done.length > 0 && (
        <div className={styles.bar}>
          <button
            type="button"
            className={`${form.button} ${form.primary}`}
            onClick={() => setConfirming(true)}
          >
            Ausgewählte eingekauft ({done.length})
          </button>
        </div>
      )}
      {confirming && (
        <Dialog title="Artikel entfernen?" onClose={() => setConfirming(false)}>
          <div className={form.form}>
            <p>{done.length} Artikel von der Liste entfernen?</p>
            <div className={form.actions}>
              <button type="button" className={form.button} onClick={() => setConfirming(false)}>
                Abbrechen
              </button>
              <button type="button" className={`${form.button} ${form.danger}`} onClick={onRemove}>
                Entfernen
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {editing && (
        <ItemEditor item={editing} categories={categories} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
