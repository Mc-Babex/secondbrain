import { describe, expect, it } from 'vitest'
import type { LastRun } from '../data/types'
import { formatLastSorted, isRecent, recentItemIds } from './lastRun'

function run(finishedAt: string, itemIds: string[] = ['a', 'b']): LastRun {
  return {
    startedAt: finishedAt,
    finishedAt,
    processed: itemIds.length,
    itemIds,
    skipped: [],
    errors: [],
  }
}

const now = new Date('2026-10-21T14:00:00+02:00')

describe('isRecent', () => {
  it('23 h ja, 25 h nein, fehlend nein', () => {
    expect(isRecent(run('2026-10-20T15:00:00+02:00'), now)).toBe(true)
    expect(isRecent(run('2026-10-20T13:00:00+02:00'), now)).toBe(false)
    expect(isRecent(null, now)).toBe(false)
  })

  it('toleriert wenige Minuten Zukunft, aber nicht mehr', () => {
    expect(isRecent(run('2026-10-21T14:03:00+02:00'), now)).toBe(true)
    expect(isRecent(run('2026-10-21T14:10:00+02:00'), now)).toBe(false)
  })
})

describe('formatLastSorted', () => {
  it('zeigt heute nur die Uhrzeit', () => {
    expect(formatLastSorted('2026-10-21T09:05:00+02:00', now)).toBe('Zuletzt sortiert: 09:05')
  })

  it('zeigt an anderem Tag Datum und Uhrzeit (auch über Mitternacht)', () => {
    expect(formatLastSorted('2026-10-16T14:00:00+02:00', now)).toBe(
      'Zuletzt sortiert: Fr 16.10., 14:00',
    )
    const late = new Date('2026-10-22T00:30:00+02:00')
    expect(formatLastSorted('2026-10-21T23:50:00+02:00', late)).toBe(
      'Zuletzt sortiert: Mi 21.10., 23:50',
    )
  })
})

describe('recentItemIds', () => {
  it('liefert IDs nur bei aktuellem Lauf', () => {
    expect([...recentItemIds(run('2026-10-21T13:00:00+02:00'), now)]).toEqual(['a', 'b'])
    expect(recentItemIds(run('2026-10-19T13:00:00+02:00'), now).size).toBe(0)
    expect(recentItemIds(null, now).size).toBe(0)
  })
})
