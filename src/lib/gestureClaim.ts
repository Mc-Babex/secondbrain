import { createContext, useContext } from 'react'

/**
 * Eine Kindkomponente mit eigener Ziehgeste (z. B. Termine verschieben, Phase 7 B4) ruft
 * `claimGesture()` in ihrem `pointerdown`/`pointermove` auf. Das Seitenwischen verwirft dann die
 * laufende Geste (eine begonnene Seitenbewegung federt zurück) und beginnt erst mit der nächsten
 * Berührung neu. Statisch ausgenommen bleibt alles mit `data-no-swipe`.
 */
export const GestureClaimContext = createContext<() => void>(() => undefined)

export function useClaimGesture(): () => void {
  return useContext(GestureClaimContext)
}
