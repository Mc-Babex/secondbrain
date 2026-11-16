import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ItemEditor } from '../../components/ItemEditor'
import {
  useCategories,
  useInbox,
  useItems,
  useLastRun,
  useProjects,
  useSuggestions,
} from '../../data/hooks'
import type { Item } from '../../data/types'
import {
  completeItemWithEvent,
  restoreItemWithEvent,
  type RemovedSchedule,
} from '../../google/itemEvents'
import { BodyPortal } from '../../components/BodyPortal'
import { recentItemIds } from '../../lib/lastRun'
import { usePageVisible } from '../../lib/pageActive'
import { somedayItems, waitingItems, type TimeLimit } from '../../lib/gtd'
import { loadTab, loadTimeLimit, saveTab, saveTimeLimit, type TaskTab } from '../../lib/tabMemory'
import { InboxSection } from './InboxSection'
import { LastRunHints } from './LastRunHints'
import { CurrentTab } from './CurrentTab'
import { ProjectsTab } from './OtherTabs'
import { SomedayTab } from './SomedayTab'
import { WaitingTab } from './WaitingTab'
import type { TaskSlots } from './slots'
import { SuggestionsSection } from './SuggestionsSection'
import { panelId, tabId } from './tabIds'
import { TaskTabs } from './TaskTabs'
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
  const projects = useProjects()

  const [tab, setTab] = useState<TaskTab>(loadTab)
  const [timeLimit, setTimeLimit] = useState<TimeLimit>(loadTimeLimit)
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

  const selectTab = (next: TaskTab): void => {
    setTab(next)
    saveTab(next)
  }
  const selectTimeLimit = (limit: TimeLimit): void => {
    setTimeLimit(limit)
    saveTimeLimit(limit)
  }

  // Solange die Ablagen noch laden, nichts anzeigen (sonst würden Aufgaben kurz als „Ohne Ablage" erscheinen).
  const loading = categories.length === 0
  const recentIds = useMemo(() => recentItemIds(lastRun, now), [lastRun, now])
  const counts = useMemo(
    () => ({
      projekte: projects.filter((p) => p.status === 'aktiv').length,
      warten: waitingItems(items).length,
      irgendwann: somedayItems(items).length,
    }),
    [items, projects],
  )
  const listProps = {
    items,
    categories,
    projects,
    now,
    recentIds,
    onComplete,
    onEdit: setEditing,
    renderOverdueActions,
    renderTaskActions,
  }

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
          <LastRunHints lastRun={lastRun} now={now} />
          <InboxSection entries={inbox} categories={categories} run={run} />
          <TaskTabs active={tab} onSelect={selectTab} counts={counts} />
          <div
            key={tab}
            id={panelId(tab)}
            role="tabpanel"
            aria-labelledby={tabId(tab)}
            className={styles.panel}
          >
            {tab === 'aktuell' && (
              <CurrentTab {...listProps} timeLimit={timeLimit} onTimeLimit={selectTimeLimit} />
            )}
            {tab === 'projekte' && <ProjectsTab {...listProps} />}
            {tab === 'warten' && <WaitingTab {...listProps} />}
            {tab === 'irgendwann' && <SomedayTab {...listProps} />}
          </div>
        </>
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
