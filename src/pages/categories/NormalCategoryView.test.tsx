import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Category, Item } from '../../data/types'
import { NormalCategoryView } from './NormalCategoryView'

const category: Category = {
  id: 'privat',
  name: 'Privat',
  kind: 'normal',
  order: 1,
  description: '',
}

function note(notes: string): Item {
  return {
    id: 'n1',
    type: 'notiz',
    title: 'Idee',
    notes,
    categoryId: 'privat',
    status: 'offen',
    important: false,
    durationMin: null,
    schedule: null,
    originalCategoryId: null,
    createdAt: '2026-10-21T10:00:00+02:00',
    updatedAt: '2026-10-21T10:00:00+02:00',
    completedAt: null,
  }
}

const view = (item: Item) => (
  <NormalCategoryView category={category} categories={[category]} items={[item]} />
)

describe('NormalCategoryView Notizen', () => {
  it('zeigt eine mehrzeilige Notiz mit allen Zeilen', () => {
    render(view(note('Zeile eins\nZeile zwei\nZeile drei')))
    const text = screen.getByText(/Zeile eins/)
    expect(text.textContent).toBe('Zeile eins\nZeile zwei\nZeile drei')
    expect(screen.queryByRole('button', { name: 'Mehr anzeigen' })).not.toBeInTheDocument()
  })

  it('lange Notiz: vollständig im Text, aufklappbar mit „Mehr anzeigen“', async () => {
    const long = Array.from({ length: 8 }, (_, i) => `Satz Nummer ${i + 1} steht hier.`).join('\n')
    render(view(note(long)))
    const toggle = screen.getByRole('button', { name: 'Mehr anzeigen' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(/Satz Nummer 8/).textContent).toBe(long)
    await userEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Weniger anzeigen' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('ohne Notiz erscheint nichts', () => {
    render(view(note('')))
    expect(screen.queryByRole('button', { name: /anzeigen/ })).not.toBeInTheDocument()
  })
})
