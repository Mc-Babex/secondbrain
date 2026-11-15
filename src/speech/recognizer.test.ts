import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRecognizer, isSpeechSupported, START_TIMEOUT_MS, START_WAIT_MS } from './recognizer'

class FakeRecognition {
  static last: FakeRecognition | undefined
  lang = ''
  continuous = false
  interimResults = false
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  onaudiostart: (() => void) | null = null
  onstart: (() => void) | null = null
  stop = vi.fn()
  abort = vi.fn()
  constructor() {
    FakeRecognition.last = this
  }
}

const result = (transcript: string, isFinal: boolean) => ({
  isFinal,
  0: { transcript },
  length: 1,
})

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(window, 'SpeechRecognition')
  Reflect.deleteProperty(window, 'webkitSpeechRecognition')
})

describe('recognizer', () => {
  it('meldet fehlende Unterstützung', () => {
    expect(isSpeechSupported()).toBe(false)
    expect(
      createRecognizer({ onInterim: vi.fn(), onFinal: vi.fn(), onEnd: vi.fn(), onError: vi.fn() }),
    ).toBeNull()
  })

  it('nutzt webkit-Präfix und leitet Ergebnisse weiter', () => {
    Object.assign(window, { webkitSpeechRecognition: FakeRecognition })
    const onInterim = vi.fn()
    const onFinal = vi.fn()
    const onError = vi.fn()
    const onEnd = vi.fn()
    const rec = createRecognizer({ onInterim, onFinal, onEnd, onError })
    expect(isSpeechSupported()).toBe(true)
    const fake = FakeRecognition.last
    if (!fake || !rec) throw new Error('Erkenner fehlt')
    expect(fake.lang).toBe('de-DE')
    expect(fake.continuous).toBe(true)
    expect(fake.interimResults).toBe(true)

    rec.start()
    expect(fake.start).toHaveBeenCalled()
    fake.onresult?.({
      resultIndex: 0,
      results: { length: 2, 0: result('Hallo', true), 1: result(' Wel', false) },
    })
    expect(onFinal).toHaveBeenCalledWith('Hallo')
    expect(onInterim).toHaveBeenCalledWith(' Wel')

    fake.onerror?.({ error: 'not-allowed' })
    fake.onerror?.({ error: 'network' })
    expect(onError).toHaveBeenNthCalledWith(1, 'denied')
    expect(onError).toHaveBeenNthCalledWith(2, 'other')
    fake.onend?.()
    expect(onEnd).toHaveBeenCalled()
    rec.stop()
    expect(fake.stop).toHaveBeenCalled()
  })

  it('bestätigt vorläufigen Text beim Ende', () => {
    Object.assign(window, { webkitSpeechRecognition: FakeRecognition })
    const onFinal = vi.fn()
    const onEnd = vi.fn()
    createRecognizer({ onInterim: vi.fn(), onFinal, onEnd, onError: vi.fn() })
    const fake = FakeRecognition.last
    fake?.onresult?.({ resultIndex: 0, results: { length: 1, 0: result('Rest', false) } })
    fake?.onend?.()
    expect(onFinal).toHaveBeenCalledWith('Rest')
    expect(onEnd).toHaveBeenCalled()
  })

  function stallSetup() {
    Object.assign(window, { webkitSpeechRecognition: FakeRecognition })
    const onStalled = vi.fn()
    const rec = createRecognizer({
      onInterim: vi.fn(),
      onFinal: vi.fn(),
      onEnd: vi.fn(),
      onError: vi.fn(),
      onStalled,
    })
    rec?.start()
    return onStalled
  }

  it('meldet Hänger, wenn binnen 20 s kein start eintrifft, und bricht ab', () => {
    const onStalled = stallSetup()
    vi.advanceTimersByTime(START_WAIT_MS - 1)
    expect(onStalled).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onStalled).toHaveBeenCalledTimes(1)
    expect(FakeRecognition.last?.abort).toHaveBeenCalled()
  })

  it('meldet keinen Hänger, wenn start nach 10 s und danach audiostart kommt', () => {
    const onStalled = stallSetup()
    vi.advanceTimersByTime(10000)
    FakeRecognition.last?.onstart?.()
    vi.advanceTimersByTime(2000)
    FakeRecognition.last?.onaudiostart?.()
    vi.advanceTimersByTime(START_WAIT_MS * 2)
    expect(onStalled).not.toHaveBeenCalled()
  })

  it('meldet Hänger, wenn nach start 6 s nichts kommt', () => {
    const onStalled = stallSetup()
    FakeRecognition.last?.onstart?.()
    vi.advanceTimersByTime(START_TIMEOUT_MS - 1)
    expect(onStalled).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onStalled).toHaveBeenCalledTimes(1)
    expect(FakeRecognition.last?.abort).toHaveBeenCalled()
  })
})
