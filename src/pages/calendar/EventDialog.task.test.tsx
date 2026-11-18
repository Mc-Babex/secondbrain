import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { resetDb } from '../../data/localStore'
import { addProjectStep, createProject, listItems, saveCategories } from '../../data/repository'
import { GoogleError, type CalendarEvent } from '../../google/types'
import { EventDialog } from './EventDialog'
import { blankForm } from './eventForm'

const calendar = vi.hoisted(() => ({
  createCalendarEvent: vi.fn(),
  patchCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  getSeries: vi.fn(),
}))
vi.mock('../../google/calendar', () => calendar)

const taskFailure = vi.hoisted(() => ({ fail: false }))
vi.mock('../../data/repository', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../data/repository')>()
  return {
    ...original,
    createScheduledTask: (...args: Parameters<typeof original.createScheduledTask>) => {
      if (taskFailure.fail) return Promise.reject(new Error('lokal kaputt'))
      return original.createScheduledTask(...args)
    },
  }
})

const CREATED: CalendarEvent = {
  id: 'ev-neu',
  title: 'Zahnarzt',
  start: '2026-10-20T09:00:00+02:00',
  end: '2026-10-20T10:00:00+02:00',
  allDay: false,
  organizerSelf: true,
  hasGuests: false,
  editable: true,
}

function setup() {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(
    <EventDialog
      event={null}
      draft={{ ...blankForm('2026-10-20', '09:00'), title: 'Zahnarzt', note: 'Bitte pünktlich' }}
      item={null}
      onClose={onClose}
      onSaved={onSaved}
      onOpenItem={vi.fn()}
    />,
  )
  return { onClose, onSaved, user: userEvent.setup() }
}

const save = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Speichern' }))

beforeEach(async () => {
  calendar.createCalendarEvent.mockReset().mockResolvedValue(CREATED)
  taskFailure.fail = false
  await resetDb(true)
})
afterAll(() => resetDb(true))

describe('EventDialog – Auch als Aufgabe ablegen', () => {
  it('Schalter erscheint nur beim neuen Termin', () => {
    setup()
    expect(screen.getByLabelText('Auch als Aufgabe ablegen')).not.toBeChecked()
  })

  it('Schalter fehlt bei vorhandenem Termin', () => {
    render(
      <EventDialog
        event={CREATED}
        item={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onOpenItem={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText('Auch als Aufgabe ablegen')).toBeNull()
  })

  it('an: legt Google-Termin und danach die Aufgabe mit Termin an', async () => {
    const { user, onSaved } = setup()
    await user.click(screen.getByLabelText('Auch als Aufgabe ablegen'))
    expect(await screen.findByLabelText('Ablage')).toHaveValue('privat')
    await save(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(calendar.createCalendarEvent).toHaveBeenCalledOnce()
    const items = await listItems()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      type: 'aufgabe',
      title: 'Zahnarzt',
      notes: 'Bitte pünktlich',
      gtd: 'naechster-schritt',
      categoryId: 'privat',
      schedule: {
        start: '2026-10-20T09:00:00+02:00',
        durationMin: 60,
        calendarEventId: 'ev-neu',
      },
      v: 2,
    })
  })

  it('mit Projekt: projectId gesetzt, projectOrder hinter vorhandenen Schritten', async () => {
    const project = await createProject({ title: 'Umzug', categoryId: 'privat' })
    await addProjectStep(project.id, { title: 'Kartons' })
    const { user, onSaved } = setup()
    await user.click(screen.getByLabelText('Auch als Aufgabe ablegen'))
    await user.selectOptions(await screen.findByLabelText('Projekt'), project.id)
    await save(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const created = (await listItems()).find((i) => i.title === 'Zahnarzt')
    expect(created?.projectId).toBe(project.id)
    expect(created?.projectOrder).toBe(2)
  })

  it('Ablagenwechsel setzt ein nicht passendes Projekt zurück', async () => {
    const project = await createProject({ title: 'Umzug', categoryId: 'privat' })
    const { user } = setup()
    await user.click(screen.getByLabelText('Auch als Aufgabe ablegen'))
    await user.selectOptions(await screen.findByLabelText('Projekt'), project.id)
    await user.selectOptions(screen.getByLabelText('Ablage'), 'arbeit')
    expect(screen.getByLabelText('Projekt')).toHaveValue('')
  })

  it('Google-Fehler: keine Aufgabe, Fehlermeldung', async () => {
    calendar.createCalendarEvent.mockRejectedValue(new GoogleError('offline'))
    const { user, onSaved } = setup()
    await user.click(screen.getByLabelText('Auch als Aufgabe ablegen'))
    await save(user)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(await listItems()).toHaveLength(0)
  })

  it('Aufgabe scheitert: Termin bleibt gemerkt, erneutes Speichern legt nur die Aufgabe an', async () => {
    taskFailure.fail = true
    const { user, onSaved } = setup()
    await user.click(screen.getByLabelText('Auch als Aufgabe ablegen'))
    await save(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Termin angelegt, Aufgabe konnte nicht gespeichert werden – erneut speichern.',
    )
    expect(onSaved).not.toHaveBeenCalled()
    taskFailure.fail = false
    await save(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(true))
    expect(calendar.createCalendarEvent).toHaveBeenCalledOnce()
    const items = await listItems()
    expect(items).toHaveLength(1)
    expect(items[0].schedule?.calendarEventId).toBe('ev-neu')
  })

  it('ohne gültige Ablage: Hinweis, kein Google-Termin', async () => {
    await saveCategories([])
    const { user, onSaved } = setup()
    await user.click(screen.getByLabelText('Auch als Aufgabe ablegen'))
    await save(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Bitte eine Ablage wählen.')
    expect(calendar.createCalendarEvent).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('ganztägig: Schalter gesperrt, Hinweis sichtbar', async () => {
    const { user } = setup()
    await user.click(screen.getByLabelText('Ganztägig'))
    expect(screen.getByLabelText('Auch als Aufgabe ablegen')).toBeDisabled()
    expect(screen.getByText(/Nicht bei ganztägigen Terminen/)).toBeInTheDocument()
  })

  it('Wiederholung: Schalter gesperrt, Hinweis sichtbar', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Wiederholung'), 'daily')
    expect(screen.getByLabelText('Auch als Aufgabe ablegen')).toBeDisabled()
    expect(screen.getByText(/Nicht bei Terminen mit Wiederholung/)).toBeInTheDocument()
  })

  it('aus: nur der Google-Termin', async () => {
    const { user, onSaved } = setup()
    await save(user)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(calendar.createCalendarEvent).toHaveBeenCalledOnce()
    expect(await listItems()).toHaveLength(0)
  })
})
