import { useEffect, useRef, type RefObject } from 'react'
import { logError } from '../data/errorLog'

/**
 * main darf nie scrollen (Fokus/scrollIntoView): Ein Versatz wird sofort auf 0 zurückgesetzt und
 * einmalig protokolliert.
 */
export function useScrollGuard(mainRef: RefObject<HTMLElement | null>): void {
  const logged = useRef(false)
  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    const onScroll = (): void => {
      const { scrollLeft: x, scrollTop: y } = main
      if (x === 0 && y === 0) return
      main.scrollLeft = 0
      main.scrollTop = 0
      if (logged.current) return
      logged.current = true
      logError('Anzeige', `Seitenbereich war verschoben (${Math.round(x)}/${Math.round(y)})`)
    }
    main.addEventListener('scroll', onScroll)
    return () => main.removeEventListener('scroll', onScroll)
  }, [mainRef])
}
