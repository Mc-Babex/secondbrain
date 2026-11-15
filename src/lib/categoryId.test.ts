import { describe, expect, it } from 'vitest'
import { categoryIdFromName } from './categoryId'

describe('categoryIdFromName', () => {
  it('macht klein und ersetzt Umlaute', () => {
    expect(categoryIdFromName('Größe Übung', [])).toBe('groesse-uebung')
    expect(categoryIdFromName('Äpfel & Öl', [])).toBe('aepfel-oel')
  })

  it('ersetzt Sonderzeichen und entfernt mehrfache sowie Rand-Bindestriche', () => {
    expect(categoryIdFromName('  --Fit & Fun!!  ', [])).toBe('fit-fun')
    expect(categoryIdFromName('a___b', [])).toBe('a-b')
  })

  it('fällt bei leerem Ergebnis auf "ablage" zurück', () => {
    expect(categoryIdFromName('', [])).toBe('ablage')
    expect(categoryIdFromName('!!!', [])).toBe('ablage')
  })

  it('hängt bei Kollisionen eine Zahl an', () => {
    expect(categoryIdFromName('Privat', ['privat'])).toBe('privat-2')
    expect(categoryIdFromName('Privat', ['privat', 'privat-2'])).toBe('privat-3')
    expect(categoryIdFromName('', ['ablage'])).toBe('ablage-2')
  })
})
