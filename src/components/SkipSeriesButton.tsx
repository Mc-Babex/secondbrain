import { useState } from 'react'
import { useProjects } from '../data/hooks'
import type { Item } from '../data/types'
import { validSeries } from '../data/types'
import { skipInstanceWithEvents } from '../google/seriesEvents'
import { formatDay } from '../pages/tasks/projects/projectDates'
import form from './Form.module.css'

const FAILED = 'Das hat nicht geklappt. Bitte versuche es erneut.'

/**
 * „Fällt aus – 1 Woche später“ für offene Instanzen einer laufenden Schritt-Serie (SPEC §3.12, §6.3.2).
 * Erscheint sonst nicht.
 */
export function SkipSeriesButton({ item }: { item: Item }) {
  const projects = useProjects()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const series = validSeries({
    series: projects.find((p) => p.id === item.projectId)?.series ?? [],
  }).find((s) => s.id === item.seriesId)
  if (item.status !== 'offen' || series === undefined || series.state === 'beendet') return null

  const label = series.every === 1 ? '1 Woche' : `${series.every} Wochen`
  const onClick = (): void => {
    setBusy(true)
    setError(null)
    skipInstanceWithEvents(item.id).then(
      ({ result, note }) => {
        const weeks =
          result.weeks === 1
            ? 'eine Woche'
            : result.weeks === 2
              ? 'zwei Wochen'
              : `${result.weeks} Wochen`
        const due = result.item.dueDate ? `Fällig jetzt ${formatDay(result.item.dueDate)} – ` : ''
        setMessage(`${due}folgende Blätter ${weeks} später${note ? `. ${note}` : ''}`)
        setBusy(false)
      },
      () => {
        setError(FAILED)
        setBusy(false)
      },
    )
  }

  return (
    <div>
      <button type="button" className={form.button} disabled={busy} onClick={onClick}>
        Fällt aus – {label} später
      </button>
      {message !== null && <p role="status">{message}</p>}
      {error !== null && (
        <p className={form.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
