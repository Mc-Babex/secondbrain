import type { ComponentType } from 'react'
import { CapturePage } from './capture/CapturePage'
import { CalendarPage } from './calendar/CalendarPage'
import { TasksPageWithCalendar } from './tasks/TasksPageWithCalendar'
import { CategoriesPage } from './categories/CategoriesPage'

export interface PageDefinition {
  id: string
  name: string
  Component: ComponentType
}

/** Zentrale Seitenliste in Anzeigereihenfolge. */
export const PAGES: readonly PageDefinition[] = [
  { id: 'calendar', name: 'Kalender', Component: CalendarPage },
  { id: 'capture', name: 'Erfassung', Component: CapturePage },
  { id: 'tasks', name: 'Aufgaben', Component: TasksPageWithCalendar },
  { id: 'categories', name: 'Ablagen', Component: CategoriesPage },
]

export const START_PAGE_INDEX = PAGES.findIndex((page) => page.id === 'capture')
