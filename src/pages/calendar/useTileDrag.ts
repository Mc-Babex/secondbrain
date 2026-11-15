import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import type { CalendarEvent } from '../../google/types'
import {
  autoScrollStep,
  dragPlace,
  placeStartIso,
  samePlace,
  type DragColumn,
  type DragMode,
  type DragPlace,
} from '../../lib/dragSchedule'
import { DAY_MINUTES } from '../../lib/calendarView'
import { formatTimeRange } from '../../lib/format'
import { zonedParts } from '../../lib/time'
import { useClaimGesture } from '../../lib/gestureClaim'
import { useUnsavedWork } from '../../lib/unsavedWork'

/** Langes Drücken (Touch/Stift) bis zum Ziehmodus. */
export const HOLD_MS = 400
/** So weit darf sich der Finger beim Halten bewegen (px); mehr ⇒ Wischen/Scrollen. */
export const HOLD_SLOP_PX = 8
/** Maus: Ziehen beginnt ab dieser Bewegung bei gedrückter Taste (px). */
export const MOUSE_DRAG_PX = 5
const CLICK_SUPPRESS_MS = 400

/** Ergebnis eines Ziehens: neuer Beginn (ISO mit Offset) und Dauer. */
export interface DragChange {
  mode: DragMode
  start: string
  durationMin: number
}

/** Gemeinsame Umgebung der ziehbaren Kacheln. */
export interface DragEnv {
  scroller: RefObject<HTMLElement | null>
  onCommit: (event: CalendarEvent, change: DragChange) => void
}

interface Session {
  pointerId: number
  touch: boolean
  mode: DragMode
  startX: number
  startY: number
  lastX: number
  lastY: number
  active: boolean
  timer: number
  frame: number
  origin: DragPlace
  pxPerMin: number
  columns: DragColumn[]
  startScroll: number
  result: DragPlace
}

function minutesOf(iso: string): number {
  const parts = zonedParts(new Date(iso))
  return parts.hour * 60 + parts.minute
}

/** Der nächste Klick (nach einem Ziehen) soll nichts auslösen, auch nicht auf einer neu eingehängten Kachel. */
function suppressNextClick(): void {
  const onClick = (event: Event): void => {
    // Eine Rückfrage, die das Ziehen auslöst, bleibt bedienbar.
    if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return
    event.stopPropagation()
    event.preventDefault()
  }
  const timer = window.setTimeout(release, CLICK_SUPPRESS_MS)
  function release(): void {
    window.clearTimeout(timer)
    window.removeEventListener('click', onClick, true)
  }
  window.addEventListener('click', onClick, { capture: true, once: true })
}

function scrollElementBy(element: HTMLElement, step: number): void {
  element.scrollTop += step
}

function measureColumns(scroller: HTMLElement | null, own: HTMLElement): DragColumn[] {
  const elements = scroller ? [...scroller.querySelectorAll<HTMLElement>('[data-day]')] : [own]
  return elements.map((element) => {
    const rect = element.getBoundingClientRect()
    return { day: element.dataset.day ?? '', left: rect.left, right: rect.right }
  })
}

/**
 * Ziehen einer Termin-Kachel (SPEC §6.2). Touch/Stift: langes Drücken (400 ms, < 8 px Bewegung) startet den Ziehmodus,
 * dann blockiert ein nicht-passiver `touchmove`-Listener das Scrollen und `claimGesture()` das Seitenwischen.
 * Maus: Ziehen ab 5 px mit gedrückter Taste. Verschieben rastet auf 15 Minuten (Woche: auch Tagwechsel),
 * der untere Griff (`data-resize-handle`) ändert die Dauer. Loslassen meldet `onCommit`, Escape/Abbruch verwirft.
 */
export function useTileDrag(event: CalendarEvent, env: DragEnv | undefined) {
  const claim = useClaimGesture()
  const tileRef = useRef<HTMLButtonElement | null>(null)
  const session = useRef<Session | null>(null)
  const latest = useRef({ event, env, claim })
  const touchSeen = useRef(false)
  const baseHeight = useRef('')
  const [badge, setBadge] = useState<string | null>(null)
  const badgeLabel = useRef<string | null>(null)
  const badgeEl = useRef<HTMLElement | null>(null)
  const badgePos = useRef({ x: 0, y: 0 })
  const tickRef = useRef<() => void>(() => undefined)
  const [active, setActive] = useState(false)
  useUnsavedWork('tile-drag', active)
  useEffect(() => {
    latest.current = { event, env, claim }
  })

  const placeBadge = useCallback(() => {
    const el = badgeEl.current
    if (!el) return
    el.style.left = `${badgePos.current.x}px`
    el.style.top = `${badgePos.current.y}px`
  }, [])
  /** Ref des Badge-Elements: setzt die Position direkt (kein React-Render pro Bewegung). */
  const attachBadge = useCallback(
    (el: HTMLElement | null) => {
      badgeEl.current = el
      placeBadge()
    },
    [placeBadge],
  )

  const clearVisuals = useCallback(() => {
    const tile = tileRef.current
    if (!tile) return
    tile.style.removeProperty('translate')
    // Die von React gesetzte Höhe wiederherstellen (sie ändert sich erst mit neuen Terminzeiten).
    tile.style.height = baseHeight.current
  }, [])

  const render = useCallback(() => {
    const s = session.current
    const tile = tileRef.current
    const scroller = latest.current.env?.scroller.current
    if (!s || !s.active || !tile) return
    const deltaY = s.lastY - s.startY + ((scroller?.scrollTop ?? 0) - s.startScroll)
    s.result = dragPlace(s.mode, s.origin, deltaY, s.pxPerMin, s.lastX, s.columns)
    if (s.mode === 'resize') {
      tile.style.setProperty('height', `${s.result.durationMin * s.pxPerMin}px`)
    } else {
      const dy = (s.result.startMin - s.origin.startMin) * s.pxPerMin
      const from = s.columns.find((column) => column.day === s.origin.day)
      const to = s.columns.find((column) => column.day === s.result.day)
      const dx = from && to ? to.left - from.left : 0
      tile.style.setProperty('translate', `${dx}px ${dy}px`)
    }
    const start = placeStartIso(s.result.day, s.result.startMin)
    const label = formatTimeRange(start, s.result.durationMin)
    badgePos.current = { x: s.lastX, y: s.lastY }
    placeBadge()
    if (label !== badgeLabel.current) {
      badgeLabel.current = label
      setBadge(label)
    }
    // Auto-Scroll läuft nur, solange der Zeiger in einer Randzone steht.
    if (s.frame === 0 && scroller) {
      const rect = scroller.getBoundingClientRect()
      if (autoScrollStep(s.lastY, rect.top, rect.bottom) !== 0) {
        s.frame = window.requestAnimationFrame(() => tickRef.current())
      }
    }
  }, [placeBadge])

  const stop = useCallback(() => {
    const s = session.current
    if (!s) return
    window.clearTimeout(s.timer)
    window.cancelAnimationFrame(s.frame)
    session.current = null
  }, [])

  const finish = useCallback(
    (commit: boolean) => {
      const s = session.current
      if (!s) return
      const wasActive = s.active
      stop()
      // Ohne aktiven Ziehmodus wurde nichts verändert – Inline-Stile der Kachel bleiben unangetastet.
      if (!wasActive) return
      clearVisuals()
      setActive(false)
      badgeLabel.current = null
      setBadge(null)
      suppressNextClick()
      const { event: current, env: currentEnv } = latest.current
      if (commit && currentEnv && !samePlace(s.result, s.origin)) {
        currentEnv.onCommit(current, {
          mode: s.mode,
          start: placeStartIso(s.result.day, s.result.startMin),
          durationMin: s.result.durationMin,
        })
      }
    },
    [clearVisuals, stop],
  )

  const tick = useCallback(() => {
    const s = session.current
    const scroller = latest.current.env?.scroller.current
    if (!s || !s.active) return
    s.frame = 0
    if (!scroller) return
    const rect = scroller.getBoundingClientRect()
    const step = autoScrollStep(s.lastY, rect.top, rect.bottom)
    if (step === 0) return
    scrollElementBy(scroller, step)
    render()
  }, [render])
  useEffect(() => {
    tickRef.current = tick
  })

  const activate = useCallback(() => {
    const s = session.current
    const tile = tileRef.current
    const { event: current, env: currentEnv } = latest.current
    if (!s || !tile || !currentEnv) return
    const column = tile.parentElement
    const height = column?.getBoundingClientRect().height ?? 0
    if (!column || height <= 0 || !column.dataset.day) {
      stop()
      return
    }
    const durationMin = Math.max(
      15,
      Math.round((Date.parse(current.end) - Date.parse(current.start)) / 60_000),
    )
    s.origin = { day: column.dataset.day, startMin: minutesOf(current.start), durationMin }
    s.result = s.origin
    s.pxPerMin = height / DAY_MINUTES
    s.columns = measureColumns(currentEnv.scroller.current, column)
    s.startScroll = currentEnv.scroller.current?.scrollTop ?? 0
    s.active = true
    baseHeight.current = tile.style.height
    latest.current.claim()
    navigator.vibrate?.(10)
    window.getSelection()?.removeAllRanges()
    try {
      tile.setPointerCapture(s.pointerId)
    } catch {
      // Capture ist optional (Zeiger schon beendet).
    }
    setActive(true)
  }, [stop])

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      const { env: currentEnv } = latest.current
      const touch = e.pointerType === 'touch' || e.pointerType === 'pen'
      touchSeen.current = touch
      if (!currentEnv || (!touch && e.button !== 0) || session.current?.active) return
      stop()
      if (!touch) {
        // Auch bei schnellen Mausbewegungen außerhalb der Kachel weiter Ereignisse erhalten.
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          // Capture ist optional (z. B. Zeiger schon beendet).
        }
      }
      const resize = e.target instanceof Element && e.target.closest('[data-resize-handle]')
      const origin = { day: '', startMin: 0, durationMin: 0 }
      session.current = {
        pointerId: e.pointerId,
        touch,
        mode: resize ? 'resize' : 'move',
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        active: false,
        timer: touch ? window.setTimeout(activate, HOLD_MS) : 0,
        frame: 0,
        origin,
        pxPerMin: 0,
        columns: [],
        startScroll: 0,
        result: origin,
      }
    },
    [activate, stop],
  )

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      const s = session.current
      if (!s || e.pointerId !== s.pointerId) return
      s.lastX = e.clientX
      s.lastY = e.clientY
      if (s.active) {
        render()
        return
      }
      const moved = Math.hypot(e.clientX - s.startX, e.clientY - s.startY)
      if (s.touch) {
        // Vor Ablauf der 0,4 s gilt jede nennenswerte Bewegung als Wischen/Scrollen.
        if (moved > HOLD_SLOP_PX) stop()
      } else if (e.buttons === 0) {
        // Taste wurde außerhalb der Kachel losgelassen: kein Ziehen starten.
        stop()
      } else if (moved >= MOUSE_DRAG_PX) {
        activate()
        render()
      }
    },
    [activate, render, stop],
  )

  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      const s = session.current
      if (!s || e.pointerId !== s.pointerId) return
      s.lastX = e.clientX
      s.lastY = e.clientY
      if (s.active) render()
      finish(true)
    },
    [finish, render],
  )

  const onPointerCancel = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      const s = session.current
      if (s && e.pointerId === s.pointerId) finish(false)
    },
    [finish],
  )

  const onContextMenu = useCallback((e: { preventDefault: () => void }) => {
    if (touchSeen.current || session.current?.active) e.preventDefault()
  }, [])

  // Nicht-passiver touchmove: im Ziehmodus kein natives Scrollen (und kein Seitenwischen, siehe `claim`).
  useEffect(() => {
    const tile = tileRef.current
    if (!tile) return undefined
    const onTouchMove = (e: TouchEvent): void => {
      if (session.current?.active && e.cancelable) e.preventDefault()
    }
    tile.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => tile.removeEventListener('touchmove', onTouchMove)
  }, [])

  // Escape verwirft das Ziehen.
  useEffect(() => {
    if (!active) return undefined
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') finish(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, finish])

  useEffect(
    () => () => {
      stop()
    },
    [stop],
  )

  return {
    tileRef,
    active,
    badge,
    attachBadge,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onContextMenu },
  }
}
