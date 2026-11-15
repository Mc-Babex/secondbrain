import { useEffect, useState } from 'react'
import { Dialog } from '../../components/Dialog'
import form from '../../components/Form.module.css'
import { deleteCategory, deletePreview } from '../../data/repository'
import type { Category } from '../../data/types'
import { userMessage } from './userMessage'

interface DeleteCategoryDialogProps {
  category: Category
  categories: readonly Category[]
  onClose: () => void
  onDeleted: () => void
}

function moveText(count: number | null): string {
  if (count === null) return 'Die Einträge werden verschoben nach:'
  if (count === 1) return '1 Eintrag wird verschoben nach:'
  return `${count} Einträge werden verschoben nach:`
}

/** Löschen einer normalen Ablage; ihre Einträge wandern in eine andere normale Ablage. */
export function DeleteCategoryDialog({
  category,
  categories,
  onClose,
  onDeleted,
}: DeleteCategoryDialogProps) {
  const targets = categories.filter((c) => c.kind === 'normal' && c.id !== category.id)
  const [targetId, setTargetId] = useState(
    (targets.find((c) => c.id === 'privat') ?? targets[0])?.id ?? '',
  )
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    deletePreview(category.id).then(
      (n) => {
        if (active) setCount(n)
      },
      () => {
        if (active) setError('Die Anzahl der Einträge konnte nicht gelesen werden.')
      },
    )
    return () => {
      active = false
    }
  }, [category.id])

  const onConfirm = (): void => {
    setError(null)
    deleteCategory(category.id, targetId).then(onDeleted, (e: unknown) => setError(userMessage(e)))
  }

  return (
    <Dialog title={`${category.name} löschen?`} onClose={onClose}>
      <div className={form.form}>
        {targets.length === 0 ? (
          <p>Es gibt keine andere normale Ablage. Lege zuerst eine weitere Ablage an.</p>
        ) : (
          <>
            <p>{moveText(count)}</p>
            <label className={form.field}>
              Zielablage
              <select
                className={form.input}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                {targets.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
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
            type="button"
            className={`${form.button} ${form.danger}`}
            disabled={targets.length === 0}
            onClick={onConfirm}
          >
            Löschen und verschieben
          </button>
        </div>
      </div>
    </Dialog>
  )
}
