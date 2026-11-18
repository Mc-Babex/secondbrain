import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Project, StepSeries } from '../../../data/types'
import { ProjectSteps } from './ProjectSteps'

const series: StepSeries = {
  id: 's1',
  titlePattern: 'Übungsblatt {Nr}',
  every: 1,
  weekday: 1,
  startDate: '2026-10-19',
  endDate: '2027-02-12',
  count: null,
  dueWeekday: 5,
  durationMin: 180,
  state: 'aktiv',
  skippedDates: [],
  lastNumber: 5,
  lastDate: '2026-11-16',
}

const project = (patch: Partial<Project> = {}): Project => ({
  id: 'p1',
  title: 'Analysis',
  notes: '',
  categoryId: 'studium',
  status: 'aktiv',
  series: [series],
  createdAt: '2026-11-01T10:00:00+01:00',
  updatedAt: '2026-11-01T10:00:00+01:00',
  completedAt: null,
  ...patch,
})

const renderSteps = (p: Project) =>
  render(
    <ProjectSteps
      project={p}
      steps={[]}
      items={[]}
      now={new Date('2026-11-17T10:00:00+01:00')}
      onComplete={vi.fn()}
      onEdit={vi.fn()}
    />,
  )

describe('ProjectSteps ohne offenen Schritt', () => {
  it('mit aktiver Serie: „Nächstes …“, keine Warnung, Eingabefeld vorhanden', () => {
    renderSteps(project())
    expect(screen.getByText('Nächstes: Übungsblatt 6 ab Mo 23.11.')).toBeInTheDocument()
    expect(screen.queryByText(/Nächsten Schritt festlegen/)).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Neuer Schritt' })).toBeInTheDocument()
  })

  it('ohne Serie: Warnung statt „Nächstes …“', () => {
    renderSteps(project({ series: [] }))
    expect(screen.getByRole('status')).toHaveTextContent('Nächsten Schritt festlegen')
    expect(screen.queryByText(/Nächstes:/)).not.toBeInTheDocument()
  })
})
