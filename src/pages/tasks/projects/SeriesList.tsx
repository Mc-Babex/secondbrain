import { useState } from 'react'
import { Dialog } from '../../../components/Dialog'
import form from '../../../components/Form.module.css'
import { endSeries, pauseSeries, resumeSeries } from '../../../data/repository'
import { validSeries } from '../../../data/types'
import type { Project, SeriesState, StepSeries } from '../../../data/types'
import { formatFullDay, formatDay, weekdayShort } from './projectDates'
import { SeriesDialog } from './SeriesDialog'
import styles from './SeriesList.module.css'
import { userMessage } from './userMessage'

const STATE_LABELS: Record<SeriesState, string> = {
  aktiv: 'Aktiv',
  pausiert: 'Pausiert',
  beendet: 'Beendet',
}

function rhythm(series: StepSeries): string {
  const every = series.every === 1 ? 'jede Woche' : `alle ${series.every} Wochen`
  return `${every} ${weekdayShort(series.weekday)}`
}

function endText(series: StepSeries): string {
  if (series.endDate !== null) return `bis ${formatFullDay(series.endDate)}`
  if (series.count !== null) return `${series.count} Mal`
  return 'ohne Ende'
}

function last(series: StepSeries): string {
  return series.lastNumber === 0 || series.lastDate === null
    ? 'noch nichts angelegt'
    : `zuletzt Nr. ${series.lastNumber} (${formatDay(series.lastDate)})`
}

/** Serien eines Projekts: Anzeige, Bearbeiten, Pausieren/Fortsetzen, Beenden (SPEC §6.3.3). */
export function SeriesList({ project }: { project: Project }) {
  const [dialog, setDialog] = useState<{ series?: StepSeries } | null>(null)
  const [endingSeries, setEnding] = useState<StepSeries | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = (action: Promise<unknown>): void => {
    setError(null)
    action.catch((e: unknown) => setError(userMessage(e)))
  }

  const list = validSeries(project)
  return (
    <section aria-labelledby="project-series" className={styles.section}>
      <h2 id="project-series" className={styles.heading}>
        Serien
      </h2>
      {list.length === 0 && <p className={styles.empty}>Keine Serien.</p>}
      {list.length > 0 && (
        <ul className={styles.list}>
          {list.map((series) => (
            <li key={series.id} className={styles.item}>
              <div className={styles.main}>
                <span className={styles.pattern}>{series.titlePattern}</span>
                <span className={styles.meta}>
                  {rhythm(series)}
                  {series.dueWeekday !== null && ` · fällig ${weekdayShort(series.dueWeekday)}`}
                  {` · ${endText(series)} · ${last(series)}`}
                </span>
                <span className={`${styles.state} ${styles[series.state]}`}>
                  {STATE_LABELS[series.state]}
                </span>
              </div>
              {series.state !== 'beendet' && (
                <div className={styles.buttons}>
                  <button
                    type="button"
                    className={styles.button}
                    aria-label={`Serie ${series.titlePattern} bearbeiten`}
                    onClick={() => setDialog({ series })}
                  >
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    className={styles.button}
                    aria-label={`Serie ${series.titlePattern} ${series.state === 'aktiv' ? 'pausieren' : 'fortsetzen'}`}
                    onClick={() =>
                      run(
                        series.state === 'aktiv'
                          ? pauseSeries(project.id, series.id)
                          : resumeSeries(project.id, series.id),
                      )
                    }
                  >
                    {series.state === 'aktiv' ? 'Pausieren' : 'Fortsetzen'}
                  </button>
                  <button
                    type="button"
                    className={styles.button}
                    aria-label={`Serie ${series.titlePattern} beenden`}
                    onClick={() => setEnding(series)}
                  >
                    Beenden
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="button" className={styles.button} onClick={() => setDialog({})}>
        Serie hinzufügen
      </button>
      {dialog && (
        <SeriesDialog project={project} series={dialog.series} onClose={() => setDialog(null)} />
      )}
      {endingSeries && (
        <Dialog title="Serie beenden?" onClose={() => setEnding(null)}>
          <p className={styles.confirmText}>
            „{endingSeries.titlePattern}“ legt danach keine neuen Schritte mehr an. Vorhandene
            Schritte bleiben.
          </p>
          <div className={form.actions}>
            <button type="button" className={form.button} onClick={() => setEnding(null)}>
              Abbrechen
            </button>
            <button
              type="button"
              className={`${form.button} ${form.danger}`}
              onClick={() => {
                run(endSeries(project.id, endingSeries.id))
                setEnding(null)
              }}
            >
              Ja, beenden
            </button>
          </div>
        </Dialog>
      )}
    </section>
  )
}
