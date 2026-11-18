import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent,
  type RefObject,
} from 'react'
import { DAY_MINUTES } from '../../lib/calendarView'
import {
  autoScrollStep,
  dragPlace,
  samePlace,
  SNAP_MIN,
  type DragColumn,
  type DragPlace,
} from '../../lib/dragSchedule'
import { useClaimGesture } from '../../lib/gestureClaim'
import { quarterStartMin } from './newEvent'
import { HOLD_MS, HOLD_SLOP_PX, measureColumns } from './useTileDrag'

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

/** Lage des Blocks beim Halten: Tag `YYYY-MM-DD` und Beginn in Minuten ab 0 Uhr. */
export interface HoldPlace {
  day: string
  startMin: number
}

interface Press {
  pointerId: number
  x: number
  y: number
  lastX: number
  lastY: number
  at: number
  fraction: number
  timer: number
  frame: number
  reached: boolean
  origin: DragPlace
  pxPerMin: number
  columns: DragColumn[]
  startScroll: number
  result: DragPlace
}

/** Standarddauer eines neuen Termins (Minuten) = Höhe des Blocks. */
export const HOLD_BLOCK_MIN = 60
const LATEST_START_MIN = Math.floor((DAY_MINUTES - HOLD_BLOCK_MIN) / SNAP_MIN) * SNAP_MIN

/**
 * Langes Drücken auf freie Zeit einer Tagesspalte (SPEC §6.2 „Neuer Termin“, „Halten und Ziehen“). Nach 400 ms ohne
 * Bewegung (> 8 px) erscheint die Markierung (`onMark`, Block in Standarddauer) und die Geste wird beansprucht
 * (kein Scrollen, kein Seitenwechsel). Danach folgt der Block dem Zeiger im 15-Minuten-Raster (Woche: auch auf
 * andere Tage, am Rand scrollt die Zeitleiste); erst beim Loslassen wird `onHold(day, startMin)` gemeldet.
 * `pointercancel` und Escape verwerfen. Vorher blockiert nichts. Kurzes Tippen tut nichts.
 */
export function useFreeHold(
  lastScrollAt: MutableRefObject<number>,
  scroller: RefObject<HTMLElement | null>,
  onMark: (place: HoldPlace | null) => void,
  onHold: (day: string, startMin: number) => void,
) {
  const claim = useClaimGesture()
  const columnRef = useRef<HTMLDivElement | null>(null)
  const press = useRef<Press | null>(null)
  const touchSeen = useRef(false)
  const latest = useRef({ claim, onMark, onHold, scroller })
  const tickRef = useRef<() => void>(() => undefined)
  const [reached, setReached] = useState(false)
  useEffect(() => {
    latest.current = { claim, onMark, onHold, scroller }
  })

  const end = useCallback(() => {
    const p = press.current
    if (p) {
      window.clearTimeout(p.timer)
      window.cancelAnimationFrame(p.frame)
      if (p.reached) latest.current.onMark(null)
    }
    press.current = null
    setReached(false)
  }, [])

  /** Berechnet die Lage aus Zeigerstelle und Scrollweg neu und meldet sie, wenn sie sich geändert hat. */
  const update = useCallback(() => {
    const p = press.current
    if (!p || !p.reached) return
    const element = latest.current.scroller.current
    const deltaY = p.lastY - p.y + ((element?.scrollTop ?? 0) - p.startScroll)
    const next = dragPlace('move', p.origin, deltaY, p.pxPerMin, p.lastX, p.columns)
    if (!samePlace(next, p.result)) {
      p.result = next
      latest.current.onMark({ day: next.day, startMin: next.startMin })
    }
    // Auto-Scroll läuft nur, solange der Zeiger in einer Randzone steht.
    if (p.frame === 0 && element) {
      const rect = element.getBoundingClientRect()
      if (autoScrollStep(p.lastY, rect.top, rect.bottom) !== 0) {
        p.frame = window.requestAnimationFrame(() => tickRef.current())
      }
    }
  }, [])

  const tick = useCallback(() => {
    const p = press.current
    const element = latest.current.scroller.current
    if (!p || !p.reached) return
    p.frame = 0
    if (!element) return
    const rect = element.getBoundingClientRect()
    const step = autoScrollStep(p.lastY, rect.top, rect.bottom)
    if (step === 0) return
    element.scrollTop += step
    update()
  }, [update])
  useEffect(() => {
    tickRef.current = tick
  })

  const reach = useCallback(() => {
    const p = press.current
    const column = columnRef.current
    if (!p || !column) return
    // Wurde die Zeitleiste inzwischen gescrollt, war es kein Halten.
    if (lastScrollAt.current >= p.at) {
      end()
      return
    }
    const height = column.getBoundingClientRect().height
    const day = column.dataset.day
    if (height <= 0 || !day) {
      end()
      return
    }
    const startMin = Math.min(quarterStartMin(p.fraction), LATEST_START_MIN)
    p.origin = { day, startMin, durationMin: HOLD_BLOCK_MIN }
    p.result = p.origin
    p.pxPerMin = height / DAY_MINUTES
    p.columns = measureColumns(latest.current.scroller.current, column)
    p.startScroll = latest.current.scroller.current?.scrollTop ?? 0
    p.reached = true
    latest.current.claim()
    navigator.vibrate?.(10)
    window.getSelection()?.removeAllRanges()
    try {
      // Auch bei schnellen Mausbewegungen außerhalb der Spalte weiter Ereignisse erhalten.
      column.setPointerCapture(p.pointerId)
    } catch {
      // Capture ist optional (Zeiger schon beendet).
    }
    setReached(true)
    latest.current.onMark({ day, startMin })
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
      const origin = { day: '', startMin: 0, durationMin: HOLD_BLOCK_MIN }
      press.current = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        at: Date.now(),
        fraction: (e.clientY - rect.top) / rect.height,
        timer: window.setTimeout(reach, HOLD_MS),
        frame: 0,
        reached: false,
        origin,
        pxPerMin: 0,
        columns: [],
        startScroll: 0,
        result: origin,
      }
    },
    [end, lastScrollAt, reach],
  )

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const p = press.current
      if (!p || e.pointerId !== p.pointerId) return
      p.lastX = e.clientX
      p.lastY = e.clientY
      if (p.reached) update()
      else if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > HOLD_SLOP_PX) end()
    },
    [end, update],
  )

  /** Nach der Schwelle öffnet Loslassen den Dialog an der Stelle des Blocks. */
  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const p = press.current
      if (!p || e.pointerId !== p.pointerId) return
      p.lastX = e.clientX
      p.lastY = e.clientY
      if (p.reached) update()
      const fire = p.reached
      const place = p.result
      end()
      if (!fire) return
      suppressNextClick()
      latest.current.onHold(place.day, place.startMin)
    },
    [end, update],
  )

  /** Systemabbruch (`pointercancel`) verwirft die Geste. */
  const onPointerCancel = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (press.current && e.pointerId === press.current.pointerId) end()
    },
    [end],
  )

  /** Maus verlässt die Spalte vor der Schwelle: Abbruch. (Danach hält die Capture die Zeiger in der Spalte.) */
  const onPointerLeave = useCallback(() => {
    if (!touchSeen.current && !press.current?.reached) end()
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

  // Escape verwirft die Geste.
  useEffect(() => {
    if (!reached) return undefined
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') end()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [reached, end])

  useEffect(
    () => () => {
      end()
      cancelSuppress?.()
    },
    [end],
  )

  return {
    columnRef,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onPointerLeave,
      onContextMenu,
    },
  }
}
