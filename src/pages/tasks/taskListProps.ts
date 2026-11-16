import type { Category, Item, Project } from '../../data/types'
import type { TaskSlots } from './slots'

/** Gemeinsame Eingaben der Reiter-Inhalte. */
export interface TaskListProps extends TaskSlots {
  items: readonly Item[]
  categories: readonly Category[]
  projects: readonly Project[]
  now: Date
  recentIds: ReadonlySet<string>
  onComplete: (item: Item) => void
  onEdit: (item: Item) => void
}
