import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Item } from '../data/types'
import { StatusBadges } from './StatusBadges'

const NOW = new Date('2026-11-16T10:00:00+01:00')

const task = (patch: Partial<Item> = {}): Item => ({
  id: 'a',
  type: 'aufgabe',
  title: 'A',
  notes: '',
  categoryId: 'privat',
  status: 'offen',
  important: false,
  durationMin: null,
  schedule: null,
  originalCategoryId: null,
  createdAt: '2026-11-01T10:00:00+01:00',
  updatedAt: '2026-11-01T10:00:00+01:00',
  completedAt: null,
  ...patch,
})

const show = (item: Item) => render(<StatusBadges item={item} now={NOW} />)

describe('StatusBadges', () => {
  it('Nächster Schritt (auch ohne gtd-Feld)', () => {
    show(task())
    expect(screen.getByText('Nächster Schritt')).toBeInTheDocument()
  })

  it('Termin mit Datum und Zeit', () => {
    show(task({ schedule: { start: '2026-11-20T14:00:00+01:00', durationMin: 30 } }))
    expect(screen.getByText('Termin Fr 20.11., 14:00')).toBeInTheDocument()
  })

  it('Warte auf mit Person', () => {
    show(
      task({
        gtd: 'warten',
        waiting: { person: 'Anna', since: '2026-11-01', followUpOn: null },
      }),
    )
    expect(screen.getByText('Warte auf Anna')).toBeInTheDocument()
  })

  it('Irgendwann', () => {
    show(task({ gtd: 'irgendwann' }))
    expect(screen.getByText('Irgendwann')).toBeInTheDocument()
  })

  it('Fokus und 2 Min. mit Text', () => {
    show(task({ important: true, durationMin: 2 }))
    expect(screen.getByText(/Fokus/)).toBeInTheDocument()
    expect(screen.getByText(/2 Min\./)).toBeInTheDocument()
  })

  it('kein 2-Min.-Kennzeichen bei längerer Dauer', () => {
    show(task({ durationMin: 15 }))
    expect(screen.queryByText(/2 Min\./)).not.toBeInTheDocument()
  })

  it('fällig in der Zukunft', () => {
    show(task({ dueDate: '2026-11-23' }))
    expect(screen.getByText('fällig Mo 23.11.')).toBeInTheDocument()
    expect(screen.queryByText(/überfällig/)).not.toBeInTheDocument()
  })

  it('fällig heute ist nicht überfällig', () => {
    show(task({ dueDate: '2026-11-16' }))
    expect(screen.getByText('fällig heute')).toBeInTheDocument()
  })

  it('überfällig mit Text', () => {
    show(task({ dueDate: '2026-11-13' }))
    expect(screen.getByText('überfällig, fällig Fr 13.11.')).toBeInTheDocument()
  })

  it('Notiz ohne Kennzeichen', () => {
    const { container } = show(task({ type: 'notiz' }))
    expect(container).toBeEmptyDOMElement()
  })
})
