import { useState, type FormEvent } from 'react'
import { Dialog } from '../../../components/Dialog'
import form from '../../../components/Form.module.css'
import { addProjectStep, listItems } from '../../../data/repository'
import type { Project } from '../../../data/types'
import { completeProjectWithEvents } from '../../../google/itemEvents'
import { userMessage } from './userMessage'

interface NextStepDialogProps {
  project: Project
  /** `note`: Hinweis, der nach dem Schließen kurz gezeigt wird (z. B. Termine, die bleiben). */
  onClose: (note?: string | null) => void
}

/** „Was ist der nächste Schritt?“ nach dem letzten offenen Schritt eines Projekts (SPEC §6.3.3). */
export function NextStepDialog({ project, onClose }: NextStepDialogProps) {
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const fail = (e: unknown): void => {
    setBusy(false)
    setError(userMessage(e))
  }

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault()
    if (title.trim() === '' || busy) return
    setBusy(true)
    setError(null)
    addProjectStep(project.id, { title }).then(() => onClose(), fail)
  }

  const onCompleteProject = (): void => {
    if (busy) return
    setBusy(true)
    setError(null)
    listItems()
      .then((items) => completeProjectWithEvents(project.id, items))
      .then((note) => onClose(note), fail)
  }

  return (
    <Dialog
      title="Was ist der nächste Schritt?"
      initialFocus="first-field"
      onClose={() => onClose()}
    >
      <form className={form.form} onSubmit={onSubmit}>
        <label className={form.field}>
          Nächster Schritt in „{project.title}“
          <input
            className={form.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Nächster Schritt"
          />
        </label>
        {error && (
          <p className={form.error} role="alert">
            {error}
          </p>
        )}
        <div className={form.actions}>
          <button type="button" className={form.button} onClick={() => onClose()}>
            Später
          </button>
          <button type="button" className={form.button} disabled={busy} onClick={onCompleteProject}>
            Projekt abschließen
          </button>
          <button
            type="submit"
            className={`${form.button} ${form.primary}`}
            disabled={title.trim() === '' || busy}
          >
            Hinzufügen
          </button>
        </div>
      </form>
    </Dialog>
  )
}
