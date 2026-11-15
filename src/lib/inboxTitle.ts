const MAX_FIRST_LINE = 80
const MAX_TITLE = 60

/**
 * Zerlegt einen Eingangskorb-Text in Titel und Notiz (SPEC §6.3 Punkt 4).
 * Titel = erste Zeile; ist sie länger als 80 Zeichen, wird sie an der letzten Wortgrenze auf höchstens
 * 60 Zeichen gekürzt (ein einzelnes längeres Wort hart bei 60). `notes` = alles, was nicht im Titel steht.
 */
export function splitInboxText(text: string): { title: string; notes: string } {
  const [first = '', ...otherLines] = text.trim().split(/\r?\n/)
  const firstLine = first.trim()
  const laterLines = otherLines.join('\n').trim()
  if (firstLine.length <= MAX_FIRST_LINE) return { title: firstLine, notes: laterLines }

  const boundary = firstLine.slice(0, MAX_TITLE + 1).search(/\s\S*$/)
  const cut = boundary > 0 ? boundary : MAX_TITLE
  const title = firstLine.slice(0, cut).trim()
  const notes = [firstLine.slice(cut).trim(), laterLines].filter((part) => part !== '').join('\n')
  return { title, notes }
}
