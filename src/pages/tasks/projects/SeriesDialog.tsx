import { useMemo, useState, type FormEvent } from 'react'
import { Dialog } from '../../../components/Dialog'
import form from '../../../components/Form.module.css'
import { useItems } from '../../../data/hooks'
import { addSeries } from '../../../data/repository'
import type { Project, StepSeries } from '../../../data/types'
import { updateSeriesWithEvents } from '../../../google/seriesEvents'
import { formatDuration } from '../../../lib/format'
import { berlinDate } from '../../../lib/gtd'
import { previewNext } from '../../../lib/series'
import { DURATION_CHOICES, WEEKDAYS, formatDay } from './projectDates'
import {
  emptySeriesForm,
  seriesFieldsOf,
  seriesFormOf,
  validateSeriesForm,
  type EndMode,
  type SeriesForm,
} from './seriesForm'
import styles from './SeriesDialog.module.css'
import { userMessage } from './userMessage'

interface SeriesDialogProps {
  project: Project
  /** Ohne Angabe wird eine neue Serie angelegt, sonst die vorhandene bearbeitet. */
  series?: StepSeries
  onClose: () => void
}

/** Dialog zum Anlegen oder Bearbeiten einer Schritt-Serie (SPEC §3.12, §6.3.3) mit Vorschau. */
export function SeriesDialog({ project, series, onClose }: SeriesDialogProps) {
  const [values, setValues] = useState<SeriesForm>(() =>
    series ? seriesFormOf(series) : emptySeriesForm(berlinDate(new Date())),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const items = useItems()

  const set = <K extends keyof SeriesForm>(key: K, value: SeriesForm[K]): void =>
    setValues((current) => ({ ...current, [key]: value }))

  const preview = useMemo(() => {
    if (validateSeriesForm(values) !== null) return []
    const base: StepSeries = {
      ...seriesFieldsOf(values),
      id: series?.id ?? 'vorschau',
      state: 'aktiv',
      skippedDates: series?.skippedDates ?? [],
      lastNumber: series?.lastNumber ?? 0,
      lastDate: series?.lastDate ?? null,
    }
    return previewNext(base, 3)
  }, [values, series])

  // Start, Wochentag, Rhythmus oder Fälligkeit geändert und offene Blätter vorhanden ⇒ Hinweis (SPEC §6.3.3).
  const recalculates = useMemo(() => {
    if (!series || validateSeriesForm(values) !== null) return false
    const next = seriesFieldsOf(values)
    const changed =
      next.startDate !== series.startDate ||
      next.weekday !== series.weekday ||
      next.every !== series.every ||
      next.dueWeekday !== series.dueWeekday
    return (
      changed &&
      items.some(
        (i) =>
          i.projectId === project.id &&
          i.seriesId === series.id &&
          i.seriesNumber !== undefined &&
          i.status === 'offen',
      )
    )
  }, [values, series, items, project.id])

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault()
    if (busy) return
    const problem = validateSeriesForm(values)
    if (problem !== null) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    const fields = seriesFieldsOf(values)
    const save = series
      ? updateSeriesWithEvents(project.id, series.id, fields).then(({ note }) => note)
      : addSeries(project.id, fields).then(() => null)
    save.then(
      (note) => {
        if (note === null) onClose()
        else {
          setBusy(false)
          setNotice(`Serie gespeichert. ${note}`)
        }
      },
      (e: unknown) => {
        setBusy(false)
        setError(userMessage(e))
      },
    )
  }

  return (
    <Dialog
      title={series ? 'Serie bearbeiten' : 'Neue Serie'}
      initialFocus={series ? 'dialog' : 'first-field'}
      onClose={onClose}
    >
      <form className={form.form} onSubmit={onSubmit} noValidate>
        <label className={form.field}>
          Titelmuster
          <input
            className={form.input}
            value={values.titlePattern}
            onChange={(e) => set('titlePattern', e.target.value)}
            aria-describedby="series-pattern-hint"
          />
          <span id="series-pattern-hint">
            {'{Nr}'} wird durch die laufende Nummer ersetzt, z. B. „Übungsblatt {'{Nr}'}“.
          </span>
        </label>
        <div className={styles.row}>
          <label className={form.field}>
            Rhythmus
            <select
              className={form.input}
              value={values.every}
              onChange={(e) => set('every', e.target.value)}
            >
              <option value="1">Jede Woche</option>
              <option value="2">Alle 2 Wochen</option>
            </select>
          </label>
          <label className={form.field}>
            Neuer Schritt am
            <select
              className={form.input}
              value={values.weekday}
              onChange={(e) => set('weekday', e.target.value)}
            >
              {WEEKDAYS.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={form.field}>
          Startdatum
          <input
            className={form.input}
            type="date"
            value={values.startDate}
            onChange={(e) => set('startDate', e.target.value)}
          />
        </label>
        <div className={styles.row}>
          <label className={form.field}>
            Ende
            <select
              className={form.input}
              value={values.endMode}
              onChange={(e) => set('endMode', e.target.value as EndMode)}
            >
              <option value="none">Ohne Ende</option>
              <option value="date">Am Datum</option>
              <option value="count">Nach Anzahl</option>
            </select>
          </label>
          {values.endMode === 'date' && (
            <label className={form.field}>
              Enddatum
              <input
                className={form.input}
                type="date"
                value={values.endDate}
                onChange={(e) => set('endDate', e.target.value)}
              />
            </label>
          )}
          {values.endMode === 'count' && (
            <label className={form.field}>
              Anzahl
              <input
                className={form.input}
                type="number"
                inputMode="numeric"
                min={1}
                value={values.count}
                onChange={(e) => set('count', e.target.value)}
              />
            </label>
          )}
        </div>
        <div className={styles.row}>
          <label className={form.field}>
            Fällig am
            <select
              className={form.input}
              value={values.dueWeekday}
              onChange={(e) => set('dueWeekday', e.target.value)}
            >
              <option value="">Ohne Fälligkeit</option>
              {WEEKDAYS.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className={form.field}>
            Dauer
            <select
              className={form.input}
              value={values.durationMin}
              onChange={(e) => set('durationMin', e.target.value)}
            >
              <option value="">Ohne Dauer</option>
              {DURATION_CHOICES.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {formatDuration(minutes)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <section aria-label="Vorschau" className={styles.preview}>
          <h3 className={styles.previewTitle}>Nächste Schritte</h3>
          {preview.length === 0 ? (
            <p className={styles.previewEmpty}>
              {values.titlePattern.trim() === ''
                ? 'Titelmuster eingeben, um die Vorschau zu sehen.'
                : 'Keine weiteren Termine.'}
            </p>
          ) : (
            <ul className={styles.previewList}>
              {preview.map((entry) => (
                <li key={entry.number}>
                  {entry.title} · ab {formatDay(entry.date)}
                  {entry.dueDate !== null && `, fällig ${formatDay(entry.dueDate)}`}
                </li>
              ))}
            </ul>
          )}
        </section>
        {recalculates && <p role="note">Offene Blätter werden neu berechnet.</p>}
        {notice !== null && <p role="status">{notice}</p>}
        {error && (
          <p className={form.error} role="alert">
            {error}
          </p>
        )}
        <div className={form.actions}>
          <button type="button" className={form.button} onClick={onClose}>
            {notice === null ? 'Abbrechen' : 'Schließen'}
          </button>
          <button
            type="submit"
            className={`${form.button} ${form.primary}`}
            disabled={busy || notice !== null}
          >
            Speichern
          </button>
        </div>
      </form>
    </Dialog>
  )
}
