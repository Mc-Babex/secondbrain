import type { ConnectionResult } from '../../data/github'

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

export function isValidRepo(repo: string): boolean {
  return REPO_PATTERN.test(repo.trim())
}

/** Hinweistext zum gespeicherten Token; zeigt nur die letzten vier Zeichen. */
export function storedTokenHint(token: string): string {
  return `Token gespeichert (endet auf …${token.slice(-4)})`
}

const CONNECTION_TEXTS: Record<ConnectionResult, string> = {
  ok: 'Verbunden',
  unauthorized: 'Token ungültig oder abgelaufen',
  notFound: 'Repository nicht gefunden oder kein Zugriff',
  offline: 'Keine Internetverbindung',
  error: 'Unbekannter Fehler',
}

export function connectionMessage(result: ConnectionResult): string {
  return CONNECTION_TEXTS[result]
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/** Prüft das Planungsfenster (`HH:MM`, Beginn vor Ende); liefert eine Fehlermeldung oder `null`. */
export function validatePlanningWindow(start: string, end: string): string | null {
  if (!TIME_PATTERN.test(start) || !TIME_PATTERN.test(end)) {
    return 'Bitte Beginn und Ende als Uhrzeit angeben.'
  }
  if (start >= end) return 'Der Beginn muss vor dem Ende liegen.'
  return null
}

/** Grobe Prüfung eines eingefügten Tokens: Präfix `github_pat_`/`ghp_`, keine Leerzeichen. */
export function looksLikeToken(text: string): boolean {
  return /^(github_pat_|ghp_)\S+$/.test(text)
}

/** Hinweis nach dem Einfügen; zeigt nur die letzten vier Zeichen. */
export function pastedTokenHint(token: string): string {
  return `Token eingefügt (endet auf …${token.slice(-4)})`
}

export const PAUSE_PROBLEM =
  'Die Pause muss innerhalb des Planungsfensters liegen und nach ihrem Beginn enden.'

/** Prüft die Pause gegen das Planungsfenster (`HH:MM`); liefert eine Fehlermeldung oder `null`. */
export function validatePause(
  window: { start: string; end: string },
  pause: { start: string; end: string },
): string | null {
  if (!TIME_PATTERN.test(pause.start) || !TIME_PATTERN.test(pause.end)) {
    return 'Bitte Beginn und Ende der Pause als Uhrzeit angeben.'
  }
  if (pause.start >= pause.end || pause.start < window.start || pause.end > window.end) {
    return PAUSE_PROBLEM
  }
  return null
}
