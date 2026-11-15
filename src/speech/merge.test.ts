import { describe, expect, it } from 'vitest'
import { createResultMerger, isSameUtterance, type MergeResult } from './merge'

const r = (transcript: string, isFinal = false): MergeResult => ({ isFinal, transcript })

/** Sammelt bestätigten Text und letzten vorläufigen Text über Ereignisse. */
function run() {
  const merger = createResultMerger()
  const finals: string[] = []
  let interim = ''
  return {
    push(index: number, ...results: MergeResult[]) {
      const update = merger.push(index, results)
      finals.push(...update.finals)
      interim = update.interim
    },
    flush() {
      const rest = merger.flush()
      if (rest !== null) finals.push(rest)
      interim = ''
    },
    get finals() {
      return finals
    },
    get interim() {
      return interim
    },
  }
}

describe('createResultMerger', () => {
  it('Chrome: finale Ergebnisse mit steigendem Index, vorläufige dahinter', () => {
    const m = run()
    m.push(0, r('Hallo'))
    expect(m.interim).toBe('Hallo')
    m.push(0, r('Hallo Welt', true), r(' wie'))
    expect(m.finals).toEqual(['Hallo Welt'])
    expect(m.interim).toBe(' wie')
    m.push(1, r('Hallo Welt', true), r(' wie geht', true))
    expect(m.finals).toEqual(['Hallo Welt', ' wie geht'])
    expect(m.interim).toBe('')
    m.flush()
    expect(m.finals).toHaveLength(2)
  })

  it('iOS A: drei Sätze ohne isFinal, Index beginnt neu', () => {
    const m = run()
    m.push(0, r('Milch'))
    m.push(0, r('Milch kaufen'))
    m.push(0, r('Zahnarzt'))
    m.push(0, r('Zahnarzt morgen anrufen'))
    expect(m.finals).toEqual(['Milch kaufen'])
    m.push(0, r('Paket abholen'))
    m.flush()
    expect(m.finals).toEqual(['Milch kaufen', 'Zahnarzt morgen anrufen', 'Paket abholen'])
  })

  it('iOS A: Sätze als wachsende Liste (neuer Index, kein isFinal)', () => {
    const m = run()
    m.push(0, r('Milch kaufen'))
    m.push(1, r('Milch kaufen'), r('Zahnarzt morgen'))
    m.push(1, r('Milch kaufen'), r('Zahnarzt morgen anrufen'))
    m.flush()
    expect(m.finals).toEqual(['Milch kaufen', 'Zahnarzt morgen anrufen'])
  })

  it('iOS B: Korrektur desselben Satzes ersetzt statt zu verdoppeln', () => {
    const m = run()
    m.push(0, r('Ich möchte Milch'))
    m.push(0, r('Ich möchte Milch kaufen'))
    m.push(0, r('ich möchte Milch kaufen heute'))
    expect(m.finals).toEqual([])
    expect(m.interim).toBe('ich möchte Milch kaufen heute')
    m.flush()
    expect(m.finals).toEqual(['ich möchte Milch kaufen heute'])
  })

  it('Ende mit vorläufigem Text bestätigt ihn, zweites flush liefert nichts', () => {
    const merger = createResultMerger()
    merger.push(0, [r('nur vorläufig')])
    expect(merger.flush()).toBe('nur vorläufig')
    expect(merger.flush()).toBeNull()
  })

  it('spätes isFinal für bereits bestätigten Text erzeugt kein Doppel', () => {
    const m = run()
    m.push(0, r('Milch kaufen'))
    m.flush()
    m.push(0, r('Milch kaufen', true))
    expect(m.finals).toEqual(['Milch kaufen'])
  })

  it('spätes isFinal nach Bestätigung durch neuen Satz erzeugt kein Doppel', () => {
    const m = run()
    m.push(0, r('Milch kaufen'))
    m.push(0, r('Zahnarzt anrufen'))
    m.push(0, r('Zahnarzt anrufen', true))
    expect(m.finals).toEqual(['Milch kaufen', 'Zahnarzt anrufen'])
  })

  it('isSameUtterance erkennt Verlängerung und unterscheidet neue Sätze', () => {
    expect(isSameUtterance('Wel', 'Welt')).toBe(true)
    expect(isSameUtterance('Milch kaufen', 'Zahnarzt morgen')).toBe(false)
  })

  it('zwei verschiedene Sätze mit gleichem Anfang bleiben beide erhalten', () => {
    const m = run()
    m.push(0, r('Ich muss morgen zum Zahnarzt gehen'))
    m.push(0, r('Ich muss morgen Milch kaufen gehen'))
    m.flush()
    expect(m.finals).toEqual([
      'Ich muss morgen zum Zahnarzt gehen',
      'Ich muss morgen Milch kaufen gehen',
    ])
  })

  it('Verlängerung eines Wortes ist derselbe Satz (Präfix)', () => {
    const m = run()
    m.push(0, r('Okay'))
    m.push(0, r('Okay Milch kaufen'))
    m.flush()
    expect(m.finals).toEqual(['Okay Milch kaufen'])
  })

  it('Korrektur am Ende eines längeren Satzes ist derselbe Satz', () => {
    expect(
      isSameUtterance('Ich muss morgen den Rasen mehen', 'Ich muss morgen den Rasen mähen'),
    ).toBe(true)
    const m = run()
    m.push(0, r('Ich muss morgen den Rasen mehen'))
    m.push(0, r('Ich muss morgen den Rasen mähen'))
    m.flush()
    expect(m.finals).toEqual(['Ich muss morgen den Rasen mähen'])
  })

  it('kurze Korrektur wird bewusst doppelt behalten (Doppel vor Verlust)', () => {
    expect(isSameUtterance('ich mochte', 'ich möchte Milch')).toBe(false)
    const m = run()
    m.push(0, r('ich mochte'))
    m.push(0, r('ich möchte Milch'))
    m.flush()
    expect(m.finals).toEqual(['ich mochte', 'ich möchte Milch'])
  })

  it('kurze neue Sätze mit gleichem ersten Wort gehen nicht verloren', () => {
    const m = run()
    m.push(0, r('Termin morgen'))
    m.push(0, r('Termin übermorgen beim Arzt'))
    m.push(0, r('Ich gehe'))
    m.push(0, r('Ich laufe'))
    m.flush()
    expect(m.finals).toEqual([
      'Termin morgen',
      'Termin übermorgen beim Arzt',
      'Ich gehe',
      'Ich laufe',
    ])
  })
})
