import type { Category } from '../data/types'
import {
  figureRect,
  pointing,
  ringLayout,
  tileRects,
  tileSize,
  toFigureCoords,
  type Rect,
} from './ring'

function cat(id: string, kind: Category['kind'] = 'normal', order = 0): Category {
  return { id, name: id, kind, order, description: '' }
}

function normals(count: number): Category[] {
  return Array.from({ length: count }, (_, i) => cat(`n${i}`, 'normal', count - i))
}

const fixed = [cat('einkauf', 'einkauf', 90), cat('archiv', 'archiv', 99)]

describe('ringLayout', () => {
  it('setzt Einkauf auf 62° und Archiv auf 118°', () => {
    const { slots } = ringLayout([...fixed], 0)
    expect(slots.find((s) => s.category.id === 'einkauf')?.angleDeg).toBe(62)
    expect(slots.find((s) => s.category.id === 'archiv')?.angleDeg).toBe(118)
  })

  it('platziert eine normale Ablage oben (270°)', () => {
    const { slots, pageCount } = ringLayout([...normals(1), ...fixed], 0)
    expect(pageCount).toBe(1)
    expect(slots[0].angleDeg).toBeCloseTo(270)
  })

  it('verteilt 6 normale Ablagen gleichmäßig nach order', () => {
    const { slots, pageCount } = ringLayout([...normals(6), ...fixed], 0)
    const normal = slots.filter((s) => s.category.kind === 'normal')
    expect(pageCount).toBe(1)
    expect(normal.map((s) => s.category.id)).toEqual(['n5', 'n4', 'n3', 'n2', 'n1', 'n0'])
    normal.forEach((s, i) => expect(s.angleDeg).toBeCloseTo(118 + ((i + 1) * 304) / 7))
  })

  it('blättert bei 7 und 13 normalen Ablagen', () => {
    const seven = ringLayout([...normals(7), ...fixed], 1)
    expect(seven.pageCount).toBe(2)
    const second = seven.slots.filter((s) => s.category.kind === 'normal')
    expect(second).toHaveLength(1)
    expect(second[0].angleDeg).toBeCloseTo(270)

    expect(ringLayout(normals(13), 0).pageCount).toBe(3)
    expect(ringLayout(normals(13), 2).slots).toHaveLength(1)
  })

  it('begrenzt die Seite auf den gültigen Bereich', () => {
    const categories = normals(7)
    expect(ringLayout(categories, 99).slots).toHaveLength(1)
    expect(ringLayout(categories, -3).slots).toHaveLength(6)
  })
})

describe('pointing', () => {
  it('wählt den Arm nach der Seite des Ziels', () => {
    expect(pointing({ x: 10, y: 100 }).arm).toBe('left')
    expect(pointing({ x: 59.9, y: 100 }).arm).toBe('left')
    expect(pointing({ x: 60, y: 100 }).arm).toBe('right')
    expect(pointing({ x: 110, y: 100 }).arm).toBe('right')
  })

  it('liefert den Winkel für Ziele rechts, unten und links', () => {
    expect(pointing({ x: 178, y: 76 }).armRotationDeg).toBeCloseTo(-90)
    expect(pointing({ x: 78, y: 176 }).armRotationDeg).toBeCloseTo(0)
    expect(pointing({ x: -58, y: 76 }).armRotationDeg).toBeCloseTo(90)
  })

  it('begrenzt den Armwinkel auf ±145°, auch für Ziele genau oben', () => {
    expect(pointing({ x: 78, y: -24 }).armRotationDeg).toBeCloseTo(-145)
    expect(pointing({ x: 42, y: -24 }).armRotationDeg).toBeCloseTo(145)
    expect(pointing({ x: 60, y: -100 })).toMatchObject({ arm: 'right', armRotationDeg: -145 })
    expect(pointing({ x: 59, y: -100 })).toMatchObject({ arm: 'left', armRotationDeg: 145 })
  })

  it('hält den linken Arm in 0…145 und den rechten in −145…0 (nach außen)', () => {
    for (let x = -200; x <= 300; x += 25) {
      for (let y = -200; y <= 300; y += 25) {
        const pose = pointing({ x, y })
        if (pose.arm === 'left') {
          expect(pose.armRotationDeg).toBeGreaterThanOrEqual(0)
          expect(pose.armRotationDeg).toBeLessThanOrEqual(145)
        } else {
          expect(pose.armRotationDeg).toBeGreaterThanOrEqual(-145)
          expect(pose.armRotationDeg).toBeLessThanOrEqual(0)
        }
      }
    }
  })

  it('neigt bei begrenztem Arm den Kopf stärker zur Armseite', () => {
    expect(pointing({ x: 42, y: -24 }).headTiltDeg).toBeLessThan(-5)
    expect(pointing({ x: 78, y: -24 }).headTiltDeg).toBeGreaterThan(5)
    expect(pointing({ x: 42, y: -24 }).eyeOffset.y).toBeLessThan(0)
  })

  it('begrenzt Augen-Versatz und Kopfneigung', () => {
    const far = pointing({ x: 1000, y: 40 })
    expect(Math.hypot(far.eyeOffset.x, far.eyeOffset.y)).toBeCloseTo(2.5)
    expect(far.headTiltDeg).toBeCloseTo(5)
    expect(pointing({ x: -1000, y: 40 }).headTiltDeg).toBeCloseTo(-5)
  })
})

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

describe('Ring-Geometrie', () => {
  const stages: [number, number][] = [
    [328, 328],
    [343, 343],
    [343, 445],
    [358, 465],
    [358, 400],
    [430, 540],
    [480, 480],
    [544, 544],
    [544, 700],
  ]

  it.each(stages)(
    'hat bei %i × %i px keine Überlappung und liegt in der Bühne (1 bis 6 Ablagen)',
    (width, height) => {
      const stage = { width, height }
      for (let count = 1; count <= 6; count++) {
        const angles = ringLayout([...normals(count), ...fixed], 0).slots.map((s) => s.angleDeg)
        const rects = tileRects(stage, angles)
        const figure = figureRect(stage)
        rects.forEach((rect, i) => {
          expect(rect.x).toBeGreaterThanOrEqual(0)
          expect(rect.y).toBeGreaterThanOrEqual(0)
          expect(rect.x + rect.width).toBeLessThanOrEqual(width)
          expect(rect.y + rect.height).toBeLessThanOrEqual(height)
          expect(overlaps(rect, figure)).toBe(false)
          rects.slice(i + 1).forEach((other) => expect(overlaps(rect, other)).toBe(false))
        })
      }
    },
  )

  it('macht Kacheln und Figur auf der Bühne größer als zuvor (Breite 343 px)', () => {
    expect(tileSize({ width: 343, height: 343 }).height).toBeGreaterThan(343 * 0.24 * 0.72)
    expect(figureRect({ width: 343, height: 343 }).width).toBeGreaterThan(96 * 1.15)
  })
})

describe('Hilfsfunktionen', () => {
  it('rechnet die Bühnenmitte in die Figurmitte um', () => {
    const stage = { width: 400, height: 500 }
    const point = toFigureCoords(stage, { x: 200, y: 250 })
    expect(point.x).toBeCloseTo(60)
    expect(point.y).toBeCloseTo(80)
  })
})
