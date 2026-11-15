import { fireEvent, render, screen } from '@testing-library/react'
import { Dialog } from './Dialog'

describe('Dialog im Portal', () => {
  it('wird direkt unter document.body gerendert, Escape und Tab-Einschluss funktionieren', () => {
    const onClose = vi.fn()
    const { container } = render(
      <div>
        <Dialog title="Test" onClose={onClose}>
          <button type="button">Eins</button>
          <button type="button">Zwei</button>
        </Dialog>
      </div>,
    )
    const dialog = screen.getByRole('dialog')
    expect(container.contains(dialog)).toBe(false)
    expect(document.body.contains(dialog)).toBe(true)
    screen.getByRole('button', { name: 'Zwei' }).focus()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Zwei' }), { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'Eins' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Eins' }), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
