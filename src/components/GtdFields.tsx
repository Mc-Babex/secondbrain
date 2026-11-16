import { useId } from 'react'
import type { GtdStatus, Project } from '../data/types'
import { formatDateTime, formatDuration } from '../lib/format'
import { DURATION_CHOICES, projectsOfCategory, type GtdForm } from './gtdForm'
import form from './Form.module.css'
import styles from './GtdFields.module.css'

interface GtdFieldsProps {
  value: GtdForm
  onChange: (patch: Partial<GtdForm>) => void
  categoryId: string
  projects: readonly Project[]
  /** Startzeit einer eingeplanten Aufgabe (ISO) – zeigt den Termin-Hinweis. */
  scheduleStart?: string | null
  /** Dauer ausblenden (bei eingeplanten Aufgaben steht sie im Termin-Abschnitt). */
  hideDuration?: boolean
}

const STATUS_CHOICES: { value: GtdStatus; label: string; className: string }[] = [
  { value: 'naechster-schritt', label: 'Nächster Schritt', className: styles.next },
  { value: 'warten', label: 'Warte auf', className: styles.waiting },
  { value: 'irgendwann', label: 'Irgendwann', className: styles.someday },
]

/** Dauer-Auswahl; ein abweichender Bestandswert bleibt wählbar. */
function durationChoices(current: string): number[] {
  const list = [...DURATION_CHOICES]
  const n = Number(current)
  if (current !== '' && Number.isFinite(n) && !list.includes(n)) list.push(n)
  return list.sort((a, b) => a - b)
}

/** Gemeinsame Feldgruppe für „Eintrag bearbeiten“ und „In Ablage“ (nur für Aufgaben, SPEC §6.3.2). */
export function GtdFields({
  value,
  onChange,
  categoryId,
  projects,
  scheduleStart = null,
  hideDuration = false,
}: GtdFieldsProps) {
  const groupId = useId()
  const choices = projectsOfCategory(projects, categoryId)
  const current =
    value.projectId === '' || choices.some((p) => p.id === value.projectId)
      ? undefined
      : projects.find((p) => p.id === value.projectId)
  const currentSuffix = current?.status === 'erledigt' ? 'abgeschlossen' : 'andere Ablage'
  const quick = value.duration !== '' && Number(value.duration) <= 2
  return (
    <>
      <div className={form.field}>
        <span id={`${groupId}-label`}>Status</span>
        {scheduleStart && (
          <p className={styles.scheduled} role="note">
            Eingeplant: {formatDateTime(scheduleStart)} – Status Termin
          </p>
        )}
        <div className={styles.segments} role="radiogroup" aria-labelledby={`${groupId}-label`}>
          {STATUS_CHOICES.map((choice) => (
            <label key={choice.value} className={`${styles.segment} ${choice.className}`}>
              <input
                type="radio"
                className={styles.segmentInput}
                name={`${groupId}-status`}
                checked={value.gtd === choice.value}
                onChange={() => onChange({ gtd: choice.value })}
              />
              <span>{choice.label}</span>
            </label>
          ))}
        </div>
      </div>
      <button
        type="button"
        className={styles.focus}
        aria-pressed={value.important}
        onClick={() => onChange({ important: !value.important })}
      >
        <span aria-hidden="true">{value.important ? '★' : '☆'}</span> Fokus
      </button>
      {value.gtd === 'warten' && (
        <fieldset className={styles.group}>
          <legend>Warte auf</legend>
          <label className={form.field}>
            Person / Was
            <input
              className={form.input}
              value={value.person}
              onChange={(e) => onChange({ person: e.target.value })}
            />
          </label>
          <label className={form.field}>
            Seit
            <input
              className={form.input}
              type="date"
              value={value.since}
              onChange={(e) => onChange({ since: e.target.value })}
            />
          </label>
          <div className={styles.dateRow}>
            <label className={form.field}>
              Nachhaken am
              <input
                className={form.input}
                type="date"
                value={value.followUpOn}
                onChange={(e) => onChange({ followUpOn: e.target.value })}
              />
            </label>
            {value.followUpOn !== '' && (
              <button
                type="button"
                className={form.button}
                aria-label="Nachhaken am entfernen"
                onClick={() => onChange({ followUpOn: '' })}
              >
                entfernen
              </button>
            )}
          </div>
        </fieldset>
      )}
      <div className={styles.dateRow}>
        <label className={form.field}>
          Fällig bis
          <input
            className={form.input}
            type="date"
            value={value.dueDate}
            onChange={(e) => onChange({ dueDate: e.target.value })}
          />
        </label>
        {value.dueDate !== '' && (
          <button
            type="button"
            className={form.button}
            aria-label="Fällig bis entfernen"
            onClick={() => onChange({ dueDate: '' })}
          >
            entfernen
          </button>
        )}
      </div>
      {!hideDuration && (
        <div className={form.field}>
          <label className={form.field}>
            Dauer
            <select
              className={form.input}
              value={value.duration}
              onChange={(e) => onChange({ duration: e.target.value })}
            >
              <option value="">Keine Angabe</option>
              {durationChoices(value.duration).map((m) => (
                <option key={m} value={m}>
                  {formatDuration(m)}
                </option>
              ))}
            </select>
          </label>
          {quick && (
            <span className={styles.quick} role="note">
              ⚡ 2-Minuten-Regel: gleich erledigen
            </span>
          )}
        </div>
      )}
      <label className={form.field}>
        Projekt
        <select
          className={form.input}
          value={value.projectId}
          onChange={(e) => onChange({ projectId: e.target.value })}
        >
          <option value="">Kein Projekt</option>
          {current && (
            <option value={current.id}>
              {current.title} ({currentSuffix})
            </option>
          )}
          {choices.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}
