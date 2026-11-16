import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { Project } from '../data/types'
import { emptyGtdForm, type GtdForm } from './gtdForm'
import { GtdFields } from './GtdFields'

const project = (over: Partial<Project>): Project => ({
  id: 'p1',
  title: 'Umzug',
  notes: '',
  categoryId: 'privat',
  status: 'aktiv',
  series: [],
  createdAt: '2026-10-01T10:00:00+02:00',
  updatedAt: '2026-10-01T10:00:00+02:00',
  completedAt: null,
  ...over,
})

function Harness({ initial, projects }: { initial?: Partial<GtdForm>; projects: Project[] }) {
  const [value, setValue] = useState<GtdForm>({ ...emptyGtdForm(), ...initial })
  return (
    <GtdFields
      value={value}
      onChange={(patch) => setValue((prev) => ({ ...prev, ...patch }))}
      categoryId="privat"
      projects={projects}
    />
  )
}

describe('GtdFields', () => {
  it('Status ist eine Gruppe echter Radio-Inputs, per Pfeiltasten bedienbar', async () => {
    const user = userEvent.setup()
    render(<Harness projects={[]} />)
    const group = screen.getByRole('radiogroup', { name: 'Status' })
    const radios = group.querySelectorAll('input[type="radio"]')
    expect(radios).toHaveLength(3)
    expect(screen.getByRole('radio', { name: 'Nächster Schritt' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Irgendwann' }))
    expect(screen.getByRole('radio', { name: 'Irgendwann' })).toBeChecked()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('radio', { name: 'Warte auf' })).toBeChecked()
    expect(screen.getByLabelText('Person / Was')).toBeInTheDocument()
  })

  it('zeigt ein abgeschlossenes Projekt als gekennzeichnete, vorausgewählte Option', () => {
    const done = project({ id: 'p9', title: 'Alt', status: 'erledigt' })
    render(<Harness initial={{ projectId: 'p9' }} projects={[project({}), done]} />)
    expect(screen.getByLabelText('Projekt')).toHaveValue('p9')
    expect(screen.getByRole('option', { name: 'Alt (abgeschlossen)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Umzug' })).toBeInTheDocument()
  })

  it('ohne Zuordnung steht „Kein Projekt“ da, ohne Zusatzoption', () => {
    render(<Harness projects={[project({})]} />)
    expect(screen.getByLabelText('Projekt')).toHaveValue('')
    expect(screen.getAllByRole('option', { name: /Umzug|Kein Projekt/ })).toHaveLength(2)
  })
})
