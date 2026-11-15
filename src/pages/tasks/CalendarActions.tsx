import { useRef, useState } from 'react'
import { ScheduleDialog } from '../../components/ScheduleDialog'
import { useSettings } from '../../data/hooks'
import type { Item } from '../../data/types'
import { GoogleError, googleErrorMessage } from '../../google/types'
import { formatDateTime } from '../../lib/format'
import { effectivePause } from '../../lib/planning'
import { scheduleItem } from '../../google/itemEvents'
import { rescheduleAutomatically, unscheduleItem } from './scheduling'
import styles from './TasksPage.module.css'

interface CalendarActionsProps {
  item: Item
  /** `overdue`: ✗ Nicht erledigt, Uhr-Symbol (selbst neu planen), – Aus Kalender; `task`: Uhr-Symbol. */
  variant: 'task' | 'overdue'
  /** Wird nach „Nicht erledigt“ mit der Bestätigung aufgerufen (die Zeile verschwindet danach). */
  onRescheduled?: (message: string) => void
}

const SERIES_MESSAGE = 'Serientermin – im Kalender bearbeiten oder „– Aus Kalender“ wählen.'

function failureMessage(error: unknown): string {
  return error instanceof GoogleError && error.kind === 'series'
    ? SERIES_MESSAGE
    : googleErrorMessage(error)
}

const NO_SLOT_MESSAGE =
  'In den nächsten 14 Tagen ist kein freier Zeitraum. Bitte wähle selbst einen Termin.'

/** Kalender-Aktionen eines Listeneintrags (Slots der Aufgabenseite, siehe `slots.ts`). */
export function CalendarActions({ item, variant, onRescheduled }: CalendarActionsProps) {
  const settings = useSettings()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const busyRef = useRef(false)

  // Ref statt State als Sperre, damit ein Doppelklick sicher nur eine Anfrage auslöst.
  // Gibt die Aktion `false` zurück, bleibt der (neu geöffnete) Dialog stehen.
  const run = async (action: () => Promise<void | false>, inDialog: boolean): Promise<void> => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    setDialogError(null)
    try {
      if ((await action()) !== false) setDialogOpen(false)
    } catch (caught) {
      // Im Dialog bleiben Eingaben und Dialog erhalten; sonst Meldung im Listeneintrag.
      if (inDialog) setDialogError(failureMessage(caught))
      else setError(failureMessage(caught))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const openDialog = (): void => {
    setDialogError(null)
    setDialogOpen(true)
  }

  const autoReschedule = async (): Promise<false | void> => {
    const start = await rescheduleAutomatically(
      item,
      settings.planningWindow,
      new Date(),
      effectivePause(settings),
    )
    if (start === null) {
      setError(NO_SLOT_MESSAGE)
      setDialogOpen(true)
      return false
    }
    onRescheduled?.(`Neu geplant: ${formatDateTime(start)}`)
  }

  const hasSchedule = item.schedule !== null
  const buttons =
    variant === 'overdue' ? (
      <>
        <button
          className={styles.textButton}
          aria-label="Nicht erledigt – automatisch neu planen"
          title="Nicht erledigt – automatisch neu planen"
          disabled={busy}
          onClick={() => void run(autoReschedule, false)}
        >
          ✗ Nicht erledigt
        </button>
        <button
          className={styles.iconButton}
          aria-label="Selbst neu planen"
          title="Selbst neu planen"
          disabled={busy}
          onClick={openDialog}
        >
          🕒
        </button>
        <button
          className={styles.textButton}
          aria-label="Aus dem Kalender nehmen"
          title="Aus dem Kalender nehmen"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const note = await unscheduleItem(item)
              if (note !== null) onRescheduled?.(note)
            }, false)
          }
        >
          – Aus Kalender
        </button>
      </>
    ) : (
      <button
        className={styles.iconButton}
        aria-label={hasSchedule ? 'Termin ändern' : 'Einplanen'}
        title={hasSchedule ? 'Termin ändern' : 'Einplanen'}
        disabled={busy}
        onClick={openDialog}
      >
        🕒
      </button>
    )

  return (
    <>
      {buttons}
      {error && (
        <p className={`${styles.error} ${styles.itemError}`} role="alert">
          {error}
        </p>
      )}
      {dialogOpen && (
        <ScheduleDialog
          title={hasSchedule && variant === 'task' ? 'Termin ändern' : 'Einplanen'}
          schedule={variant === 'task' ? item.schedule : null}
          durationMin={item.schedule?.durationMin ?? item.durationMin}
          planningWindow={settings.planningWindow}
          pause={effectivePause(settings)}
          busy={busy}
          submitError={dialogError}
          onSubmit={({ start, durationMin }) =>
            void run(() => scheduleItem(item, start, durationMin), true)
          }
          onCancel={() => setDialogOpen(false)}
        />
      )}
    </>
  )
}
