/**
 * Seitenanzeige ohne große transformierte Ebene (Aufgabe 74). Die Seiten (Kinder der Leiste) liegen
 * absolut übereinander. In Ruhe hat nur die aktive Seite eine Darstellung und keinerlei `transform`;
 * nur während Wischgeste und Übergang bekommen die beteiligten Seiten ein eigenes `translate3d`.
 * Das Ende des Übergangs wird per `transitionend` bzw. Rückfallzeit festgelegt, nicht per CSS-Verzögerung.
 */

/** Dauer des Übergangs (ms), identisch zu `--page-transition` in `styles/theme.css`. */
export const PAGE_TRANSITION_MS = 300
/** Rückfallzeit, falls kein `transitionend` kommt (z. B. Seite war schon am Ziel). */
export const PAGE_FALLBACK_MS = PAGE_TRANSITION_MS + 100

/** Abbruch des gerade laufenden Übergangs (Timer und Listener) je Leiste. */
const pending = new WeakMap<HTMLElement, () => void>()

/** CSS-`transform` der Seite `page`, wenn die Seite `base` um `offset` px verschoben angezeigt wird. */
export function pageTransform(page: number, base: number, offset = 0): string {
  return `translate3d(calc(${(page - base) * 100}% + ${offset}px), 0, 0)`
}

function slots(track: HTMLElement): HTMLElement[] {
  return [...track.children].filter((child): child is HTMLElement => child instanceof HTMLElement)
}

function cancelPending(track: HTMLElement): void {
  pending.get(track)?.()
  pending.delete(track)
}

function place(track: HTMLElement, visible: number[], base: number, offset: number): void {
  slots(track).forEach((slot, i) => {
    if (visible.includes(i)) {
      slot.style.visibility = 'visible'
      slot.style.transform = pageTransform(i, base, offset)
    } else {
      slot.style.visibility = ''
      slot.style.transform = ''
    }
  })
}

/** Ruhelage: keine Transforms, keine Übergangs-Markierungen; sichtbar ist nur die aktive Seite (CSS). */
export function restPages(track: HTMLElement): void {
  cancelPending(track)
  delete track.dataset.dragging
  delete track.dataset.moving
  for (const slot of slots(track)) {
    slot.style.transform = ''
    slot.style.visibility = ''
  }
}

/** Während der Geste: aktive Seite und beide Nachbarn folgen dem Finger (`offset` in px). */
export function dragPages(track: HTMLElement, index: number, offset: number): void {
  cancelPending(track)
  delete track.dataset.moving
  track.dataset.dragging = ''
  place(track, [index - 1, index, index + 1], index, offset)
}

/**
 * Übergang von `from` nach `to` (auch gleich: Zurückfedern). Danach Ruhelage. Bei reduzierter
 * Bewegung sofort. `track.dataset.target` merkt das Ziel, damit ein Wechsel nicht doppelt startet.
 */
export function movePages(track: HTMLElement, from: number, to: number, reduced: boolean): void {
  cancelPending(track)
  track.dataset.target = String(to)
  if (reduced) {
    restPages(track)
    return
  }
  const visible = [...new Set([from - 1, from, from + 1, to])]
  if (!('dragging' in track.dataset)) {
    // Ausgangslage ohne Übergang setzen, damit ein Sprung über mehrere Seiten gleitet.
    delete track.dataset.moving
    place(track, visible, from, 0)
    void track.offsetWidth
  }
  delete track.dataset.dragging
  track.dataset.moving = ''
  place(track, visible, to, 0)
  const cancel = (): void => {
    window.clearTimeout(timer)
    track.removeEventListener('transitionend', onEnd)
  }
  const finish = (): void => restPages(track)
  const onEnd = (event: TransitionEvent): void => {
    if (event.propertyName === 'transform' && event.target instanceof HTMLElement) {
      if (event.target.parentElement === track) finish()
    }
  }
  const timer = window.setTimeout(finish, PAGE_FALLBACK_MS)
  track.addEventListener('transitionend', onEnd)
  pending.set(track, cancel)
}
