import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Item, Project } from '../data/types'
import { ProjectCard } from './ProjectCard'

const project: Project = {
  id: 'p1',
  title: 'Analysis 1',
  notes: '',
  categoryId: 'studium',
  status: 'aktiv',
  series: [],
  createdAt: '2026-11-01T10:00:00+01:00',
  updatedAt: '2026-11-01T10:00:00+01:00',
  completedAt: null,
}

const step = (id: string, order: number, status: Item['status']): Item => ({
  id,
  type: 'aufgabe',
  title: `Schritt ${id}`,
  notes: '',
  categoryId: 'studium',
  status,
  important: false,
  durationMin: null,
  schedule: null,
  originalCategoryId: null,
  createdAt: '2026-11-01T10:00:00+01:00',
  updatedAt: '2026-11-01T10:00:00+01:00',
  completedAt: null,
  projectId: 'p1',
  projectOrder: order,
})

describe('ProjectCard', () => {
  it('zeigt Titel, Fortschritt x/y und nächsten Schritt', () => {
    const items = [step('a', 1, 'erledigt'), step('b', 2, 'offen'), step('c', 3, 'offen')]
    render(<ProjectCard project={project} items={items} />)
    expect(screen.getByText('Analysis 1')).toBeInTheDocument()
    expect(screen.getByText('1/3')).toBeInTheDocument()
    expect(screen.getByText('Nächster Schritt: Schritt b')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    expect(screen.queryByText(/Nächsten Schritt festlegen/)).not.toBeInTheDocument()
  })

  it('warnt ohne offenen Schritt', () => {
    render(<ProjectCard project={project} items={[step('a', 1, 'erledigt')]} />)
    expect(screen.getByText('⚠ Nächsten Schritt festlegen')).toBeInTheDocument()
  })

  it('ohne Schritte: 0/0 und Warnung', () => {
    render(<ProjectCard project={project} items={[]} />)
    expect(screen.getByText('0/0')).toBeInTheDocument()
    expect(screen.getByText('⚠ Nächsten Schritt festlegen')).toBeInTheDocument()
  })

  it('mit aktiver Serie: Fortschritt mit geplanten Blättern, „Nächstes“ statt Warnung', () => {
    const withSeries: Project = {
      ...project,
      series: [
        {
          id: 's1',
          titlePattern: 'Übungsblatt {Nr}',
          every: 1,
          weekday: 1,
          startDate: '2026-10-26',
          endDate: null,
          count: 10,
          dueWeekday: null,
          durationMin: null,
          state: 'aktiv',
          skippedDates: [],
          lastNumber: 5,
          lastDate: '2026-11-23',
        },
      ],
    }
    const items = [1, 2, 3, 4, 5].map((n) => step(`b${n}`, n, 'erledigt'))
    render(<ProjectCard project={withSeries} items={items} />)
    expect(screen.getByText('5/10')).toBeInTheDocument()
    expect(screen.getByText('Nächstes: Übungsblatt 6 ab Mo 30.11.')).toBeInTheDocument()
    expect(screen.queryByText(/Nächsten Schritt festlegen/)).not.toBeInTheDocument()
  })

  it('ist ohne onOpen kein Knopf', () => {
    render(<ProjectCard project={project} items={[]} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('Antippen ruft onOpen mit dem Projekt auf', async () => {
    const onOpen = vi.fn()
    render(<ProjectCard project={project} items={[]} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onOpen).toHaveBeenCalledWith(project)
  })
})
