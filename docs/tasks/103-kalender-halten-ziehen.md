# 103 – Kalender: neuen Termin beim Halten verschieben

## Ziel
Nach dem langen Drücken auf freie Zeit kann man, ohne loszulassen, den neuen Termin auf die richtige Startzeit
ziehen; erst das Loslassen öffnet den Dialog (SPEC §6.2 „Halten und Ziehen“).

## Bereich
- `src/pages/calendar/useFreeHold.ts`, `DayColumn.tsx`, `CalendarPage.tsx`, `CalendarPage.module.css`; gemeinsame
  Rechenlogik mit `useTileDrag.ts` (Raster, Tageswechsel, Rand-Scrollen) wiederverwenden bzw. in eine kleine reine
  Hilfsdatei herausziehen statt kopieren (+ Tests)
- **Tabu:** `EventDialog.tsx`, `eventForm.ts`, `newEvent.ts` (nur nutzen), `src/data/**`, Aufgabenseite, `scripts/`.

## Vorgaben
- Nach ~0,4 s Halten erscheint wie bisher die Markierung, jetzt als Block in Standarddauer (60 Min.).
- Bewegen bei gehaltenem Finger/gehaltener Maustaste: Block folgt im 15-Min.-Raster senkrecht, in der Wochenansicht
  auch seitlich (anderer Tag); am oberen/unteren Rand scrollt die Zeitleiste mit; der Block bleibt innerhalb 0–24 Uhr.
- Kein Seitenwechsel, kein Scrollen der Seite, keine Textauswahl/kein Kontextmenü während des Haltens.
- Loslassen ⇒ Termin-Dialog (neu) mit Datum und Startzeit des Blocks. Abbruch (`pointercancel`, Esc) ⇒ nichts.
- Bewegung vor Ablauf der 0,4 s bleibt Scrollen/Wischen wie bisher. Kurzes Antippen tut weiterhin nichts.
- Touch und Maus. Bestehendes Ziehen vorhandener Termine bleibt unverändert (vorhandene Tests grün).

## Abnahmekriterien
1. Halten 0,4 s, ziehen um 45 Min. nach unten, loslassen ⇒ Dialog mit Startzeit +45 Min. (Test mit Fake-Timern und
   Pointer-Events).
2. Wochenansicht: seitlich ziehen ⇒ anderer Tag im Dialog (Test).
3. Bewegung vor 0,4 s ⇒ kein Halten, kein Dialog (Test).
4. `pointercancel` ⇒ kein Dialog (Test).
5. Manuell: iPhone und Desktop – Halten und Ziehen, Rand-Scrollen, kein Seitenwechsel.
6. `npm run lint`, `npm test`, `npm run build` grün.
