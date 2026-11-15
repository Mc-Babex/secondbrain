import { useEffect, type RefObject } from 'react'
import { logError } from '../data/errorLog'

/** Wartezeit nach Seitenwechsel bzw. Rückkehr ins Fenster, bevor geprüft wird. */
export const WATCHDOG_DELAY_MS = 2000

interface Box {
  top: number
  bottom: number
  left: number
  right: number
  height: number
}

/** Messwerte der Anzeige für die Diagnose („Seite leer“). */
export interface DisplayMeasure {
  innerWidth: number
  innerHeight: number
  viewportHeight: number | null
  main: Box
  track: Box
  page: Box
  pageVisibility: string
  mainScroll: { x: number; y: number }
  moving: boolean
  pageIndex: number
  transform: string
  dragging: boolean
  visibilityState: string
  uptimeS: number
}

const box = (element: Element): Box => {
  const { top, bottom, left, right, height } = element.getBoundingClientRect()
  return { top, bottom, left, right, height }
}

/** Misst main, Leiste und aktive Seite; `null`, wenn ein Element fehlt. */
export function measureDisplay(
  main: HTMLElement | null,
  track: HTMLElement | null,
  pageIndex: number,
): DisplayMeasure | null {
  const page = track?.children[pageIndex]
  if (!main || !track || !(page instanceof HTMLElement)) return null
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    viewportHeight: window.visualViewport?.height ?? null,
    main: box(main),
    track: box(track),
    page: box(page),
    pageVisibility: getComputedStyle(page).visibility,
    mainScroll: { x: main.scrollLeft, y: main.scrollTop },
    moving: 'moving' in track.dataset,
    pageIndex,
    transform: page.style.transform || '-',
    dragging: 'dragging' in track.dataset,
    visibilityState: document.visibilityState,
    uptimeS: Math.round(performance.now() / 1000),
  }
}

/** Hat die aktive Seite keine sichtbare Fläche (Höhe 0, außerhalb des Fensters oder `visibility: hidden`)? */
export function isDisplayBlank(m: DisplayMeasure): boolean {
  const outside =
    m.page.bottom <= 0 ||
    m.page.top >= m.innerHeight ||
    m.page.right <= 0 ||
    m.page.left >= m.innerWidth
  return (
    m.main.height <= 0 ||
    m.track.height <= 0 ||
    m.page.height <= 0 ||
    outside ||
    m.pageVisibility === 'hidden'
  )
}

/**
 * Steht die Anzeige anders als erwartet? Der Seitenbereich ist verschoben (Scroll-Versatz ≠ 0), oder die
 * aktive Seite liegt in Ruhe nicht an der Position von main. Ein reiner Zeichenfehler von WebKit
 * (Seite ist laut DOM richtig platziert, wird aber nicht gezeichnet) ist nicht messbar.
 */
export function isDisplayShifted(m: DisplayMeasure): boolean {
  if (m.mainScroll.x !== 0 || m.mainScroll.y !== 0) return true
  if (m.dragging || m.moving) return false
  return Math.abs(m.page.left - m.main.left) > 1 || Math.abs(m.page.top - m.main.top) > 1
}

const r = (n: number): number => Math.round(n)

/** Kompakter Text der Messwerte (ohne Geheimnisse). */
export function describeMeasure(m: DisplayMeasure, reason = 'Seite leer'): string {
  return (
    `${reason}: Seite ${m.pageIndex}, innen ${r(m.innerWidth)}x${r(m.innerHeight)}, ` +
    `visual ${m.viewportHeight === null ? '-' : r(m.viewportHeight)}, ` +
    `main ${r(m.main.height)}, Leiste ${r(m.track.height)}, Seite ${r(m.page.height)}@${r(m.page.left)},${r(m.page.top)}, ` +
    `vis ${m.pageVisibility}, scroll ${r(m.mainScroll.x)}/${r(m.mainScroll.y)}, tf ${m.transform}, drag ${m.dragging ? 'ja' : 'nein'}, ` +
    `${m.visibilityState}, ${m.uptimeS}s`
  )
}

/** Prüft einmal und protokolliert bei leerer oder verschobener Anzeige; gibt zurück, ob etwas auffiel. */
export function checkDisplay(
  main: HTMLElement | null,
  track: HTMLElement | null,
  pageIndex: number,
): boolean {
  const measure = measureDisplay(main, track, pageIndex)
  if (!measure) return false
  if (isDisplayBlank(measure)) {
    logError('Anzeige', describeMeasure(measure))
    return true
  }
  if (isDisplayShifted(measure)) {
    logError('Anzeige', describeMeasure(measure, 'Seite verschoben'))
    return true
  }
  return false
}

/**
 * Wächter gegen stummes „leerer Bildschirm“: ca. 2 s nach jedem Seitenwechsel, nach Rückkehr ins
 * sichtbare Fenster und nach dem Schließen eines Dialogs wird geprüft, ob die aktive Seite Fläche hat und
 * an ihrer Stelle steht; sonst steht ein Eintrag in der Fehlerliste.
 */
export function useDisplayWatchdog(
  mainRef: RefObject<HTMLElement | null>,
  trackRef: RefObject<HTMLElement | null>,
  pageIndex: number,
): void {
  useEffect(() => {
    let timer: number | undefined
    const schedule = (): void => {
      window.clearTimeout(timer)
      timer = window.setTimeout(
        () => checkDisplay(mainRef.current, trackRef.current, pageIndex),
        WATCHDOG_DELAY_MS,
      )
    }
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') schedule()
    }
    // Dialoge hängen direkt unter body (BodyPortal): Verschwinden des letzten Dialogs löst eine Prüfung aus.
    let dialogOpen = document.querySelector('[role="dialog"]') !== null
    const observer = new MutationObserver(() => {
      const open = document.querySelector('[role="dialog"]') !== null
      if (dialogOpen && !open) schedule()
      dialogOpen = open
    })
    observer.observe(document.body, { childList: true })
    schedule()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [mainRef, trackRef, pageIndex])
}
