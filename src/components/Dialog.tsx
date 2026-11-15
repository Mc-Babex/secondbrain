import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { useUnsavedWork } from '../lib/unsavedWork'
import { BodyPortal } from './BodyPortal'
import styles from './Dialog.module.css'

interface DialogProps {
  title: string
  /** 'dialog' (Standard): Fokus auf das Panel, keine Tastatur; 'first-field': erstes Feld (Neu-Anlegen). */
  initialFocus?: 'dialog' | 'first-field'
  onClose: () => void
  children: ReactNode
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Modaler Dialog: Esc schließt, Tab bleibt im Dialog, Fokus kehrt beim Schließen zurück. */
export function Dialog({ title, onClose, initialFocus = 'dialog', children }: DialogProps) {
  const titleId = useId()
  useUnsavedWork('dialog', true)
  const panelRef = useRef<HTMLDivElement>(null)
  // Der Anfangsfokus gilt nur beim Öffnen.
  const initialFocusRef = useRef(initialFocus)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    const first =
      initialFocusRef.current === 'first-field'
        ? panel?.querySelector<HTMLElement>(FOCUSABLE)
        : null
    if (first) first.focus()
    else panel?.focus({ preventScroll: true })
    return () => {
      // Ohne Scrollen und nur, wenn das Element noch erreichbar ist (nicht entfernt, nicht in `inert`).
      if (previous?.isConnected && !previous.closest('[inert]'))
        previous.focus({ preventScroll: true })
    }
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !panelRef.current) return
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (
      event.shiftKey &&
      (active === first || active === panelRef.current || !panelRef.current.contains(active))
    ) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || !panelRef.current.contains(active))) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <BodyPortal>
      <div className={styles.backdrop} onKeyDown={onKeyDown}>
        <div
          ref={panelRef}
          className={styles.panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {children}
        </div>
      </div>
    </BodyPortal>
  )
}
