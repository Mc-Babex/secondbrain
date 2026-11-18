# 101 – Schritt-Serien: Ausfall, Neuberechnung offener Blätter, Pause als Ausfall

## Ziel
Korrektur aus dem Vorschau-Test: Fällt eine Vorlesung aus, rücken das aktuelle Blatt und alle folgenden um eine
Woche nach hinten; Änderungen an Start/Rhythmus/Fälligkeit wirken auch auf offene Blätter (SPEC §3.12 „Schritt-Serien“,
§6.3.2, §6.3.3). Serien sind noch nicht veröffentlicht; `skippedDates` ist neu (fehlt ⇒ `[]`).

## Bereich
- `src/data/types.ts` (Feld `skippedDates` in `StepSeries` + Type Guard), `src/lib/series.ts` (Stichtage ohne
  Ausfälle, n-ter Stichtag, Ausfall-Berechnung, Neuberechnung als reine Funktionen), `src/data/seriesInstances.ts`,
  `src/data/repository.ts` (Ausfall an Instanz, Ausfall eintragen/entfernen, Serie bearbeiten mit Neuberechnung,
  Fortsetzen) + Tests
- `src/pages/tasks/projects/SeriesDialog.tsx`, `SeriesList.tsx`, `seriesForm.ts` (+ CSS, Tests)
- `src/components/ItemEditor.tsx` (+ ggf. kleine neue Komponente) für den Knopf „Fällt aus – 1 Woche später“
- `src/google/itemEvents.ts` nur nutzen (Löschen künftiger Instanzen mit Google-Termin wie §6.6)
- **Tabu:** `src/lib/gtd.ts` (Warnung/Fortschritt kommt in 102), Kalenderseite, Reiter-Leiste, `scripts/`.

## Vorgaben
- Genau nach SPEC §3.12: Stichtage ohne `skippedDates`; Nummer n = n-ter Stichtag; Ende per `count` rückt mit,
  `endDate` bleibt.
- **Ausfall an Instanz:** erster Stichtag nach dem Stichtag der Instanz, der nicht in `skippedDates` ist ⇒ aufnehmen;
  `dueDate` + `every`·7 Tage (ohne `dueDate` nur Ausfall). Stichtag einer Instanz = Datum aus ihrer ID bzw. die
  vorhandene Hilfsfunktion; nicht aus `dueDate` raten. Nur offene Instanzen einer aktiven oder pausierten Serie.
  Projektdatei und Instanz in einem Schritt lokal + Outbox. Meldung laut §6.3.2.
- **Ausfall eintragen/entfernen** an der Serie: nur Stichtage nach `lastDate`; Auswahl der nächsten 8 künftigen.
- **Fortsetzen:** Stichtage von `lastDate` (exklusiv) bis gestern ⇒ `skippedDates`, `lastDate` auf den letzten davon.
- **Bearbeiten** von Start/Wochentag/Rhythmus/Fälligkeit: offene Instanzen neu berechnen (n-ter Stichtag, neues
  `dueDate`); geänderter Stichtag ⇒ neue Datei mit deterministischer ID des neuen Stichtags ersetzt die alte (übrige
  Felder inkl. unbekannter, `createdAt`, Google-Verknüpfung bleiben; alte Datei gelöscht über die Outbox); Stichtag
  nach heute ⇒ Instanz löschen (künftiger Google-Termin wie §6.6). `lastNumber`/`lastDate` = höchste verbleibende
  Instanz; `skippedDates` vor dem neuen Start entfernen. Erledigte Instanzen unverändert. Dialog-Hinweis „Offene
  Blätter werden neu berechnet“, wenn betroffen.
- Unbekannte Felder in Serien und Einträgen bleiben erhalten. Keine Duplikate über zwei Geräte (vorhandene Tests
  der Serienanlage müssen grün bleiben).
- Datum/Zeit Europe/Berlin, auch über die Zeitumstellung.

## Abnahmekriterien
1. Stichtage überspringen `skippedDates`; Nummerierung lückenlos; `count`-Ende rückt mit, `endDate` bleibt (Tests).
2. Ausfall an Übungsblatt 5 (Stichtag Mo 23.11.2026, fällig Fr 27.11.) ⇒ fällig Fr 04.12., `skippedDates` enthält
   30.11.; nächste Instanz Übungsblatt 6 am 07.12. (Test); zweimal Ausfall ⇒ fällig 11.12., Blatt 6 am 14.12. (Test);
   `every` 2 ⇒ zwei Wochen (Test).
3. Ausfall eintragen/entfernen ändert die Stichtage der Vorschau (Test).
4. Fortsetzen nach Pause trägt die Pause-Stichtage ein, Nummerierung läuft weiter (Test).
5. Start eine Woche später nach erledigtem Blatt 1: Blatt 1 bleibt, offenes Blatt 2 bekommt neuen Stichtag/`dueDate`
   bzw. wird gelöscht, wenn künftig; `lastNumber`/`lastDate` passen; erneute Anlage erzeugt keine Doppel (Tests).
6. Knopf „Fällt aus …“ nur bei offenen Serien-Instanzen im ItemEditor; Meldung erscheint (Test).
7. Zwei Geräte nach Ausfall ⇒ dieselbe ID der nächsten Instanz (Test).
8. Manuell: Projekt „Analysis 1“ mit Serie, Ausfall am aktuellen Blatt, Vorschau zeigt verschobene Termine.
9. `npm run lint`, `npm test`, `npm run build` grün.
