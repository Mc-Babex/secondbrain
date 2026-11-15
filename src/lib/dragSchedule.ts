import { DAY_MINUTES } from './calendarView'
import { zonedToDate } from './planning'
import { toIso } from './time'

/** Raster beim Ziehen von Terminen (Minuten). */
export const SNAP_MIN = 15
/** Randzone (px) der Zeitleiste, in der beim Ziehen automatisch gescrollt wird. */
export const EDGE_ZONE_PX = 48
/** Höchste Scrollgeschwindigkeit (px je Bild) am äußersten Rand. */
export const MAX_SCROLL_PX = 14

export type DragMode = 'move' | 'resize'

/** Lage eines Termins vor dem Ziehen: Tag `YYYY-MM-DD`, Beginn und Dauer in Minuten. */
export interface DragPlace {
  day: string
  startMin: number
  durationMin: number
}

/** Waagerechter Bereich einer Tagesspalte (Bildschirm-Pixel). */
export interface DragColumn {
  day: string
  left: number
  right: number
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

/** Nächstes Vielfaches von 15 Minuten. */
export function snapMinutes(minutes: number): number {
  return Math.round(minutes / SNAP_MIN) * SNAP_MIN
}

/** Tag der Spalte unter `x`; außerhalb aller Spalten die nächstgelegene. `null` ohne Spalten. */
export function columnAt(x: number, columns: readonly DragColumn[]): DragColumn | null {
  let best: DragColumn | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const column of columns) {
    const distance = x < column.left ? column.left - x : x > column.right ? x - column.right : 0
    if (distance < bestDistance) {
      best = column
      bestDistance = distance
    }
  }
  return best
}

/**
 * Neue Lage nach dem Ziehen um `deltaY` Pixel (inkl. Scrollweg) und an die waagerechte Stelle `x`.
 * Verschieben: Beginn im 15-Minuten-Raster, der Termin bleibt im Tag, der Tag folgt der Spalte unter `x`.
 * Dauer ändern: das Ende rastet ein, mindestens 15 Minuten, höchstens bis Tagesende. Eine Bewegung unter
 * einer halben Rasterstufe ändert nichts.
 */
export function dragPlace(
  mode: DragMode,
  origin: DragPlace,
  deltaY: number,
  pxPerMin: number,
  x: number,
  columns: readonly DragColumn[],
): DragPlace {
  const deltaMin = pxPerMin > 0 ? deltaY / pxPerMin : 0
  if (mode === 'resize') {
    if (Math.abs(deltaMin) < SNAP_MIN / 2) return origin
    const end = snapMinutes(origin.startMin + origin.durationMin + deltaMin)
    const durationMin = clamp(end - origin.startMin, SNAP_MIN, DAY_MINUTES - origin.startMin)
    return { ...origin, durationMin }
  }
  const day = columnAt(x, columns)?.day ?? origin.day
  if (Math.abs(deltaMin) < SNAP_MIN / 2 && day === origin.day) return origin
  const latest = Math.max(0, Math.floor((DAY_MINUTES - origin.durationMin) / SNAP_MIN) * SNAP_MIN)
  const startMin =
    Math.abs(deltaMin) < SNAP_MIN / 2 ? origin.startMin : snapMinutes(origin.startMin + deltaMin)
  return { ...origin, day, startMin: clamp(startMin, 0, latest) }
}

export function samePlace(a: DragPlace, b: DragPlace): boolean {
  return a.day === b.day && a.startMin === b.startMin && a.durationMin === b.durationMin
}

/** ISO 8601 mit Offset (Europe/Berlin) für Tag `YYYY-MM-DD` und Minuten seit Mitternacht. */
export function placeStartIso(day: string, minutes: number): string {
  const [year, month, d] = day.split('-').map(Number)
  return toIso(zonedToDate(year, month, d, Math.floor(minutes / 60), minutes % 60))
}

/** Scrollweg (px je Bild; negativ = nach oben) für einen Zeiger an `y` in einer Zeitleiste von `top` bis `bottom`. */
export function autoScrollStep(y: number, top: number, bottom: number): number {
  const zone = Math.min(EDGE_ZONE_PX, (bottom - top) / 2)
  if (zone <= 0) return 0
  if (y < top + zone) return -MAX_SCROLL_PX * Math.min(1, (top + zone - y) / zone)
  if (y > bottom - zone) return MAX_SCROLL_PX * Math.min(1, (y - (bottom - zone)) / zone)
  return 0
}
