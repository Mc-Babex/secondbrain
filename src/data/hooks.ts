import { useEffect, useState } from 'react'
import { defaultSettings } from './defaults'
import { getOutbox } from './localStore'
import {
  getCategories,
  getLastRun,
  getSettings,
  listInbox,
  listItems,
  listSuggestions,
  subscribe,
} from './repository'
import type { Category, InboxEntry, Item, LastRun, Settings, Suggestion } from './types'

const MAX_RETRIES = 3
const RETRY_MS = 1000

/** Lädt initial und bei jedem `"change"`-Ereignis neu. `load` muss stabil sein. */
function useLoaded<T>(load: () => Promise<T>, initial: T): T {
  const [value, setValue] = useState<T>(initial)

  useEffect(() => {
    let active = true
    let latest = 0
    let applied = 0
    let failures = 0
    let retry: ReturnType<typeof setTimeout> | undefined
    const refresh = (): void => {
      clearTimeout(retry)
      const run = ++latest
      load()
        .then((result) => {
          failures = 0
          // Auch ein älteres Ergebnis übernehmen, solange kein neueres angekommen ist; so bleibt die
          // Anzeige nicht leer, wenn die neuere Abfrage später fehlschlägt oder hängt.
          if (active && run > applied) {
            applied = run
            setValue(result)
          }
        })
        .catch((error: unknown) => {
          // Bisherigen Stand behalten; nur Fehlerart melden, keine Inhalte.
          console.warn(
            'Lokale Daten konnten nicht gelesen werden',
            error instanceof Error ? error.name : 'unbekannt',
          )
          // Kurzzeitige Fehler (z. B. gleichzeitiger Zugriff) nicht bis zum nächsten Ereignis stehen lassen.
          if (active && run === latest && failures < MAX_RETRIES) {
            failures += 1
            retry = setTimeout(refresh, RETRY_MS)
          }
        })
    }
    refresh()
    const unsubscribe = subscribe(refresh)
    return () => {
      active = false
      clearTimeout(retry)
      unsubscribe()
    }
  }, [load])

  return value
}

const EMPTY_INBOX: InboxEntry[] = []
const EMPTY_ITEMS: Item[] = []
const EMPTY_SUGGESTIONS: Suggestion[] = []
const EMPTY_CATEGORIES: Category[] = []
const INITIAL_SETTINGS: Settings = defaultSettings()

const loadOutboxCount = async (): Promise<number> => (await getOutbox()).length

export const useInbox = (): InboxEntry[] => useLoaded(listInbox, EMPTY_INBOX)
export const useItems = (): Item[] => useLoaded(listItems, EMPTY_ITEMS)
export const useSuggestions = (): Suggestion[] => useLoaded(listSuggestions, EMPTY_SUGGESTIONS)
export const useCategories = (): Category[] => useLoaded(getCategories, EMPTY_CATEGORIES)
export const useSettings = (): Settings => useLoaded(getSettings, INITIAL_SETTINGS)
export const useOutboxCount = (): number => useLoaded(loadOutboxCount, 0)
export const useLastRun = (): LastRun | null => useLoaded(getLastRun, null)
