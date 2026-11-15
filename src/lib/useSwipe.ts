import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type PointerEvent,
  type RefObject,
} from 'react'
import { classifyMove, DIRECTION_LOCK_PX, isInEdgeStrip, type MoveClass } from './swipe'
import { dragPages, movePages } from './pageLayout'
import { dragOffset, releaseVelocity, snapDirection, type Sample } from './pageSnap'
import { hasTextSelection, startsInNoSwipeZone } from './swipeGuard'

const INTERACTIVE_SELECTOR =
  'button, a, input, textarea, select, label, summary, [contenteditable="true"], [role="button"]'
const CLICK_SUPPRESS_MS = 300

export interface SwipeOptions {
  /** Aktuelle Seite und Seitenzahl. */
  index: number
  count: number
  /** Die Leiste, deren Seiten dem Finger folgen (Seiten werden direkt per `style.transform` bewegt, siehe `pageLayout.ts`). */
  trackRef: RefObject<HTMLElement | null>
  /** „Reduzierte Bewegung“: nicht mitziehen, Wechsel erst beim Loslassen. */
  reducedMotion: boolean
  /** Neue Seite nach dem Einrasten. */
  onChange: (index: number) => void
}

interface Gesture {
  pointerId: number
  mouse: boolean
  startX: number
  startY: number
  direction: MoveClass
  dragging: boolean
  samples: Sample[]
  pendingDx: number
}

/** Legt die Richtung fest, sobald genug Bewegung vorliegt (gemeinsam für pointermove und touchmove). */
function decideDirection(current: Gesture, x: number, y: number): void {
  if (current.direction === 'undecided') {
    current.direction = classifyMove(x - current.startX, y - current.startY)
  }
}

function isTouchLike(event: PointerEvent): boolean {
  return event.pointerType === 'touch' || event.pointerType === 'pen'
}

function startsOnInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null
}

/** Unterdrückt den nächsten Klick (nach einem echten Ziehen soll nichts ausgelöst werden). */
function suppressNextClick(): void {
  const onClick = (event: Event): void => {
    event.stopPropagation()
    event.preventDefault()
  }
  const timer = window.setTimeout(() => release(), CLICK_SUPPRESS_MS)
  function release(): void {
    window.clearTimeout(timer)
    window.removeEventListener('click', onClick, true)
  }
  window.addEventListener('click', onClick, { capture: true, once: true })
}

/**
 * Flüssiges Seitenwischen. Die Seiten folgen Finger oder Maus 1:1 (direkter `transform`, Aktualisierung
 * per `requestAnimationFrame`, kein React-Render pro Bewegung); beim Loslassen rasten sie ein
 * (`pageSnap.ts`). Touch/Stift: Richtung früh festlegen, Ausnahmen (Scroll-Bereiche, Textauswahl,
 * Randstreifen, mehrere Finger, offener Dialog) ziehen nie. Maus: nicht beim Start auf Knöpfen,
 * Links oder Eingabefeldern. Rückgabe: Zeigerhandler, `areaRef` (Ref des Wisch-Bereichs für den touchmove-Listener) und
 * `claimGesture` (verwirft die laufende Geste).
 */
export function useSwipe(options: SwipeOptions) {
  const latest = useRef(options)
  useLayoutEffect(() => {
    latest.current = options
  })
  const gesture = useRef<Gesture | null>(null)
  const touches = useRef(new Set<number>())
  const frame = useRef(0)

  const applyOffset = useCallback((dx: number, width: number) => {
    const { index, count, trackRef } = latest.current
    const track = trackRef.current
    if (track) dragPages(track, index, dragOffset(dx, index, count, width))
  }, [])

  const settle = useCallback((direction: -1 | 0 | 1) => {
    const { index, trackRef, reducedMotion, onChange } = latest.current
    window.cancelAnimationFrame(frame.current)
    frame.current = 0
    const track = trackRef.current
    if (track) movePages(track, index, index + direction, reducedMotion)
    if (direction !== 0) onChange(index + direction)
  }, [])

  const abort = useCallback(() => {
    const current = gesture.current
    gesture.current = null
    if (current?.dragging) settle(0)
  }, [settle])

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    const mouse = !isTouchLike(event)
    gesture.current = null
    if (mouse && event.button > 0) return
    if (!mouse) {
      // Ein neuer Primärfinger startet frisch: hängt ein Zeiger (iOS ohne up/cancel), wird er verworfen.
      if (event.isPrimary) touches.current.clear()
      touches.current.add(event.pointerId)
    }
    const blocked =
      (!mouse && touches.current.size > 1) ||
      (!mouse && isInEdgeStrip(event.clientY, window.innerHeight)) ||
      (mouse && startsOnInteractive(event.target)) ||
      startsInNoSwipeZone(event.target, event.currentTarget) ||
      hasTextSelection(event.target) ||
      document.querySelector('[role="dialog"]') !== null
    if (blocked) return
    gesture.current = {
      pointerId: event.pointerId,
      mouse,
      startX: event.clientX,
      startY: event.clientY,
      direction: 'undecided',
      dragging: false,
      samples: [{ x: event.clientX, time: event.timeStamp }],
      pendingDx: 0,
    }
  }, [])

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const current = gesture.current
      if (!current || event.pointerId !== current.pointerId) return
      if (!current.mouse && touches.current.size > 1) {
        abort()
        return
      }
      const dx = event.clientX - current.startX
      decideDirection(current, event.clientX, event.clientY)
      if (current.direction !== 'horizontal') return
      current.samples.push({ x: event.clientX, time: event.timeStamp })
      if (!current.dragging) {
        current.dragging = true
        const track = latest.current.trackRef.current
        if (track && !latest.current.reducedMotion) dragPages(track, latest.current.index, 0)
        if (current.mouse) {
          window.getSelection()?.removeAllRanges()
          try {
            event.currentTarget.setPointerCapture(event.pointerId)
          } catch {
            // Capture ist optional (z. B. Zeiger schon beendet).
          }
        }
      }
      if (latest.current.reducedMotion) return
      current.pendingDx = dx
      if (frame.current !== 0) return
      const width = event.currentTarget.clientWidth || window.innerWidth
      frame.current = window.requestAnimationFrame(() => {
        frame.current = 0
        applyOffset(current.pendingDx, width)
      })
    },
    [abort, applyOffset],
  )

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const touch = isTouchLike(event)
      const wasMultiTouch = touch && touches.current.size > 1
      touches.current.delete(event.pointerId)
      const current = gesture.current
      if (!current || event.pointerId !== current.pointerId) return
      gesture.current = null
      if (wasMultiTouch) {
        if (current.dragging) settle(0)
        return
      }
      const dx = event.clientX - current.startX
      decideDirection(current, event.clientX, event.clientY)
      if (current.direction !== 'horizontal') return
      current.samples.push({ x: event.clientX, time: event.timeStamp })
      const { index, count } = latest.current
      const width = event.currentTarget.clientWidth || window.innerWidth
      settle(snapDirection(dx, releaseVelocity(current.samples), width, index, count))
      if (current.mouse && current.dragging && Math.abs(dx) >= DIRECTION_LOCK_PX)
        suppressNextClick()
    },
    [settle],
  )

  const onPointerCancel = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      touches.current.delete(event.pointerId)
      const current = gesture.current
      const last = current?.samples[current.samples.length - 1]
      if (!current || current.mouse || current.direction !== 'horizontal' || !last) {
        abort()
        return
      }
      // Waagerecht festgelegt: Abbruch durch das System (z. B. Safari) zählt wie Loslassen.
      gesture.current = null
      const { index, count } = latest.current
      const width = event.currentTarget.clientWidth || window.innerWidth
      const dx = last.x - current.startX
      settle(snapDirection(dx, releaseVelocity(current.samples), width, index, count))
    },
    [abort, settle],
  )

  const areaRef = useRef<HTMLElement | null>(null)
  // Nicht-passiver touchmove-Listener: nach festgelegter Waagerechte kein natives Scrollen mehr.
  useEffect(() => {
    const area = areaRef.current
    if (!area) return
    const onTouchMove = (event: TouchEvent): void => {
      const current = gesture.current
      const finger = event.touches[0]
      if (!current || current.mouse || !finger || event.touches.length > 1) return
      // Unabhängig von der Reihenfolge pointermove/touchmove: Richtung hier ggf. selbst festlegen.
      decideDirection(current, finger.clientX, finger.clientY)
      if (current.direction === 'horizontal' && event.cancelable) event.preventDefault()
    }
    area.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => area.removeEventListener('touchmove', onTouchMove)
  }, [])
  const attachArea = useCallback((element: HTMLElement | null) => {
    areaRef.current = element
  }, [])

  const handlers = useMemo(
    () => ({ onPointerDown, onPointerMove, onPointerUp, onPointerCancel }),
    [onPointerDown, onPointerMove, onPointerUp, onPointerCancel],
  )
  return { handlers, claimGesture: abort, areaRef: attachArea }
}
