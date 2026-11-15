import { dragOffset, releaseVelocity, rubberBand, snapDirection } from './pageSnap'

const W = 390

describe('snapDirection', () => {
  it('weniger als ein Drittel und langsam ⇒ zurück', () => {
    expect(snapDirection(-100, -0.05, W, 1, 4)).toBe(0)
  })
  it('ab einem Drittel der Breite ⇒ nächste bzw. vorherige Seite', () => {
    expect(snapDirection(-131, -0.1, W, 1, 4)).toBe(1)
    expect(snapDirection(131, 0.1, W, 1, 4)).toBe(-1)
  })
  it('kurz aber schnell ⇒ weiter', () => {
    expect(snapDirection(-40, -0.6, W, 1, 4)).toBe(1)
  })
  it('zu kurz bleibt auch schnell zurück', () => {
    expect(snapDirection(-20, -0.9, W, 1, 4)).toBe(0)
  })
  it('Gegenrichtung am Ende der Geste ⇒ zurück', () => {
    expect(snapDirection(-200, 0.3, W, 1, 4)).toBe(0)
  })
  it('über den Rand hinaus nie', () => {
    expect(snapDirection(300, 1, W, 0, 4)).toBe(0)
    expect(snapDirection(-300, -1, W, 3, 4)).toBe(0)
  })
})

describe('Randwiderstand', () => {
  it('dämpft am ersten und letzten Rand, aber nicht in der Mitte', () => {
    const damped = dragOffset(200, 0, 4, W)
    expect(damped).toBeGreaterThan(0)
    expect(damped).toBeLessThan(100)
    expect(dragOffset(-200, 3, 4, W)).toBe(-damped)
    expect(dragOffset(200, 1, 4, W)).toBe(200)
  })
  it('ist nach oben begrenzt und wächst monoton', () => {
    expect(rubberBand(5000, W)).toBeLessThan(0.25 * W)
    expect(rubberBand(300, W)).toBeGreaterThan(rubberBand(100, W))
  })
})

describe('releaseVelocity', () => {
  it('mittelt über die letzten 100 ms', () => {
    const samples = [
      { x: 300, time: 0 },
      { x: 250, time: 200 },
      { x: 200, time: 250 },
      { x: 150, time: 300 },
    ]
    expect(releaseVelocity(samples)).toBeCloseTo(-1, 5)
  })
  it('liefert 0 ohne Zeitspanne', () => {
    expect(releaseVelocity([{ x: 1, time: 5 }])).toBe(0)
    expect(releaseVelocity([])).toBe(0)
  })
})
