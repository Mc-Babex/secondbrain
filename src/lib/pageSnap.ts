/** Anteil der Seitenbreite, ab dem Loslassen auf die Nachbarseite einrastet. */
export const SNAP_FRACTION = 1 / 3
/** Mindesttempo (px/ms) in Zugrichtung für „schnelles Wischen“. */
export const SNAP_MIN_SPEED = 0.4
/** Mindestweg (px) für schnelles Wischen. */
export const SNAP_MIN_FLICK_PX = 30
/** Gegentempo (px/ms), ab dem die Geste am Ende als „zurückgezogen“ gilt. */
export const SNAP_REVERSE_SPEED = 0.1
/** Fenster (ms), über das das Endtempo gemittelt wird. */
export const VELOCITY_WINDOW_MS = 100
/** Größter Überzug am Rand als Anteil der Breite. */
export const RUBBER_LIMIT = 0.25

export interface Sample {
  x: number
  time: number
}

/** Tempo (px/ms, mit Vorzeichen) aus den letzten Messpunkten; 0 ohne genug Daten. */
export function releaseVelocity(samples: readonly Sample[]): number {
  const last = samples[samples.length - 1]
  if (!last) return 0
  const reference = samples.find((s) => last.time - s.time <= VELOCITY_WINDOW_MS) ?? last
  const elapsed = last.time - reference.time
  if (elapsed <= 0) return 0
  return (last.x - reference.x) / elapsed
}

/** Gedämpfter Versatz am Rand: folgt anfangs dem Finger, nähert sich aber `RUBBER_LIMIT × Breite`. */
export function rubberBand(dx: number, width: number): number {
  const limit = RUBBER_LIMIT * Math.max(width, 1)
  const damped = limit * (1 - 1 / ((Math.abs(dx) * 0.6) / limit + 1))
  return dx < 0 ? -damped : damped
}

/** Sichtbarer Versatz (px) der Leiste für den Fingerweg `dx` auf Seite `index`. */
export function dragOffset(dx: number, index: number, count: number, width: number): number {
  const beyondStart = index === 0 && dx > 0
  const beyondEnd = index === count - 1 && dx < 0
  return beyondStart || beyondEnd ? rubberBand(dx, width) : dx
}

/**
 * Wohin rastet die Leiste beim Loslassen ein? `1` = nächste Seite, `-1` = vorherige, `0` = zurück.
 * Schnell in Zugrichtung oder Weg ≥ ⅓ Breite ⇒ Wechsel; deutliche Gegenbewegung am Ende ⇒ zurück;
 * über den Rand hinaus nie.
 */
export function snapDirection(
  dx: number,
  velocity: number,
  width: number,
  index: number,
  count: number,
): -1 | 0 | 1 {
  if (dx === 0) return 0
  const toward = dx < 0 ? 1 : -1
  const target = index + toward
  if (target < 0 || target >= count) return 0
  const speed = Math.abs(velocity)
  const sameDirection = Math.sign(velocity) === Math.sign(dx)
  if (!sameDirection && speed >= SNAP_REVERSE_SPEED) return 0
  const fast = sameDirection && speed >= SNAP_MIN_SPEED && Math.abs(dx) >= SNAP_MIN_FLICK_PX
  return fast || Math.abs(dx) >= width * SNAP_FRACTION ? toward : 0
}
