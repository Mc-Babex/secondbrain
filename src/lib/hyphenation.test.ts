import { loadHyphenator, type Hyphenator } from './hyphenation'

const SHY = String.fromCharCode(0xad)

let hyphenate: Hyphenator
beforeAll(async () => {
  hyphenate = await loadHyphenator()
})

/** Erlaubte Trennstellen je Wort (echte deutsche Silbentrennung, `|` = Trennstelle). */
const EXPECTED: Record<string, string> = {
  Bewerbungsunterlagen: 'Be|wer|bungs|un|ter|la|gen',
  Steuererklärung: 'Steu|er|erklä|rung',
  Hausaufgaben: 'Haus|auf|ga|ben',
  Krankenversicherung: 'Kran|ken|ver|si|che|rung',
  Einkaufsliste: 'Ein|kaufs|lis|te',
  Fahrzeugaerodynamik: 'Fahr|zeug|ae|ro|dy|na|mik',
}

/** Alle Teilmengen der erlaubten Trennstellen sind richtig; falsche Stellen dürfen nie vorkommen. */
function breakPositions(text: string): number[] {
  const positions: number[] = []
  let letters = 0
  for (const char of text) {
    if (char === SHY) positions.push(letters)
    else letters++
  }
  return positions
}

describe('Deutsche Trennung mit echten Mustern', () => {
  it.each(Object.entries(EXPECTED))('trennt %s nur an erlaubten Stellen', (word, expected) => {
    const result = hyphenate(word)
    expect(result.replaceAll(SHY, '')).toBe(word)
    const allowed = new Set(breakPositions(expected.replaceAll('|', SHY)))
    const found = breakPositions(result)
    expect(found.length).toBeGreaterThan(0)
    found.forEach((position) => expect(allowed.has(position)).toBe(true))
    expect(result.replaceAll(SHY, '|')).toBe(expected)
  })

  it('trennt „Formula Student“ je Wort und lässt das Leerzeichen als Umbruchstelle', () => {
    const result = hyphenate('Formula Student')
    expect(result.replaceAll(SHY, '|')).toBe('For|mu|la Stu|dent')
  })

  it('lässt kurze Wörter und Bindestriche unverändert', () => {
    expect(hyphenate('Arbeit')).toBe(`Ar${SHY}beit`)
    expect(hyphenate('Kurz')).toBe('Kurz')
    expect(hyphenate('Kosten-Nutzen')).not.toContain(' ')
    expect(hyphenate('Kosten-Nutzen')).toContain('-')
  })
})
