import { splitInboxText } from './inboxTitle'

describe('splitInboxText', () => {
  it('kurzer einzeiliger Text: Titel = Text, Notiz leer', () => {
    expect(splitInboxText('Wohnung putzen')).toEqual({ title: 'Wohnung putzen', notes: '' })
  })

  it('mehrzeilig: erste Zeile ist der Titel, der Rest steht mit Umbrüchen in notes', () => {
    expect(splitInboxText('Einkauf planen\nMilch\n\nBrot')).toEqual({
      title: 'Einkauf planen',
      notes: 'Milch\n\nBrot',
    })
  })

  it('trimmt außen und verträgt Windows-Zeilenumbrüche', () => {
    expect(splitInboxText('  Titel  \r\nDetails \r\n')).toEqual({
      title: 'Titel',
      notes: 'Details',
    })
  })

  it('genau 80 Zeichen bleiben ungekürzt der Titel', () => {
    const line = 'a'.repeat(80)
    expect(splitInboxText(line)).toEqual({ title: line, notes: '' })
  })

  it('lange erste Zeile: Titel höchstens 60 Zeichen an Wortgrenze, Rest vollständig in notes', () => {
    const text =
      'Ich muss unbedingt noch die Unterlagen für den Steuerberater zusammensuchen und danach alles abheften.'
    const { title, notes } = splitInboxText(text)
    expect(title.length).toBeLessThanOrEqual(60)
    expect(title).toBe('Ich muss unbedingt noch die Unterlagen für den Steuerberater')
    expect(notes).toBe('zusammensuchen und danach alles abheften.')
  })

  it('lange erste Zeile plus weitere Zeilen: Rest der Zeile und alle Zeilen in notes', () => {
    const first = `${'wort '.repeat(20)}ende`
    const { title, notes } = splitInboxText(`${first}\nZweite Zeile\nDritte`)
    expect(title.length).toBeLessThanOrEqual(60)
    expect(notes.endsWith('ende\nZweite Zeile\nDritte')).toBe(true)
  })

  it('Titel und Notiz ergeben zusammen den ganzen Text (nichts geht verloren)', () => {
    const text = `${'Satz eins ist lang genug. '.repeat(6)}\nZeile zwei\nZeile drei`
    const { title, notes } = splitInboxText(text)
    const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()
    expect(squash(`${title} ${notes}`)).toBe(squash(text))
  })

  it('einzelnes Wort über 60 Zeichen wird hart bei 60 gekürzt', () => {
    const word = 'x'.repeat(100)
    expect(splitInboxText(word)).toEqual({ title: 'x'.repeat(60), notes: 'x'.repeat(40) })
  })

  it('erstes langes Wort nach kurzem Präfix: hartes Kürzen nur, wenn keine Wortgrenze passt', () => {
    const { title, notes } = splitInboxText(`Hallo ${'y'.repeat(90)}`)
    expect(title).toBe('Hallo')
    expect(notes).toBe('y'.repeat(90))
  })

  it('leerer Text ergibt leeren Titel und leere Notiz', () => {
    expect(splitInboxText('  \n ')).toEqual({ title: '', notes: '' })
  })
})
