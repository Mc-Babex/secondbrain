# 92 – Aufgabenseite: Reiter-Leiste und Reiter „Aktuell“

## Ziel
Die Aufgabenseite bekommt unter dem Eingangskorb die Reiter **Aktuell · Projekte · Warte auf · Irgendwann** und den
fertigen Reiter „Aktuell“ mit Fokus, Heute/Überfällig, Nächsten Schritten mit Zeitfilter und „Eingeplant“
(SPEC §6.3, §6.3.1). Die anderen drei Reiter zeigen vorerst ihre Liste in einfacher Form (Titel + Kennzeichen); sie
werden in 93/94 ausgebaut.

## Bereich
- `src/pages/tasks/` (TasksPage, neue Komponenten z. B. `TaskTabs.tsx`, `CurrentTab.tsx`, `TimeFilter.tsx`,
  `TaskRow.tsx`; vorhandene `OverdueSection`, `TaskGroups` umbauen oder ersetzen – keine toten Dateien zurücklassen)
  + CSS + Tests, `TasksPageWithCalendar.tsx`/`slots.ts`/`CalendarActions.tsx` soweit für ✓ ✗ – 🕐 nötig
- `src/lib/taskGroups.ts` (+ Test): ersetzen bzw. auf `src/lib/gtd.ts` umstellen; nicht mehr Benutztes entfernen
- neu `src/lib/tabMemory.ts` (+ Test): gemerkter Reiter und Zeitfilter je Gerät (localStorage, jeder Zugriff in
  try/catch, Standard „Aktuell“ / „alle“)
- **Tabu:** `src/data/**`, `src/lib/gtd.ts` (nur benutzen; Fehler darin melden), `src/components/**` außer
  Wiederverwendung von `StatusBadges` (aus 96), `src/pages/categories/**`, `src/App.tsx`, Wisch-Logik
  (`src/lib/swipe*`, `useSwipe`, `gestureClaim`), `scripts/`.

## Vorgaben
- Aufbau exakt laut §6.3: Vorschläge, Hinweise vom letzten Lauf, Eingangskorb (mit Anzahl + „Jetzt sortieren“), dann
  Reiter. „Überfällig“ steht nicht mehr über dem Eingangskorb, sondern im Reiter „Aktuell“.
- **Reiter-Leiste:** echtes Tab-Muster (`role="tablist"`/`tab`/`tabpanel`, `aria-selected`, Pfeiltasten wechseln den
  Fokus innerhalb der Leiste, Enter/Leertaste/Tippen wählt). Anzahl an Projekte/Warte auf/Irgendwann. Wechsel **nur**
  per Tippen/Tastatur, **keine** eigene Wischgeste; Pfeiltasten dürfen in der Leiste nicht die Seite wechseln
  (Ereignis dort abfangen, bestehende Pfeiltasten-Logik der Seiten nicht ändern). 360 px ohne waagerechtes Scrollen
  („Irgendw.“ als Kurzform, voller Name als `aria-label`). Tippflächen ≥ 44 px.
- **Aktuell** laut §6.3.1: ★ Fokus (Hinweis bei > 5), Heute/Überfällig mit ✓ ✗ – 🕐 (bisherige Aktionen
  wiederverwenden), Nächste Schritte nach Ablage gruppiert mit Projektname bei Schritten, Sortierung und Zeitfilter
  (gemerkt), „Eingeplant (n)“ eingeklappt (`<details>` oder Knopf mit `aria-expanded`), Kennzeichen „neu“ (24 h) wie
  bisher, leere Zustände mit kurzer Einladung.
- Zeilen: Checkbox, Titel (antippen ⇒ ItemEditor), Kennzeichen (`StatusBadges` aus 96), Uhr-Symbol. Fokus-Zeilen mit
  Kante in `--status-focus` (das einzige auffällige Element; sonst ruhig – frontend-design).
- Erledigen mit Rückgängig (5 s) wie bisher.
- Animation höchstens beim Wechsel des Reiter-Inhalts, bei reduzierter Bewegung keine.

## Abnahmekriterien
1. Reihenfolge der Abschnitte über den Reitern laut §6.3 (Test).
2. Reiter-Wahl und Zeitfilter bleiben nach Neuladen erhalten; ohne verfügbaren localStorage Standardwerte ohne Fehler
   (Tests).
3. Fokus: nur offene Fokus-Aufgaben außer Irgendwann; Hinweis ab 6 (Test).
4. Heute/Überfällig: heutige und überfällige Termin-Aufgaben mit den vier Aktionen; künftige unter „Eingeplant“
   (Tests).
5. Nächste Schritte: Gruppierung nach Ablage, nur der nächste Schritt je Projekt mit Projektname, Sortierung
   überfällig → fällig → ohne Datum → Dauer; Filter ≤ 15/30/60/alle inkl. fehlender Dauer (Tests).
6. Tastatur: Pfeiltasten in der Reiter-Leiste wechseln den Reiter-Fokus, nicht die Seite (Test).
7. Bestehendes Wischen zwischen Seiten unverändert (bestehende Tests `App.swipe` grün).
8. Manuell: iPhone (375 px) und Desktop – Leiste passt, Wischen auf der Aufgabenseite wechselt die Seite, Tippen
   auf Reiter wechselt den Reiter.
9. `npm run lint`, `npm test`, `npm run build` grün.
