import { useCallback, useEffect, useRef, useState } from 'react'

/** Kurze Meldung, die nach `ms` Millisekunden von selbst verschwindet; `show(null)` entfernt sie sofort. */
export function useTransientNote(ms: number): [string | null, (note: string | null) => void] {
  const [note, setNote] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const show = useCallback(
    (next: string | null): void => {
      clearTimeout(timer.current)
      setNote(next)
      if (next !== null) timer.current = setTimeout(() => setNote(null), ms)
    },
    [ms],
  )
  return [note, show]
}
