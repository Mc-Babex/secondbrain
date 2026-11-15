import { useCallback, useEffect, useRef, useState } from 'react'
import { hasClientId, loadGoogleScript } from '../../google/auth'
import type { Item } from '../../data/types'
import { CalendarActions } from './CalendarActions'
import { TasksPage } from './TasksPage'

const NOTICE_MS = 6000

const renderTaskActions = (item: Item) => <CalendarActions item={item} variant="task" />

/** Aufgabenseite mit Google-Kalender-Aktionen (Aufgabe 07). */
export function TasksPageWithCalendar() {
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Skript vorab laden, damit die spätere Token-Anfrage noch im Klick-Kontext (Popup-Blocker) läuft.
  useEffect(() => {
    if (hasClientId()) loadGoogleScript().catch(() => undefined)
  }, [])
  useEffect(() => () => clearTimeout(noticeTimer.current), [])

  // Die Bestätigung liegt hier, denn die Überfällig-Zeile verschwindet nach dem Neuplanen.
  const showNotice = useCallback((message: string): void => {
    setNotice(message)
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS)
  }, [])

  const renderOverdueActions = useCallback(
    (item: Item) => <CalendarActions item={item} variant="overdue" onRescheduled={showNotice} />,
    [showNotice],
  )

  return (
    <TasksPage
      renderOverdueActions={renderOverdueActions}
      renderTaskActions={renderTaskActions}
      notice={notice}
    />
  )
}
