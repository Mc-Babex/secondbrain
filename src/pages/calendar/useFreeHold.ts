import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent,
} from 'react'
import { useClaimGesture } from '../../lib/gestureClaim'
import { HOLD_MS, HOLD_SLOP_PX } from './useTileDrag'

/** Ein Antippen kurz nach dem Scrollen (iOS-Auslauf) stoppt nur die Bewegung. */
export const SCROLL_QUIET_MS = 150

const CLICK_SUPPRESS_MS = 400

/** Der auf das Loslassen folgende Klick darf den frisch geöffneten Dialog nicht treffen (einmalig, max. 400 ms). */
let cancelSuppress: (() => void) | null = null

function suppressNextClick(): void {
  cancelSuppress?.()
  const onClick = (event: Event): void => {
    event.stopPropagation()
    event.preventDefault()
  }
  const timer = window.setTimeout(release, CLICK_SUPPRESS_MS)
  function release(): void {
    window.clearTimeout(timer)
    window.removeEventListener('click', onClick, true)
    window.removeEventListener('pointerdown', release, true)
    cancelSuppress = null
  }
  cancelSuppress = release
  window.addEventListener('click', onClick, { capture: true, once: true })
  // Eine neue Berührung beendet die Sperre (der Klick zur alten Geste kommt dann nicht mehr).
  window.addEventListener('pointerdown', release, { capture: true, once: true })
}

interface Press {
  pointerId: number
  x: number
  y: number
  at: number
  fraction: number
  timer: number
  reached: boolean
}

/**
 * Langes Drücken auf freie Zeit einer Tagesspalte (SPEC §6.2 „Neuer Termin“). Nach 400 ms ohne Bewegung (> 8 px)
 * wird die Stelle markiert (`mark` = Lage im Tag, 0–1) und die Geste beansprucht (kein Scrollen, kein Seitenwechsel);
 * erst beim Loslassen wird `onHold(fraction)` gemeldet. Vorher blockiert nichts. Kurzes Tippen tut nichts.
 */
export function useFreeHold(
  lastScrollAt: MutableRefObject<number>,
  onHold: (fraction: number) => void,
) {
  const claim = useClaimGesture()
  const columnRef = useRef<HTMLDivElement | null>(null)
  const press = useRef<Press | null>(null)
  const touchSeen = useRef(false)
  const latest = useRef({ claim, onHold })
  const [mark, setMark] = useState<number | null>(null)
  useEffect(() => {
    latest.current = { claim, onHold }
  })

  const end = useCallback(() => {
    const p = press.current
    if (p) window.clearTimeout(p.timer)
    press.current = null
    setMark(null)
  }, [])

  const reach = useCallback(() => {
    const p = press.current
    if (!p) return
    // Wurde die Zeitleiste inzwischen gescrollt, war es kein Halten.
    if (lastScrollAt.current >= p.at) {
      end()
      return
    }
    p.reached = true
    latest.current.claim()
    navigator.vibrate?.(10)
    window.getSelection()?.removeAllRanges()
    setMark(p.fraction)
  }, [end, lastScrollAt])

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      touchSeen.current = e.pointerType === 'touch' || e.pointerType === 'pen'
      end()
      const onTile = e.target instanceof Element && e.target.closest('button') !== null
      const scrolling = Date.now() - lastScrollAt.current < SCROLL_QUIET_MS
      if (onTile || scrolling || e.button !== 0) return
      const rect = e.currentTarget.getBoundingClientRect()
      if (rect.height <= 0) return
      press.current = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        at: Date.now(),
        fraction: (e.clientY - rect.top) / rect.height,
        timer: window.setTimeout(reach, HOLD_MS),
        reached: false,
      }
    },
    [end, lastScrollAt, reach],
  )

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const p = press.current
      if (!p || p.reached || e.pointerId !== p.pointerId) return
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > HOLD_SLOP_PX) end()
    },
    [end],
  )

  /** Nach der Schwelle öffnen Loslassen und Systemabbruch (`pointercancel`) den Dialog. */
  const release = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const p = press.current
      if (!p || e.pointerId !== p.pointerId) return
      const fire = p.reached
      end()
      if (!fire) return
      suppressNextClick()
      latest.current.onHold(p.fraction)
    },
    [end],
  )

  /** Maus verlässt die Spalte: Abbruch. (Touch hält die Zeiger durch Capture in der Spalte.) */
  const onPointerLeave = useCallback(() => {
    if (!touchSeen.current) end()
  }, [end])

  const onContextMenu = useCallback((e: { preventDefault: () => void }) => {
    if (touchSeen.current || press.current?.reached) e.preventDefault()
  }, [])

  // Nicht-passiver touchmove: erst nach dem langen Drücken kein natives Scrollen mehr.
  useEffect(() => {
    const column = columnRef.current
    if (!column) return undefined
    const onTouchMove = (e: TouchEvent): void => {
      if (press.current?.reached && e.cancelable) e.preventDefault()
    }
    column.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => column.removeEventListener('touchmove', onTouchMove)
  }, [])

  useEffect(
    () => () => {
      end()
      cancelSuppress?.()
    },
    [end],
  )

  return {
    columnRef,
    mark,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: release,
      onPointerCancel: release,
      onPointerLeave,
      onContextMenu,
    },
  }
}
