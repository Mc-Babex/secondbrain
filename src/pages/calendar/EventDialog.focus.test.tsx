import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { CalendarEvent } from '../../google/types'
import { blankForm } from './eventForm'
import { EventDialog } from './EventDialog'

vi.mock('../../google/calendar', () => ({
  patchCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  getSeries: vi.fn(),
}))

const EVENT: CalendarEvent = {
  id: 'ev1',
  title: 'Zahnarzt',
  start: '2026-10-20T14:00:00+02:00',
  end: '2026-10-20T15:00:00+02:00',
  allDay: false,
  organizerSelf: true,
  hasGuests: false,
  editable: true,
}

const props = { item: null, onClose: vi.fn(), onSaved: vi.fn(), onOpenItem: vi.fn() }

describe('EventDialog – Anfangsfokus', () => {
  it('vorhandener Termin: Fokus auf dem Panel, nicht im Titelfeld', () => {
    render(<EventDialog event={EVENT} {...props} />)
    expect(screen.getByRole('dialog')).toHaveFocus()
    expect(screen.getByLabelText('Titel')).not.toHaveFocus()
  })

  it('neuer Termin: Fokus im ersten Feld', () => {
    render(<EventDialog event={null} draft={blankForm('2026-10-20', '09:00')} {...props} />)
    expect(screen.getByLabelText('Titel')).toHaveFocus()
  })
})
