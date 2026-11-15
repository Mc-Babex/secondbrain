/**
 * Größte Schriftgröße (px) zwischen `min` und `max` (in Schritten von `step` unter `max`), für die `fits`
 * wahr ist; binäre Suche, `fits` muss mit kleinerer Schrift monoton leichter erfüllt sein.
 * Passt auch `min` nicht, wird `min` geliefert (lesbare Untergrenze).
 */
export function fitFontSize(
  max: number,
  min: number,
  fits: (size: number) => boolean,
  step = 0.5,
): number {
  const steps = Math.floor((max - min) / step)
  if (steps < 0) return min
  let low = 0
  let high = steps
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (fits(max - middle * step)) high = middle
    else low = middle + 1
  }
  const size = max - low * step
  return low === steps && !fits(size) ? min : size
}
