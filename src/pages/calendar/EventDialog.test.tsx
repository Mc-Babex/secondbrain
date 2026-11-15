import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { resetDb } from '../../data/localStore'
import { createItem, listItems } from '../../data/repository'
import type { Item } from '../../data/types'
import { GoogleError, type CalendarEvent } from '../../google/types'
import { EventDialog } from './EventDialog'

const calendar = vi.hoisted(() => ({
  patchCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  getSeries: vi.fn(),
}))
vi.mock('../../google/calendar', () => calendar)

const EVENT: CalendarEvent = {
  id: 'ev1',
  title: 'Zahnarzt',
  start: '2026-10-20T14:00:00+02:00',
  end: '2026-10-20T15:00:00+02:00',
  allDay: false,
  location: 'Praxis',
  description: 'Bitte pünktlich\n\nErstellt mit SecondBrain\nEintrag: abc',
  organizerSelf: true,
  hasGuests: false,
  editable: true,
}

const SERIES: CalendarEvent = {
  ...EVENT,
  id: 'serie',
  start: '2026-10-06T14:00:00+02:00',
  end: '2026-10-06T15:00:00+02:00',
  recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
}

function setup(event: CalendarEvent = EVENT, item: Item | null = null) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const onOpenItem = vi.fn()
  render(
    <EventDialog
      event={event}
      item={item}
      onClose={onClose}
      onSaved={onSaved}
      onOpenItem={onOpenItem}
    />,
  )
  return { onClose, onSaved, onOpenItem, user: userEvent.setup() }
}

const save = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Speichern' }))

async function linkedItem(): Promise<Item> {
  return createItem({
    type: 'termin',
    title: 'Zahnarzt',
    categoryId: 'privat',
    durationMin: 60,
    schedule: { start: EVENT.start, durationMin: 60, calendarEventId: 'ev1' },
  })
}

beforeEach(async () => {
  calendar.patchCalendarEvent.mockReset().mockResolvedValue(EVENT)
  calendar.deleteCalendarEvent.mockReset().mockResolvedValue(undefined)
  calendar.getSeries.mockReset().mockResolvedValue(SERIES)
  await resetDb(true)
})
afterAll(() => resetDb(true))

describe('EventDialog – Ansicht', () => {
  it('belegt alle Felder vor; die Markierung bleibt aus der Notiz heraus', () => {
    setup()
    expect(screen.getByLabelText('Titel')).toHaveValue('Zahnarzt')
    expect(screen.getByLabelText('Ganztägig')).not.toBeChecked()
    expect(screen.getByLabelText('Datum')).toHaveValue('2026-10-20')
    expect(screen.getByLabelText('Beginn')).toHaveValue('14:00')
    expect(screen.getByLabelText('Ende')).toHaveValue('15:00')
    expect(screen.getByLabelText('Dauer')).toHaveValue('60')
    expect(screen.getByLabelText('Ort')).toHaveValue('Praxis')
    expect(screen.getByLabelText('Notiz')).toHaveValue('Bitte pünktlich')
  })

  it('zeigt eine Einladung nur lesend', () => {
    setup({ ...EVENT, organizerSelf: false, editable: false })
    expect(screen.getByText('Einladung – nur lesen')).toBeInTheDocument()
    expect(screen.queryByLabelText('Titel')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Speichern' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Schließen' })).toBeInTheDocument()
  })

  it('weist bei Serientermin auf die Wahl „Nur dieser Termin“ oder „Ganze Serie“ hin', () => {
    setup({ ...EVENT, recurringEventId: 'serie' })
    expect(screen.getByText(/^Serientermin – beim Speichern wählst du/)).toBeInTheDocument()
  })
})

describe('EventDialog – Speichern', () => {
  it('sendet nur geänderte Felder und sendUpdates=none ohne Gäste', async () => {
    const { user, onSaved, onClose } = setup()
    await user.clear(screen.getByLabelText('Titel'))
    await user.type(screen.getByLabelText('Titel'), 'Zahnreinigung')
    await user.clear(screen.getByLabelText('Ort'))
    await user.type(screen.getByLabelText('Ort'), 'Praxis Nord')
    await save(user)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calendar.patchCalendarEvent).toHaveBeenCalledTimes(1)
    expect(calendar.patchCalendarEvent).toHaveBeenCalledWith(
      'ev1',
      { title: 'Zahnreinigung', location: 'Praxis Nord' },
      { sendUpdates: 'none' },
    )
    expect(onSaved).toHaveBeenCalled()
  })

  it('ruft ohne Änderung nichts auf', async () => {
    const { user, onClose } = setup()
    await save(user)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
  })

  it('erhält die SecondBrain-Markierung beim Bearbeiten der Notiz', async () => {
    const { user } = setup()
    await user.clear(screen.getByLabelText('Notiz'))
    await user.type(screen.getByLabelText('Notiz'), 'Neu')
    await save(user)
    await waitFor(() => expect(calendar.patchCalendarEvent).toHaveBeenCalled())
    expect(calendar.patchCalendarEvent.mock.calls[0][1]).toEqual({
      description: 'Neu\n\nErstellt mit SecondBrain\nEintrag: abc',
    })
  })

  it('ändert Startzeit, Ende folgt über die Dauer', async () => {
    const { user } = setup()
    fireEvent.change(screen.getByLabelText('Beginn'), { target: { value: '15:30' } })
    expect(screen.getByLabelText('Ende')).toHaveValue('16:30')
    await save(user)
    await waitFor(() => expect(calendar.patchCalendarEvent).toHaveBeenCalled())
    expect(calendar.patchCalendarEvent.mock.calls[0][1]).toEqual({
      timing: { allDay: false, start: '2026-10-20T15:30:00+02:00', durationMin: 60 },
      wasAllDay: false,
    })
  })

  it('koppelt Ende und Dauer', () => {
    setup()
    fireEvent.change(screen.getByLabelText('Ende'), { target: { value: '15:45' } })
    expect(screen.getByLabelText('Dauer')).toHaveValue('105')
    fireEvent.change(screen.getByLabelText('Dauer'), { target: { value: '30' } })
    expect(screen.getByLabelText('Ende')).toHaveValue('14:30')
  })

  it('meldet Ende vor oder gleich Beginn und speichert nicht', async () => {
    const { user } = setup()
    fireEvent.change(screen.getByLabelText('Ende'), { target: { value: '14:00' } })
    await save(user)
    expect(screen.getByRole('alert')).toHaveTextContent('Das Ende muss nach dem Beginn liegen.')
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
  })

  it('verlangt einen Titel', async () => {
    const { user } = setup()
    await user.clear(screen.getByLabelText('Titel'))
    await save(user)
    expect(screen.getByRole('alert')).toHaveTextContent('Bitte einen Titel angeben.')
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
  })

  it('schaltet auf ganztägig um', async () => {
    const { user } = setup()
    await user.click(screen.getByLabelText('Ganztägig'))
    await save(user)
    await waitFor(() => expect(calendar.patchCalendarEvent).toHaveBeenCalled())
    expect(calendar.patchCalendarEvent.mock.calls[0][1]).toEqual({
      timing: { allDay: true, startDate: '2026-10-20', endDate: '2026-10-21' },
      wasAllDay: false,
    })
  })

  it('schaltet von ganztägig auf Uhrzeit um und zeigt das Ende einschließlich', async () => {
    const { user } = setup({
      ...EVENT,
      start: '2026-10-20',
      end: '2026-10-22',
      allDay: true,
      startDate: '2026-10-20',
      endDate: '2026-10-22',
    })
    expect(screen.getByLabelText('Ende (Datum)')).toHaveValue('2026-10-21')
    await user.click(screen.getByLabelText('Ganztägig'))
    await save(user)
    await waitFor(() => expect(calendar.patchCalendarEvent).toHaveBeenCalled())
    expect(calendar.patchCalendarEvent.mock.calls[0][1]).toEqual({
      timing: { allDay: false, start: '2026-10-20T09:00:00+02:00', durationMin: 60 },
      wasAllDay: true,
    })
  })

  it('fragt bei Gästen und sendet die Antwort als sendUpdates', async () => {
    const { user } = setup({ ...EVENT, hasGuests: true })
    await user.type(screen.getByLabelText('Titel'), '!')
    await save(user)
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: 'Nein' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Ja' }))
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(calendar.patchCalendarEvent).toHaveBeenCalled())
    expect(calendar.patchCalendarEvent.mock.calls[0][2]).toEqual({ sendUpdates: 'all' })
  })

  it('sendet bei Gästen ohne Auswahl none', async () => {
    const { user } = setup({ ...EVENT, hasGuests: true })
    await user.type(screen.getByLabelText('Titel'), '!')
    await save(user)
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(calendar.patchCalendarEvent).toHaveBeenCalled())
    expect(calendar.patchCalendarEvent.mock.calls[0][2]).toEqual({ sendUpdates: 'none' })
  })

  it('übernimmt Titel und Zeit in den verknüpften Eintrag', async () => {
    const item = await linkedItem()
    const { user } = setup(EVENT, item)
    await user.clear(screen.getByLabelText('Titel'))
    await user.type(screen.getByLabelText('Titel'), 'Zahnreinigung')
    fireEvent.change(screen.getByLabelText('Beginn'), { target: { value: '16:00' } })
    fireEvent.change(screen.getByLabelText('Dauer'), { target: { value: '90' } })
    await save(user)
    await waitFor(async () => {
      const saved = (await listItems()).find((i) => i.id === item.id)
      expect(saved?.title).toBe('Zahnreinigung')
      expect(saved?.schedule).toEqual({
        start: '2026-10-20T16:00:00+02:00',
        durationMin: 90,
        calendarEventId: 'ev1',
      })
      expect(saved?.durationMin).toBe(90)
    })
  })

  it('zeigt bei Fehler die Meldung, bleibt offen und behält die Eingaben', async () => {
    calendar.patchCalendarEvent.mockRejectedValue(new GoogleError('offline'))
    const { user, onClose } = setup()
    await user.type(screen.getByLabelText('Titel'), ' neu')
    await save(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Google ist nicht erreichbar')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Titel')).toHaveValue('Zahnarzt neu')
  })

  it('löst bei Doppelklick nur einen Aufruf aus', async () => {
    let resolve: (event: CalendarEvent) => void = () => undefined
    calendar.patchCalendarEvent.mockReturnValue(new Promise((r) => (resolve = r)))
    const { user } = setup()
    await user.type(screen.getByLabelText('Titel'), '!')
    const button = screen.getByRole('button', { name: 'Speichern' })
    await user.dblClick(button)
    expect(calendar.patchCalendarEvent).toHaveBeenCalledTimes(1)
    resolve(EVENT)
  })
})

describe('EventDialog – Löschen', () => {
  const startDelete = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: 'Löschen' }))
  const confirm = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: 'Endgültig löschen' }))

  it('löscht erst nach Bestätigung', async () => {
    const { user, onClose, onSaved } = setup()
    await startDelete(user)
    expect(calendar.deleteCalendarEvent).not.toHaveBeenCalled()
    await confirm(user)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calendar.deleteCalendarEvent).toHaveBeenCalledWith('ev1', { sendUpdates: 'none' })
    expect(onSaved).toHaveBeenCalled()
  })

  it('gilt „schon weg“ (nicht gefunden) als Erfolg', async () => {
    calendar.deleteCalendarEvent.mockRejectedValue(new GoogleError('notFound'))
    const { user, onClose } = setup()
    await startDelete(user)
    await confirm(user)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('fragt bei Gästen und sendet die Antwort', async () => {
    const { user } = setup({ ...EVENT, hasGuests: true })
    await startDelete(user)
    await user.click(screen.getByRole('radio', { name: 'Ja' }))
    await confirm(user)
    await waitFor(() => expect(calendar.deleteCalendarEvent).toHaveBeenCalled())
    expect(calendar.deleteCalendarEvent).toHaveBeenCalledWith('ev1', { sendUpdates: 'all' })
  })

  it('verknüpft: „Nur Termin löschen“ setzt schedule auf null', async () => {
    const item = await linkedItem()
    const { user, onClose } = setup(EVENT, item)
    await startDelete(user)
    await confirm(user)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const saved = (await listItems()).find((i) => i.id === item.id)
    expect(saved?.schedule).toBeNull()
  })

  it('verknüpft: „Termin und Eintrag löschen“ entfernt den Eintrag', async () => {
    const item = await linkedItem()
    const { user, onClose } = setup(EVENT, item)
    await startDelete(user)
    await user.click(screen.getByRole('radio', { name: 'Termin und Eintrag löschen' }))
    await confirm(user)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect((await listItems()).some((i) => i.id === item.id)).toBe(false)
  })

  it('bei Fehler: Meldung, Dialog bleibt, Eintrag bleibt verknüpft', async () => {
    calendar.deleteCalendarEvent.mockRejectedValue(new GoogleError('offline'))
    const item = await linkedItem()
    const { user, onClose } = setup(EVENT, item)
    await startDelete(user)
    await confirm(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Google ist nicht erreichbar')
    expect(onClose).not.toHaveBeenCalled()
    expect((await listItems()).find((i) => i.id === item.id)?.schedule).not.toBeNull()
  })
})

describe('EventDialog – verknüpfter Termin', () => {
  it('sperrt „Ganztägig“ mit Hinweis', async () => {
    const item = await linkedItem()
    setup(EVENT, item)
    expect(screen.getByLabelText('Ganztägig')).toBeDisabled()
    expect(screen.getByText('Mit Eintrag verknüpft – braucht eine Uhrzeit')).toBeInTheDocument()
  })

  it('lässt „Ganztägig“ bei nicht verknüpften Terminen zu', () => {
    setup()
    expect(screen.getByLabelText('Ganztägig')).toBeEnabled()
  })
})

describe('EventDialog – Eintrag öffnen', () => {
  it('bietet bei verknüpftem Termin „Eintrag öffnen“', async () => {
    const item = await linkedItem()
    const { user, onOpenItem } = setup(EVENT, item)
    await user.click(screen.getByRole('button', { name: 'Eintrag öffnen' }))
    expect(onOpenItem).toHaveBeenCalledWith(item)
  })
})
