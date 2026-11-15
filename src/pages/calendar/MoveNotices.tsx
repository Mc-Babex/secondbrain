import { useState } from 'react'
import { BodyPortal } from '../../components/BodyPortal'
import { Dialog } from '../../components/Dialog'
import form from '../../components/Form.module.css'
import type { SendUpdates } from '../../google/types'
import type { MoveToast } from './useEventMoves'
import dialogStyles from './EventDialog.module.css'
import styles from './CalendarPage.module.css'

/** Meldung nach dem Ziehen (5 s) mit „Rückgängig“; Fehler als Hinweis ohne Knopf. */
export function MoveToastView({ toast }: { toast: MoveToast }) {
  return (
    <BodyPortal>
      <div className={styles.toast} role={toast.error ? 'alert' : 'status'}>
        <span>{toast.text}</span>
        {toast.undo && (
          <button type="button" className={styles.toastButton} onClick={toast.undo}>
            Rückgängig
          </button>
        )}
      </div>
    </BodyPortal>
  )
}

/** Rückfrage „Gäste benachrichtigen?“ nach dem Loslassen (SPEC §6.7); `null` = abgebrochen. */
export function GuestPrompt({ onAnswer }: { onAnswer: (sendUpdates: SendUpdates | null) => void }) {
  const [notify, setNotify] = useState<SendUpdates>('none')
  return (
    <Dialog title="Termin ändern" onClose={() => onAnswer(null)}>
      <div className={form.form}>
        <fieldset className={dialogStyles.choice}>
          <legend>Gäste benachrichtigen?</legend>
          <label className={dialogStyles.option}>
            <input
              type="radio"
              name="move-notify"
              checked={notify === 'none'}
              onChange={() => setNotify('none')}
            />
            Nein
          </label>
          <label className={dialogStyles.option}>
            <input
              type="radio"
              name="move-notify"
              checked={notify === 'all'}
              onChange={() => setNotify('all')}
            />
            Ja
          </label>
        </fieldset>
        <div className={form.actions}>
          <button type="button" className={form.button} onClick={() => onAnswer(null)}>
            Abbrechen
          </button>
          <button
            type="button"
            className={`${form.button} ${form.primary}`}
            onClick={() => onAnswer(notify)}
          >
            Speichern
          </button>
        </div>
      </div>
    </Dialog>
  )
}
