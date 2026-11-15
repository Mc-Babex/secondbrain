import { useState, type FormEvent } from 'react'
import type { Schedule } from '../data/types'
import { formatDuration } from '../lib/format'
import { suggestSlot, timeToMinutes, zonedToDate, type PlanningWindow } from '../lib/planning'
import { toIso, zonedParts } from '../lib/time'
import { Dialog } from './Dialog'
import form from './Form.module.css'

interface ScheduleDialogProps {
  title: string
  /** Vorhandener Termin; sonst Vorschlag per `suggestSlot`. */
  schedule: Schedule | null
  durationMin: number | null
  planningWindow: PlanningWindow
  /** Wirksame Pause; nur der Vorschlag überspringt sie, gewählt werden darf jede Zeit. */
  pause?: PlanningWindow | null
  busy?: boolean
  /** Fehler der Speicheraktion; der Dialog bleibt dabei offen. */
  submitError?: string | null
  now?: Date
  onSubmit: (value: { start: string; durationMin: number }) => void
  onCancel: () => void
}

const STEP = 15
const DEFAULT_DURATION = 30
const pad = (n: number): string => String(n).padStart(2, '0')

function durationOptions(window: PlanningWindow, current: number): number[] {
  const length = timeToMinutes(window.end) - timeToMinutes(window.start)
  const max = Math.max(STEP, Math.floor(length / STEP) * STEP, current)
  const options: number[] = []
  for (let value = STEP; value <= max; value += STEP) options.push(value)
  if (!options.includes(current)) options.push(current)
  return options.sort((a, b) => a - b)
}

/** Termin einplanen/ändern: Datum, Uhrzeit (15-Minuten-Schritte), Dauer. */
export function ScheduleDialog({
  title,
  schedule,
  durationMin,
  planningWindow,
  pause = null,
  busy = false,
  submitError = null,
  now,
  onSubmit,
  onCancel,
}: ScheduleDialogProps) {
  const [initial] = useState(() => {
    const duration = schedule?.durationMin ?? durationMin ?? DEFAULT_DURATION
    const start = schedule
      ? new Date(schedule.start)
      : suggestSlot(now ?? new Date(), planningWindow, duration, pause)
    const p = zonedParts(start)
    return {
      duration,
      date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
      time: `${pad(p.hour)}:${pad(p.minute)}`,
    }
  })
  const [date, setDate] = useState(initial.date)
  const [time, setTime] = useState(initial.time)
  const [duration, setDuration] = useState(initial.duration)
  const [error, setError] = useState<string | null>(null)

  const startMinutes = /^\d{2}:\d{2}$/.test(time) ? timeToMinutes(time) : null
  const outside =
    startMinutes !== null &&
    (startMinutes < timeToMinutes(planningWindow.start) ||
      startMinutes + duration > timeToMinutes(planningWindow.end))

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
    if (!match || startMinutes === null) {
      setError('Bitte Datum und Uhrzeit angeben.')
      return
    }
    if (startMinutes % STEP !== 0) {
      setError('Die Uhrzeit muss in 15-Minuten-Schritten liegen.')
      return
    }
    setError(null)
    const start = zonedToDate(Number(match[1]), Number(match[2]), Number(match[3]), 0, startMinutes)
    onSubmit({ start: toIso(start), durationMin: duration })
  }

  return (
    <Dialog title={title} onClose={onCancel}>
      <form className={form.form} onSubmit={submit}>
        <label className={form.field}>
          Datum
          <input
            className={form.input}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label className={form.field}>
          Uhrzeit
          <input
            className={form.input}
            type="time"
            step={STEP * 60}
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </label>
        <label className={form.field}>
          Dauer
          <select
            className={form.input}
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
          >
            {durationOptions(planningWindow, initial.duration).map((value) => (
              <option key={value} value={value}>
                {formatDuration(value)}
              </option>
            ))}
          </select>
        </label>
        {outside && (
          <p role="status">
            Hinweis: Der Termin liegt außerhalb des Planungsfensters ({planningWindow.start}–
            {planningWindow.end}).
          </p>
        )}
        {(error ?? submitError) && (
          <p className={form.error} role="alert">
            {error ?? submitError}
          </p>
        )}
        <div className={form.actions}>
          <button type="button" className={form.button} onClick={onCancel}>
            Abbrechen
          </button>
          <button type="submit" className={`${form.button} ${form.primary}`} disabled={busy}>
            Speichern
          </button>
        </div>
      </form>
    </Dialog>
  )
}
