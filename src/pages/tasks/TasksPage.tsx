import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ItemEditor } from '../../components/ItemEditor'
import { useCategories, useInbox, useItems, useLastRun, useSuggestions } from '../../data/hooks'
import type { Item } from '../../data/types'
import {
  completeItemWithEvent,
  restoreItemWithEvent,
  type RemovedSchedule,
} from '../../google/itemEvents'
import { BodyPortal } from '../../components/BodyPortal'
import { recentItemIds } from '../../lib/lastRun'
import { usePageVisible } from '../../lib/pageActive'
import { buildTaskView } from '../../lib/taskGroups'
import { InboxSection } from './InboxSection'
import { LastRunHints } from './LastRunHints'
import { OverdueSection } from './OverdueSection'
import type { TaskSlots } from './slots'
import { SuggestionsSection } from './SuggestionsSection'
import { TaskGroups } from './TaskGroups'
import styles from './TasksPage.module.css'

const UNDO_MS = 5000
const CLOCK_MS = 60_000

/** Aufgabenseite laut SPEC §6.3 (ohne Kalender-Funktionen; Erweiterungspunkte siehe `slots.ts`). */
export function TasksPage({
  renderOverdueActions,
  renderTaskActions,
  notice = null,
}: TaskSlots & { notice?: string | null } = {}) {
  const items = useItems()
  const categories = useCategories()
  const inbox = useInbox()
  const suggestions = useSuggestions()
  const lastRun = useLastRun()

  const [now, setNow] = useState(() => new Date())
  const [editing, setEditing] = useState<Item | null>(null)
  const [undo, setUndo] = useState<Item | null>(null)
  const [undoNote, setUndoNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const removedSchedule = useRef<RemovedSchedule | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const visible = usePageVisible()
  useEffect(() => {
    if (!visible) return undefined
    const timer = setInterval(() => setNow(new Date()), CLOCK_MS)
    return () => clearInterval(timer)
  }, [visible])
  useEffect(() => () => clearTimeout(undoTimer.current), [])

  const run = useCallback((action: () => Promise<unknown>): void => {
    setError(null)
    action().catch(() => setError('Das hat nicht geklappt. Bitte versuche es erneut.'))
  }, [])

  const onComplete = useCallback(
    (item: Item): void => {
      run(async () => {
        const result = await completeItemWithEvent(item)
        setUndoNote(result.note)
        removedSchedule.current = result.removed
        setUndo(item)
        clearTimeout(undoTimer.current)
        undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS)
      })
    },
    [run],
  )

  const onUndo = (): void => {
    if (!undo) return
    const { id } = undo
    const removed = removedSchedule.current
    clearTimeout(undoTimer.current)
    setUndo(null)
    run(async () => {
      const hint = await restoreItemWithEvent(id, removed)
      if (hint) setError(hint)
    })
  }

  // Solange die Ablagen noch laden, nichts anzeigen (sonst würden Aufgaben kurz als „Ohne Ablage" erscheinen).
  const loading = categories.length === 0
  const view = useMemo(() => buildTaskView(items, categories, now), [items, categories, now])
  const recentIds = useMemo(() => recentItemIds(lastRun, now), [lastRun, now])
  const isEmpty = !loading && view.overdue.length === 0 && view.groups.length === 0

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Aufgaben</h1>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      {!loading && (
        <>
          <SuggestionsSection suggestions={suggestions} categories={categories} run={run} />
          <OverdueSection
            items={view.overdue}
            onComplete={onComplete}
            renderOverdueActions={renderOverdueActions}
          />
          <LastRunHints lastRun={lastRun} now={now} />
          <InboxSection entries={inbox} categories={categories} run={run} />
          <TaskGroups
            groups={view.groups}
            recentIds={recentIds}
            onComplete={onComplete}
            onEdit={setEditing}
            renderTaskActions={renderTaskActions}
          />
        </>
      )}
      {isEmpty && (
        <p className={styles.empty}>
          Keine offenen Aufgaben. Neue Gedanken hältst du auf der Erfassungsseite fest.
        </p>
      )}
      {undo && (
        <BodyPortal>
          <div className={styles.toast} role="status">
            <span>{undoNote ? `Erledigt. ${undoNote}` : 'Erledigt'}</span>
            <button className={styles.toastButton} onClick={onUndo}>
              Rückgängig
            </button>
          </div>
        </BodyPortal>
      )}
      {editing && (
        <ItemEditor item={editing} categories={categories} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
