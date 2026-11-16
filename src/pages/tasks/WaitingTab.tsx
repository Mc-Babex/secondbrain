import { useMemo, useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { answerReceived } from '../../data/repository'
import type { Item } from '../../data/types'
import { berlinDate, followUpDue, waitingDays, waitingItems } from '../../lib/gtd'
import { TaskRow } from './TaskRow'
import type { TaskListProps } from './taskListProps'
import { followUpText, sinceText } from './waitingText'
import styles from './TasksPage.module.css'

/** Reiter „Warte auf“ (SPEC §6.3.1): fällige Nachfragen zuerst, hervorgehoben, mit „Antwort erhalten“. */
export function WaitingTab(props: TaskListProps) {
  const { items, projects, now, recentIds, onComplete, onEdit, renderTaskActions } = props
  const [answering, setAnswering] = useState<Item | null>(null)
  const [error, setError] = useState<string | null>(null)

  const list = useMemo(() => waitingItems(items), [items])
  const projectNames = useMemo(() => new Map(projects.map((p) => [p.id, p.title])), [projects])
  const today = berlinDate(now)

  const complete = (item: Item): void => {
    setAnswering(null)
    onComplete(item)
  }
  const makeNextStep = (item: Item): void => {
    setAnswering(null)
    setError(null)
    answerReceived(item.id, 'naechster-schritt').then(onEdit, () =>
      setError('Das hat nicht geklappt. Bitte versuche es erneut.'),
    )
  }

  if (list.length === 0) return <p className={styles.empty}>Du wartest gerade auf nichts.</p>

  return (
    <>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <ul className={styles.list}>
        {list.map((item) => {
          const due = followUpDue(item, now)
          const followUpOn = item.waiting?.followUpOn
          return (
            <TaskRow
              key={item.id}
              item={item}
              now={now}
              isNew={recentIds.has(item.id)}
              projectName={item.projectId ? projectNames.get(item.projectId) : undefined}
              highlight={due}
              note={
                <p className={styles.waitNote}>
                  <span>{sinceText(waitingDays(item, now))}</span>
                  {typeof followUpOn === 'string' && (
                    <span className={due ? styles.followUpText : undefined}>
                      {due && <span aria-hidden="true">⚠ </span>}
                      {followUpText(followUpOn, today)}
                    </span>
                  )}
                </p>
              }
              onComplete={onComplete}
              onEdit={onEdit}
              actions={
                <>
                  <button className={styles.textButton} onClick={() => setAnswering(item)}>
                    Antwort erhalten
                    <span className={styles.srOnly}>: {item.title}</span>
                  </button>
                  {renderTaskActions?.(item)}
                </>
              }
            />
          )
        })}
      </ul>
      {answering && (
        <Dialog title="Antwort erhalten" onClose={() => setAnswering(null)}>
          <p className={styles.dialogText}>{answering.title}</p>
          <div className={styles.dialogChoices}>
            <button className={styles.textButton} onClick={() => complete(answering)}>
              Erledigt (archivieren)
            </button>
            <button className={styles.textButton} onClick={() => makeNextStep(answering)}>
              Daraus nächsten Schritt machen
            </button>
            <button className={styles.textButton} onClick={() => setAnswering(null)}>
              Abbrechen
            </button>
          </div>
        </Dialog>
      )}
    </>
  )
}
