import { dayOfDate, plusDraft, holdDraft } from './newEvent'

describe('plusDraft', () => {
  const now = new Date('2026-10-17T10:07:00+02:00')

  it('nimmt heute die nächste volle Viertelstunde, 60 Min.', () => {
    const draft = plusDraft('2026-10-17', now, 540)
    expect(draft).toMatchObject({
      date: '2026-10-17',
      time: '10:15',
      endTime: '11:15',
      duration: 60,
    })
  })

  it('lässt eine volle Viertelstunde stehen', () => {
    expect(plusDraft('2026-10-17', new Date('2026-10-17T10:00:00+02:00'), 540).time).toBe('10:00')
  })

  it('hält sich spät abends bei 23:45', () => {
    expect(plusDraft('2026-10-17', new Date('2026-10-17T23:50:00+02:00'), 540).time).toBe('23:45')
  })

  it('nimmt an einem anderen Tag den Beginn des Planungsfensters', () => {
    expect(plusDraft('2026-10-18', now, 540)).toMatchObject({ date: '2026-10-18', time: '09:00' })
  })
})

describe('holdDraft', () => {
  it('rundet auf die Viertelstunde ab', () => {
    expect(holdDraft('2026-10-14', 622 / 1440)).toMatchObject({ date: '2026-10-14', time: '10:15' })
  })

  it('bleibt im Tag', () => {
    expect(holdDraft('2026-10-14', 1).time).toBe('23:45')
    expect(holdDraft('2026-10-14', -0.2).time).toBe('00:00')
  })
})

describe('dayOfDate', () => {
  it('liefert den Berliner Tag', () => {
    expect(dayOfDate(new Date('2026-10-17T23:30:00+02:00'))).toBe('2026-10-17')
  })
})
