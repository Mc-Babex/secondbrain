import { useState, type FormEvent } from 'react'
import { Dialog } from '../../components/Dialog'
import form from '../../components/Form.module.css'
import { createCategory, updateCategory } from '../../data/repository'
import type { Category } from '../../data/types'
import { userMessage } from './userMessage'

interface CategoryFormDialogProps {
  /** Ohne Angabe wird eine neue Ablage angelegt, sonst die vorhandene umbenannt. */
  category?: Category
  onClose: () => void
}

/** Dialog zum Anlegen oder Umbenennen einer Ablage (SPEC §3.5). */
export function CategoryFormDialog({ category, onClose }: CategoryFormDialogProps) {
  const [name, setName] = useState(category?.name ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [error, setError] = useState<string | null>(null)

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault()
    if (name.trim() === '') return
    const save = category
      ? updateCategory(category.id, { name, description })
      : createCategory(name, description)
    setError(null)
    save.then(onClose, (e: unknown) => setError(userMessage(e)))
  }

  return (
    <Dialog
      title={category ? 'Ablage umbenennen' : 'Neue Ablage'}
      initialFocus={category ? 'dialog' : 'first-field'}
      onClose={onClose}
    >
      <form className={form.form} onSubmit={onSubmit}>
        <label className={form.field}>
          Name
          <input
            className={form.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className={form.field}>
          Beschreibung
          <textarea
            className={form.input}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <span>Hilft beim automatischen Einsortieren</span>
        </label>
        {error && (
          <p className={form.error} role="alert">
            {error}
          </p>
        )}
        <div className={form.actions}>
          <button type="button" className={form.button} onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="submit"
            className={`${form.button} ${form.primary}`}
            disabled={name.trim() === ''}
          >
            Speichern
          </button>
        </div>
      </form>
    </Dialog>
  )
}
