/** Erster Komponentenname aus dem React-Komponentenstapel („at Name (pfad)“), ohne Pfade. */
export function firstComponentName(stack: string | null | undefined): string | null {
  const match = /^\s*(?:at\s+|in\s+)?([A-Za-z_$][\w$.]*)/m.exec(stack ?? '')
  return match ? match[1] : null
}
