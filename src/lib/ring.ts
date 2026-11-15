import type { Category } from '../data/types'

export const TILES_PER_PAGE = 6
/** Seitenverhältnis der Figur-ViewBox (120 × 160). */
const FIGURE_ASPECT = 4 / 3
/** Anteil der Bühnenbreite, den die Figur einnimmt. */
const FIGURE_WIDTH_RATIO = 0.34

const SHOPPING_ANGLE = 62
const ARCHIVE_ANGLE = 118
const ARC_START = 118
const ARC_LENGTH = 304

export interface RingSlot {
  category: Category
  angleDeg: number
}

export interface RingLayout {
  slots: RingSlot[]
  pageCount: number
}

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Winkel in Grad: 0° = rechts, 90° = unten. Einkauf und Archiv sind fest, normale Ablagen verteilen sich im Bogen. */
export function ringLayout(categories: readonly Category[], page: number): RingLayout {
  const normal = categories.filter((c) => c.kind === 'normal').sort((a, b) => a.order - b.order)
  const pageCount = Math.max(1, Math.ceil(normal.length / TILES_PER_PAGE))
  const current = Math.min(pageCount - 1, Math.max(0, Math.trunc(page) || 0))
  const onPage = normal.slice(current * TILES_PER_PAGE, (current + 1) * TILES_PER_PAGE)

  const slots: RingSlot[] = onPage.map((category, i) => ({
    category,
    angleDeg: ARC_START + ((i + 1) * ARC_LENGTH) / (onPage.length + 1),
  }))
  const shopping = categories.find((c) => c.kind === 'einkauf')
  if (shopping) slots.push({ category: shopping, angleDeg: SHOPPING_ANGLE })
  const archive = categories.find((c) => c.kind === 'archiv')
  if (archive) slots.push({ category: archive, angleDeg: ARCHIVE_ANGLE })
  return { slots, pageCount }
}

export type ArmSide = 'left' | 'right'

export interface Pose {
  arm: ArmSide
  /** Drehung des zeigenden Arms; links 0…145, rechts −145…0: schwingt nach außen, nie über Körper oder Gesicht. */
  armRotationDeg: number
  eyeOffset: Point
  headTiltDeg: number
}

export const SHOULDERS: Record<ArmSide, Point> = {
  left: { x: 42, y: 76 },
  right: { x: 78, y: 76 },
}
export const REST_ROTATION: Record<ArmSide, number> = { left: 10, right: -10 }
const HEAD_CENTER: Point = { x: 60, y: 40 }
const MAX_EYE_OFFSET = 2.5
const MAX_HEAD_TILT = 5
const CLAMPED_HEAD_TILT = 8
/** Größter Armausschlag (Betrag); darüber läge der Arm vor dem Kopf. */
const MAX_ARM_DEG = 145

function normalizeDeg(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180
}

/** Haltung der Figur für ein Ziel in Koordinaten der Figur-ViewBox. */
export function pointing(target: Point): Pose {
  const arm: ArmSide = target.x < 60 ? 'left' : 'right'
  const shoulder = SHOULDERS[arm]
  const normalized = normalizeDeg(
    (Math.atan2(target.y - shoulder.y, target.x - shoulder.x) * 180) / Math.PI - 90,
  )
  // Der Arm schwingt immer nach außen und wird begrenzt, damit er nicht quer vor dem Gesicht liegt.
  const outward =
    arm === 'left' && normalized < 0
      ? normalized + 360
      : arm === 'right' && normalized > 0
        ? normalized - 360
        : normalized
  const armRotationDeg =
    arm === 'left' ? Math.min(outward, MAX_ARM_DEG) : Math.max(outward, -MAX_ARM_DEG)
  const clamped = armRotationDeg !== outward

  const dx = target.x - HEAD_CENTER.x
  const dy = target.y - HEAD_CENTER.y
  const distance = Math.hypot(dx, dy) || 1
  const eyeOffset = {
    x: (dx / distance) * MAX_EYE_OFFSET,
    y: (dy / distance) * MAX_EYE_OFFSET,
  }
  // Bei begrenztem Arm übernimmt der Kopf die Richtung stärker.
  const headTiltDeg = clamped
    ? (arm === 'left' ? -1 : 1) * CLAMPED_HEAD_TILT
    : MAX_HEAD_TILT * Math.max(-1, Math.min(1, dx / 60))
  return { arm, armRotationDeg, eyeOffset, headTiltDeg }
}

export interface TileSize {
  width: number
  height: number
}

/** Bühne des Rings in px; mindestens so hoch wie breit, höchstens 1,3-mal so hoch. */
export interface Stage {
  width: number
  height: number
}

/** Kachelgröße; wächst mit der Höhe der Bühne, solange die Kacheln einander nicht berühren. */
export function tileSize(stage: Stage): TileSize {
  const tall = Math.min(1, Math.max(0, (stage.height / stage.width - 1) / 0.3))
  const width = Math.min(160, stage.width * (0.225 + 0.03 * tall))
  return { width, height: width * 0.8 }
}

/** Größe der Figur in Pixeln; wächst mit der Bühne. */
export function figureSize(stage: Stage): { width: number; height: number } {
  const width = stage.width * FIGURE_WIDTH_RATIO
  return { width, height: width * FIGURE_ASPECT }
}

/** Mittelpunkt der Kachel auf der Ellipse durch alle Kachelmitten. */
export function tileCenter(stage: Stage, angleDeg: number): Point {
  const size = tileSize(stage)
  const rx = stage.width / 2 - size.width / 2 - 2
  const ry = stage.height / 2 - size.height / 2 - 2
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: stage.width / 2 + rx * Math.cos(rad),
    y: stage.height / 2 + ry * Math.sin(rad),
  }
}

export function tileRects(stage: Stage, anglesDeg: readonly number[]): Rect[] {
  const size = tileSize(stage)
  return anglesDeg.map((angle) => {
    const c = tileCenter(stage, angle)
    return { x: c.x - size.width / 2, y: c.y - size.height / 2, ...size }
  })
}

export function figureRect(stage: Stage): Rect {
  const size = figureSize(stage)
  return {
    x: (stage.width - size.width) / 2,
    y: (stage.height - size.height) / 2,
    ...size,
  }
}

/** Rechnet einen Punkt der Bühne (px) in Koordinaten der Figur-ViewBox (120 × 160) um. */
export function toFigureCoords(stage: Stage, point: Point): Point {
  const figure = figureRect(stage)
  const scale = figure.width / 120
  return { x: (point.x - figure.x) / scale, y: (point.y - figure.y) / scale }
}
