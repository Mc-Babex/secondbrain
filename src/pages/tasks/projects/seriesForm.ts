import type { SeriesFields } from '../../../data/repository'
import type { StepSeries } from '../../../data/types'

export type EndMode = 'none' | 'date' | 'count'

/** Eingaben des Serien-Dialogs als Text, so wie sie in den Feldern stehen. */
export interface SeriesForm {
  titlePattern: string
  every: string
  weekday: string
  startDate: string
  endMode: EndMode
  endDate: string
  count: string
  /** `''` = ohne Fälligkeit. */
  dueWeekday: string
  /** `''` = ohne Dauer. */
  durationMin: string
}

export function emptySeriesForm(today: string): SeriesForm {
  return {
    titlePattern: '',
    every: '1',
    weekday: '1',
    startDate: today,
    endMode: 'none',
    endDate: '',
    count: '',
    dueWeekday: '',
    durationMin: '',
  }
}

export function seriesFormOf(series: StepSeries): SeriesForm {
  return {
    titlePattern: series.titlePattern,
    every: String(series.every),
    weekday: String(series.weekday),
    startDate: series.startDate,
    endMode: series.endDate !== null ? 'date' : series.count !== null ? 'count' : 'none',
    endDate: series.endDate ?? '',
    count: series.count === null ? '' : String(series.count),
    dueWeekday: series.dueWeekday === null ? '' : String(series.dueWeekday),
    durationMin: series.durationMin === null ? '' : String(series.durationMin),
  }
}

/** Erste Fehlermeldung (deutsch) oder `null`, wenn die Eingaben gültig sind. */
export function validateSeriesForm(form: SeriesForm): string | null {
  if (form.titlePattern.trim() === '') return 'Bitte ein Titelmuster eingeben.'
  if (form.startDate === '') return 'Bitte ein Startdatum wählen.'
  if (form.endMode === 'date') {
    if (form.endDate === '') return 'Bitte ein Enddatum wählen.'
    if (form.endDate < form.startDate) return 'Das Enddatum liegt vor dem Startdatum.'
  }
  if (form.endMode === 'count') {
    const count = Number(form.count)
    if (form.count === '' || !Number.isInteger(count) || count < 1) {
      return 'Die Anzahl muss mindestens 1 sein.'
    }
  }
  return null
}

/** Felder für die Datenschicht; nur bei gültigen Eingaben aufrufen. */
export function seriesFieldsOf(form: SeriesForm): SeriesFields {
  return {
    titlePattern: form.titlePattern.trim(),
    every: Number(form.every),
    weekday: Number(form.weekday),
    startDate: form.startDate,
    endDate: form.endMode === 'date' ? form.endDate : null,
    count: form.endMode === 'count' ? Number(form.count) : null,
    dueWeekday: form.dueWeekday === '' ? null : Number(form.dueWeekday),
    durationMin: form.durationMin === '' ? null : Number(form.durationMin),
  }
}
