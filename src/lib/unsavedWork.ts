import { useEffect, useId } from 'react'

/**
 * Register „gerade ungespeichert“: Wer eine Eingabe hält, die ein Neuladen verlieren würde (Text im Feld,
 * offener Dialog, laufende Spracherkennung, Ziehen eines Termins), meldet sich hier unter einem Schlüssel an.
 */
const flags = new Set<string>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of [...listeners]) listener()
}

export function setUnsaved(key: string, unsaved: boolean): void {
  if (unsaved === flags.has(key)) return
  if (unsaved) flags.add(key)
  else flags.delete(key)
  notify()
}

export function hasUnsavedWork(): boolean {
  return flags.size > 0
}

export function subscribeUnsavedWork(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Meldet `unsaved` unter `name` (plus eindeutiger Kennung) an und beim Entfernen der Komponente wieder ab. */
export function useUnsavedWork(name: string, unsaved: boolean): void {
  const id = useId()
  useEffect(() => {
    if (!unsaved) return undefined
    const key = `${name}:${id}`
    setUnsaved(key, true)
    return () => setUnsaved(key, false)
  }, [name, id, unsaved])
}

const FOCUS_KEY = 'focus-field'

/** Ist das Element ein Feld, in das man Text tippt (Knöpfe, Häkchen, Auswahlknöpfe zählen nicht)? */
export function isTextEntry(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false
  if (element.isContentEditable) return true
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true
  if (!(element instanceof HTMLInputElement)) return false
  return ![
    'button',
    'submit',
    'reset',
    'checkbox',
    'radio',
    'range',
    'color',
    'file',
    'image',
  ].includes(element.type)
}

let focusGuardInstalled = false

/** Allgemeiner Schutz: Solange der Fokus in einem Eingabefeld liegt, gilt etwas als ungespeichert. */
export function installFocusGuard(): void {
  if (focusGuardInstalled) return
  focusGuardInstalled = true
  const update = (): void => setUnsaved(FOCUS_KEY, isTextEntry(document.activeElement))
  document.addEventListener('focusin', update)
  // Beim Verlassen ist activeElement kurz noch das alte Feld; erst danach prüfen.
  document.addEventListener('focusout', () => queueMicrotask(update))
}
