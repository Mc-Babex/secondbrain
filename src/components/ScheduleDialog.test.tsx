import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { ScheduleDialog } from './ScheduleDialog'

const WINDOW = { start: '08:00', end: '18:00' }

function setup(props: Partial<React.ComponentProps<typeof ScheduleDialog>> = {}) {
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  render(
    <ScheduleDialog
      title="Einplanen"
      schedule={null}
      durationMin={null}
      planningWindow={WINDOW}
      now={new Date('2026-10-20T10:01:00+02:00')}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    />,
  )
  return { onSubmit, onCancel }
}

describe('ScheduleDialog', () => {
  it('belegt mit dem Vorschlag und 30 Minuten vor', () => {
    setup()
    expect(screen.getByLabelText('Datum')).toHaveValue('2026-10-20')
    expect(screen.getByLabelText('Uhrzeit')).toHaveValue('10:15')
    expect(screen.getByLabelText('Dauer')).toHaveValue('30')
  })

  it('der Vorschlag überspringt die Pause; jede Zeit bleibt wählbar', async () => {
    const pause = { start: '12:00', end: '13:00' }
    const { onSubmit } = setup({ pause, now: new Date('2026-10-20T11:35:00+02:00') })
    expect(screen.getByLabelText('Uhrzeit')).toHaveValue('13:00')
    const user = userEvent.setup()
    fireEvent.change(screen.getByLabelText('Uhrzeit'), { target: { value: '12:15' } })
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(onSubmit).toHaveBeenCalledWith({ start: '2026-10-20T12:15:00+02:00', durationMin: 30 })
  })

  it('ohne Pause bleibt der Vorschlag die nächste Viertelstunde', () => {
    setup({ pause: null, now: new Date('2026-10-20T11:35:00+02:00') })
    expect(screen.getByLabelText('Uhrzeit')).toHaveValue('11:45')
  })

  it('belegt mit dem vorhandenen Termin vor', () => {
    setup({ schedule: { start: '2026-10-22T14:00:00+02:00', durationMin: 90 }, durationMin: 30 })
    expect(screen.getByLabelText('Datum')).toHaveValue('2026-10-22')
    expect(screen.getByLabelText('Uhrzeit')).toHaveValue('14:00')
    expect(screen.getByLabelText('Dauer')).toHaveValue('90')
  })

  it('bietet Dauern in 15-Minuten-Schritten bis zur Fensterlänge', () => {
    setup()
    const options = screen.getAllByRole('option').map((o) => Number((o as HTMLOptionElement).value))
    expect(options[0]).toBe(15)
    expect(options[1]).toBe(30)
    expect(options[options.length - 1]).toBe(600)
  })

  it('übergibt Start (ISO mit Offset) und Dauer', async () => {
    const { onSubmit } = setup()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Dauer'), '45')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(onSubmit).toHaveBeenCalledWith({ start: '2026-10-20T10:15:00+02:00', durationMin: 45 })
  })

  it('validiert fehlende Eingaben und falsche Minutenschritte', async () => {
    const { onSubmit } = setup()
    const user = userEvent.setup()
    fireEvent.change(screen.getByLabelText('Uhrzeit'), { target: { value: '10:20' } })
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(screen.getByRole('alert')).toHaveTextContent('15-Minuten-Schritten')
    fireEvent.change(screen.getByLabelText('Datum'), { target: { value: '' } })
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Datum und Uhrzeit')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('weist auf Zeiten außerhalb des Planungsfensters hin, erlaubt sie aber', async () => {
    const { onSubmit } = setup()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Uhrzeit'), { target: { value: '19:00' } })
    expect(screen.getByRole('status')).toHaveTextContent('außerhalb des Planungsfensters')
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('deaktiviert Speichern während busy und bricht ab', async () => {
    const { onCancel } = setup({ busy: true })
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('ändert Datum, Startzeit und Dauer eines vorhandenen Termins', async () => {
    const user = userEvent.setup()
    const { onSubmit } = setup({
      schedule: { start: '2026-10-22T14:00:00+02:00', durationMin: 90 },
      durationMin: 30,
    })
    fireEvent.change(screen.getByLabelText('Datum'), { target: { value: '2026-10-23' } })
    fireEvent.change(screen.getByLabelText('Uhrzeit'), { target: { value: '09:30' } })
    await user.selectOptions(screen.getByLabelText('Dauer'), '45')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(onSubmit).toHaveBeenCalledWith({ start: '2026-10-23T09:30:00+02:00', durationMin: 45 })
  })
})
