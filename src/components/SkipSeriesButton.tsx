import { useState } from 'react'
import { useProjects } from '../data/hooks'
import type { Item } from '../data/types'
import { validSeries } from '../data/types'
import { skipInstanceWithEvents, unskipInstanceWithEvents } from '../google/seriesEvents'
import { addDays, instanceSkips } from '../lib/series'
import { formatDay } from '../pages/tasks/projects/projectDates'
import form from './Form.module.css'

const FAILED = 'Das hat nicht geklappt. Bitte versuche es erneut.'

const weeksText = (weeks: number): string =>
  weeks === 1 ? 'eine Woche' : weeks === 2 ? 'zwei Wochen' : `${weeks} Wochen`

interface SkipSeriesButtonProps {
  item: Item
  /** Meldet das neue `dueDate` (bzw. `null`) nach „Fällt aus“ und „Ausfall zurücknehmen“. */
  onDueDateChange?: (dueDate: string | null) => void
}

/**
 * „Fällt aus – 1 Woche später“, „Rückgängig“ und „Ausfall zurücknehmen“ für offene Instanzen einer
 * laufenden Schritt-Serie (SPEC §3.12, §6.3.2). Erscheint sonst nicht.
 */
export function SkipSeriesButton({ item, onDueDateChange }: SkipSeriesButtonProps) {
  const projects = useProjects()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Stand des Blatts nach den Aktionen hier (das Blatt der Aufrufer bleibt unverändert).
  const [dueDate, setDueDate] = useState<string | null>(item.dueDate ?? null)
  const [justSkipped, setJustSkipped] = useState(false)

  const series = validSeries({
    series: projects.find((p) => p.id === item.projectId)?.series ?? [],
  }).find((s) => s.id === item.seriesId)
  if (item.status !== 'offen' || series === undefined || series.state === 'beendet') return null

  const label = series.every === 1 ? '1 Woche' : `${series.every} Wochen`
  const hasSkips = instanceSkips(series, item.seriesNumber ?? 0).length > 0
  const backDate = dueDate ? addDays(dueDate, -7 * series.every) : null

  const act = (
    run: typeof skipInstanceWithEvents,
    text: (result: Item, weeks: number) => string,
    skipped: boolean,
  ): void => {
    setBusy(true)
    setError(null)
    run(item.id).then(
      ({ result, note }) => {
        setDueDate(result.item.dueDate ?? null)
        onDueDateChange?.(result.item.dueDate ?? null)
        setJustSkipped(skipped)
        setMessage(`${text(result.item, result.weeks)}${note ? `. ${note}` : ''}`)
        setBusy(false)
      },
      () => {
        setError(FAILED)
        setBusy(false)
      },
    )
  }

  const skip = (): void =>
    act(
      skipInstanceWithEvents,
      (result, weeks) =>
        `${result.dueDate ? `Fällig jetzt ${formatDay(result.dueDate)} – ` : ''}folgende Blätter ${weeksText(weeks)} später`,
      true,
    )
  const unskip = (): void =>
    act(
      unskipInstanceWithEvents,
      (_result, weeks) =>
        `Ausfall zurückgenommen – folgende Blätter wieder ${weeksText(weeks)} früher`,
      false,
    )

  return (
    <div>
      <button type="button" className={form.button} disabled={busy} onClick={skip}>
        Fällt aus – {label} später
      </button>
      {justSkipped && (
        <button type="button" className={form.button} disabled={busy} onClick={unskip}>
          Rückgängig
        </button>
      )}
      {hasSkips && !justSkipped && (
        <button type="button" className={form.button} disabled={busy} onClick={unskip}>
          Ausfall zurücknehmen{backDate ? ` – fällig wieder ${formatDay(backDate)}` : ''}
        </button>
      )}
      {message !== null && <p role="status">{message}</p>}
      {error !== null && (
        <p className={form.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
