import {
  EDGE_ZONE_PX,
  MAX_SCROLL_PX,
  autoScrollStep,
  columnAt,
  dragPlace,
  placeStartIso,
  samePlace,
  snapMinutes,
  type DragColumn,
  type DragPlace,
} from './dragSchedule'

const PX = 0.8 // 48 px je Stunde
const COLUMNS: DragColumn[] = [
  { day: '2026-10-19', left: 50, right: 100 },
  { day: '2026-10-20', left: 102, right: 152 },
  { day: '2026-10-21', left: 154, right: 204 },
]
const ORIGIN: DragPlace = { day: '2026-10-20', startMin: 600, durationMin: 60 }

describe('snapMinutes', () => {
  it('rastet auf 15 Minuten', () => {
    expect(snapMinutes(607)).toBe(600)
    expect(snapMinutes(608)).toBe(615)
    expect(snapMinutes(622)).toBe(615)
  })
})

describe('columnAt', () => {
  it('findet die Spalte unter x und sonst die nächste', () => {
    expect(columnAt(120, COLUMNS)?.day).toBe('2026-10-20')
    expect(columnAt(10, COLUMNS)?.day).toBe('2026-10-19')
    expect(columnAt(500, COLUMNS)?.day).toBe('2026-10-21')
    expect(columnAt(101, COLUMNS)?.day).toBe('2026-10-19')
    expect(columnAt(1, [])).toBeNull()
  })
})

describe('dragPlace verschieben', () => {
  it('übersetzt Pixel in Minuten im 15-Minuten-Raster', () => {
    // 24 px = 30 Min.
    expect(dragPlace('move', ORIGIN, 24, PX, 120, COLUMNS)).toEqual({ ...ORIGIN, startMin: 630 })
    // 10 px = 12,5 Min. => 615
    expect(dragPlace('move', ORIGIN, 10, PX, 120, COLUMNS).startMin).toBe(615)
    expect(dragPlace('move', ORIGIN, -24, PX, 120, COLUMNS).startMin).toBe(570)
  })

  it('ändert bei Bewegung unter einer halben Stufe nichts', () => {
    expect(dragPlace('move', ORIGIN, 4, PX, 120, COLUMNS)).toBe(ORIGIN)
    const offGrid = { ...ORIGIN, startMin: 607 }
    expect(dragPlace('move', offGrid, 0, PX, 120, COLUMNS)).toBe(offGrid)
  })

  it('wechselt den Tag seitlich und behält die Uhrzeit', () => {
    expect(dragPlace('move', ORIGIN, 0, PX, 180, COLUMNS)).toEqual({
      ...ORIGIN,
      day: '2026-10-21',
    })
    expect(dragPlace('move', ORIGIN, 24, PX, 70, COLUMNS)).toEqual({
      day: '2026-10-19',
      startMin: 630,
      durationMin: 60,
    })
  })

  it('bleibt innerhalb des Tages', () => {
    expect(dragPlace('move', ORIGIN, -5000, PX, 120, COLUMNS).startMin).toBe(0)
    expect(dragPlace('move', ORIGIN, 5000, PX, 120, COLUMNS).startMin).toBe(1380)
    const odd = { ...ORIGIN, durationMin: 50 }
    expect(dragPlace('move', odd, 5000, PX, 120, COLUMNS).startMin).toBe(1380)
    expect(
      dragPlace('move', { ...ORIGIN, durationMin: 1500 }, 100, PX, 120, COLUMNS).startMin,
    ).toBe(0)
  })
})

describe('dragPlace Dauer', () => {
  it('rastet das Ende ein und ändert nur die Dauer', () => {
    expect(dragPlace('resize', ORIGIN, 24, PX, 999, COLUMNS)).toEqual({
      ...ORIGIN,
      durationMin: 90,
    })
    expect(dragPlace('resize', ORIGIN, -12, PX, 999, COLUMNS).durationMin).toBe(45)
  })

  it('hält die Mindestdauer von 15 Minuten', () => {
    expect(dragPlace('resize', ORIGIN, -5000, PX, 120, COLUMNS).durationMin).toBe(15)
  })

  it('endet spätestens um Mitternacht', () => {
    expect(dragPlace('resize', ORIGIN, 5000, PX, 120, COLUMNS).durationMin).toBe(840)
  })

  it('ändert bei kleiner Bewegung nichts', () => {
    expect(dragPlace('resize', ORIGIN, 3, PX, 120, COLUMNS)).toBe(ORIGIN)
  })
})

describe('samePlace', () => {
  it('vergleicht Tag, Beginn und Dauer', () => {
    expect(samePlace(ORIGIN, { ...ORIGIN })).toBe(true)
    expect(samePlace(ORIGIN, { ...ORIGIN, startMin: 615 })).toBe(false)
  })
})

describe('placeStartIso', () => {
  it('liefert ISO mit Berliner Offset (auch bei Zeitumstellung)', () => {
    expect(placeStartIso('2026-10-22', 615)).toBe('2026-10-22T10:15:00+02:00')
    expect(placeStartIso('2026-10-26', 615)).toBe('2026-10-26T10:15:00+01:00')
  })
})

describe('autoScrollStep', () => {
  it('scrollt nur in den Randzonen, stärker am äußersten Rand', () => {
    expect(autoScrollStep(300, 100, 500)).toBe(0)
    expect(autoScrollStep(100, 100, 500)).toBe(-MAX_SCROLL_PX)
    expect(autoScrollStep(500, 100, 500)).toBe(MAX_SCROLL_PX)
    const half = autoScrollStep(100 + EDGE_ZONE_PX / 2, 100, 500)
    expect(half).toBeLessThan(0)
    expect(half).toBeGreaterThan(-MAX_SCROLL_PX)
    expect(autoScrollStep(0, 100, 500)).toBe(-MAX_SCROLL_PX)
  })
})
