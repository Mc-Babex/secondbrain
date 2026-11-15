import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { getSortTrigger, type SortState } from './sortTrigger'

/** Zustand und Start des Knopfs „Jetzt sortieren“; der Zustand gilt app-weit und überlebt Seitenwechsel. */
export function useSortTrigger(): { state: SortState; start: () => void } {
  const trigger = getSortTrigger()
  const state = useSyncExternalStore(trigger.subscribe, trigger.getState)

  useEffect(() => {
    void trigger.restore()
  }, [trigger])

  const start = useCallback(() => {
    void trigger.start()
  }, [trigger])

  return { state, start }
}
