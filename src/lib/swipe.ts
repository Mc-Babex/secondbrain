/** Ab dieser Bewegung (px) wird die Richtung einer Berührung festgelegt. */
export const DIRECTION_LOCK_PX = 10
/** Größter Winkel zur Waagerechten (Grad), der noch als Wisch-Kandidat zählt. */
export const MAX_SWIPE_ANGLE_DEG = 35
/** Randstreifen oben und unten (px), in denen kein Wischen beginnt (iOS-Systemgesten). */
export const EDGE_STRIP_PX = 24

export type MoveClass = 'undecided' | 'horizontal' | 'vertical'

/** Richtung einer Berührung: erst ab `DIRECTION_LOCK_PX` Bewegung entschieden. */
export function classifyMove(dx: number, dy: number): MoveClass {
  if (Math.hypot(dx, dy) < DIRECTION_LOCK_PX) return 'undecided'
  const angle = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI
  return angle <= MAX_SWIPE_ANGLE_DEG ? 'horizontal' : 'vertical'
}

/** Liegt der Startpunkt im oberen oder unteren Randstreifen des Fensters? */
export function isInEdgeStrip(y: number, viewportHeight: number): boolean {
  return y < EDGE_STRIP_PX || y > viewportHeight - EDGE_STRIP_PX
}
