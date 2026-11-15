import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { PageActiveContext } from '../lib/pageActive'
import styles from './PageSlot.module.css'

interface PageSlotProps {
  active: boolean
  children: ReactNode
}

/**
 * Eine Seite in der Wischleiste. Nicht aktive Seiten bleiben gemountet, sind aber `inert`
 * (nicht fokussierbar, nicht vorlesbar) und wissen über den Kontext, dass sie nicht sichtbar sind.
 * Für WebKit (iOS): Nicht aktive Seiten werden nicht gezeichnet (CSS); nur während Wischgeste und Übergang
 * macht `lib/pageLayout.ts` die beteiligten Seiten sichtbar und verschiebt sie einzeln (Aufgabe 74).
 * `inert` wird direkt gesetzt, weil die React-18-Typen das Attribut nicht kennen.
 */
export function PageSlot({ active, children }: PageSlotProps) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    ref.current?.toggleAttribute('inert', !active)
  }, [active])
  return (
    <div
      ref={ref}
      className={styles.slot}
      aria-hidden={active ? undefined : true}
      data-active={active ? '' : undefined}
    >
      <PageActiveContext.Provider value={active}>{children}</PageActiveContext.Provider>
    </div>
  )
}
