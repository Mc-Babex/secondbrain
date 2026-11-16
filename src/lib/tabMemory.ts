import type { TimeLimit } from './gtd'

/** Reiter der Aufgabenseite (SPEC §6.3.1). */
export type TaskTab = 'aktuell' | 'projekte' | 'warten' | 'irgendwann'

export const TASK_TABS: readonly TaskTab[] = ['aktuell', 'projekte', 'warten', 'irgendwann']

const TAB_KEY = 'secondbrain.tasks.tab'
const LIMIT_KEY = 'secondbrain.tasks.timeLimit'

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Speicher nicht verfügbar (z. B. privater Modus): Wahl gilt nur für diese Sitzung.
  }
}

/** Gemerkter Reiter; Standard „Aktuell“. */
export function loadTab(): TaskTab {
  const stored = read(TAB_KEY)
  return TASK_TABS.find((tab) => tab === stored) ?? 'aktuell'
}

export function saveTab(tab: TaskTab): void {
  write(TAB_KEY, tab)
}

/** Gemerkter Zeitfilter; Standard „alle“ (`null`). */
export function loadTimeLimit(): TimeLimit {
  const stored = read(LIMIT_KEY)
  return stored === '15' ? 15 : stored === '30' ? 30 : stored === '60' ? 60 : null
}

export function saveTimeLimit(limit: TimeLimit): void {
  write(LIMIT_KEY, limit === null ? 'alle' : String(limit))
}
