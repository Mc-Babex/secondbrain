import { useCallback, useEffect, useRef, useState } from 'react'
import type { Item, Project } from '../../data/types'
import {
  completeItemWithEvent,
  restoreItemWithEvent,
  type RemovedSchedule,
} from '../../google/itemEvents'
import { projectSteps } from '../../lib/gtd'
import { useTransientNote } from './useTransientNote'

const UNDO_MS = 5000
const HINT_MS = 5000
export const COMPLETE_ERROR = 'Das hat nicht geklappt. Bitte versuche es erneut.'

export interface StepCompletion {
  /** Erledigt die Aufgabe (samt Google-Termin) und zeigt bei Projekt-Schritten den Hinweis (SPEC §6.3.3). */
  complete: (item: Item) => void
  /** Zuletzt erledigte Aufgabe, solange „Rückgängig“ möglich ist. */
  done: { note: string | null } | null
  undo: () => void
  /** „Weiter mit: <Titel>“ bzw. ein Hinweis zum Abschließen eines Projekts. */
  hint: string | null
  /** Projekt ohne offenen Schritt nach dem Abhaken: Dialog „Was ist der nächste Schritt?“. */
  dialogProject: Project | null
  closeDialog: (note?: string | null) => void
  error: string | null
}

/**
 * Erledigen mit Rückgängig und Folgehinweis. Gehört die Aufgabe zu einem aktiven Projekt: gibt es danach
 * einen offenen Schritt ⇒ „Weiter mit: …“, sonst der Dialog „Was ist der nächste Schritt?“.
 */
export function useStepCompletion(
  items: readonly Item[],
  projects: readonly Project[],
): StepCompletion {
  const [done, setDone] = useState<{ note: string | null } | null>(null)
  const [doneItem, setDoneItem] = useState<Item | null>(null)
  const [dialogProject, setDialogProject] = useState<Project | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hint, showHint] = useTransientNote(HINT_MS)
  const removed = useRef<RemovedSchedule | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef({ items, projects })
  useEffect(() => {
    latest.current = { items, projects }
  })
  useEffect(() => () => clearTimeout(undoTimer.current), [])

  const followUp = useCallback(
    (item: Item): void => {
      const { items: all, projects: known } = latest.current
      const project = known.find((p) => p.id === item.projectId && p.status === 'aktiv')
      if (!project) return
      const next = projectSteps(project.id, all).find(
        (s) => s.status === 'offen' && s.id !== item.id,
      )
      if (next) showHint(`Weiter mit: ${next.title}`)
      else setDialogProject(project)
    },
    [showHint],
  )

  const complete = useCallback(
    (item: Item): void => {
      setError(null)
      completeItemWithEvent(item).then(
        (result) => {
          removed.current = result.removed
          setDone({ note: result.note })
          setDoneItem(item)
          clearTimeout(undoTimer.current)
          undoTimer.current = setTimeout(() => setDone(null), UNDO_MS)
          followUp(item)
        },
        () => setError(COMPLETE_ERROR),
      )
    },
    [followUp],
  )

  const undo = useCallback((): void => {
    if (!doneItem) return
    const restoreSchedule = removed.current
    clearTimeout(undoTimer.current)
    setDone(null)
    showHint(null)
    restoreItemWithEvent(doneItem.id, restoreSchedule).then(
      (message) => setError(message),
      () => setError(COMPLETE_ERROR),
    )
  }, [doneItem, showHint])

  const closeDialog = useCallback(
    (note: string | null = null): void => {
      setDialogProject(null)
      if (note !== null) showHint(note)
    },
    [showHint],
  )

  return { complete, done, undo, hint, dialogProject, closeDialog, error }
}
