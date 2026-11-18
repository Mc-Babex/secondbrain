import { useEffect, useMemo, useRef, useState } from 'react'
import { ItemEditor } from '../../components/ItemEditor'
import form from '../../components/Form.module.css'
import { useCategories, useItems, useSettings } from '../../data/hooks'
import type { Item } from '../../data/types'
import { useCalendarEvents, useGoogleConnected } from '../../google/hooks'
import type { CalendarEvent } from '../../google/types'
import {
  DAY_MINUTES,
  allDayEvents,
  nowMinutes,
  rangeLabel,
  shiftAnchor,
  viewRange,
  type ViewMode,
} from '../../lib/calendarView'
import { usePageVisible } from '../../lib/pageActive'
import { effectivePause, timeToMinutes } from '../../lib/planning'
import { zonedParts } from '../../lib/time'
import { CalendarHeader } from './CalendarHeader'
import { ConnectionNotice } from './ConnectionNotice'
import { DayColumn } from './DayColumn'
import type { HoldPlace } from './useFreeHold'
import { EventDialog } from './EventDialog'
import { EventTile } from './EventTile'
import { GuestPrompt, MoveToastView } from './MoveNotices'
import { useEventMoves } from './useEventMoves'
import type { EventForm } from './eventForm'
import { dayOfDate, plusDraft, holdDraftAt } from './newEvent'
import { dayFullLabel, dayShortLabel, dayToAnchor } from './dayLabels'
import styles from './CalendarPage.module.css'

const MODE_KEY = 'secondbrain.calendarMode'
const HOUR_PX = 48
const NOW_TICK_MS = 60_000
const NOTICE_MS = 5000
const TASK_CREATED_NOTICE = 'Termin angelegt – auch als Aufgabe abgelegt'

function loadMode(): ViewMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'woche' ? 'woche' : 'tag'
  } catch {
    return 'tag'
  }
}

function saveMode(mode: ViewMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    // Ohne Speicher startet die Seite beim nächsten Mal wieder mit der Tagesansicht.
  }
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

export function CalendarPage() {
  const [mode, setMode] = useState<ViewMode>(loadMode)
  const [anchor, setAnchor] = useState(() => new Date())
  const [now, setNow] = useState(() => new Date())
  const [editing, setEditing] = useState<Item | null>(null)
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null)
  const [draft, setDraft] = useState<EventForm | null>(null)
  const [connectHint, setConnectHint] = useState(false)
  const items = useItems()
  const categories = useCategories()
  const settings = useSettings()
  const { planningWindow } = settings
  const pauseWindow = effectivePause(settings)
  const connected = useGoogleConnected()
  const scroller = useRef<HTMLDivElement>(null)
  const lastScrollAt = useRef(0)
  const [holdMark, setHoldMark] = useState<HoldPlace | null>(null)
  const [createdNotice, setCreatedNotice] = useState(false)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(noticeTimer.current), [])

  const range = useMemo(() => viewRange(anchor, mode), [anchor, mode])
  const { events: loaded, status, error, reload } = useCalendarEvents(connected ? range : null)

  const visible = usePageVisible()
  useEffect(() => {
    if (!visible) return undefined
    const timer = window.setInterval(() => setNow(new Date()), NOW_TICK_MS)
    return () => window.clearInterval(timer)
  }, [visible])

  // Beim Öffnen auf die aktuelle Uhrzeit scrollen (eine Stunde Vorlauf).
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const parts = zonedParts(new Date())
    const target = parts.hour * 60 + parts.minute
    element.scrollTop = Math.max(0, ((target - 60) / 60) * HOUR_PX)
  }, [])

  // Termin-ID → Eintrag; Vorkommen einer verknüpften Serie zählen über `recurringEventId`.
  const itemsByEventId = useMemo(() => {
    const linked = new Map<string, Item>()
    for (const item of items) {
      const id = item.schedule?.calendarEventId
      if (id) linked.set(id, item)
    }
    const map = new Map(linked)
    for (const event of loaded) {
      const item = event.recurringEventId ? linked.get(event.recurringEventId) : undefined
      if (item && !map.has(event.id)) map.set(event.id, item)
    }
    return map
  }, [items, loaded])

  const moves = useEventMoves(loaded, (event) => itemsByEventId.get(event.id) ?? null, reload)
  const events = moves.shown
  const dragEnv = useMemo(() => ({ scroller, onCommit: moves.commit }), [moves.commit])

  const planning = {
    startMin: timeToMinutes(planningWindow.start),
    endMin: timeToMinutes(planningWindow.end),
  }

  const pause = pauseWindow
    ? { startMin: timeToMinutes(pauseWindow.start), endMin: timeToMinutes(pauseWindow.end) }
    : null

  const changeMode = (next: ViewMode): void => {
    setMode(next)
    saveMode(next)
  }
  const openDay = (day: string): void => {
    setAnchor(dayToAnchor(day))
    changeMode('tag')
  }

  const newEvent = (): void => {
    if (!connected) {
      setConnectHint(true)
      return
    }
    setDraft(plusDraft(dayOfDate(anchor), new Date(), planning.startMin))
  }
  const holdFree = (day: string, startMin: number): void => {
    if (connected) setDraft(holdDraftAt(day, startMin))
    else setConnectHint(true)
  }

  const showCreatedNotice = (): void => {
    clearTimeout(noticeTimer.current)
    setCreatedNotice(true)
    noticeTimer.current = setTimeout(() => setCreatedNotice(false), NOTICE_MS)
  }

  const columns = `3rem repeat(${range.days.length}, minmax(0, 1fr))`
  const gridStyle = { gridTemplateColumns: columns }
  const week = mode === 'woche'
  const hasEvents = events.length > 0

  return (
    <div className={styles.page}>
      <CalendarHeader
        label={rangeLabel(range, mode)}
        mode={mode}
        onMode={changeMode}
        onShift={(step) => setAnchor(shiftAnchor(anchor, mode, step))}
        onToday={() => setAnchor(new Date())}
        onNew={newEvent}
      />

      {!connected && connectHint && (
        <p className={styles.hint} role="status">
          Mit Google verbinden, um Termine anzulegen.
        </p>
      )}
      {!connected && <ConnectionNotice />}
      {connected && status === 'laedt' && (
        <p className={styles.hint} role="status">
          Lade Termine …
        </p>
      )}
      {connected && status === 'fehler' && error && (
        <div className={styles.notice}>
          <p className={form.error} role="alert">
            {error}
          </p>
          <button
            type="button"
            className={form.button}
            onClick={() => reload({ interactive: true })}
          >
            Erneut versuchen
          </button>
        </div>
      )}
      {connected && status === 'bereit' && !hasEvents && (
        <p className={styles.hint} role="status">
          Keine Termine
        </p>
      )}

      {week && (
        <div className={styles.row} style={gridStyle}>
          <span />
          {range.days.map((day) => (
            <button
              key={day}
              type="button"
              className={`${styles.dayHead} ${nowMinutes(now, day) !== null ? styles.todayHead : ''}`}
              aria-label={dayFullLabel(day)}
              title={dayFullLabel(day)}
              onClick={() => openDay(day)}
            >
              {dayShortLabel(day)}
            </button>
          ))}
        </div>
      )}

      <div className={styles.row} style={gridStyle} data-testid="allday-bar">
        <span className={styles.axisNote}>ganztägig</span>
        {range.days.map((day) => (
          <div key={day} className={styles.allDayCell}>
            {allDayEvents(events, day).map((event) => (
              <EventTile
                key={event.id}
                event={event}
                item={itemsByEventId.get(event.id) ?? null}
                onOpen={setOpenEvent}
              />
            ))}
          </div>
        ))}
      </div>

      <div
        className={styles.scroller}
        ref={scroller}
        onScroll={() => {
          lastScrollAt.current = Date.now()
        }}
      >
        <div
          className={styles.grid}
          style={{ ...gridStyle, height: `${24 * HOUR_PX}px` }}
          data-testid="time-grid"
        >
          <div className={styles.axis} aria-hidden="true">
            {HOURS.map((hour) => (
              <span
                key={hour}
                className={styles.hourLabel}
                style={{ top: `${(hour * 60 * 100) / DAY_MINUTES}%` }}
              >
                {String(hour).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          {range.days.map((day) => {
            const nowMin = nowMinutes(now, day)
            return (
              <DayColumn
                key={day}
                day={day}
                events={events}
                itemsByEventId={itemsByEventId}
                planning={planning}
                pause={pause}
                nowMin={nowMin}
                today={nowMin !== null}
                onOpenEvent={setOpenEvent}
                onHoldFree={holdFree}
                holdStartMin={holdMark?.day === day ? holdMark.startMin : null}
                onHoldMark={setHoldMark}
                lastScrollAt={lastScrollAt}
                drag={dragEnv}
              />
            )
          })}
        </div>
      </div>

      {openEvent && (
        <EventDialog
          event={openEvent}
          item={itemsByEventId.get(openEvent.id) ?? null}
          onClose={() => setOpenEvent(null)}
          onSaved={() => reload()}
          onOpenItem={(item) => {
            setOpenEvent(null)
            setEditing(item)
          }}
        />
      )}
      {draft && (
        <EventDialog
          event={null}
          draft={draft}
          item={null}
          onClose={() => setDraft(null)}
          onSaved={(taskCreated) => {
            reload()
            if (taskCreated) showCreatedNotice()
          }}
          onOpenItem={() => undefined}
        />
      )}
      {moves.pending && <GuestPrompt onAnswer={moves.answer} />}
      {moves.toast && <MoveToastView toast={moves.toast} />}
      {createdNotice && (
        <MoveToastView toast={{ text: TASK_CREATED_NOTICE, error: false, undo: null }} />
      )}
      {editing && (
        <ItemEditor item={editing} categories={categories} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
