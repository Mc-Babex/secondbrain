import { createContext, useContext } from 'react'

/** Öffnet die Einstellungen; ohne Anbieter (z. B. in Tests einzelner Seiten) ohne Wirkung. */
export const OpenSettingsContext = createContext<() => void>(() => undefined)

export const useOpenSettings = (): (() => void) => useContext(OpenSettingsContext)
