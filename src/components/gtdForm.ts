import type { GtdStatus, Item, Project, Waiting } from '../data/types'
import { berlinDate } from '../lib/gtd'

/** Formularzustand der GTD-Felder (Texte, wie sie in den Eingabefeldern stehen). */
export interface GtdForm {
  gtd: GtdStatus
  important: boolean
  dueDate: string
  /** Dauer in Minuten als Text; leer = keine Angabe. */
  duration: string
  projectId: string
  person: string
  since: string
  followUpOn: string
}

/** Auswahl der kurzen Dauern (SPEC §6.3.2). */
export const DURATION_CHOICES = [2, 5, 10, 15, 30, 45, 60, 90, 120, 180, 240]

export function emptyGtdForm(): GtdForm {
  return {
    gtd: 'naechster-schritt',
    important: false,
    dueDate: '',
    duration: '',
    projectId: '',
    person: '',
    since: berlinDate(new Date()),
    followUpOn: '',
  }
}

/** Vorbelegung aus einem vorhandenen Eintrag. */
export function gtdFormFromItem(item: Item): GtdForm {
  const base = emptyGtdForm()
  const waiting = item.gtd === 'warten' ? item.waiting : null
  return {
    ...base,
    gtd: item.gtd ?? 'naechster-schritt',
    important: item.important,
    dueDate: item.dueDate ?? '',
    duration: item.durationMin === null ? '' : String(item.durationMin),
    projectId: item.projectId ?? '',
    person: waiting?.person ?? '',
    since: waiting?.since ?? base.since,
    followUpOn: waiting?.followUpOn ?? '',
  }
}

export function waitingFromForm(form: GtdForm): Waiting | null {
  if (form.gtd !== 'warten') return null
  return {
    person: form.person.trim(),
    since: form.since === '' ? berlinDate(new Date()) : form.since,
    followUpOn: form.followUpOn === '' ? null : form.followUpOn,
  }
}

/** Aktive Projekte einer Ablage. */
export function projectsOfCategory(projects: readonly Project[], categoryId: string): Project[] {
  return projects.filter((p) => p.status === 'aktiv' && p.categoryId === categoryId)
}

/** Projekt nach einem Ablagenwechsel: bleibt nur, wenn es in der neuen Ablage aktiv ist. */
export function projectAfterCategoryChange(
  projectId: string,
  categoryId: string,
  projects: readonly Project[],
): string {
  return projectsOfCategory(projects, categoryId).some((p) => p.id === projectId) ? projectId : ''
}

/** Felder, die für eine Aufgabe gespeichert werden (ohne Projekt-Zuordnung, die hängt von der Reihenfolge ab). */
export function gtdFields(form: GtdForm): {
  gtd: GtdStatus
  waiting: Waiting | null
  dueDate: string | null
} {
  return {
    gtd: form.gtd,
    waiting: waitingFromForm(form),
    dueDate: form.dueDate === '' ? null : form.dueDate,
  }
}
