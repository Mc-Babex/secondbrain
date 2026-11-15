import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getSyncStatus,
  resetSyncStatus,
  setSyncStatus,
  subscribeSyncStatus,
  useSyncStatus,
} from './syncStatus'

beforeEach(() => resetSyncStatus())

describe('syncStatus', () => {
  it('startet als nicht eingerichtet', () => {
    expect(getSyncStatus()).toEqual({
      state: 'nichtEingerichtet',
      pending: 0,
      lastSync: null,
      message: null,
    })
  })

  it('benachrichtigt Abonnenten nur bei Änderungen', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSyncStatus(listener)
    setSyncStatus({ state: 'synchron' })
    setSyncStatus({ state: 'synchron' })
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    setSyncStatus({ pending: 3 })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('useSyncStatus liefert den aktuellen Stand und aktualisiert sich', () => {
    const { result } = renderHook(() => useSyncStatus())
    expect(result.current.state).toBe('nichtEingerichtet')
    act(() => setSyncStatus({ state: 'offline', pending: 2, message: 'Keine Verbindung' }))
    expect(result.current).toMatchObject({
      state: 'offline',
      pending: 2,
      message: 'Keine Verbindung',
    })
  })
})
