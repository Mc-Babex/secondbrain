import type { MutableRefObject } from 'react'
import type { Item } from '../../data/types'
import type { CalendarEvent } from '../../google/types'
import { DAY_MINUTES, layoutDay } from '../../lib/calendarView'
import { EventTile } from './EventTile'
import { minutesLabel } from './dayLabels'
import { dayOfDate, quarterStartMin } from './newEvent'
import { useFreeHold } from './useFreeHold'
import type { DragEnv } from './useTileDrag'
import styles from './CalendarPage.module.css'

/** Höhe der Markierung = Standarddauer eines neuen Termins (60 Min.). */
const DEFAULT_MARK_MIN = 60

const pct = (minutes: number): string => `${(minutes / DAY_MINUTES) * 100}%`

interface DayColumnProps {
  day: string
  events: CalendarEvent[]
  itemsByEventId: Map<string, Item>
  planning: { startMin: number; endMin: number }
  /** Pause (SPEC §3.6); `null` = keine Pause, kein Band. */
  pause: { startMin: number; endMin: number } | null
  nowMin: number | null
  today: boolean
  onOpenEvent: (event: CalendarEvent) => void
  /** Langes Drücken auf freie Zeit; `fraction` = Lage im Tag (0–1). */
  onHoldFree: (day: string, fraction: number) => void
  /** Zeitpunkt (`Date.now()`) des letzten Scroll-Ereignisses der Zeitleiste. */
  lastScrollAt: MutableRefObject<number>
  /** Umgebung zum Ziehen der Termine (Verschieben, Dauer). */
  drag: DragEnv
}

/** Bearbeitbar, mit Uhrzeit und am angezeigten Tag beginnend (sonst nicht ziehbar). */
function isDraggable(event: CalendarEvent, day: string): boolean {
  return !event.allDay && event.editable !== false && dayOfDate(new Date(event.start)) === day
}

/** Eine Tagesspalte der Zeitleiste: Planungsfenster, Pause, Termine, Jetzt-Linie. */
export function DayColumn({
  day,
  events,
  itemsByEventId,
  planning,
  pause,
  nowMin,
  today,
  onOpenEvent,
  onHoldFree,
  lastScrollAt,
  drag,
}: DayColumnProps) {
  const { columnRef, mark, handlers } = useFreeHold(lastScrollAt, (fraction) =>
    onHoldFree(day, fraction),
  )

  return (
    <div
      className={`${styles.dayColumn} ${today ? styles.today : ''}`}
      data-day={day}
      ref={columnRef}
      {...handlers}
    >
      <div
        className={styles.planning}
        data-testid="planning-window"
        data-start={minutesLabel(planning.startMin)}
        data-end={minutesLabel(planning.endMin)}
        style={{ top: pct(planning.startMin), height: pct(planning.endMin - planning.startMin) }}
      />
      {pause && (
        <div
          className={styles.pause}
          data-testid="pause-band"
          data-start={minutesLabel(pause.startMin)}
          data-end={minutesLabel(pause.endMin)}
          title="Pause"
          style={{ top: pct(pause.startMin), height: pct(pause.endMin - pause.startMin) }}
        />
      )}
      {layoutDay(events, day).map(({ event, startMin, endMin, column, columns }) => (
        <EventTile
          key={event.id}
          event={event}
          item={itemsByEventId.get(event.id) ?? null}
          onOpen={onOpenEvent}
          drag={isDraggable(event, day) ? drag : undefined}
          style={{
            top: pct(startMin),
            height: pct(endMin - startMin),
            left: `${(column / columns) * 100}%`,
            width: `${100 / columns}%`,
          }}
        />
      ))}
      {mark !== null && (
        <div
          className={styles.holdMark}
          data-testid="hold-mark"
          style={{ top: pct(quarterStartMin(mark)), height: pct(DEFAULT_MARK_MIN) }}
        />
      )}
      {nowMin !== null && (
        <div className={styles.nowLine} data-testid="now-line" style={{ top: pct(nowMin) }} />
      )}
    </div>
  )
}
