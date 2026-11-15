import { useRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { useSwipe } from './useSwipe'

function Harness({ onChange }: { onChange: (index: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const { handlers, claimGesture } = useSwipe({
    index: 1,
    count: 3,
    trackRef,
    reducedMotion: false,
    onChange,
  })
  return (
    <div data-testid="area" {...handlers}>
      <div ref={trackRef} data-testid="track" />
      <button type="button" onClick={claimGesture}>
        übernehmen
      </button>
    </div>
  )
}

describe('useSwipe claimGesture', () => {
  it('verwirft die laufende Geste: Seiten federn zurück, kein Wechsel', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const area = screen.getByTestId('area')
    const touch = { pointerType: 'touch', pointerId: 1 }
    fireEvent.pointerDown(area, { ...touch, clientX: 300, clientY: 300 })
    fireEvent.pointerMove(area, { ...touch, clientX: 100, clientY: 300 })
    expect(screen.getByTestId('track')).toHaveAttribute('data-dragging')
    fireEvent.click(screen.getByRole('button', { name: 'übernehmen' }))
    expect(screen.getByTestId('track')).not.toHaveAttribute('data-dragging')
    expect(screen.getByTestId('track').dataset.target).toBe('1')
    fireEvent.pointerUp(area, { ...touch, clientX: 100, clientY: 300 })
    expect(onChange).not.toHaveBeenCalled()
  })
})
