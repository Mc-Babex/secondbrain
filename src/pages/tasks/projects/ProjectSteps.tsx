import { useState, type FormEvent } from 'react'
import { StatusBadges } from '../../../components/StatusBadges'
import { addProjectStep, moveProjectStep } from '../../../data/repository'
import type { Item, Project } from '../../../data/types'
import { formatDuration } from '../../../lib/format'
import { needsNextStep, nextSeriesOccurrence } from '../../../lib/gtd'
import { DURATION_CHOICES, nextSeriesText } from './projectDates'
import styles from './ProjectSteps.module.css'
import { userMessage } from './userMessage'

interface ProjectStepsProps {
  project: Project
  /** Alle Schritte des Projekts in `projectOrder`-Reihenfolge. */
  steps: readonly Item[]
  /** Alle Einträge (für die Warnung „Nächsten Schritt festlegen“). */
  items: readonly Item[]
  now: Date
  onComplete: (item: Item) => void
  onEdit: (item: Item) => void
}

/** Schritte eines Projekts: offene mit ↑ ↓, Schritt hinzufügen, erledigte eingeklappt (SPEC §6.3.3). */
export function ProjectSteps({
  project,
  steps,
  items,
  now,
  onComplete,
  onEdit,
}: ProjectStepsProps) {
  const open = steps.filter((s) => s.status === 'offen')
  const done = steps.filter((s) => s.status === 'erledigt')
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState('')
  const [error, setError] = useState<string | null>(null)
  const warn = needsNextStep(project, items)
  const series = open.length === 0 ? nextSeriesOccurrence(project) : null

  const run = (action: Promise<unknown>): Promise<boolean> => {
    setError(null)
    return action.then(
      () => true,
      (e: unknown) => {
        setError(userMessage(e))
        return false
      },
    )
  }

  const add = (event: FormEvent): void => {
    event.preventDefault()
    if (title.trim() === '') return
    void run(
      addProjectStep(project.id, {
        title,
        durationMin: duration === '' ? null : Number(duration),
      }),
    ).then((ok) => {
      if (ok) setTitle('')
    })
  }

  return (
    <section aria-labelledby="project-steps" className={styles.section}>
      <h2 id="project-steps" className={styles.heading}>
        Schritte
      </h2>
      {warn && (
        <p className={styles.warning} role="status">
          <span aria-hidden="true">⚠ </span>
          Nächsten Schritt festlegen
        </p>
      )}
      {series && <p className={styles.next}>{nextSeriesText(series)}</p>}
      {open.length > 0 && (
        <ul className={styles.list}>
          {open.map((step, index) => (
            <li key={step.id} className={styles.step}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={false}
                aria-label={`${step.title} erledigt`}
                onChange={() => onComplete(step)}
              />
              <div className={styles.main}>
                <button type="button" className={styles.titleButton} onClick={() => onEdit(step)}>
                  {step.title}
                </button>
                <div className={styles.meta}>
                  <StatusBadges item={step} now={now} />
                  {step.durationMin !== null && <span>{formatDuration(step.durationMin)}</span>}
                </div>
              </div>
              <div className={styles.moves}>
                <button
                  type="button"
                  className={styles.move}
                  aria-label="Nach oben"
                  disabled={index === 0}
                  onClick={() => void run(moveProjectStep(step.id, 'up'))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.move}
                  aria-label="Nach unten"
                  disabled={index === open.length - 1}
                  onClick={() => void run(moveProjectStep(step.id, 'down'))}
                >
                  ↓
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className={styles.add} onSubmit={add}>
        <input
          className={styles.input}
          value={title}
          placeholder={warn ? 'Nächster Schritt' : 'Schritt hinzufügen'}
          aria-label="Neuer Schritt"
          onChange={(e) => setTitle(e.target.value)}
        />
        <select
          className={styles.duration}
          aria-label="Dauer des neuen Schritts"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
        >
          <option value="">Dauer</option>
          {DURATION_CHOICES.map((minutes) => (
            <option key={minutes} value={minutes}>
              {formatDuration(minutes)}
            </option>
          ))}
        </select>
        <button type="submit" className={styles.addButton} disabled={title.trim() === ''}>
          Hinzufügen
        </button>
      </form>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {done.length > 0 && (
        <details className={styles.done}>
          <summary className={styles.summary}>Erledigte Schritte ({done.length})</summary>
          <ul className={styles.doneList}>
            {done.map((step) => (
              <li key={step.id}>
                <span aria-hidden="true">✓ </span>
                {step.title}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
