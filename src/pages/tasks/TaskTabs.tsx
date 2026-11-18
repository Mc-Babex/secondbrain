import type { KeyboardEvent } from 'react'
import type { TaskTab } from '../../lib/tabMemory'
import { panelId, tabId } from './tabIds'
import styles from './TaskTabs.module.css'

interface TabDef {
  id: TaskTab
  label: string
}

const TABS: readonly TabDef[] = [
  { id: 'aktuell', label: 'Aktuell' },
  { id: 'projekte', label: 'Projekte' },
  { id: 'warten', label: 'Warte auf' },
  { id: 'irgendwann', label: 'Irgendwann' },
]

interface TaskTabsProps {
  active: TaskTab
  onSelect: (tab: TaskTab) => void
  counts: Record<Exclude<TaskTab, 'aktuell'>, number>
}

/** Reiter-Leiste (Tab-Muster mit manueller Aktivierung): Pfeiltasten bewegen den Fokus, Tippen/Enter wählt. */
export function TaskTabs({ active, onSelect, counts }: TaskTabsProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key)) return
    // Die Pfeiltasten gehören der Leiste; sie dürfen nicht die Seite wechseln.
    event.stopPropagation()
    event.preventDefault()
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    )
    const current = buttons.findIndex((button) => button === document.activeElement)
    const last = buttons.length - 1
    const target =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : event.key === 'ArrowRight'
            ? Math.min(last, current + 1)
            : Math.max(0, current - 1)
    buttons[target]?.focus()
  }

  return (
    <div className={styles.bar} role="tablist" aria-label="Aufgaben" onKeyDown={onKeyDown}>
      {TABS.map((tab) => {
        const count = tab.id === 'aktuell' ? null : counts[tab.id]
        const selected = tab.id === active
        return (
          <button
            key={tab.id}
            id={tabId(tab.id)}
            type="button"
            role="tab"
            className={selected ? `${styles.tab} ${styles.selected}` : styles.tab}
            aria-selected={selected}
            aria-controls={panelId(tab.id)}
            aria-label={count === null ? undefined : `${tab.label}, ${count}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
          >
            <span>{tab.label}</span>
            {count !== null && <span className={styles.count}>{count}</span>}
          </button>
        )
      })}
    </div>
  )
}
