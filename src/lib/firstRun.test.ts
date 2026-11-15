import { isFirstRunDone, markFirstRunDone, shouldShowFirstRun } from './firstRun'

const empty = { hasToken: false, hasRepo: false, hasEntries: false, markerSet: false }

describe('shouldShowFirstRun', () => {
  it('erscheint auf einem leeren Gerät', () => {
    expect(shouldShowFirstRun(empty)).toBe(true)
  })

  it.each(['hasToken', 'hasRepo', 'hasEntries', 'markerSet'] as const)(
    'erscheint nicht, wenn %s gilt',
    (key) => {
      expect(shouldShowFirstRun({ ...empty, [key]: true })).toBe(false)
    },
  )
})

describe('Merker', () => {
  beforeEach(() => localStorage.clear())

  it('ist anfangs nicht gesetzt und bleibt nach dem Setzen erhalten', () => {
    expect(isFirstRunDone()).toBe(false)
    markFirstRunDone()
    expect(isFirstRunDone()).toBe(true)
  })
})
