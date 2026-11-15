import { vi } from 'vitest'
import { assertNotSeries, isSeriesEvent } from './seriesGuard'
import { GoogleError } from './types'

const calendar = vi.hoisted(() => ({ getEvent: vi.fn() }))
vi.mock('./calendar', () => calendar)

const PLAIN = { id: 'e', title: '', start: '', end: '', allDay: false }

describe('isSeriesEvent', () => {
  it('erkennt eine Serie (recurrence) und ein Vorkommen (recurringEventId)', async () => {
    calendar.getEvent.mockResolvedValue({ ...PLAIN, recurrence: ['RRULE:FREQ=DAILY'] })
    expect(await isSeriesEvent('e')).toBe(true)
    calendar.getEvent.mockResolvedValue({ ...PLAIN, recurringEventId: 's' })
    expect(await isSeriesEvent('e')).toBe(true)
  })

  it('normaler Termin ⇒ false; nicht gefunden ⇒ false; reicht die Optionen weiter', async () => {
    calendar.getEvent.mockResolvedValue(PLAIN)
    expect(await isSeriesEvent('e', { interactive: false })).toBe(false)
    expect(calendar.getEvent).toHaveBeenLastCalledWith('e', { interactive: false })
    calendar.getEvent.mockRejectedValue(new GoogleError('notFound'))
    expect(await isSeriesEvent('e')).toBe(false)
  })

  it('reicht andere Fehler weiter', async () => {
    calendar.getEvent.mockRejectedValue(new GoogleError('offline'))
    await expect(isSeriesEvent('e')).rejects.toMatchObject({ kind: 'offline' })
  })
})

describe('assertNotSeries', () => {
  it('wirft bei einer Serie GoogleError(series)', async () => {
    calendar.getEvent.mockResolvedValue({ ...PLAIN, recurrence: ['RRULE:FREQ=DAILY'] })
    await expect(assertNotSeries('e')).rejects.toMatchObject({
      kind: 'series',
      message: 'Serientermin – im Kalender bearbeiten.',
    })
    calendar.getEvent.mockResolvedValue(PLAIN)
    await expect(assertNotSeries('e')).resolves.toBeUndefined()
  })
})
