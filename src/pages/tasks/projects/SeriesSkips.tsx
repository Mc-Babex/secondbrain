import { useState } from 'react'
import { Dialog } from '../../../components/Dialog'
import form from '../../../components/Form.module.css'
import { addSkippedDate, removeSkippedDate } from '../../../data/repository'
import type { StepSeries } from '../../../data/types'
import { futureSkips, upcomingOccurrences } from '../../../lib/series'
import { formatDay } from './projectDates'
import styles from './SeriesList.module.css'

interface SeriesSkipsProps {
  projectId: string
  series: StepSeries
  /** Führt die Aktion aus und zeigt Fehler an (gemeinsam mit den anderen Serien-Knöpfen). */
  run: (action: Promise<unknown>) => void
}

/** Künftige Ausfälle einer Serie (mit „Entfernen“) und „Ausfall eintragen“ (SPEC §3.12, §6.3.3). */
export function SeriesSkips({ projectId, series, run }: SeriesSkipsProps) {
  const [choosing, setChoosing] = useState(false)
  const candidates = upcomingOccurrences(series, 8)
  const [date, setDate] = useState('')
  const skips = futureSkips(series)

  return (
    <div className={styles.skips}>
      {skips.length > 0 && (
        <ul className={styles.skipList} aria-label={`Ausfälle von ${series.titlePattern}`}>
          {skips.map((day) => (
            <li key={day}>
              Fällt aus: {formatDay(day)}
              <button
                type="button"
                className={styles.button}
                aria-label={`Ausfall ${formatDay(day)} entfernen`}
                onClick={() => run(removeSkippedDate(projectId, series.id, day))}
              >
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      )}
      {series.state !== 'beendet' && (
        <button
          type="button"
          className={styles.button}
          aria-label={`Ausfall für ${series.titlePattern} eintragen`}
          onClick={() => {
            setDate(candidates[0] ?? '')
            setChoosing(true)
          }}
        >
          Ausfall eintragen
        </button>
      )}
      {choosing && (
        <Dialog title="Ausfall eintragen" onClose={() => setChoosing(false)}>
          {candidates.length === 0 ? (
            <p className={styles.confirmText}>Keine weiteren Termine.</p>
          ) : (
            <label className={form.field}>
              Stichtag
              <select className={form.input} value={date} onChange={(e) => setDate(e.target.value)}>
                {candidates.map((day) => (
                  <option key={day} value={day}>
                    {formatDay(day)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className={form.actions}>
            <button type="button" className={form.button} onClick={() => setChoosing(false)}>
              Abbrechen
            </button>
            <button
              type="button"
              className={`${form.button} ${form.primary}`}
              disabled={date === ''}
              onClick={() => {
                run(addSkippedDate(projectId, series.id, date))
                setChoosing(false)
              }}
            >
              Eintragen
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
