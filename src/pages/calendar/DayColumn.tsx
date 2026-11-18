import type { MutableRefObject } from 'react'
import type { Item } from '../../data/types'
import type { CalendarEvent } from '../../google/types'
import { DAY_MINUTES, layoutDay } from '../../lib/calendarView'
import { EventTile } from './EventTile'
import { minutesLabel } from './dayLabels'
import { dayOfDate } from './newEvent'
import { HOLD_BLOCK_MIN, useFreeHold, type HoldPlace } from './useFreeHold'
import type { DragEnv } from './useTileDrag'
import styles from './CalendarPage.module.css'

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
  /** Loslassen nach Halten und Ziehen auf freier Zeit: Tag und Beginn (Minuten) des Blocks. */
  onHoldFree: (day: string, startMin: number) => void
  /** Beginn des Halte-Blocks (Minuten) in dieser Spalte; `null` = keiner. */
  holdStartMin: number | null
  /** Meldet die Lage des Halte-Blocks (`null` = beendet). */
  onHoldMark: (place: HoldPlace | null) => void
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
  holdStartMin,
  onHoldMark,
  lastScrollAt,
  drag,
}: DayColumnProps) {
  const { columnRef, handlers } = useFreeHold(lastScrollAt, drag.scroller, onHoldMark, onHoldFree)

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
      {holdStartMin !== null && (
        <div
          className={styles.holdMark}
          data-testid="hold-mark"
          style={{ top: pct(holdStartMin), height: pct(HOLD_BLOCK_MIN) }}
        />
      )}
      {nowMin !== null && (
        <div className={styles.nowLine} data-testid="now-line" style={{ top: pct(nowMin) }} />
      )}
    </div>
  )
}
