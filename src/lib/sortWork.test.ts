import { describe, expect, it } from 'vitest'
import { hasSortWork } from './sortWork'

const sortError = { message: 'm', at: '2026-10-21T14:05:00+02:00' }

describe('hasSortWork', () => {
  it('leer: keine Arbeit', () => {
    expect(hasSortWork([])).toBe(false)
  })

  it('nur Inbox mit sortError: keine Arbeit, auch bei ungültig geformtem Wert', () => {
    expect(
      hasSortWork([
        { id: 'a', sortError },
        { id: 'b', sortError: 'kaputt' },
        { id: 'c', sortError: null },
      ]),
    ).toBe(false)
  })

  it('Inbox ohne sortError: Arbeit', () => {
    expect(hasSortWork([{ id: 'a', sortError }, { id: 'b' }])).toBe(true)
  })
})
