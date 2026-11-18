# 100 – Reiter-Leiste ohne Anzahl am Handy, Zeitfilter ≤ 15 / alle

## Ziel
Korrektur aus dem Vorschau-Test: Die Reiter-Leiste ist am Handy zu eng, der Zeitfilter hat zu viele Stufen
(SPEC §6.3.1).

## Bereich
- `src/pages/tasks/TaskTabs.tsx` + `.module.css`, `src/pages/tasks/TimeFilter.tsx`, `src/lib/tabMemory.ts`
  (bzw. wo der Zeitfilter gemerkt wird), `src/lib/taskGroups.ts` nur falls dort Filterstufen definiert sind, zugehörige Tests.
- **Tabu:** `src/data/**`, `src/components/**`, Kalender, Projekte, `scripts/`.

## Vorgaben
- Reiter: Unter 600 px Breite nur die Namen (keine Anzahl); ab 600 px wie bisher mit Anzahl (außer Aktuell).
  Umsetzung per CSS-Media-Query (Anzahl ausblenden), die Anzahl bleibt für Screenreader im `aria-label`
  (z. B. „Warte auf, 3“), damit auch am Handy nichts an Information verloren geht. Die Kürzung „Irgendw.“ entfällt,
  wenn die vollen Namen ab 360 px ohne waagerechtes Scrollen passen; sonst bleibt sie.
- Zeitfilter: nur noch **≤ 15 Min.** und **alle**. Ein früher gemerkter Wert (30/60) wird beim Lesen als „alle“
  behandelt (kein Fehler, kein Absturz). Typ der Filterstufen entsprechend verkleinern; keine toten Werte.

## Abnahmekriterien
1. Zeitfilter zeigt genau zwei Stufen; „≤ 15 Min.“ blendet größere und fehlende Dauer aus (Test).
2. Gemerkter alter Wert `30` oder `60` ⇒ „alle“ aktiv (Test).
3. Reiter-Leiste: Anzahl-Element hat eine Klasse, die unter 600 px ausgeblendet wird; `aria-label` enthält Name und
   Anzahl (Test auf `aria-label`, CSS-Regel im Code-Review).
4. Manuell: 360 px und 390 px Breite – Reiter einzeilig, kein waagerechtes Scrollen.
5. `npm run lint`, `npm test`, `npm run build` grün.
