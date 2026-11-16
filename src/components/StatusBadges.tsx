import type { Item } from '../data/types'
import { berlinDate, displayStatus, isDueOverdue, isQuick, type DisplayStatus } from '../lib/gtd'
import { formatDateTime } from '../lib/format'
import styles from './StatusBadges.module.css'

interface StatusBadgesProps {
  item: Item
  /** Bezugszeit für „überfällig“; Standard: jetzt. */
  now?: Date
}

const dueFormatter = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'UTC',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
})

/** „Mo 23.11.“ für einen Kalendertag `YYYY-MM-DD`; unlesbare Angaben bleiben unverändert. */
function formatDueDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return day
  const v: Record<string, string> = {}
  for (const part of dueFormatter.formatToParts(date)) v[part.type] = part.value
  return `${v.weekday.replace('.', '')} ${v.day}.${v.month}.`
}

function statusLabel(status: DisplayStatus, item: Item): string {
  switch (status) {
    case 'termin':
      return item.schedule ? `Termin ${formatDateTime(item.schedule.start)}` : 'Termin'
    case 'warten':
      return item.waiting?.person ? `Warte auf ${item.waiting.person}` : 'Warte auf'
    case 'irgendwann':
      return 'Irgendwann'
    case 'naechster-schritt':
      return 'Nächster Schritt'
  }
}

const STATUS_CLASS: Record<DisplayStatus, string> = {
  'naechster-schritt': styles.next,
  termin: styles.termin,
  warten: styles.waiting,
  irgendwann: styles.someday,
}

/** Kennzeichen einer Aufgabe (SPEC §6.3.1/§6.4): Status, ★ Fokus, ⚡, fällig. Immer mit Text. */
export function StatusBadges({ item, now = new Date() }: StatusBadgesProps) {
  const status = displayStatus(item)
  const due = item.type === 'aufgabe' && item.status === 'offen' ? item.dueDate : null
  const overdue = isDueOverdue(item, now)
  const dueIsToday = typeof due === 'string' && due === berlinDate(now)
  if (status === null && !item.important) return null
  return (
    <span className={styles.badges}>
      {status !== null && (
        <span className={`${styles.badge} ${STATUS_CLASS[status]}`}>
          {statusLabel(status, item)}
        </span>
      )}
      {item.important && (
        <span className={`${styles.badge} ${styles.focus}`}>
          <span aria-hidden="true">★ </span>Fokus
        </span>
      )}
      {status !== null && isQuick(item) && (
        <span className={`${styles.badge} ${styles.quick}`}>
          <span aria-hidden="true">⚡ </span>2 Min.
        </span>
      )}
      {typeof due === 'string' && due !== '' && (
        <span className={`${styles.badge} ${overdue ? styles.overdue : styles.due}`}>
          {overdue ? 'überfällig, ' : ''}fällig {dueIsToday ? 'heute' : formatDueDay(due)}
        </span>
      )}
    </span>
  )
}
