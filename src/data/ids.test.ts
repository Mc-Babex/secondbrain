import { newId } from './ids'

describe('newId', () => {
  it('erzeugt das Format YYYYMMDD-HHmmss-xxxx in Berliner Ortszeit', () => {
    expect(newId(new Date('2026-10-17T07:30:00Z'))).toMatch(/^20261017-093000-[a-z0-9]{4}$/)
  })
  it('nutzt Winterzeit im Winter', () => {
    expect(newId(new Date('2026-01-05T07:05:09Z'))).toMatch(/^20260105-080509-[a-z0-9]{4}$/)
  })
  it('erzeugt unterschiedliche Suffixe', () => {
    const ids = new Set(Array.from({ length: 30 }, () => newId(new Date(0))))
    expect(ids.size).toBeGreaterThan(1)
  })
})
