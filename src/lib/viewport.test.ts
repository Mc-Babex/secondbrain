import { afterEach, describe, expect, it, vi } from 'vitest'
import { keyboardInset, readKeyboardInset, trackKeyboard } from './viewport'

describe('keyboardInset', () => {
  it('berechnet den verdeckten Bereich unten', () => {
    expect(keyboardInset({ innerHeight: 844, viewportHeight: 500, viewportOffsetTop: 0 })).toBe(344)
  })

  it('zieht den Versatz des sichtbaren Bereichs ab', () => {
    expect(keyboardInset({ innerHeight: 844, viewportHeight: 500, viewportOffsetTop: 100 })).toBe(
      244,
    )
  })

  it('wird nie negativ und rundet', () => {
    expect(keyboardInset({ innerHeight: 800, viewportHeight: 810, viewportOffsetTop: 0 })).toBe(0)
    expect(keyboardInset({ innerHeight: 800, viewportHeight: 499.6, viewportOffsetTop: 0 })).toBe(
      300,
    )
  })

  it('liefert 0 bei ungültigen Werten', () => {
    expect(keyboardInset({ innerHeight: 800, viewportHeight: NaN, viewportOffsetTop: 0 })).toBe(0)
  })
})

describe('readKeyboardInset', () => {
  it('liefert 0 ohne visualViewport', () => {
    const win = { innerHeight: 800, visualViewport: null } as unknown as Window
    expect(readKeyboardInset(win)).toBe(0)
  })
})

describe('trackKeyboard', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--keyboard-inset')
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('setzt --keyboard-inset ohne visualViewport auf 0px und räumt auf', () => {
    const stop = trackKeyboard()
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('0px')
    stop()
    expect(document.documentElement.style.getPropertyValue('--keyboard-inset')).toBe('')
  })

  it('folgt Größenänderungen des visualViewport und scrollt das Feld ins Bild', () => {
    vi.useFakeTimers()
    const viewport = Object.assign(new EventTarget(), { height: window.innerHeight, offsetTop: 0 })
    vi.stubGlobal('visualViewport', viewport)
    const stop = trackKeyboard()
    const root = document.documentElement
    expect(root.style.getPropertyValue('--keyboard-inset')).toBe('0px')

    viewport.height = window.innerHeight - 300
    viewport.dispatchEvent(new Event('resize'))
    expect(root.style.getPropertyValue('--keyboard-inset')).toBe('300px')

    const input = document.createElement('input')
    input.scrollIntoView = vi.fn()
    document.body.append(input)
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    vi.advanceTimersByTime(300)
    expect(input.scrollIntoView).toHaveBeenCalledWith({ block: 'center' })

    stop()
    input.remove()
  })
})
