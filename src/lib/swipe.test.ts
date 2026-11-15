import { classifyMove, isInEdgeStrip } from './swipe'

describe('classifyMove', () => {
  it('entscheidet erst ab 10 px', () => {
    expect(classifyMove(6, 6)).toBe('undecided')
    expect(classifyMove(12, 0)).toBe('horizontal')
  })
  it('schräg über 35 Grad ist senkrecht', () => {
    expect(classifyMove(40, 30)).toBe('vertical')
    expect(classifyMove(40, 24)).toBe('horizontal')
    expect(classifyMove(40, 48)).toBe('vertical')
  })
})

describe('isInEdgeStrip', () => {
  it('erkennt oberen und unteren Rand', () => {
    expect(isInEdgeStrip(10, 800)).toBe(true)
    expect(isInEdgeStrip(790, 800)).toBe(true)
    expect(isInEdgeStrip(400, 800)).toBe(false)
  })
})
