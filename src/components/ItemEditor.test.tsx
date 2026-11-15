import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { defaultCategories } from '../data/defaults'
import { resetDb } from '../data/localStore'
import { createItem, listItems } from '../data/repository'
import type { Item } from '../data/types'
import { GoogleError } from '../google/types'
import { ItemEditor } from './ItemEditor'

const calendar = vi.hoisted(() => ({
  deleteEvent: vi.fn(),
  patchCalendarEvent: vi.fn(),
  createEvent: vi.fn(),
  updateEventTime: vi.fn(),
  getEvent: vi.fn(),
}))
const auth = vi.hoisted(() => ({
  wasConnected: vi.fn(),
  loadGoogleScript: vi.fn(),
}))
vi.mock('../google/calendar', () => calendar)
vi.mock('../google/auth', () => auth)

beforeEach(async () => {
  calendar.deleteEvent.mockReset().mockResolvedValue(undefined)
  calendar.patchCalendarEvent.mockReset().mockResolvedValue({})
  calendar.createEvent.mockReset().mockResolvedValue('neu')
  calendar.updateEventTime.mockReset().mockResolvedValue(undefined)
  calendar.getEvent
    .mockReset()
    .mockResolvedValue({ id: 'ev', title: '', start: '', end: '', allDay: false })
  auth.wasConnected.mockReset().mockReturnValue(true)
  auth.loadGoogleScript.mockReset().mockResolvedValue({})
  await resetDb(true)
})
afterAll(() => resetDb(true))

const { categories } = defaultCategories()

async function setup(onClose = vi.fn(), withEvent = false) {
  const item: Item = await createItem({
    type: 'aufgabe',
    title: 'Alt',
    categoryId: 'privat',
    durationMin: 30,
    ...(withEvent
      ? {
          schedule: { start: '2026-12-01T10:00:00+01:00', durationMin: 30, calendarEventId: 'ev1' },
        }
      : {}),
  })
  render(<ItemEditor item={item} categories={categories} onClose={onClose} />)
  return { item, onClose }
}

describe('ItemEditor', () => {
  it('öffnet ohne Fokus in einem Eingabefeld (keine Tastatur)', async () => {
    await setup()
    expect(screen.getByRole('dialog')).toHaveFocus()
    expect(screen.getByLabelText('Titel')).not.toHaveFocus()
  })

  it('speichert Änderungen', async () => {
    const user = userEvent.setup()
    const { onClose } = await setup()
    const title = screen.getByLabelText('Titel')
    await user.clear(title)
    await user.type(title, 'Neu')
    await user.type(screen.getByLabelText('Notizen'), 'Hinweis')
    await user.click(screen.getByLabelText('Wichtig'))
    await user.selectOptions(screen.getByLabelText('Dauer'), '45')
    await user.selectOptions(screen.getByLabelText('Ablage'), 'arbeit')
    await user.selectOptions(screen.getByLabelText('Art'), 'notiz')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const [saved] = await listItems()
    expect(saved).toMatchObject({
      title: 'Neu',
      notes: 'Hinweis',
      important: true,
      durationMin: 45,
      categoryId: 'arbeit',
      type: 'notiz',
    })
  })

  it('erlaubt leere Dauer', async () => {
    const user = userEvent.setup()
    const { onClose } = await setup()
    await user.selectOptions(screen.getByLabelText('Dauer'), '')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect((await listItems())[0].durationMin).toBeNull()
  })

  it('kann mit leerem Titel nicht gespeichert werden', async () => {
    const user = userEvent.setup()
    await setup()
    await user.clear(screen.getByLabelText('Titel'))
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled()
  })

  it('löscht erst nach Rückfrage', async () => {
    const user = userEvent.setup()
    const { onClose } = await setup()
    await user.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(await listItems()).toHaveLength(1)
    expect(screen.getByText('Wirklich löschen?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(await listItems()).toHaveLength(0)
  })

  it('Abbrechen bei der Rückfrage löscht nicht', async () => {
    const user = userEvent.setup()
    await setup()
    await user.click(screen.getByRole('button', { name: 'Löschen' }))
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(await listItems()).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument()
  })

  it('Rückfrage ohne Termin nennt keinen Google-Termin und ruft Google nicht auf', async () => {
    const user = userEvent.setup()
    const { onClose } = await setup()
    await user.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(screen.queryByText('Eintrag und Google-Termin löschen?')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calendar.deleteEvent).not.toHaveBeenCalled()
  })

  it('löscht bei einem Termin erst den Google-Termin, dann den Eintrag', async () => {
    const user = userEvent.setup()
    const { onClose } = await setup(vi.fn(), true)
    await user.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(screen.getByText('Eintrag und Google-Termin löschen?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calendar.deleteEvent).toHaveBeenCalledWith('ev1')
    expect(await listItems()).toHaveLength(0)
  })

  it('ohne Verbindung: „Mit Google verbinden und löschen“ löscht beides', async () => {
    auth.wasConnected.mockReturnValue(false)
    const user = userEvent.setup()
    const { onClose } = await setup(vi.fn(), true)
    await user.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(screen.queryByRole('button', { name: 'Endgültig löschen' })).not.toBeInTheDocument()
    expect(auth.loadGoogleScript).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Mit Google verbinden und löschen' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calendar.deleteEvent).toHaveBeenCalledWith('ev1')
    expect(await listItems()).toHaveLength(0)
  })

  it('offline: Meldung, „Nur Eintrag löschen“ löscht lokal', async () => {
    calendar.deleteEvent.mockRejectedValue(new GoogleError('offline'))
    const user = userEvent.setup()
    const { onClose } = await setup(vi.fn(), true)
    await user.click(screen.getByRole('button', { name: 'Löschen' }))
    await user.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
    expect(
      await screen.findByText('Offline – der Google-Termin kann gerade nicht gelöscht werden.'),
    ).toBeInTheDocument()
    expect(await listItems()).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Nur Eintrag löschen (Termin bleibt)' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(await listItems()).toHaveLength(0)
  })

  it('Google-Fehler: Meldung, „Abbrechen“ löscht nichts', async () => {
    calendar.deleteEvent.mockRejectedValue(new GoogleError('server'))
    const user = userEvent.setup()
    const { onClose } = await setup(vi.fn(), true)
    await user.click(screen.getByRole('button', { name: 'Löschen' }))
    await user.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
    expect(
      await screen.findByText('Google hat einen Fehler gemeldet. Bitte versuche es später erneut.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(await listItems()).toHaveLength(1)
  })

  it('Ablage und Art ändern lassen den Termin unberührt (kein Google-Aufruf)', async () => {
    const user = userEvent.setup()
    const { onClose } = await setup(vi.fn(), true)
    await user.selectOptions(screen.getByLabelText('Ablage'), 'arbeit')
    await user.selectOptions(screen.getByLabelText('Art'), 'notiz')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calendar.deleteEvent).not.toHaveBeenCalled()
    expect((await listItems())[0].schedule?.calendarEventId).toBe('ev1')
  })

  it('Doppelklick auf „Endgültig löschen“ löscht nur einmal', async () => {
    let release: () => void = () => undefined
    calendar.deleteEvent.mockReturnValue(new Promise<void>((resolve) => (release = resolve)))
    const user = userEvent.setup()
    await setup(vi.fn(), true)
    await user.click(screen.getByRole('button', { name: 'Löschen' }))
    const confirm = screen.getByRole('button', { name: 'Endgültig löschen' })
    await user.dblClick(confirm)
    expect(confirm).toBeDisabled()
    release()
    await waitFor(async () => expect(await listItems()).toHaveLength(0))
    expect(calendar.deleteEvent).toHaveBeenCalledTimes(1)
  })

  it('Titeländerung eines Eintrags mit Termin ändert den Google-Titel (ohne Gäste-Mail)', async () => {
    const user = userEvent.setup()
    const { onClose } = await setup(vi.fn(), true)
    const title = screen.getByLabelText('Titel')
    await user.clear(title)
    await user.type(title, 'Neu')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calendar.patchCalendarEvent).toHaveBeenCalledWith(
      'ev1',
      { title: 'Neu' },
      { sendUpdates: 'none', interactive: false },
    )
  })

  it('ohne Titeländerung kein Google-Aufruf', async () => {
    const user = userEvent.setup()
    const { onClose } = await setup(vi.fn(), true)
    await user.type(screen.getByLabelText('Notizen'), 'x')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
  })

  it('ohne Verbindung: Eintrag wird gespeichert, Hinweis statt Schließen', async () => {
    auth.wasConnected.mockReturnValue(false)
    const user = userEvent.setup()
    const { onClose } = await setup(vi.fn(), true)
    const title = screen.getByLabelText('Titel')
    await user.clear(title)
    await user.type(title, 'Neu')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Termintitel in Google blieb unverändert',
    )
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
    expect((await listItems())[0].title).toBe('Neu')
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('Google-Fehler beim Titel: Hinweis, Eintrag trotzdem gespeichert', async () => {
    calendar.patchCalendarEvent.mockRejectedValue(new GoogleError('offline'))
    const user = userEvent.setup()
    await setup(vi.fn(), true)
    const title = screen.getByLabelText('Titel')
    await user.clear(title)
    await user.type(title, 'Neu')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Google ist nicht erreichbar')
    expect((await listItems())[0].title).toBe('Neu')
  })

  describe('Termin-Abschnitt', () => {
    it('zeigt ohne Termin nur „Dauer“, mit Termin Datum, Startzeit und Dauer aus schedule', async () => {
      await setup()
      expect(screen.queryByRole('group', { name: 'Termin' })).not.toBeInTheDocument()
      expect(screen.getByLabelText('Dauer')).toHaveValue('30')
    })

    it('belegt Datum, Startzeit und Dauer aus schedule vor', async () => {
      await setup(vi.fn(), true)
      expect(screen.getByRole('group', { name: 'Termin' })).toBeInTheDocument()
      expect(await screen.findByLabelText('Datum')).toHaveValue('2026-12-01')
      expect(screen.getByLabelText('Startzeit')).toHaveValue('10:00')
      expect(screen.getByLabelText('Dauer')).toHaveValue('30')
    })

    it('verschiebt den Google-Termin und setzt schedule und Dauer', async () => {
      const user = userEvent.setup()
      const { onClose, item } = await setup(vi.fn(), true)
      fireEvent.change(await screen.findByLabelText('Datum'), { target: { value: '2026-12-02' } })
      fireEvent.change(screen.getByLabelText('Startzeit'), { target: { value: '14:15' } })
      await user.selectOptions(screen.getByLabelText('Dauer'), '90')
      await user.click(screen.getByRole('button', { name: 'Speichern' }))
      await waitFor(() => expect(onClose).toHaveBeenCalled())
      expect(calendar.updateEventTime).toHaveBeenCalledWith('ev1', '2026-12-02T14:15:00+01:00', 90)
      const saved = (await listItems()).find((i) => i.id === item.id)
      expect(saved?.schedule).toEqual({
        start: '2026-12-02T14:15:00+01:00',
        durationMin: 90,
        calendarEventId: 'ev1',
      })
      expect(saved?.durationMin).toBe(90)
    })

    it('ohne Zeitänderung kein Google-Aufruf', async () => {
      const user = userEvent.setup()
      const { onClose } = await setup(vi.fn(), true)
      await user.type(screen.getByLabelText('Notizen'), 'x')
      await user.click(screen.getByRole('button', { name: 'Speichern' }))
      await waitFor(() => expect(onClose).toHaveBeenCalled())
      expect(calendar.updateEventTime).not.toHaveBeenCalled()
      expect(calendar.createEvent).not.toHaveBeenCalled()
    })

    it('Fehler: Felder werden gespeichert, Zeit bleibt, Hinweis erscheint', async () => {
      calendar.updateEventTime.mockRejectedValue(new GoogleError('offline'))
      const user = userEvent.setup()
      const { onClose, item } = await setup(vi.fn(), true)
      await user.type(screen.getByLabelText('Notizen'), 'Neu')
      fireEvent.change(screen.getByLabelText('Startzeit'), { target: { value: '11:00' } })
      await user.click(screen.getByRole('button', { name: 'Speichern' }))
      expect(await screen.findByRole('status')).toHaveTextContent(
        'Die Terminzeit blieb unverändert: Google ist nicht erreichbar',
      )
      expect(onClose).not.toHaveBeenCalled()
      const saved = (await listItems()).find((i) => i.id === item.id)
      expect(saved?.notes).toBe('Neu')
      expect(saved?.schedule?.start).toBe('2026-12-01T10:00:00+01:00')
    })

    it('ohne Verbindung: Termin nur lesbar mit Hinweis, kein Google-Aufruf, Zeit unverändert', async () => {
      auth.wasConnected.mockReturnValue(false)
      const user = userEvent.setup()
      const { item } = await setup(vi.fn(), true)
      expect(await screen.findByText(/Prüfung auf Serientermin ist nicht möglich/)).toBeVisible()
      expect(screen.queryByLabelText('Startzeit')).not.toBeInTheDocument()
      await user.type(screen.getByLabelText('Notizen'), 'x')
      await user.click(screen.getByRole('button', { name: 'Speichern' }))
      await waitFor(async () => expect((await listItems())[0].notes).toBe('x'))
      expect(calendar.updateEventTime).not.toHaveBeenCalled()
      expect((await listItems()).find((i) => i.id === item.id)?.schedule?.start).toBe(
        '2026-12-01T10:00:00+01:00',
      )
    })
  })
})

describe('ItemEditor – Eintrag hängt an einer Serie', () => {
  const SERIES_EVENT = {
    id: 'ev1',
    title: 'Vorlesung',
    start: '',
    end: '',
    allDay: false,
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
  }
  const waitForSeriesNote = () => screen.findByText('Serientermin – im Kalender bearbeiten')

  beforeEach(() => {
    calendar.getEvent.mockResolvedValue(SERIES_EVENT)
  })

  it('zeigt den Abschnitt „Termin“ nur lesbar mit Hinweis', async () => {
    await setup(vi.fn(), true)
    await waitForSeriesNote()
    expect(screen.getByRole('group', { name: 'Termin' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Startzeit')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Datum')).not.toBeInTheDocument()
    expect(calendar.getEvent).toHaveBeenCalledWith('ev1', { interactive: false })
  })

  it('Titeländerung speichert den Eintrag, ändert aber die Serie nicht', async () => {
    const user = userEvent.setup()
    await setup(vi.fn(), true)
    await waitForSeriesNote()
    const title = screen.getByLabelText('Titel')
    await user.clear(title)
    await user.type(title, 'Neu')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Der Termintitel in Google blieb unverändert: Serientermin',
    )
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
    expect((await listItems())[0].title).toBe('Neu')
  })

  it('Speichern ohne Titeländerung ruft weder PATCH noch Verschieben auf', async () => {
    const user = userEvent.setup()
    const { onClose } = await setup(vi.fn(), true)
    await waitForSeriesNote()
    await user.type(screen.getByLabelText('Notizen'), 'x')
    await user.click(screen.getByRole('button', { name: 'Speichern' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calendar.patchCalendarEvent).not.toHaveBeenCalled()
    expect(calendar.updateEventTime).not.toHaveBeenCalled()
    expect(calendar.createEvent).not.toHaveBeenCalled()
  })

  it('Löschen: nur der Eintrag, die Serie im Kalender bleibt (mit Hinweis in der Rückfrage)', async () => {
    const user = userEvent.setup()
    const { onClose } = await setup(vi.fn(), true)
    await waitForSeriesNote()
    await user.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(
      screen.getByText('Eintrag löschen? Die Serie im Google-Kalender bleibt bestehen.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calendar.deleteEvent).not.toHaveBeenCalled()
    expect(await listItems()).toHaveLength(0)
  })

  it('Prüfung fehlgeschlagen (offline): Termin nur lesbar, Löschtext neutral, Serie bleibt unberührt', async () => {
    calendar.getEvent.mockRejectedValue(new GoogleError('offline'))
    const user = userEvent.setup()
    const { onClose } = await setup(vi.fn(), true)
    expect(await screen.findByText(/Prüfung auf Serientermin ist nicht möglich/)).toBeVisible()
    expect(screen.queryByLabelText('Startzeit')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(
      screen.getByText(
        'Eintrag löschen? Der Google-Termin wird nur gelöscht, wenn er keine Serie ist.',
      ),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Endgültig löschen' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Offline')
    expect(calendar.deleteEvent).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Prüfung läuft noch: Termin nur lesbar, Löschtext neutral', async () => {
    let resolve: (event: unknown) => void = () => undefined
    calendar.getEvent.mockReturnValue(new Promise((r) => (resolve = r)))
    const user = userEvent.setup()
    await setup(vi.fn(), true)
    expect(screen.getByText('Termin wird geprüft …')).toBeInTheDocument()
    expect(screen.queryByLabelText('Startzeit')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(
      screen.getByText(/Der Google-Termin wird nur gelöscht, wenn er keine Serie ist/),
    ).toBeInTheDocument()
    resolve(SERIES_EVENT)
  })
})
