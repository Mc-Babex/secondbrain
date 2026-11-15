import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { resetSyncStatus, setSyncStatus, type SyncStatus } from '../data/syncStatus'
import { SyncIndicator } from './SyncIndicator'

afterEach(() => act(() => resetSyncStatus()))

describe('SyncIndicator', () => {
  const cases: [Partial<SyncStatus>, string][] = [
    [{ state: 'nichtEingerichtet' }, 'nicht eingerichtet'],
    [{ state: 'synchron' }, 'synchron'],
    [{ state: 'ausstehend', pending: 3 }, '3 ausstehend'],
    [{ state: 'offline' }, 'offline'],
    [{ state: 'fehler' }, 'Fehler'],
    [{ state: 'laeuft' }, 'synchronisiere…'],
  ]

  it.each(cases)('zeigt %j als "%s"', (patch, text) => {
    render(<SyncIndicator onClick={() => undefined} />)
    act(() => setSyncStatus(patch))
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('ist eine höfliche Live-Region und öffnet per Klick die Einstellungen', async () => {
    const onClick = vi.fn()
    render(<SyncIndicator onClick={onClick} />)
    expect(screen.getByText('nicht eingerichtet')).toHaveAttribute('aria-live', 'polite')
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
