import { BodyPortal } from '../../components/BodyPortal'
import { NextStepDialog } from './projects/NextStepDialog'
import type { StepCompletion } from './useStepCompletion'
import styles from './CompletionNotices.module.css'

/** Meldungen zum Erledigen: Fehler, „Erledigt – Rückgängig“, „Weiter mit …“ und der Dialog zum nächsten Schritt. */
export function CompletionNotices({ completion }: { completion: StepCompletion }) {
  const { done, undo, hint, dialogProject, closeDialog, error } = completion
  return (
    <>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {(done || hint) && (
        <BodyPortal>
          <div className={styles.stack}>
            {hint && (
              <div className={styles.toast} role="status">
                {hint}
              </div>
            )}
            {done && (
              <div className={styles.toast} role="status">
                <span>{done.note ? `Erledigt. ${done.note}` : 'Erledigt'}</span>
                <button type="button" className={styles.undo} onClick={undo}>
                  Rückgängig
                </button>
              </div>
            )}
          </div>
        </BodyPortal>
      )}
      {dialogProject && <NextStepDialog project={dialogProject} onClose={closeDialog} />}
    </>
  )
}
