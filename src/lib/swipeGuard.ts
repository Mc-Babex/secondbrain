/** Elemente mit diesem Attribut (oder darin) lösen nie einen Seitenwechsel aus. */
export const NO_SWIPE_ATTRIBUTE = 'data-no-swipe'

function scrollsHorizontally(element: HTMLElement): boolean {
  if (element.scrollWidth <= element.clientWidth) return false
  const overflowX = getComputedStyle(element).overflowX
  return overflowX === 'auto' || overflowX === 'scroll'
}

/** Beginnt die Berührung in einem Bereich, der selbst waagerecht scrollt oder zieht (Ziel bis `boundary`)? */
export function startsInNoSwipeZone(target: EventTarget | null, boundary: HTMLElement): boolean {
  let element = target instanceof Element ? target : null
  while (element) {
    if (element.hasAttribute(NO_SWIPE_ATTRIBUTE)) return true
    if (element instanceof HTMLElement && scrollsHorizontally(element)) return true
    if (element === boundary) return false
    element = element.parentElement
  }
  return false
}

/** Ist gerade Text markiert (Seitenauswahl oder in einem Eingabefeld)? */
export function hasTextSelection(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    if (target.selectionStart !== null && target.selectionStart !== target.selectionEnd) return true
  }
  const selection = window.getSelection()
  return selection !== null && !selection.isCollapsed && selection.toString() !== ''
}
