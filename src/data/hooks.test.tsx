import { act, renderHook, waitFor } from '@testing-library/react'
import { putFileLocal, resetDb } from './localStore'
import {
  useCategories,
  useInbox,
  useLastRun,
  useItems,
  useOutboxCount,
  useSettings,
  useSuggestions,
} from './hooks'
import { addInboxEntry, createItem, notifyChange, saveCategories, saveSettings } from './repository'

beforeEach(() => resetDb(true))
afterAll(() => resetDb(true))

describe('Hooks', () => {
  it('useInbox und useOutboxCount aktualisieren sich nach Änderungen', async () => {
    const { result } = renderHook(() => ({ inbox: useInbox(), count: useOutboxCount() }))
    await waitFor(() => expect(result.current.inbox).toEqual([]))
    await act(async () => {
      await addInboxEntry('Hallo', 'text')
    })
    await waitFor(() => {
      expect(result.current.inbox).toHaveLength(1)
      expect(result.current.count).toBe(1)
    })
  })

  it('useItems zeigt neue Einträge', async () => {
    const { result } = renderHook(() => useItems())
    await act(async () => {
      await createItem({ type: 'aufgabe', title: 'A', categoryId: 'privat' })
    })
    await waitFor(() => expect(result.current).toHaveLength(1))
  })

  it('useCategories und useSettings liefern Standardwerte und Änderungen', async () => {
    const { result } = renderHook(() => ({ cats: useCategories(), settings: useSettings() }))
    await waitFor(() => expect(result.current.cats).toHaveLength(4))
    expect(result.current.settings.planningWindow.start).toBe('09:00')
    await act(async () => {
      await saveCategories([{ id: 'x', name: 'X', kind: 'normal', order: 1, description: '' }])
      await saveSettings({
        planningWindow: { start: '07:00', end: '12:00' },
        timezone: 'Europe/Berlin',
      })
    })
    await waitFor(() => {
      expect(result.current.cats).toHaveLength(1)
      expect(result.current.settings.planningWindow.start).toBe('07:00')
    })
  })

  it('useSuggestions startet leer und reagiert auf notifyChange', async () => {
    const { result } = renderHook(() => useSuggestions())
    await waitFor(() => expect(result.current).toEqual([]))
    act(() => notifyChange())
    await waitFor(() => expect(result.current).toEqual([]))
  })

  it('useLastRun liefert null ohne Datei und das Protokoll mit Datei', async () => {
    const { result } = renderHook(() => useLastRun())
    await waitFor(() => expect(result.current).toBeNull())
    await act(async () => {
      await putFileLocal('runs/last.json', { finishedAt: '2026-10-21T14:07:30+02:00' })
      notifyChange()
    })
    await waitFor(() => expect(result.current?.finishedAt).toBe('2026-10-21T14:07:30+02:00'))
  })
})
