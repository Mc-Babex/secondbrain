import { isEmail } from './email'
import { GoogleError, type GoogleOAuth2, type TokenResponse } from './types'

const GIS_URL = 'https://accounts.google.com/gsi/client'
const SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const CONNECTED_KEY = 'secondbrain.googleConnected'
const ACCOUNT_KEY = 'secondbrain.googleAccount'
const EXPIRY_MARGIN_MS = 60_000

interface CachedToken {
  value: string
  expiresAt: number
}

// Access-Token nur im Arbeitsspeicher, nie in Storage.
let cached: CachedToken | null = null
let scriptPromise: Promise<GoogleOAuth2> | null = null
let pending: Promise<string> | null = null
const listeners = new Set<() => void>()

function notify(): void {
  listeners.forEach((listener) => listener())
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function hasClientId(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)
}

/** Lokales Flag „war verbunden" (kein Token) für die Anzeige. */
export function wasConnected(): boolean {
  try {
    return localStorage.getItem(CONNECTED_KEY) === '1'
  } catch {
    return false
  }
}

function setConnected(value: boolean): void {
  try {
    if (value) localStorage.setItem(CONNECTED_KEY, '1')
    else {
      localStorage.removeItem(CONNECTED_KEY)
      localStorage.removeItem(ACCOUNT_KEY)
    }
  } catch {
    // Ohne Speicher entfällt nur die Anzeige.
  }
  notify()
}

/** Gemerkter Kontoname (z. B. Gmail-Adresse); kein Geheimnis, kein Token. */
export function getAccountName(): string | null {
  try {
    return localStorage.getItem(ACCOUNT_KEY) || null
  } catch {
    return null
  }
}

export function setAccountName(name: string): void {
  try {
    localStorage.setItem(ACCOUNT_KEY, name)
  } catch {
    // Ohne Speicher entfällt nur die Anzeige des Namens.
  }
  notify()
}

/** Lädt das GIS-Skript genau einmal. */
export function loadGoogleScript(): Promise<GoogleOAuth2> {
  const existing = window.google?.accounts?.oauth2
  if (existing) return Promise.resolve(existing)
  scriptPromise ??= new Promise<GoogleOAuth2>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_URL
    script.async = true
    script.onload = () => {
      const oauth2 = window.google?.accounts?.oauth2
      if (oauth2) resolve(oauth2)
      else reject(new GoogleError('offline'))
    }
    script.onerror = () => {
      scriptPromise = null
      script.remove()
      reject(new GoogleError('offline'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

/** Anmeldehinweis für Google: nur der gemerkte Kontoname, wenn er wie eine E-Mail-Adresse aussieht. */
function getLoginHint(): string | undefined {
  const name = getAccountName()
  return isEmail(name) ? name : undefined
}

function requestToken(oauth2: GoogleOAuth2, prompt: string): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) return Promise.reject(new GoogleError('config'))
  const loginHint = getLoginHint()
  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      ...(loginHint ? { login_hint: loginHint } : {}),
      callback: (response: TokenResponse) => {
        const lifetime = Number(response.expires_in)
        if (response.error || !response.access_token || !Number.isFinite(lifetime)) {
          reject(new GoogleError('unauthorized'))
          return
        }
        cached = { value: response.access_token, expiresAt: Date.now() + lifetime * 1000 }
        setConnected(true)
        resolve(response.access_token)
      },
      error_callback: () => reject(new GoogleError('unauthorized')),
    })
    client.requestAccessToken({ prompt })
  })
}

/**
 * Liefert ein gültiges Access-Token. `interactive: true` nur aus Nutzeraktionen (Popup-Blocker):
 * beim ersten Mal mit Zustimmungsdialog. Ohne `interactive` wird still erneuert (`prompt: ''`).
 */
export async function getAccessToken(options: { interactive: boolean }): Promise<string> {
  if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return cached.value
  if (!hasClientId()) throw new GoogleError('config')
  if (pending) return pending
  const prompt = options.interactive && !wasConnected() ? 'consent' : ''
  pending = loadGoogleScript()
    .then((oauth2) => requestToken(oauth2, prompt))
    .finally(() => {
      pending = null
    })
  return pending
}

/** Verwirft das Token im Speicher (z. B. nach 401). */
export function discardToken(): void {
  cached = null
}

/** Widerruft das Token bei Google und leert Speicher und Flag. */
export async function disconnect(): Promise<void> {
  const token = cached?.value
  cached = null
  setConnected(false)
  const oauth2 = window.google?.accounts?.oauth2
  if (token && oauth2) await new Promise<void>((resolve) => oauth2.revoke(token, resolve))
}
