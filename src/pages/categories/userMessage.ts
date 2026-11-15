export const GENERIC_ERROR = 'Das hat nicht geklappt. Bitte versuche es erneut.'

/** Deutsche Meldungen der Datenschicht, die dem Nutzer unverändert gezeigt werden dürfen. */
const KNOWN_MESSAGES: readonly string[] = [
  'Der Name darf nicht leer sein.',
  'Eine Ablage mit diesem Namen gibt es schon.',
  'Die Einkaufsliste und das Archiv lassen sich nicht löschen.',
  'Bitte eine andere normale Ablage als Ziel wählen.',
]

/** Bekannte Nutzermeldungen durchreichen, alles andere (technische Fehler) allgemein ausdrücken. */
export function userMessage(error: unknown): string {
  return error instanceof Error && KNOWN_MESSAGES.includes(error.message)
    ? error.message
    : GENERIC_ERROR
}
