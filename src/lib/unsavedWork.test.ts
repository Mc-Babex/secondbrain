import { renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import {
  hasUnsavedWork,
  installFocusGuard,
  setUnsaved,
  subscribeUnsavedWork,
  useUnsavedWork,
} from './unsavedWork'

afterEach(() => {
  setUnsaved('a', false)
  setUnsaved('b', false)
})

describe('Register ungespeichert', () => {
  it('ist leer, bis sich jemand anmeldet, und zählt mehrere Schlüssel', () => {
    expect(hasUnsavedWork()).toBe(false)
    setUnsaved('a', true)
    setUnsaved('b', true)
    setUnsaved('a', false)
    expect(hasUnsavedWork()).toBe(true)
    setUnsaved('b', false)
    expect(hasUnsavedWork()).toBe(false)
  })

  it('benachrichtigt Abonnenten nur bei Änderungen', () => {
    const listener = vi.fn()
    const stop = subscribeUnsavedWork(listener)
    setUnsaved('a', true)
    setUnsaved('a', true)
    setUnsaved('a', false)
    expect(listener).toHaveBeenCalledTimes(2)
    stop()
    setUnsaved('a', true)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('Hook meldet an, ab bei Wegfall des Flags und beim Entfernen', () => {
    const { rerender, unmount } = renderHook(({ on }) => useUnsavedWork('x', on), {
      initialProps: { on: true },
    })
    expect(hasUnsavedWork()).toBe(true)
    rerender({ on: false })
    expect(hasUnsavedWork()).toBe(false)
    rerender({ on: true })
    expect(hasUnsavedWork()).toBe(true)
    unmount()
    expect(hasUnsavedWork()).toBe(false)
  })
})

describe('Fokus-Wächter', () => {
  function field(html: string): HTMLElement {
    document.body.innerHTML = html
    return document.body.firstElementChild as HTMLElement
  }

  beforeAll(() => installFocusGuard())
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('meldet ein fokussiertes Textfeld an und beim Verlassen wieder ab', async () => {
    const input = field('<input type="text" />')
    input.focus()
    expect(hasUnsavedWork()).toBe(true)
    input.blur()
    await Promise.resolve()
    expect(hasUnsavedWork()).toBe(false)
  })

  it('zählt Textbereich und Auswahlliste, nicht aber Häkchen oder Knöpfe', async () => {
    field('<textarea></textarea>').focus()
    expect(hasUnsavedWork()).toBe(true)
    field('<input type="checkbox" />').focus()
    await Promise.resolve()
    expect(hasUnsavedWork()).toBe(false)
    field('<button>x</button>').focus()
    expect(hasUnsavedWork()).toBe(false)
    field('<input type="radio" />').focus()
    expect(hasUnsavedWork()).toBe(false)
  })

  it('meldet geöffnete Einstellungen an', () => {
    const { unmount } = renderHook(() => useUnsavedWork('settings', true))
    expect(hasUnsavedWork()).toBe(true)
    unmount()
    expect(hasUnsavedWork()).toBe(false)
  })
})
