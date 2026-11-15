import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Dialog } from '../../components/Dialog'
import form from '../../components/Form.module.css'
import type { Item } from '../../data/types'
import { getSeries } from '../../google/calendar'
import {
  affectsItem,
  createEvent,
  deleteEventAndLink,
  isLinkedDirectly,
  isLinkedToSeries,
  saveEvent,
  type SeriesScope,
} from '../../google/eventActions'
import {
  GoogleError,
  googleErrorMessage,
  type CalendarEvent,
  type SendUpdates,
} from '../../google/types'
import { formatDuration } from '../../lib/format'
import type { Recurrence } from '../../lib/recurrence'
import { clockLabel, dayFullLabel } from './dayLabels'
import {
  durationBetween,
  endTimeFor,
  formFromEvent,
  validateForm,
  valuesFromForm,
  type EventForm,
} from './eventForm'
import { RecurrenceFields } from './RecurrenceFields'
import { SeriesChoice } from './SeriesChoice'
import styles from './EventDialog.module.css'

interface DialogBase {
  /** Eintrag, zu dem der Termin (oder seine Serie) gehört. */
  item: Item | null
  onClose: () => void
  /** Nach erfolgreichem Speichern/Löschen (Kalender neu laden). */
  onSaved: () => void
  onOpenItem: (item: Item) => void
}

type EventDialogProps = DialogBase &
  (
    | { event: CalendarEvent; draft?: undefined }
    /** Neuer Termin mit Vorgaben. */
    | { event: null; draft: EventForm }
  )

const SERIES_NOTE =
  'Serientermin – beim Speichern wählst du, ob die Änderung nur diesen Termin oder die ganze Serie betrifft'
const SERIES_TIME_NOTE =
  'Uhrzeit und Dauer gelten für alle Termine der Serie; das Datum der Serie bleibt unverändert.'
const SERIES_RECURRENCE_NOTE =
  'Die Wiederholung lässt sich nur für die ganze Serie ändern – bei „Nur dieser Termin“ bleibt sie unverändert.'
const SERIES_DELETE_NOTE = 'Alle Termine der Serie werden gelöscht.'
const GENERIC_ERROR = 'Das hat nicht geklappt. Bitte versuche es erneut.'
const TIME = /^\d{2}:\d{2}$/

function durationOptions(current: number): number[] {
  const steps = Array.from({ length: 48 }, (_, i) => (i + 1) * 15)
  if (current > 0 && !steps.includes(current)) steps.push(current)
  return steps.sort((a, b) => a - b)
}

function failureMessage(error: unknown): string {
  return error instanceof GoogleError ? googleErrorMessage(error) : GENERIC_ERROR
}

function whenLabel(event: CalendarEvent): string {
  if (event.allDay) return dayFullLabel(event.start)
  return `${dayFullLabel(event.start.slice(0, 10))}, ${clockLabel(event.start)}–${clockLabel(event.end)}`
}

function OpenItemButton({ item, onOpenItem }: { item: Item; onOpenItem: (item: Item) => void }) {
  return (
    <button type="button" className={form.button} onClick={() => onOpenItem(item)}>
      Eintrag öffnen
    </button>
  )
}

function ReadOnlyDialog({
  event,
  item,
  onClose,
  onOpenItem,
}: DialogBase & { event: CalendarEvent }) {
  const note = formFromEvent(event).note
  const hint = event.organizerSelf === false ? 'Einladung – nur lesen' : 'Nur lesen'
  return (
    <Dialog title={event.title === '' ? '(ohne Titel)' : event.title} onClose={onClose}>
      <div className={form.form}>
        <p className={styles.notice} role="note">
          {hint}
        </p>
        <dl className={styles.facts}>
          <dt>Zeit</dt>
          <dd>{whenLabel(event)}</dd>
          {event.location && (
            <>
              <dt>Ort</dt>
              <dd>{event.location}</dd>
            </>
          )}
          {note && (
            <>
              <dt>Notiz</dt>
              <dd>{note}</dd>
            </>
          )}
        </dl>
        <div className={form.actions}>
          {item && <OpenItemButton item={item} onOpenItem={onOpenItem} />}
          <button type="button" className={`${form.button} ${form.primary}`} onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </Dialog>
  )
}

type Step = 'form' | 'options' | 'delete'

/** Zustand der Serie eines Vorkommens: lädt, geladen oder nicht ladbar. */
type SeriesState =
  | { status: 'loading' }
  | { status: 'ready'; series: CalendarEvent; recurrence: Recurrence }
  | { status: 'error' }

function EditDialog({
  event,
  initial,
  item,
  onClose,
  onSaved,
  onOpenItem,
}: DialogBase & { event: CalendarEvent | null; initial: EventForm }) {
  const [values, setValues] = useState<EventForm>(initial)
  const [step, setStep] = useState<Step>('form')
  const [notify, setNotify] = useState<SendUpdates>('none')
  const [deleteLinked, setDeleteLinked] = useState(false)
  const [scope, setScope] = useState<SeriesScope>('occurrence')
  const isOccurrence = event?.recurringEventId !== undefined
  const [seriesState, setSeriesState] = useState<SeriesState | null>(
    isOccurrence ? { status: 'loading' } : null,
  )
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const linked = event !== null && (isLinkedDirectly(event, item) || isLinkedToSeries(event, item))
  const linkedForDelete = event !== null && affectsItem(event, item, scope)
  const guests = event?.hasGuests === true
  const seriesReady = seriesState?.status === 'ready'
  const effectiveScope: SeriesScope = isOccurrence && seriesReady ? scope : 'occurrence'
  const recurrenceChanged =
    seriesState?.status === 'ready' &&
    JSON.stringify(values.recurrence) !== JSON.stringify(seriesState.recurrence)

  // Ein Vorkommen lädt seine Serie: sie liefert die Wiederholungsregel und die Serienzeit.
  const seriesId = event?.recurringEventId
  useEffect(() => {
    if (seriesId === undefined) return
    let cancelled = false
    getSeries(seriesId, { interactive: false }).then(
      (series) => {
        if (cancelled) return
        const recurrence = formFromEvent(series).recurrence
        setSeriesState({ status: 'ready', series, recurrence })
        setValues((prev) => ({ ...prev, recurrence }))
      },
      () => {
        if (!cancelled) setSeriesState({ status: 'error' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [seriesId])
  const change = (patch: Partial<EventForm>): void => setValues((prev) => ({ ...prev, ...patch }))

  const setDate = (date: string): void =>
    change({ date, endDate: date > values.endDate ? date : values.endDate })
  const setStart = (time: string): void => {
    if (!TIME.test(time)) return change({ time })
    if (values.duration > 0) change({ time, endTime: endTimeFor(time, values.duration) })
    else change({ time, duration: durationBetween(time, values.endTime) })
  }
  const setEnd = (endTime: string): void =>
    change({
      endTime,
      duration:
        TIME.test(endTime) && TIME.test(values.time) ? durationBetween(values.time, endTime) : 0,
    })
  const setDuration = (duration: number): void =>
    change({ duration, endTime: endTimeFor(values.time, duration) })

  // Sperre per Ref, damit ein Doppelklick sicher nur einen Aufruf auslöst.
  const run = async (action: () => Promise<void>): Promise<void> => {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setProblem(null)
    try {
      await action()
      onSaved()
      onClose()
    } catch (error) {
      setProblem(failureMessage(error))
    } finally {
      locked.current = false
      setBusy(false)
    }
  }

  const save = (sendUpdates: SendUpdates): Promise<void> =>
    run(() =>
      event
        ? saveEvent(event, valuesFromForm(values), {
            sendUpdates,
            item,
            scope: effectiveScope,
            series: seriesState?.status === 'ready' ? seriesState.series : null,
          })
        : createEvent(valuesFromForm(values)),
    )

  const onSubmit = (submitEvent: FormEvent): void => {
    submitEvent.preventDefault()
    const message = validateForm(values)
    setProblem(message)
    if (message !== null) return
    if (guests || isOccurrence) setStep('options')
    else void save('none')
  }

  const remove = (): Promise<void> =>
    run(async () => {
      if (!event) return
      await deleteEventAndLink(event, {
        sendUpdates: guests ? notify : 'none',
        item,
        deleteLinkedItem: linkedForDelete && deleteLinked,
        scope: effectiveScope,
      })
    })

  const back = (): void => {
    setStep('form')
    setProblem(null)
  }

  const guestChoice = (
    <fieldset className={styles.choice}>
      <legend>Gäste benachrichtigen?</legend>
      <label className={styles.option}>
        <input
          type="radio"
          name="notify"
          checked={notify === 'none'}
          onChange={() => setNotify('none')}
        />
        Nein
      </label>
      <label className={styles.option}>
        <input
          type="radio"
          name="notify"
          checked={notify === 'all'}
          onChange={() => setNotify('all')}
        />
        Ja
      </label>
    </fieldset>
  )

  return (
    <Dialog
      title={event ? 'Termin' : 'Neuer Termin'}
      initialFocus={event ? 'dialog' : 'first-field'}
      onClose={onClose}
    >
      <form className={form.form} onSubmit={onSubmit} noValidate>
        {event?.recurringEventId && (
          <p className={styles.notice} role="note">
            {SERIES_NOTE}
          </p>
        )}
        <label className={form.field}>
          Titel
          <input
            className={form.input}
            value={values.title}
            onChange={(e) => change({ title: e.target.value })}
            required
          />
        </label>
        <label className={form.check}>
          <input
            type="checkbox"
            checked={values.allDay}
            disabled={linked}
            onChange={(e) =>
              change({
                allDay: e.target.checked,
                endDate: values.endDate < values.date ? values.date : values.endDate,
              })
            }
          />
          Ganztägig
        </label>
        {linked && (
          <p className={styles.notice} role="note">
            Mit Eintrag verknüpft – braucht eine Uhrzeit
          </p>
        )}
        <label className={form.field}>
          {values.allDay ? 'Beginn (Datum)' : 'Datum'}
          <input
            className={form.input}
            type="date"
            value={values.date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        {values.allDay ? (
          <label className={form.field}>
            Ende (Datum)
            <input
              className={form.input}
              type="date"
              value={values.endDate}
              min={values.date}
              onChange={(e) => change({ endDate: e.target.value })}
            />
          </label>
        ) : (
          <div className={styles.times}>
            <label className={form.field}>
              Beginn
              <input
                className={form.input}
                type="time"
                value={values.time}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className={form.field}>
              Ende
              <input
                className={form.input}
                type="time"
                value={values.endTime}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
            <label className={form.field}>
              Dauer
              <select
                className={form.input}
                value={values.duration > 0 ? String(values.duration) : ''}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {values.duration <= 0 && (
                  <option value="" disabled>
                    –
                  </option>
                )}
                {durationOptions(values.duration).map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {formatDuration(minutes)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {isOccurrence && seriesState?.status === 'loading' && (
          <p className={styles.notice} role="status">
            Wiederholung wird geladen …
          </p>
        )}
        {isOccurrence && seriesState?.status === 'error' && (
          <p className={styles.notice} role="note">
            Wiederholung konnte nicht geladen werden – nur „Nur dieser Termin“ ist möglich.
          </p>
        )}
        {(!isOccurrence || seriesReady) && (
          <RecurrenceFields
            value={values.recurrence}
            date={values.date}
            onChange={(recurrence) => change({ recurrence })}
          />
        )}
        <label className={form.field}>
          Ort
          <input
            className={form.input}
            value={values.location}
            onChange={(e) => change({ location: e.target.value })}
          />
        </label>
        <label className={form.field}>
          Notiz
          <textarea
            className={form.input}
            rows={3}
            value={values.note}
            onChange={(e) => change({ note: e.target.value })}
          />
        </label>
        {problem && (
          <p className={form.error} role="alert">
            {problem}
          </p>
        )}
        {step === 'options' && (
          <>
            {isOccurrence && (
              <SeriesChoice scope={effectiveScope} onChange={setScope} seriesReady={seriesReady} />
            )}
            {effectiveScope === 'series' && (
              <p className={styles.notice} role="note">
                {SERIES_TIME_NOTE}
              </p>
            )}
            {effectiveScope === 'occurrence' && recurrenceChanged && (
              <p className={styles.notice} role="note">
                {SERIES_RECURRENCE_NOTE}
              </p>
            )}
            {guests && guestChoice}
            <div className={form.actions}>
              <button type="button" className={form.button} disabled={busy} onClick={back}>
                Zurück
              </button>
              <button
                type="button"
                className={`${form.button} ${form.primary}`}
                disabled={busy}
                onClick={() => void save(notify)}
              >
                Speichern
              </button>
            </div>
          </>
        )}
        {step === 'delete' && (
          <>
            {isOccurrence && (
              <SeriesChoice scope={effectiveScope} onChange={setScope} seriesReady={seriesReady} />
            )}
            {effectiveScope === 'series' && (
              <p className={styles.notice} role="note">
                {SERIES_DELETE_NOTE}
              </p>
            )}
            {linkedForDelete && (
              <fieldset className={styles.choice}>
                <legend>Verknüpfter Eintrag</legend>
                <label className={styles.option}>
                  <input
                    type="radio"
                    name="linked"
                    checked={!deleteLinked}
                    onChange={() => setDeleteLinked(false)}
                  />
                  Nur Termin löschen (Eintrag bleibt)
                </label>
                <label className={styles.option}>
                  <input
                    type="radio"
                    name="linked"
                    checked={deleteLinked}
                    onChange={() => setDeleteLinked(true)}
                  />
                  Termin und Eintrag löschen
                </label>
              </fieldset>
            )}
            {guests && guestChoice}
            <div className={form.actions} role="group" aria-label="Löschen bestätigen">
              <span>Termin wirklich löschen?</span>
              <button
                type="button"
                className={`${form.button} ${form.danger}`}
                disabled={busy}
                onClick={() => void remove()}
              >
                Endgültig löschen
              </button>
              <button type="button" className={form.button} disabled={busy} onClick={back}>
                Abbrechen
              </button>
            </div>
          </>
        )}
        {step === 'form' && (
          <div className={form.actions}>
            {event && (
              <button
                type="button"
                className={`${form.button} ${form.danger}`}
                onClick={() => setStep('delete')}
              >
                Löschen
              </button>
            )}
            {item && <OpenItemButton item={item} onOpenItem={onOpenItem} />}
            <button type="button" className={form.button} onClick={onClose}>
              Abbrechen
            </button>
            <button type="submit" className={`${form.button} ${form.primary}`} disabled={busy}>
              Speichern
            </button>
          </div>
        )}
      </form>
    </Dialog>
  )
}

/** Termin-Dialog (SPEC §6.7): bearbeitbare und neue Termine mit Feldern, Einladungen nur lesbar. */
export function EventDialog({ event, draft, ...rest }: EventDialogProps) {
  if (event === null) return <EditDialog event={null} initial={draft} {...rest} />
  if (event.editable === false) return <ReadOnlyDialog event={event} {...rest} />
  return <EditDialog event={event} initial={formFromEvent(event)} {...rest} />
}
