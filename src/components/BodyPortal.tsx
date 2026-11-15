import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Rendert nach `document.body`. Nötig für `position: fixed`-Elemente (Dialoge, Hinweise): Die Seiten
 * liegen in einer per `transform` verschobenen Leiste, die fixe Nachfahren sonst relativ zu sich selbst
 * positioniert und abschneidet. React-Ereignisse laufen weiter durch den React-Baum.
 */
export function BodyPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body)
}
