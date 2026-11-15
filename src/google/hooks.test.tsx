import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PageActiveContext } from '../lib/pageActive'
import { GoogleError, type CalendarEvent } from './types'

const mocks = vi.hoisted(() => ({
  listEvents: vi.fn(),
  wasConnected: vi.fn(),
}))
vi.mock('./calendar', () => ({ listEvents: mocks.listEvents }))
vi.mock('./auth', () => ({
  subscribeAuth: () => () => undefined,
  wasConnected: mocks.wasConnected,
}))

import { useCalendarEvents } from './hooks'

const EVENT: CalendarEvent = { id: 'a', title: 'T', start: 's', end: 'e', allDay: false }
const RANGE_A = { timeMin: 'a1', timeMax: 'a2' }
const RANGE_B = { timeMin: 'b1', timeMax: 'b2' }

beforeEach(() => {
  mocks.listEvents.mockReset()
  mocks.wasConnected.mockReset().mockReturnValue(true)
})

describe('useCalendarEvents', () => {
  it('ohne Verbindung oder Bereich: idle und kein Netzaufruf', () => {
    mocks.wasConnected.mockReturnValue(false)
    const { result } = renderHook(() => useCalendarEvents(RANGE_A))
    expect(result.current.status).toBe('idle')
    const none = renderHook(() => useCalendarEvents(null))
    expect(none.result.current.status).toBe('idle')
    expect(mocks.listEvents).not.toHaveBeenCalled()
  })

  it('lädt von laedt zu bereit und ruft beim Mounten nur nicht-interaktiv an', async () => {
    mocks.listEvents.mockResolvedValue([EVENT])
    const { result } = renderHook(() => useCalendarEvents(RANGE_A))
    expect(result.current.status).toBe('laedt')
    await waitFor(() => expect(result.current.status).toBe('bereit'))
    expect(result.current.events).toEqual([EVENT])
    expect(mocks.listEvents).toHaveBeenCalledWith('a1', 'a2', { interactive: false })
  })

  it('Fehler ergibt fehler mit deutschem Text; reload interaktiv fragt interaktiv an', async () => {
    mocks.listEvents.mockRejectedValue(new GoogleError('unauthorized'))
    const { result } = renderHook(() => useCalendarEvents(RANGE_A))
    await waitFor(() => expect(result.current.status).toBe('fehler'))
    expect(result.current.error).toContain('Erneut verbinden')

    mocks.listEvents.mockRejectedValue(new GoogleError('offline'))
    act(() => result.current.reload({ interactive: true }))
    await waitFor(() => expect(result.current.error).toContain('nicht erreichbar'))
    expect(mocks.listEvents).toHaveBeenLastCalledWith('a1', 'a2', { interactive: true })
  })

  it('verwirft die späte Antwort eines alten Bereichs', async () => {
    let resolveOld: (events: CalendarEvent[]) => void = () => undefined
    mocks.listEvents.mockImplementationOnce(
      () => new Promise<CalendarEvent[]>((resolve) => (resolveOld = resolve)),
    )
    mocks.listEvents.mockResolvedValueOnce([{ ...EVENT, id: 'neu' }])
    const { result, rerender } = renderHook(({ range }) => useCalendarEvents(range), {
      initialProps: { range: RANGE_A },
    })
    rerender({ range: RANGE_B })
    await waitFor(() => expect(result.current.status).toBe('bereit'))
    await act(async () => resolveOld([{ ...EVENT, id: 'alt' }]))
    expect(result.current.events.map((e) => e.id)).toEqual(['neu'])
  })

  it('erfolgreicher interaktiver reload ergibt bereit mit Terminen', async () => {
    mocks.listEvents.mockRejectedValueOnce(new GoogleError('offline'))
    const { result } = renderHook(() => useCalendarEvents(RANGE_A))
    await waitFor(() => expect(result.current.status).toBe('fehler'))
    mocks.listEvents.mockResolvedValue([EVENT])
    act(() => result.current.reload({ interactive: true }))
    await waitFor(() => expect(result.current.status).toBe('bereit'))
    expect(result.current.events).toEqual([EVENT])
    expect(mocks.listEvents).toHaveBeenLastCalledWith('a1', 'a2', { interactive: true })
  })

  it('Hintergrund-Refresh verwirft eine laufende interaktive Anfrage nicht', async () => {
    mocks.listEvents.mockResolvedValueOnce([])
    const { result } = renderHook(() => useCalendarEvents(RANGE_A))
    await waitFor(() => expect(result.current.status).toBe('bereit'))
    let resolveInteractive: (events: CalendarEvent[]) => void = () => undefined
    mocks.listEvents.mockImplementationOnce(
      () => new Promise<CalendarEvent[]>((resolve) => (resolveInteractive = resolve)),
    )
    act(() => result.current.reload({ interactive: true }))
    const calls = mocks.listEvents.mock.calls.length
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(mocks.listEvents).toHaveBeenCalledTimes(calls)
    await act(async () => resolveInteractive([EVENT]))
    expect(result.current.status).toBe('bereit')
    expect(result.current.events).toEqual([EVENT])
  })

  it('lädt bei online-Ereignis neu', async () => {
    mocks.listEvents.mockResolvedValue([])
    const { result } = renderHook(() => useCalendarEvents(RANGE_A))
    await waitFor(() => expect(result.current.status).toBe('bereit'))
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(mocks.listEvents).toHaveBeenCalledTimes(2)
  })

  it('lädt bei visibilitychange (sichtbar) neu', async () => {
    mocks.listEvents.mockResolvedValue([])
    const { result } = renderHook(() => useCalendarEvents(RANGE_A))
    await waitFor(() => expect(result.current.status).toBe('bereit'))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(mocks.listEvents).toHaveBeenCalledTimes(2)
  })

  it('fragt auf einer nicht aktiven Seite nichts ab und lädt bei Aktivierung', async () => {
    mocks.listEvents.mockResolvedValue([])
    let active = false
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PageActiveContext.Provider value={active}>{children}</PageActiveContext.Provider>
    )
    const { rerender } = renderHook(() => useCalendarEvents(RANGE_A), { wrapper })
    expect(mocks.listEvents).not.toHaveBeenCalled()
    active = true
    rerender()
    await waitFor(() => expect(mocks.listEvents).toHaveBeenCalledTimes(1))
  })
})
