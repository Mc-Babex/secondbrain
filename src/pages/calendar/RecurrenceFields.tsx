import form from '../../components/Form.module.css'
import {
  WEEKDAYS,
  weekdayOf,
  type Recurrence,
  type RepeatEnd,
  type RepeatFreq,
  type Weekday,
} from '../../lib/recurrence'
import styles from './EventDialog.module.css'

const FREQ_LABELS: Record<RepeatFreq, string> = {
  none: 'Keine',
  daily: 'Täglich',
  weekly: 'Wöchentlich',
  biweekly: 'Alle 2 Wochen',
  monthly: 'Monatlich',
}

const DAY_LABELS: Record<Weekday, string> = {
  MO: 'Mo',
  TU: 'Di',
  WE: 'Mi',
  TH: 'Do',
  FR: 'Fr',
  SA: 'Sa',
  SU: 'So',
}

const END_LABELS: Record<RepeatEnd['type'], string> = {
  never: 'Nie',
  until: 'Bis Datum',
  count: 'Nach Anzahl',
}

export const CUSTOM_RECURRENCE_TEXT = 'Wiederholung: benutzerdefiniert'
const DEFAULT_COUNT = 10

interface RecurrenceFieldsProps {
  value: Recurrence
  /** Beginn des Termins `YYYY-MM-DD` (Vorgabe für Wochentag und Enddatum). */
  date: string
  onChange: (value: Recurrence) => void
}

/** Abschnitt „Wiederholung“ des Termin-Dialogs (SPEC §6.7). */
export function RecurrenceFields({ value, date, onChange }: RecurrenceFieldsProps) {
  if (value.freq === 'custom') {
    return (
      <p className={styles.notice} role="note">
        {CUSTOM_RECURRENCE_TEXT}
      </p>
    )
  }
  const start = date.length === 10 ? date : '1970-01-01'
  const effectiveDays = value.weekdays.length > 0 ? value.weekdays : [weekdayOf(start)]
  const repeating = value.freq !== 'none'
  const weekly = value.freq === 'weekly' || value.freq === 'biweekly'

  const setFreq = (freq: RepeatFreq): void =>
    onChange({
      ...value,
      freq,
      weekdays: freq === 'weekly' || freq === 'biweekly' ? value.weekdays : [],
      end: freq === 'none' ? { type: 'never' } : value.end,
    })
  const toggleDay = (day: Weekday): void => {
    const next = effectiveDays.includes(day)
      ? effectiveDays.filter((d) => d !== day)
      : [...effectiveDays, day]
    if (next.length === 0) return
    onChange({ ...value, weekdays: WEEKDAYS.filter((d) => next.includes(d)) })
  }
  const setEndType = (type: RepeatEnd['type']): void =>
    onChange({
      ...value,
      end:
        type === 'until'
          ? { type, date: start }
          : type === 'count'
            ? { type, count: DEFAULT_COUNT }
            : { type },
    })

  return (
    <>
      <label className={form.field}>
        Wiederholung
        <select
          className={form.input}
          value={value.freq}
          onChange={(e) => setFreq(e.target.value as RepeatFreq)}
        >
          {Object.entries(FREQ_LABELS).map(([freq, label]) => (
            <option key={freq} value={freq}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {weekly && (
        <div className={styles.weekdays} role="group" aria-label="Wochentage">
          {WEEKDAYS.map((day) => (
            <label key={day} className={styles.weekday}>
              <input
                type="checkbox"
                checked={effectiveDays.includes(day)}
                onChange={() => toggleDay(day)}
              />
              {DAY_LABELS[day]}
            </label>
          ))}
        </div>
      )}
      {repeating && (
        <>
          <label className={form.field}>
            Wiederholung endet
            <select
              className={form.input}
              value={value.end.type}
              onChange={(e) => setEndType(e.target.value as RepeatEnd['type'])}
            >
              {Object.entries(END_LABELS).map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {value.end.type === 'until' && (
            <label className={form.field}>
              Letzter Tag
              <input
                className={form.input}
                type="date"
                value={value.end.date}
                min={start}
                onChange={(e) =>
                  onChange({ ...value, end: { type: 'until', date: e.target.value } })
                }
              />
            </label>
          )}
          {value.end.type === 'count' && (
            <label className={form.field}>
              Anzahl Termine
              <input
                className={form.input}
                type="number"
                min={1}
                step={1}
                value={Number.isNaN(value.end.count) ? '' : value.end.count}
                onChange={(e) =>
                  onChange({ ...value, end: { type: 'count', count: e.target.valueAsNumber } })
                }
              />
            </label>
          )}
        </>
      )}
    </>
  )
}
