# 104 – Neuer Termin: „Auch als Aufgabe ablegen“

## Ziel
Beim Anlegen eines neuen Termins auf der Kalenderseite kann man ihn gleich als Aufgabe ablegen (SPEC §6.7
„Auch als Aufgabe ablegen“, §6.2).

## Bereich
- `src/pages/calendar/EventDialog.tsx` (+ ggf. neue kleine Komponente `TaskOptionFields.tsx` im selben Ordner),
  `src/pages/calendar/eventForm.ts`, `src/pages/calendar/newEvent.ts` nur soweit für das Speichern nötig, + Tests
- `src/data/repository.ts` (+ Test): neue Funktion zum Anlegen einer Aufgabe mit `schedule` und `calendarEventId`
  (lokal + Outbox), mit optionalem Projekt (hinten angehängt wie `assignItemToProject`). Vorhandene Funktionen
  wiederverwenden, nichts duplizieren.
- `src/data/hooks.ts` nur lesend nutzen (Ablagen, Projekte).
- **Tabu:** `src/pages/calendar/useFreeHold.ts`, `useTileDrag.ts`, `DayColumn.tsx`, `CalendarPage.tsx` (außer
  zwingend nötiger Weitergabe von Props – dann im Bericht nennen), `src/pages/tasks/**`, `src/lib/series.ts`,
  `scripts/`.

## Vorgaben
- Schalter „Auch als Aufgabe ablegen“ nur beim Neu-Anlegen; Standard aus. An ⇒ Ablage-Auswahl (ohne Einkauf und
  Archiv, Vorgabe erste Ablage laut `order`) und Projekt-Auswahl („kein Projekt“ + aktive Projekte dieser Ablage;
  Ablagenwechsel setzt ein nicht passendes Projekt zurück).
- Gesperrt (mit kurzem Hinweis) bei ganztägig und bei Wiederholung ≠ keine.
- Speichern: erst Google-Termin; nur bei Erfolg der Eintrag: `type: "aufgabe"`, Titel = Termintitel, `notes` =
  Beschreibung (leer ⇒ `""`), `gtd: "naechster-schritt"`, `schedule` = { Beginn ISO mit Offset, Dauer in Min.,
  `calendarEventId` laut vorhandener Schedule-Form }, sonst wie bei anderen neu angelegten Aufgaben (IDs, `v: 2`).
  Schlägt Google fehl ⇒ kein Eintrag, Fehlermeldung wie bisher.
- Meldung nach dem Speichern wie bisher, bei Aufgabe ergänzt um „– auch als Aufgabe abgelegt“.
- Bearbeiten vorhandener Termine bleibt unverändert (Schalter erscheint nicht).

## Abnahmekriterien
1. Schalter nur bei neuem Termin, nicht bei vorhandenem (Test).
2. Schalter an + Speichern ⇒ Google-Termin angelegt, danach Aufgabe mit `schedule`, `calendarEventId`, Ablage,
   Titel, Notiz, `gtd` (Test mit gemocktem Google, fake-indexeddb).
3. Mit Projekt ⇒ `projectId` gesetzt, `projectOrder` hinter vorhandenen Schritten (Test).
4. Google-Fehler ⇒ keine Aufgabe (Test).
5. Ganztägig oder Wiederholung ⇒ Schalter gesperrt, Hinweis sichtbar (Test).
6. Schalter aus ⇒ wie bisher nur Google-Termin (Test).
7. `npm run lint`, `npm test`, `npm run build` grün.
