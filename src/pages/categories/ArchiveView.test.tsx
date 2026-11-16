import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Category, Item } from '../../data/types'
import { resetDb } from '../../data/localStore'
import { createItem } from '../../data/repository'
import { ArchiveView } from './ArchiveView'

beforeEach(() => resetDb(true))
afterAll(() => resetDb(true))

const archive: Category = {
  id: 'erledigt',
  name: 'Erledigt',
  kind: 'archiv',
  order: 9,
  description: '',
}
const privat: Category = { id: 'privat', name: 'Privat', kind: 'normal', order: 1, description: '' }

describe('ArchiveView Termine', () => {
  it('zeigt „Termin am …“ und meldet beim Wiederherstellen den Kalender-Hinweis', async () => {
    const created = await createItem({
      type: 'termin',
      title: 'Zahnarzt',
      categoryId: 'erledigt',
      status: 'erledigt',
      originalCategoryId: 'privat',
      completedAt: '2026-10-22T15:00:00+02:00',
      schedule: { start: '2026-10-22T14:00:00+02:00', durationMin: 60 },
    })
    const user = userEvent.setup()
    render(<ArchiveView category={archive} categories={[privat, archive]} items={[created]} />)
    expect(screen.getByText(/Termin am Do 22\.10\., 14:00/)).toBeInTheDocument()
    expect(screen.queryByText(/erledigt am/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Zahnarzt wiederherstellen' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Zurück in Privat. Termin bleibt im Kalender.',
    )
  })

  it('zeigt bei Aufgaben weiter „erledigt am“', () => {
    const task: Item = {
      id: 'x',
      type: 'aufgabe',
      title: 'Steuer',
      notes: '',
      categoryId: 'erledigt',
      status: 'erledigt',
      important: false,
      durationMin: null,
      schedule: null,
      originalCategoryId: 'privat',
      createdAt: '2026-10-01T10:00:00+02:00',
      updatedAt: '2026-10-01T10:00:00+02:00',
      completedAt: '2026-10-22T15:00:00+02:00',
    }
    render(<ArchiveView category={archive} categories={[privat, archive]} items={[task]} />)
    expect(screen.getByText(/erledigt am/)).toBeInTheDocument()
  })
})
