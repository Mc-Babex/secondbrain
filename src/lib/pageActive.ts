import { createContext, useContext, useEffect, useState } from 'react'

/**
 * Ist die umgebende Seite die aktuell angezeigte? Alle Seiten bleiben gemountet (App.tsx); Seiten
 * fragen hier ab, ob sie arbeiten dürfen. Ohne Anbieter (Einzeltests) gilt „aktiv“.
 */
export const PageActiveContext = createContext(true)

export function usePageActive(): boolean {
  return useContext(PageActiveContext)
}

function isDocumentVisible(): boolean {
  return document.visibilityState !== 'hidden'
}

/** Seite aktiv **und** Dokument sichtbar: nur dann laufen Abfragen und Zeitgeber. */
export function usePageVisible(): boolean {
  const active = usePageActive()
  const [documentVisible, setDocumentVisible] = useState(isDocumentVisible)
  useEffect(() => {
    const onChange = (): void => setDocumentVisible(isDocumentVisible())
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
  return active && documentVisible
}
