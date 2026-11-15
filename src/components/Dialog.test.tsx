import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { hasUnsavedWork } from '../lib/unsavedWork'
import { Dialog } from './Dialog'

function Host({ initialFocus }: { initialFocus?: 'dialog' | 'first-field' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Öffnen</button>
      {open && (
        <Dialog title="Mein Dialog" initialFocus={initialFocus} onClose={() => setOpen(false)}>
          <input aria-label="Erstes" />
          <button>Zweites</button>
        </Dialog>
      )}
    </>
  )
}

describe('Dialog', () => {
  it('meldet sich beim Öffnen am Register „ungespeichert“ an und beim Schließen ab', async () => {
    render(<Host />)
    expect(hasUnsavedWork()).toBe(false)
    await userEvent.click(screen.getByText('Öffnen'))
    expect(hasUnsavedWork()).toBe(true)
    await userEvent.keyboard('{Escape}')
    expect(hasUnsavedWork()).toBe(false)
  })

  it('hat Dialog-Rolle, aria-modal und Titel per aria-labelledby', async () => {
    render(<Host />)
    await userEvent.click(screen.getByText('Öffnen'))
    const dialog = screen.getByRole('dialog', { name: 'Mein Dialog' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('fokussiert mit first-field das erste Feld, hält den Fokus im Dialog und gibt ihn beim Schließen zurück', async () => {
    const user = userEvent.setup()
    render(<Host initialFocus="first-field" />)
    const opener = screen.getByText('Öffnen')
    await user.click(opener)
    expect(screen.getByLabelText('Erstes')).toHaveFocus()
    await user.tab()
    expect(screen.getByText('Zweites')).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('Erstes')).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByText('Zweites')).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('fokussiert standardmäßig das Panel statt eines Feldes; Tab erreicht das erste Feld', async () => {
    const user = userEvent.setup()
    render(<Host />)
    await user.click(screen.getByText('Öffnen'))
    expect(screen.getByRole('dialog')).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('Erstes')).toHaveFocus()
  })

  it('Umschalt+Tab vom Panel springt zum letzten Element im Dialog', async () => {
    const user = userEvent.setup()
    render(<Host />)
    await user.click(screen.getByText('Öffnen'))
    await user.tab({ shift: true })
    expect(screen.getByText('Zweites')).toHaveFocus()
  })

  it('Standard: Escape schließt und der Fokus kehrt zum auslösenden Element zurück', async () => {
    const user = userEvent.setup()
    render(<Host />)
    const opener = screen.getByText('Öffnen')
    await user.click(opener)
    expect(screen.getByRole('dialog')).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('gibt den Fokus ohne Scrollen zurück', async () => {
    const user = userEvent.setup()
    render(<Host />)
    const opener = screen.getByText('Öffnen')
    await user.click(opener)
    const focus = vi.spyOn(opener, 'focus')
    await user.keyboard('{Escape}')
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('stellt den Fokus nicht auf inerte Elemente zurück', async () => {
    const user = userEvent.setup()
    const { container } = render(<Host />)
    const opener = screen.getByText('Öffnen')
    await user.click(opener)
    const focus = vi.spyOn(opener, 'focus')
    container.setAttribute('inert', '')
    await user.keyboard('{Escape}')
    expect(focus).not.toHaveBeenCalled()
  })
})
