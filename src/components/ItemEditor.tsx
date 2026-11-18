import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useProjects } from '../data/hooks'
import { assignItemToProject, deleteItem, updateItem } from '../data/repository'
import type { Category, Item, ItemType } from '../data/types'
import { loadGoogleScript, wasConnected } from '../google/auth'
import {
  deleteEventErrorMessage,
  deleteItemWithEvent,
  hasCalendarEvent,
  moveItemEvent,
} from '../google/itemEvents'
import { renameLinkedEvent } from '../google/eventActions'
import { isSeriesEvent, SERIES_HINT } from '../google/seriesGuard'
import { GoogleError } from '../google/types'
import { formatDateTime, formatDuration } from '../lib/format'
import { timeToMinutes, zonedToDate } from '../lib/planning'
import { toIso, zonedParts } from '../lib/time'
import { Dialog } from './Dialog'
import { GtdFields } from './GtdFields'
import { SkipSeriesButton } from './SkipSeriesButton'
import { gtdFields, gtdFormFromItem, projectAfterCategoryChange, type GtdForm } from './gtdForm'
import form from './Form.module.css'
import styles from './ItemEditor.module.css'

interface ItemEditorProps {
  item: Item
  categories: Category[]
  onClose: () => void
}

const TYPE_LABELS: Record<ItemType, string> = {
  aufgabe: 'Aufgabe',
  notiz: 'Notiz',
  termin: 'Termin',
}

/** Dauer-Auswahl in 15-Minuten-Schritten (bis 8 Std.); ein abweichender Bestandswert bleibt wählbar. */
function durationOptions(current: number | null): number[] {
  const steps = Array.from({ length: 32 }, (_, i) => (i + 1) * 15)
  if (current !== null && !steps.includes(current)) steps.push(current)
  return steps.sort((a, b) => a - b)
}

const pad = (n: number): string => String(n).padStart(2, '0')
const KEEP_OPEN = 'keep-open'

/** Datum `YYYY-MM-DD` und Uhrzeit `HH:MM` (Berlin) eines Zeitpunkts. */
function dateAndTime(iso: string): { date: string; time: string } {
  const p = zonedParts(new Date(iso))
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  }
}

/** ISO-Zeitpunkt aus Datum und Uhrzeit oder `null`, wenn eines ungültig ist. */
function toStart(date: string, time: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match || !/^\d{2}:\d{2}$/.test(time)) return null
  return toIso(
    zonedToDate(Number(match[1]), Number(match[2]), Number(match[3]), 0, timeToMinutes(time)),
  )
}

/** Dialog zum Bearbeiten (und Löschen) eines Eintrags. */
export function ItemEditor({ item, categories, onClose }: ItemEditorProps) {
  const [title, setTitle] = useState(item.title)
  const [notes, setNotes] = useState(item.notes)
  const [gtdForm, setGtdForm] = useState<GtdForm>(() => gtdFormFromItem(item))
  const projects = useProjects()
  const { duration } = gtdForm
  const patchGtd = (patch: Partial<GtdForm>): void => setGtdForm((prev) => ({ ...prev, ...patch }))
  const schedule = item.schedule
  const [when] = useState(() => (schedule ? dateAndTime(schedule.start) : null))
  const [date, setDate] = useState(when?.date ?? '')
  const [time, setTime] = useState(when?.time ?? '')
  const [slotDuration, setSlotDuration] = useState(schedule?.durationMin ?? 0)
  const [categoryId, setCategoryId] = useState(item.categoryId)
  const [type, setType] = useState<ItemType>(item.type)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const deleting = useRef(false)
  const [needsConnect, setNeedsConnect] = useState(false)
  const [deleteProblem, setDeleteProblem] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Der Termin ist hier erst bearbeitbar, wenn feststeht, dass er keine Serie ist (die Serie wird nie von
  // hier aus geändert); solange die Prüfung läuft oder fehlschlägt, ist er nur lesbar.
  const eventId = schedule?.calendarEventId
  const [seriesCheck, setSeriesCheck] = useState<'checking' | 'series' | 'plain' | 'failed'>(() =>
    !eventId ? 'plain' : wasConnected() ? 'checking' : 'failed',
  )

  useEffect(() => {
    if (!eventId || !wasConnected()) return
    let cancelled = false
    isSeriesEvent(eventId, { interactive: false }).then(
      (isSeries) => {
        if (!cancelled) setSeriesCheck(isSeries ? 'series' : 'plain')
      },
      () => {
        if (!cancelled) setSeriesCheck('failed')
      },
    )
    return () => {
      cancelled = true
    }
  }, [eventId])

  // Ablage des Eintrags bleibt wählbar, auch wenn sie unbekannt oder das Archiv ist.
  const choices = categories.filter((c) => c.kind !== 'archiv' || c.id === item.categoryId)
  const knownCategory = choices.some((c) => c.id === item.categoryId)

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    try {
      setError(null)
      if ((await action()) !== KEEP_OPEN) onClose()
    } catch {
      setError('Das hat nicht geklappt. Bitte versuche es erneut.')
    }
  }

  const hasEvent = hasCalendarEvent(item)

  const openDeleteConfirm = (): void => {
    const connect = hasEvent && !wasConnected()
    // Skript vorladen, damit das Anmeldefenster direkt aus dem Klick geöffnet werden kann.
    if (connect) loadGoogleScript().catch(() => undefined)
    setNeedsConnect(connect)
    setDeleteProblem(null)
    setConfirmDelete(true)
  }

  const cancelDelete = (): void => {
    setConfirmDelete(false)
    setDeleteProblem(null)
  }

  const onDelete = async (): Promise<void> => {
    if (deleting.current) return
    deleting.current = true
    setBusy(true)
    setError(null)
    try {
      await deleteItemWithEvent(item)
      onClose()
    } catch (caught) {
      if (hasEvent && caught instanceof GoogleError)
        setDeleteProblem(deleteEventErrorMessage(caught))
      else setError('Das hat nicht geklappt. Bitte versuche es erneut.')
    } finally {
      deleting.current = false
      setBusy(false)
    }
  }

  const changeCategory = (id: string): void => {
    setCategoryId(id)
    setGtdForm((prev) => ({
      ...prev,
      projectId: projectAfterCategoryChange(prev.projectId, id, projects),
    }))
  }

  // Eine Notiz oder ein Termin ist kein Projekt-Schritt: die Zuordnung entfällt (gtd/waiting/dueDate bleiben).
  const detachFromProject = type !== 'aufgabe' && typeof item.projectId === 'string'
  const projectChanged = type === 'aufgabe' && gtdForm.projectId !== (item.projectId ?? '')

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault()
    const newTitle = title.trim()
    if (newTitle === '') return
    let newStart: string | null = null
    if (schedule) {
      newStart = toStart(date, time)
      if (newStart === null) {
        setError('Bitte Datum und Uhrzeit angeben.')
        return
      }
    }
    const moved =
      schedule !== null &&
      newStart !== null &&
      (Date.parse(newStart) !== Date.parse(schedule.start) || slotDuration !== schedule.durationMin)
    void run(async () => {
      await updateItem(item.id, {
        title: newTitle,
        notes,
        important: gtdForm.important,
        ...(schedule ? {} : { durationMin: duration === '' ? null : Number(duration) }),
        categoryId,
        type,
        ...(type === 'aufgabe' ? gtdFields(gtdForm) : {}),
        ...(detachFromProject ? { projectId: null, projectOrder: undefined } : {}),
      })
      if (projectChanged) {
        await assignItemToProject(item.id, gtdForm.projectId === '' ? null : gtdForm.projectId)
      }
      // Titel und Zeit gelten auch für den Google-Termin (SPEC §6.6); Fehler dort verhindern das Speichern nicht.
      const hints: string[] = []
      const renamed = newTitle === item.title ? null : await renameLinkedEvent(item, newTitle)
      if (renamed !== null) hints.push(`Der Termintitel in Google blieb unverändert: ${renamed}`)
      if (moved && newStart !== null) {
        const moveHint = await moveItemEvent({ ...item, title: newTitle }, newStart, slotDuration)
        if (moveHint !== null) hints.push(`Die Terminzeit blieb unverändert: ${moveHint}`)
      }
      if (hints.length > 0) {
        setNotice(`Eintrag gespeichert. ${hints.join(' ')}`)
        return KEEP_OPEN
      }
    })
  }

  return (
    <Dialog title="Eintrag bearbeiten" onClose={onClose}>
      <form className={form.form} onSubmit={onSubmit}>
        <label className={form.field}>
          Titel
          <input
            className={form.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>
        <label className={form.field}>
          Notizen
          <textarea
            className={form.input}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {type === 'aufgabe' && (
          <GtdFields
            value={gtdForm}
            onChange={patchGtd}
            categoryId={categoryId}
            projects={projects}
            scheduleStart={schedule?.start ?? null}
            hideDuration={schedule !== null}
          />
        )}
        {type === 'aufgabe' && <SkipSeriesButton item={item} />}
        {schedule && seriesCheck !== 'plain' ? (
          <fieldset className={styles.slot}>
            <legend>Termin</legend>
            <p>
              {formatDateTime(schedule.start)} · {formatDuration(schedule.durationMin)}
            </p>
            <p role="note">
              {seriesCheck === 'series'
                ? SERIES_HINT
                : seriesCheck === 'checking'
                  ? 'Termin wird geprüft …'
                  : 'Termin nur lesbar – die Prüfung auf Serientermin ist nicht möglich.'}
            </p>
          </fieldset>
        ) : schedule ? (
          <fieldset className={styles.slot}>
            <legend>Termin</legend>
            <label className={form.field}>
              Datum
              <input
                className={form.input}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className={form.field}>
              Startzeit
              <input
                className={form.input}
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
            <label className={form.field}>
              Dauer
              <select
                className={form.input}
                value={slotDuration}
                onChange={(e) => setSlotDuration(Number(e.target.value))}
              >
                {durationOptions(schedule.durationMin).map((m) => (
                  <option key={m} value={m}>
                    {formatDuration(m)}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        ) : type === 'aufgabe' ? null : (
          <label className={form.field}>
            Dauer
            <select
              className={form.input}
              value={duration}
              onChange={(e) => patchGtd({ duration: e.target.value })}
            >
              <option value="">Keine Angabe</option>
              {durationOptions(item.durationMin).map((m) => (
                <option key={m} value={m}>
                  {formatDuration(m)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={form.field}>
          Ablage
          <select
            className={form.input}
            value={categoryId}
            onChange={(e) => changeCategory(e.target.value)}
          >
            {!knownCategory && <option value={item.categoryId}>Ohne Ablage</option>}
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={form.field}>
          Art
          <select
            className={form.input}
            value={type}
            onChange={(e) => setType(e.target.value as ItemType)}
          >
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className={form.error} role="alert">
            {error}
          </p>
        )}
        {notice !== null ? (
          <>
            <p role="status">{notice}</p>
            <div className={form.actions}>
              <button type="button" className={`${form.button} ${form.primary}`} onClick={onClose}>
                Schließen
              </button>
            </div>
          </>
        ) : confirmDelete && deleteProblem !== null ? (
          <div className={form.actions} role="group" aria-label="Termin nicht gelöscht">
            <p className={form.error} role="alert">
              {deleteProblem}
            </p>
            <button
              type="button"
              className={`${form.button} ${form.danger}`}
              onClick={() => void run(() => deleteItem(item.id))}
            >
              Nur Eintrag löschen (Termin bleibt)
            </button>
            <button type="button" className={form.button} onClick={cancelDelete}>
              Abbrechen
            </button>
          </div>
        ) : confirmDelete ? (
          <div className={form.actions} role="group" aria-label="Löschen bestätigen">
            <span>
              {!hasEvent
                ? 'Wirklich löschen?'
                : seriesCheck === 'plain'
                  ? 'Eintrag und Google-Termin löschen?'
                  : seriesCheck === 'series'
                    ? 'Eintrag löschen? Die Serie im Google-Kalender bleibt bestehen.'
                    : 'Eintrag löschen? Der Google-Termin wird nur gelöscht, wenn er keine Serie ist.'}
            </span>
            <button
              type="button"
              className={`${form.button} ${form.danger}`}
              disabled={busy}
              onClick={() => void onDelete()}
            >
              {needsConnect ? 'Mit Google verbinden und löschen' : 'Endgültig löschen'}
            </button>
            <button type="button" className={form.button} onClick={cancelDelete}>
              Abbrechen
            </button>
          </div>
        ) : (
          <div className={form.actions}>
            <button
              type="button"
              className={`${form.button} ${form.danger}`}
              onClick={openDeleteConfirm}
            >
              Löschen
            </button>
            <button type="button" className={form.button} onClick={onClose}>
              Abbrechen
            </button>
            <button
              type="submit"
              className={`${form.button} ${form.primary}`}
              disabled={title.trim() === ''}
            >
              Speichern
            </button>
          </div>
        )}
      </form>
    </Dialog>
  )
}
