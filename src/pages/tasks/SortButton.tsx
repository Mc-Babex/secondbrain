import type { SortPhase } from '../../data/sortTrigger'
import { MSG_NOT_SET_UP } from '../../lib/sortLock'
import { useOpenSettings } from '../../lib/openSettings'
import { useSortTrigger } from '../../data/useSortTrigger'
import styles from './SortButton.module.css'

function label(phase: SortPhase): string {
  if (phase === 'idle') return 'Jetzt sortieren'
  return phase === 'pruefen' ? 'Prüfe …' : 'Sortierung läuft …'
}

/** Knopf „Jetzt sortieren“ mit Statusmeldung (SPEC §6.3). */
export function SortButton() {
  const { state, start } = useSortTrigger()
  const openSettings = useOpenSettings()
  const busy = state.phase !== 'idle'
  return (
    <div className={styles.sort}>
      <button className={styles.button} disabled={busy} onClick={start}>
        {label(state.phase)}
      </button>
      {state.message && (
        <p className={styles.message} role="status">
          {state.message}
        </p>
      )}
      {state.message === MSG_NOT_SET_UP && (
        <button type="button" className={styles.link} onClick={openSettings}>
          Einstellungen
        </button>
      )}
    </div>
  )
}
