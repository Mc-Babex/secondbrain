import { render, screen } from '@testing-library/react'
import { logError } from '../data/errorLog'
import { hyphenatorSettled, useHyphenator } from './hyphenation'

vi.mock('hyphen/de', () => {
  throw new Error('Chunk nicht erreichbar')
})
vi.mock('../data/errorLog', () => ({ logError: vi.fn() }))

function Probe() {
  const hyphenate = useHyphenator()
  return <p>{hyphenate ? 'getrennt' : 'ungetrennt'}</p>
}

function FreshProbe({ useHyphenator: use }: { useHyphenator: typeof useHyphenator }) {
  return <p>{use() ? 'getrennt' : 'ungetrennt'}</p>
}

describe('Trennmuster nicht ladbar', () => {
  it('bleibt beim Rückfall, protokolliert einmal und versucht nicht pro Kachel neu', async () => {
    const first = render(<Probe />)
    await hyphenatorSettled()
    expect(screen.getByText('ungetrennt')).toBeInTheDocument()
    expect(logError).toHaveBeenCalledTimes(1)

    first.unmount()
    render(<Probe />)
    render(<Probe />)
    await hyphenatorSettled()
    expect(screen.getAllByText('ungetrennt')).toHaveLength(2)
    expect(logError).toHaveBeenCalledTimes(1)
  })

  it('merkt sich einen neuen Versuch für das nächste online-Ereignis', async () => {
    const add = vi.spyOn(window, 'addEventListener')
    vi.resetModules()
    const fresh = await import('./hyphenation')
    render(<FreshProbe useHyphenator={fresh.useHyphenator} />)
    await fresh.hyphenatorSettled()
    expect(add).toHaveBeenCalledWith('online', expect.any(Function), { once: true })
  })
})
