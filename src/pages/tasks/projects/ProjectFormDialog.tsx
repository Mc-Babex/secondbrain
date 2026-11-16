import { useState, type FormEvent } from 'react'
import { Dialog } from '../../../components/Dialog'
import form from '../../../components/Form.module.css'
import { createProject, updateProject } from '../../../data/repository'
import type { Category, Project } from '../../../data/types'
import { userMessage } from './userMessage'

interface ProjectFormDialogProps {
  /** Ohne Angabe wird ein neues Projekt angelegt, sonst das vorhandene bearbeitet. */
  project?: Project
  categories: readonly Category[]
  onClose: () => void
}

/** Dialog zum Anlegen oder Bearbeiten eines Projekts: Titel, Ablage (nie Einkauf/Archiv), Notiz. */
export function ProjectFormDialog({ project, categories, onClose }: ProjectFormDialogProps) {
  const choices = categories.filter((c) => c.kind === 'normal').sort((a, b) => a.order - b.order)
  const fallback = choices[0]?.id ?? ''
  const [title, setTitle] = useState(project?.title ?? '')
  const [categoryId, setCategoryId] = useState(project?.categoryId ?? fallback)
  const [notes, setNotes] = useState(project?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault()
    if (title.trim() === '' || categoryId === '' || busy) return
    setBusy(true)
    setError(null)
    const save = project
      ? updateProject(project.id, { title, categoryId, notes })
      : createProject({ title, categoryId, notes })
    save.then(
      () => onClose(),
      (e: unknown) => {
        setBusy(false)
        setError(userMessage(e))
      },
    )
  }

  return (
    <Dialog
      title={project ? 'Projekt bearbeiten' : 'Neues Projekt'}
      initialFocus={project ? 'dialog' : 'first-field'}
      onClose={onClose}
    >
      <form className={form.form} onSubmit={onSubmit}>
        <label className={form.field}>
          Titel
          <input
            className={form.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>
        <label className={form.field}>
          Ablage
          <select
            className={form.input}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
          >
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={form.field}>
          Notiz
          <textarea
            className={form.input}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
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
            disabled={title.trim() === '' || categoryId === '' || busy}
          >
            Speichern
          </button>
        </div>
      </form>
    </Dialog>
  )
}
