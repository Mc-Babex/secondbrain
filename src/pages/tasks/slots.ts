import type { ReactNode } from 'react'
import type { Item } from '../../data/types'

/**
 * Erweiterungspunkte für Aufgabe 07 (Google Kalender), damit die Seite nicht umgebaut werden muss:
 * - `renderOverdueActions`: ergänzt in jeder Überfällig-Zeile die Knöpfe „Nicht erledigt“, Uhr-Symbol und –
 *   (Aus Kalender) neben „Erledigt“.
 * - `renderTaskActions`: ergänzt in jeder offenen Aufgabe das Uhr-Symbol (Einplanen).
 */
export interface TaskSlots {
  renderOverdueActions?: (item: Item) => ReactNode
  renderTaskActions?: (item: Item) => ReactNode
}
