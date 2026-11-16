import { loadTab, loadTimeLimit, saveTab, saveTimeLimit } from './tabMemory'

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('tabMemory', () => {
  it('liefert Standardwerte ohne gemerkte Wahl', () => {
    expect(loadTab()).toBe('aktuell')
    expect(loadTimeLimit()).toBeNull()
  })

  it('merkt Reiter und Zeitfilter', () => {
    saveTab('warten')
    saveTimeLimit(30)
    expect(loadTab()).toBe('warten')
    expect(loadTimeLimit()).toBe(30)
    saveTimeLimit(null)
    expect(loadTimeLimit()).toBeNull()
  })

  it('ignoriert unbekannte gespeicherte Werte', () => {
    window.localStorage.setItem('secondbrain.tasks.tab', 'quatsch')
    window.localStorage.setItem('secondbrain.tasks.timeLimit', '99')
    expect(loadTab()).toBe('aktuell')
    expect(loadTimeLimit()).toBeNull()
  })

  it('wirft nicht, wenn localStorage nicht verfügbar ist', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('gesperrt')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('gesperrt')
    })
    expect(loadTab()).toBe('aktuell')
    expect(loadTimeLimit()).toBeNull()
    expect(() => saveTab('projekte')).not.toThrow()
    expect(() => saveTimeLimit(15)).not.toThrow()
  })
})
