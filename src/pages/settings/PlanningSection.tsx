import { useState, type FormEvent } from 'react'
import form from '../../components/Form.module.css'
import { useSettings } from '../../data/hooks'
import { saveSettings } from '../../data/repository'
import type { Settings } from '../../data/types'
import { DEFAULT_PAUSE } from '../../lib/planning'
import { validatePause, validatePlanningWindow } from './githubForm'
import { Section } from './Section'
import styles from './SettingsPage.module.css'

interface PlanningFormProps {
  settings: Settings
}

function PlanningForm({ settings }: PlanningFormProps) {
  const [start, setStart] = useState(settings.planningWindow.start)
  const [end, setEnd] = useState(settings.planningWindow.end)
  const storedPause = settings.pause === undefined ? DEFAULT_PAUSE : settings.pause
  const [pauseOn, setPauseOn] = useState(storedPause !== null)
  const [pauseStart, setPauseStart] = useState(storedPause?.start ?? DEFAULT_PAUSE.start)
  const [pauseEnd, setPauseEnd] = useState(storedPause?.end ?? DEFAULT_PAUSE.end)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const problem = validatePlanningWindow(start, end)
    if (problem) {
      setMessage({ kind: 'error', text: problem })
      return
    }
    const pause = pauseOn ? { start: pauseStart, end: pauseEnd } : null
    const pauseProblem = pause ? validatePause({ start, end }, pause) : null
    if (pauseProblem) {
      setMessage({ kind: 'error', text: pauseProblem })
      return
    }
    try {
      await saveSettings({ ...settings, planningWindow: { start, end }, pause })
      setMessage({ kind: 'ok', text: 'Gespeichert.' })
    } catch {
      setMessage({ kind: 'error', text: 'Speichern fehlgeschlagen.' })
    }
  }

  return (
    <form className={form.form} onSubmit={(event) => void save(event)}>
      <label className={form.field}>
        Beginn
        <input
          className={form.input}
          type="time"
          step={900}
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
      </label>
      <label className={form.field}>
        Ende
        <input
          className={form.input}
          type="time"
          step={900}
          value={end}
          onChange={(event) => setEnd(event.target.value)}
        />
      </label>
      <label className={form.check}>
        <input
          type="checkbox"
          checked={pauseOn}
          onChange={(event) => setPauseOn(event.target.checked)}
        />
        Pause
      </label>
      {pauseOn && (
        <>
          <label className={form.field}>
            Pause Beginn
            <input
              className={form.input}
              type="time"
              step={900}
              value={pauseStart}
              onChange={(event) => setPauseStart(event.target.value)}
            />
          </label>
          <label className={form.field}>
            Pause Ende
            <input
              className={form.input}
              type="time"
              step={900}
              value={pauseEnd}
              onChange={(event) => setPauseEnd(event.target.value)}
            />
          </label>
        </>
      )}
      <div role="status" aria-live="polite">
        {message && (
          <p className={message.kind === 'ok' ? styles.ok : form.error}>{message.text}</p>
        )}
      </div>
      <div className={form.actions}>
        <button type="submit" className={`${form.button} ${form.primary}`}>
          Fenster speichern
        </button>
      </div>
    </form>
  )
}

export function PlanningSection() {
  const settings = useSettings()
  // Schlüssel: Formular wird neu aufgebaut, wenn die gespeicherten Werte (nach dem Laden) wechseln.
  const pause = settings.pause === undefined ? 'standard' : (settings.pause ?? 'aus')
  const key = `${settings.planningWindow.start}-${settings.planningWindow.end}-${typeof pause === 'string' ? pause : `${pause.start}-${pause.end}`}`
  return (
    <Section title="Planungsfenster">
      <PlanningForm key={key} settings={settings} />
    </Section>
  )
}
