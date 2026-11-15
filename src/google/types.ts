// Typen für Google Identity Services (minimal) und die Kalender-Anbindung (SPEC §7).

export interface TokenResponse {
  access_token?: string
  expires_in?: number | string
  error?: string
}

export interface TokenClientConfig {
  client_id: string
  scope: string
  login_hint?: string
  callback: (response: TokenResponse) => void
  error_callback?: (error: { type?: string }) => void
}

export interface TokenRequestOptions {
  prompt?: string
}

export interface TokenClient {
  requestAccessToken: (options?: TokenRequestOptions) => void
}

export interface GoogleOAuth2 {
  initTokenClient: (config: TokenClientConfig) => TokenClient
  revoke: (token: string, done?: () => void) => void
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } }
  }
}

export type GoogleErrorKind =
  'config' | 'unauthorized' | 'notFound' | 'offline' | 'rateLimit' | 'server' | 'series'

const MESSAGES: Record<GoogleErrorKind, string> = {
  config: 'Google-Client-ID fehlt (VITE_GOOGLE_CLIENT_ID).',
  unauthorized: 'Google-Verbindung abgelaufen – bitte erneut versuchen.',
  notFound: 'Der Termin existiert im Google Kalender nicht mehr.',
  offline: 'Google ist nicht erreichbar. Bitte prüfe die Internetverbindung.',
  rateLimit: 'Google bremst gerade ab. Bitte versuche es in einer Minute erneut.',
  server: 'Google hat einen Fehler gemeldet. Bitte versuche es später erneut.',
  series: 'Serientermin – im Kalender bearbeiten.',
}

/** Fehler der Google-Anbindung; enthält nie ein Token. */
export class GoogleError extends Error {
  readonly kind: GoogleErrorKind

  constructor(kind: GoogleErrorKind) {
    super(MESSAGES[kind])
    this.name = 'GoogleError'
    this.kind = kind
  }
}

/** Verständliche deutsche Meldung für beliebige Fehler. */
export function googleErrorMessage(error: unknown): string {
  return error instanceof GoogleError ? error.message : MESSAGES.server
}

export interface CalendarEvent {
  id: string
  title: string
  /** ISO 8601 mit Offset, bei ganztägigen Terminen `YYYY-MM-DD`. */
  start: string
  /** Bei ganztägigen Terminen `YYYY-MM-DD`, exklusiv (wie Google). */
  end: string
  allDay: boolean
  /** Nur gesetzt, wenn der Termin als „frei“ (transparent) markiert ist. */
  transparent?: true
  /** Nur gesetzt, wenn der Nutzer den Termin abgelehnt hat. */
  declined?: true
  location?: string
  description?: string
  /** Nur bei ganztägigen Terminen: Start- und Enddatum (Ende exklusiv wie Google). */
  startDate?: string
  endDate?: string
  /** Serien-ID; nur bei Vorkommen einer Serie. */
  recurringEventId?: string
  /** RRULE/EXDATE-Zeilen; nur beim Lesen der Serie selbst. */
  recurrence?: string[]
  /** Der Nutzer ist Organisator (oder es gibt keine Organisator-Angabe). */
  organizerSelf?: boolean
  /** Es gibt Teilnehmer außer dem Nutzer. */
  hasGuests?: boolean
  /** Bearbeitbar (= `organizerSelf`). */
  editable?: boolean
}

/** Zeitangabe eines Termins: ganztägig (Ende exklusiv) oder mit Uhrzeit und Dauer. */
export type EventTiming =
  | { allDay: true; startDate: string; endDate: string }
  | { allDay: false; start: string; durationMin: number }

export interface NewCalendarEvent {
  title: string
  timing: EventTiming
  location?: string
  description?: string
  /** RRULE-Zeilen. */
  recurrence?: string[]
}

/** Nur die geänderten Felder; leerer Text löscht Ort/Notiz. */
export interface CalendarEventChanges {
  title?: string
  timing?: EventTiming
  location?: string
  description?: string
  recurrence?: string[]
  /** War der Termin vorher ganztägig? Dann werden `date`/`dateTime` nur bei echtem Wechsel geleert. */
  wasAllDay?: boolean
}

/** Gäste benachrichtigen? Wird immer ausdrücklich gesetzt. */
export type SendUpdates = 'none' | 'all'

export interface NewEvent {
  title: string
  /** ISO 8601 mit Offset. */
  start: string
  durationMin: number
  itemId: string
}
