import type { SeriesScope } from '../../google/eventActions'
import styles from './EventDialog.module.css'

interface SeriesChoiceProps {
  scope: SeriesScope
  onChange: (scope: SeriesScope) => void
  /** Die Serie ist geladen; sonst ist „Ganze Serie“ nicht wählbar. */
  seriesReady: boolean
}

/** Rückfrage bei einem Serien-Vorkommen: nur dieser Termin oder die ganze Serie (SPEC §6.7). */
export function SeriesChoice({ scope, onChange, seriesReady }: SeriesChoiceProps) {
  return (
    <fieldset className={styles.choice}>
      <legend>Serientermin</legend>
      <label className={styles.option}>
        <input
          type="radio"
          name="scope"
          checked={scope === 'occurrence'}
          onChange={() => onChange('occurrence')}
        />
        Nur dieser Termin
      </label>
      <label className={styles.option}>
        <input
          type="radio"
          name="scope"
          checked={scope === 'series'}
          disabled={!seriesReady}
          onChange={() => onChange('series')}
        />
        Ganze Serie
      </label>
    </fieldset>
  )
}
