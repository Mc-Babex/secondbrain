import { vi } from 'vitest'
import { requestPersistentStorage } from './persistentStorage'

function stubStorage(value: unknown): void {
  Object.defineProperty(navigator, 'storage', { value, configurable: true })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'storage')
})

describe('requestPersistentStorage', () => {
  it('meldet gewährten Speicher', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    stubStorage({ persist })
    expect(await requestPersistentStorage()).toBe('persistent')
    expect(persist).toHaveBeenCalledOnce()
  })

  it('meldet abgelehnten Speicher', async () => {
    stubStorage({ persist: vi.fn().mockResolvedValue(false) })
    expect(await requestPersistentStorage()).toBe('volatile')
  })

  it('wirft ohne navigator.storage nicht', async () => {
    stubStorage(undefined)
    expect(await requestPersistentStorage()).toBe('unsupported')
  })

  it('behandelt einen Fehler von persist() als nicht unterstützt', async () => {
    stubStorage({ persist: vi.fn().mockRejectedValue(new Error('x')) })
    expect(await requestPersistentStorage()).toBe('unsupported')
  })
})
