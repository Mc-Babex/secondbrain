import type { TaskTab } from '../../lib/tabMemory'

export const tabId = (tab: TaskTab): string => `tasks-tab-${tab}`
export const panelId = (tab: TaskTab): string => `tasks-panel-${tab}`
