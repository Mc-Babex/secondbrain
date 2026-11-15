import type { CSSProperties } from 'react'
import type { Item } from '../../data/types'
import type { CalendarEvent } from '../../google/types'
import { BodyPortal } from '../../components/BodyPortal'
import { clockLabel } from './dayLabels'
import { useTileDrag, type DragEnv } from './useTileDrag'
import styles from './CalendarPage.module.css'

interface EventTileProps {
  event: CalendarEvent
  /** Eintrag, zu dem der Termin gehört (sonst `null`). */
  item: Item | null
  style?: CSSProperties
  onOpen: (event: CalendarEvent) => void
  /** Nur bei bearbeitbaren, zeitgebundenen Terminen: Ziehen zum Verschieben bzw. für die Dauer. */
  drag?: DragEnv
}

/**
 * Termin-Kachel (Knopf: öffnet den Termin-Dialog); gehört der Termin zu einem Eintrag, ist sie markiert.
 * Mit `drag` lässt sie sich verschieben (langes Drücken bzw. Maus ziehen) und am unteren Griff verlängern.
 */
export function EventTile({ event, item, style, onOpen, drag }: EventTileProps) {
  const { tileRef, active, badge, attachBadge, handlers } = useTileDrag(event, drag)
  const time = event.allDay ? '' : clockLabel(event.start)
  const title = event.title === '' ? '(ohne Titel)' : event.title
  const done = item !== null && item.completedAt !== null
  const classes = [
    styles.event,
    styles.tile,
    item ? styles.linked : '',
    done ? styles.done : '',
    active ? styles.lifted : '',
  ]
  return (
    <button
      ref={tileRef}
      type="button"
      className={classes.filter(Boolean).join(' ')}
      style={style}
      title={title}
      aria-label={`${title}${time ? `, ${time}` : ''}${item ? ' – mit Eintrag verknüpft' : ''}`}
      onClick={() => onOpen(event)}
      {...(drag ? handlers : {})}
    >
      {item && <span aria-hidden="true">🔗 </span>}
      {time && <span className={styles.eventTime}>{time} </span>}
      <span>{title}</span>
      {drag && <span className={styles.resizeHandle} data-resize-handle aria-hidden="true" />}
      {badge && (
        <BodyPortal>
          <div ref={attachBadge} className={styles.dragBadge} role="status">
            {badge}
          </div>
        </BodyPortal>
      )}
    </button>
  )
}
