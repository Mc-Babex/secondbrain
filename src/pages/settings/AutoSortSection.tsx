import { useState } from 'react'
import form from '../../components/Form.module.css'
import { useSettings } from '../../data/hooks'
import { clearPendingAutoSort } from '../../data/pendingAutoSort'
import { saveSettings } from '../../data/repository'
import { isAutoSortEnabled } from '../../data/types'
import { TESTER_GUIDE_URL } from '../../lib/links'
import { Section } from './Section'
import styles from './SettingsPage.module.css'

/** Schalter „Mit Claude sortieren“ (SPEC §6.5). */
export function AutoSortSection() {
  const settings = useSettings()
  const enabled = isAutoSortEnabled(settings)
  const [failed, setFailed] = useState(false)

  const toggle = async (checked: boolean): Promise<void> => {
    try {
      await saveSettings({ ...settings, autoSort: checked })
      clearPendingAutoSort()
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }

  return (
    <Section title="Automatisches Sortieren">
      <label className={form.check}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => void toggle(event.target.checked)}
        />
        Mit Claude sortieren
      </label>
      <p className={styles.hint}>
        {enabled
          ? 'Claude sortiert den Eingangskorb über deine eigene Routine. '
          : 'Einträge sortierst du selbst über ‚In Ablage…‘ im Eingangskorb. '}
        <a href={TESTER_GUIDE_URL} target="_blank" rel="noopener noreferrer">
          {enabled ? 'Anleitung' : 'Anleitung zum Einrichten'}
        </a>
      </p>
      {failed && <p className={form.error}>Speichern fehlgeschlagen.</p>}
    </Section>
  )
}
