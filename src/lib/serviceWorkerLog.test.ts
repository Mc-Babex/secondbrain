import { vi } from 'vitest'
import { clearErrorLog, getErrorLog } from '../data/errorLog'
import { installDisplayLogging, logVersionChange } from './serviceWorkerLog'

beforeEach(() => clearErrorLog())
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('installDisplayLogging', () => {
  it('protokolliert pageshow mit persisted und controllerchange', () => {
    const target = new EventTarget()
    vi.stubGlobal('navigator', { serviceWorker: target })
    const stop = installDisplayLogging()
    window.dispatchEvent(new PageTransitionEventLike('pageshow', false))
    expect(getErrorLog()).toEqual([])
    window.dispatchEvent(new PageTransitionEventLike('pageshow', true))
    target.dispatchEvent(new Event('controllerchange'))
    const messages = getErrorLog().map((e) => e.message)
    expect(messages.some((m) => m.includes('pageshow'))).toBe(true)
    expect(messages.some((m) => m.includes('controllerchange'))).toBe(true)
    stop()
  })
})

describe('logVersionChange', () => {
  const messages = (): string[] => getErrorLog().map((e) => e.message)
  beforeEach(() => localStorage.clear())

  it('meldet den ersten Start ohne gemerkten Wert', () => {
    logVersionChange('B1')
    expect(messages()).toEqual(['Version B1 (erster Start mit Protokoll)'])
  })

  it('meldet bei gleichem Stempel nichts', () => {
    logVersionChange('B1')
    clearErrorLog()
    logVersionChange('B1')
    expect(messages()).toEqual([])
  })

  it('meldet genau einen Wechsel alt → neu', () => {
    logVersionChange('B1')
    clearErrorLog()
    logVersionChange('B2')
    logVersionChange('B2')
    expect(messages()).toEqual(['Neue Version aktiv (B1 → B2)'])
  })

  it('wirft ohne localStorage keinen Fehler', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('gesperrt')
    })
    expect(() => logVersionChange('B1')).not.toThrow()
  })
})

class PageTransitionEventLike extends Event {
  readonly persisted: boolean
  constructor(type: string, persisted: boolean) {
    super(type)
    this.persisted = persisted
  }
}
