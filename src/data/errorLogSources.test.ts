import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GoogleError } from '../google/types'
import { connectGoogle } from '../pages/settings/googleConnect'
import { clearErrorLog, getErrorLog } from './errorLog'
import { resetSyncStatus, setSyncStatus } from './syncStatus'

const auth = vi.hoisted(() => ({ getAccessToken: vi.fn(), setAccountName: vi.fn() }))
vi.mock('../google/auth', () => auth)
vi.mock('../google/calendar', () => ({ getCalendarName: vi.fn() }))

beforeEach(() => {
  clearErrorLog()
  resetSyncStatus()
})

describe('Fehlerprotokoll an den zentralen Stellen', () => {
  it('protokolliert einen Sync-Fehler und Offline, aber keinen normalen Wechsel', () => {
    setSyncStatus({ state: 'synchron', message: null })
    expect(getErrorLog()).toEqual([])
    setSyncStatus({ state: 'fehler', message: 'GitHub meldet einen Fehler.' })
    setSyncStatus({ state: 'offline', message: 'Keine Verbindung zu GitHub.' })
    const log = getErrorLog()
    expect(log.map((entry) => entry.message)).toEqual([
      'Keine Verbindung zu GitHub.',
      'GitHub meldet einen Fehler.',
    ])
    expect(log.every((entry) => entry.area === 'Sync')).toBe(true)
  })

  it('protokolliert Dauer-Offline nur einmal, auch über laeuft-Wechsel', () => {
    for (let i = 0; i < 3; i++) {
      setSyncStatus({ state: 'laeuft', message: null })
      setSyncStatus({ state: 'offline', message: 'Keine Verbindung zu GitHub.' })
    }
    expect(getErrorLog()).toHaveLength(1)
    expect(getErrorLog()[0]?.count).toBe(1)
    setSyncStatus({ state: 'synchron', message: null })
    setSyncStatus({ state: 'offline', message: 'Keine Verbindung zu GitHub.' })
    expect(getErrorLog()[0]?.count).toBe(2)
  })

  it('protokolliert einen Google-Verbindungsfehler', async () => {
    auth.getAccessToken.mockRejectedValue(new GoogleError('unauthorized'))
    const message = await connectGoogle()
    expect(message).not.toBeNull()
    expect(getErrorLog()[0]).toMatchObject({ area: 'Google', message })
  })
})
