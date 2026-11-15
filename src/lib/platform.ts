export interface PlatformInfo {
  userAgent: string
  platform?: string
  maxTouchPoints?: number
  standalone?: boolean
}

export const IOS_DICTATION_HINT = 'Diktat: Mikrofon-Taste auf der iPhone-Tastatur'
export const DESKTOP_DICTATION_HINT = 'Spracheingabe nicht verfügbar – Diktat mit Win + H'

/** iPhone/iPad (auch iPadOS, das sich als Mac ausgibt, und installierte Web-Apps). */
export function isIos(info: PlatformInfo = navigator): boolean {
  if (/iPhone|iPad|iPod/.test(info.userAgent)) return true
  const touch = (info.maxTouchPoints ?? 0) > 1
  return touch && (info.platform === 'MacIntel' || typeof info.standalone === 'boolean')
}

export function dictationHint(ios: boolean): string {
  return ios ? IOS_DICTATION_HINT : DESKTOP_DICTATION_HINT
}

/** Läuft die App als installierte Web-App (Home-Bildschirm bzw. Standalone-Fenster)? */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return (
    nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true
  )
}
