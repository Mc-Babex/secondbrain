import { useMemo, useState, type FormEvent } from 'react'
import form from '../../components/Form.module.css'
import { Dialog } from '../../components/Dialog'
import { deleteInboxEntry, fileInboxEntry } from '../../data/repository'
import type { Category, InboxEntry, ItemType } from '../../data/types'
import { formatDateTime } from '../../lib/format'
import { splitInboxText } from '../../lib/inboxTitle'
import { SortButton } from './SortButton'
import styles from './TasksPage.module.css'

interface InboxSectionProps {
  entries: InboxEntry[]
  categories: Category[]
  run: (action: () => Promise<unknown>) => void
}

/** Bereich „Eingangskorb“ mit Knopf „Jetzt sortieren“ (auch bei leerem Eingangskorb sichtbar). */
export function InboxSection({ entries, categories, run }: InboxSectionProps) {
  const [filing, setFiling] = useState<InboxEntry | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  return (
    <section className={styles.section} aria-labelledby="tasks-inbox">
      <h2 id="tasks-inbox" className={styles.heading}>
        Eingangskorb
      </h2>
      <SortButton />
      {entries.length > 0 && (
        <ul className={styles.list}>
          {entries.map((entry) => (
            <li key={entry.id} className={styles.card}>
              <div className={styles.cardMain}>
                <p className={styles.inboxText}>{entry.text}</p>
                <p className={styles.muted}>{formatDateTime(entry.createdAt)}</p>
                {entry.sortError && (
                  <p className={styles.sortError} role="note">
                    {entry.sortError.message}
                  </p>
                )}
              </div>
              {deleting === entry.id ? (
                <div className={styles.buttons} role="group" aria-label="Löschen bestätigen">
                  <span>Wirklich löschen?</span>
                  <button
                    className={`${styles.button} ${styles.danger}`}
                    onClick={() => {
                      setDeleting(null)
                      run(() => deleteInboxEntry(entry.id))
                    }}
                  >
                    Endgültig löschen
                  </button>
                  <button className={styles.button} onClick={() => setDeleting(null)}>
                    Abbrechen
                  </button>
                </div>
              ) : (
                <div className={styles.buttons}>
                  <button className={styles.button} onClick={() => setFiling(entry)}>
                    In Ablage…
                  </button>
                  <button
                    className={styles.iconButton}
                    aria-label={`Eingangskorb-Eintrag löschen: ${entry.text.split('\n')[0]}`}
                    title="Löschen"
                    onClick={() => setDeleting(entry.id)}
                  >
                    🗑
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {filing && (
        <FileInboxDialog entry={filing} categories={categories} onClose={() => setFiling(null)} />
      )}
    </section>
  )
}

interface FileInboxDialogProps {
  entry: InboxEntry
  categories: Category[]
  onClose: () => void
}

function FileInboxDialog({ entry, categories, onClose }: FileInboxDialogProps) {
  const choices = categories.filter((c) => c.kind !== 'archiv')
  const [type, setType] = useState<ItemType>('aufgabe')
  const initial = useMemo(() => splitInboxText(entry.text), [entry.text])
  const [title, setTitle] = useState(initial.title)
  const [notes, setNotes] = useState(initial.notes)
  const [categoryId, setCategoryId] = useState(
    (choices.find((c) => c.kind === 'normal') ?? choices[0])?.id ?? '',
  )
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (title.trim() === '' || categoryId === '') return
    try {
      setError(null)
      await fileInboxEntry(entry.id, { type, title: title.trim(), notes: notes.trim(), categoryId })
      onClose()
    } catch {
      setError('Das hat nicht geklappt. Bitte versuche es erneut.')
    }
  }

  return (
    <Dialog title="In Ablage" onClose={onClose}>
      <form className={form.form} onSubmit={(e) => void onSubmit(e)}>
        <label className={form.field}>
          Art
          <select
            className={form.input}
            value={type}
            onChange={(e) => setType(e.target.value as ItemType)}
          >
            <option value="aufgabe">Aufgabe</option>
            <option value="notiz">Notiz</option>
            <option value="termin">Termin</option>
          </select>
        </label>
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
          Notiz
          <textarea
            className={form.input}
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label className={form.field}>
          Ablage
          <select
            className={form.input}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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
            disabled={title.trim() === ''}
          >
            Ablegen
          </button>
        </div>
      </form>
    </Dialog>
  )
}
