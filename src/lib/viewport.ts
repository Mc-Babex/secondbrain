export interface ViewportMetrics {
  innerHeight: number
  viewportHeight: number
  viewportOffsetTop: number
}

/** Höhe der Bildschirmtastatur (px), die das Layout-Viewport am unteren Rand verdeckt. */
export function keyboardInset({
  innerHeight,
  viewportHeight,
  viewportOffsetTop,
}: ViewportMetrics): number {
  const inset = innerHeight - viewportHeight - viewportOffsetTop
  return Number.isFinite(inset) ? Math.max(0, Math.round(inset)) : 0
}

export function readKeyboardInset(win: Window): number {
  const viewport = win.visualViewport
  if (!viewport) return 0
  return keyboardInset({
    innerHeight: win.innerHeight,
    viewportHeight: viewport.height,
    viewportOffsetTop: viewport.offsetTop,
  })
}

function isTextField(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

/**
 * Hält die CSS-Variable `--keyboard-inset` aktuell und scrollt ein fokussiertes Feld sichtbar,
 * wenn die Bildschirmtastatur offen ist. Gibt eine Aufräumfunktion zurück.
 */
export function trackKeyboard(win: Window = window): () => void {
  const root = win.document.documentElement
  const viewport = win.visualViewport
  const update = () => root.style.setProperty('--keyboard-inset', `${readKeyboardInset(win)}px`)
  update()

  const onFocusIn = (event: FocusEvent) => {
    if (!isTextField(event.target)) return
    const field = event.target
    win.setTimeout(() => {
      update()
      if (readKeyboardInset(win) > 0) field.scrollIntoView({ block: 'center' })
    }, 300)
  }

  viewport?.addEventListener('resize', update)
  viewport?.addEventListener('scroll', update)
  win.addEventListener('focusin', onFocusIn)
  return () => {
    viewport?.removeEventListener('resize', update)
    viewport?.removeEventListener('scroll', update)
    win.removeEventListener('focusin', onFocusIn)
    root.style.removeProperty('--keyboard-inset')
  }
}
