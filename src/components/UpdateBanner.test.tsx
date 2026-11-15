import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { UpdateBanner } from './UpdateBanner'

describe('UpdateBanner', () => {
  it('lädt per Klick neu und ist mit aria-label benannt', async () => {
    const onReload = vi.fn()
    render(<UpdateBanner onReload={onReload} />)
    await userEvent.click(screen.getByRole('button', { name: 'Neue Version jetzt laden' }))
    expect(onReload).toHaveBeenCalledTimes(1)
  })

  it('ist per Tastatur bedienbar (Tab, Enter)', async () => {
    const onReload = vi.fn()
    render(<UpdateBanner onReload={onReload} />)
    await userEvent.tab()
    expect(screen.getByRole('button')).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(onReload).toHaveBeenCalledTimes(1)
  })
})
