export const GENERIC_ERROR = 'Das hat nicht geklappt. Bitte versuche es erneut.'

/** Deutsche Meldungen der Datenschicht, die dem Nutzer unverändert gezeigt werden dürfen. */
const KNOWN_MESSAGES: readonly string[] = [
  'Der Titel darf nicht leer sein.',
  'Ein Projekt gehört in eine normale Ablage.',
  'Das Projekt hat noch Schritte. Bitte zuerst abschließen.',
  'Das Titelmuster darf nicht leer sein.',
  'Der Rhythmus muss mindestens jede Woche sein.',
  'Ungültiger Wochentag.',
  'Ungültiger Fälligkeits-Wochentag.',
  'Ende entweder per Datum oder per Anzahl festlegen.',
]

/** Bekannte Nutzermeldungen durchreichen, alles andere (technische Fehler) allgemein ausdrücken. */
export function userMessage(error: unknown): string {
  return error instanceof Error && KNOWN_MESSAGES.includes(error.message)
    ? error.message
    : GENERIC_ERROR
}
