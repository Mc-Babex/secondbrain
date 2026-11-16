import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { recentItemIds } from '../../lib/lastRun'
import { usePageVisible } from '../../lib/pageActive'
import { somedayItems, waitingItems, type TimeLimit } from '../../lib/gtd'
import { loadTab, loadTimeLimit, saveTab, saveTimeLimit, type TaskTab } from '../../lib/tabMemory'
import { InboxSection } from './InboxSection'
import { LastRunHints } from './LastRunHints'
import { CurrentTab } from './CurrentTab'
import { CompletionNotices } from './CompletionNotices'
import { ProjectsTab } from './projects/ProjectsTab'
import { ProjectView } from './projects/ProjectView'
import { SomedayTab } from './SomedayTab'
import { WaitingTab } from './WaitingTab'
import type { TaskSlots } from './slots'
import { SuggestionsSection } from './SuggestionsSection'
import { panelId, tabId } from './tabIds'
import { TaskTabs } from './TaskTabs'
import { useStepCompletion } from './useStepCompletion'
import { useTransientNote } from './useTransientNote'
import styles from './TasksPage.module.css'

const CLOCK_MS = 60_000
const NOTE_MS = 6000

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
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const [projectNote, showProjectNote] = useTransientNote(NOTE_MS)
  const [error, setError] = useState<string | null>(null)
  const completion = useStepCompletion(items, projects)

  const visible = usePageVisible()
  useEffect(() => {
    if (!visible) return undefined
    const timer = setInterval(() => setNow(new Date()), CLOCK_MS)
    return () => clearInterval(timer)
  }, [visible])

  const run = useCallback((action: () => Promise<unknown>): void => {
    setError(null)
    action().catch(() => setError('Das hat nicht geklappt. Bitte versuche es erneut.'))
  }, [])

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
    onComplete: completion.complete,
    onEdit: setEditing,
    renderOverdueActions,
    renderTaskActions,
  }

  const closeProject = useCallback(
    (note?: string | null): void => {
      setOpenProjectId(null)
      showProjectNote(note ?? null)
    },
    [showProjectNote],
  )

  if (openProjectId && projects.some((p) => p.id === openProjectId && p.status === 'aktiv')) {
    return (
      <ProjectView
        projectId={openProjectId}
        backLabel="Zurück zu den Aufgaben"
        onBack={closeProject}
      />
    )
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Aufgaben</h1>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {(notice ?? projectNote) && (
        <p className={styles.notice} role="status">
          {notice ?? projectNote}
        </p>
      )}
      <CompletionNotices completion={completion} />
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
            {tab === 'projekte' && (
              <ProjectsTab
                items={items}
                categories={categories}
                projects={projects}
                onOpen={setOpenProjectId}
              />
            )}
            {tab === 'warten' && <WaitingTab {...listProps} />}
            {tab === 'irgendwann' && <SomedayTab {...listProps} />}
          </div>
        </>
      )}
      {editing && (
        <ItemEditor item={editing} categories={categories} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
