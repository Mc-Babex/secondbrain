import { act } from '@testing-library/react'
import { getFile, getOutbox, putFileFromRemote, resetDb } from './localStore'
import {
  applyPendingAutoSort,
  getPendingAutoSort,
  setPendingAutoSort,
  startPendingAutoSort,
} from './pendingAutoSort'
import { resetSyncStatus, setSyncStatus } from './syncStatus'

const REMOTE = {
  planningWindow: { start: '08:00', end: '18:00' },
  pause: null,
  timezone: 'Europe/Berlin',
  zukunft: { a: 1 },
}

beforeEach(async () => {
  localStorage.clear()
  await resetDb(true)
  resetSyncStatus()
})

const synced = () => setSyncStatus({ state: 'synchron', lastSync: '2026-01-01T10:00:00+01:00' })
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)))

describe('pendingAutoSort', () => {
  it('schreibt vor einem erfolgreichen Abgleich nichts', async () => {
    await putFileFromRemote('settings.json', REMOTE, 'sha1')
    setPendingAutoSort(true)
    const stop = startPendingAutoSort()
    act(() => setSyncStatus({ state: 'fehler', message: 'kaputt' }))
    await settle()
    expect(await getOutbox()).toEqual([])
    expect(getPendingAutoSort()).toBe(true)
    stop()
  })

  it('ändert nach dem Abgleich nur autoSort und löscht den Merker', async () => {
    await putFileFromRemote('settings.json', REMOTE, 'sha1')
    setPendingAutoSort(false)
    const stop = startPendingAutoSort()
    act(synced)
    await settle()
    expect((await getFile('settings.json'))?.data).toEqual({ ...REMOTE, autoSort: false })
    expect(getPendingAutoSort()).toBeNull()
    stop()
  })

  it('legt ohne Remote-Datei eine gültige Datei mit Standardwerten an', async () => {
    setPendingAutoSort(true)
    act(synced)
    await applyPendingAutoSort()
    expect((await getFile('settings.json'))?.data).toEqual({
      planningWindow: { start: '09:00', end: '19:00' },
      pause: { start: '12:00', end: '13:00' },
      timezone: 'Europe/Berlin',
      autoSort: true,
    })
  })

  it('tut ohne Verbindung nichts und behält den Merker', async () => {
    setPendingAutoSort(true)
    const stop = startPendingAutoSort()
    await settle()
    await applyPendingAutoSort()
    expect(await getOutbox()).toEqual([])
    expect(await getFile('settings.json')).toBeUndefined()
    expect(getPendingAutoSort()).toBe(true)
    stop()
  })
})
