# 105 – Abgeschlossene Serien ausblenden, Serien löschen

## Ziel
Abgeschlossene Serien stören die Projektansicht nicht mehr, und jede Serie lässt sich löschen, ohne dass vorhandene
Blätter verloren gehen (SPEC §3.12 „Abgeschlossen“, „Serie löschen“; §6.3.3 „Serien“).

## Bereich
- `src/lib/series.ts` (reine Funktion `isSeriesFinished(series)` o. ä., nutzt `nthOccurrence`) + Test
- `src/data/repository.ts` (`deleteSeries(projectId, seriesId)`, lokal + Outbox, unbekannte Felder und übrige Serien
  bleiben) + Test
- `src/pages/tasks/projects/SeriesList.tsx` (+ CSS), ggf. neue kleine Komponente `FinishedSeries.tsx`, Tests
- **Tabu:** Kalender, Reiter-Leiste, `src/lib/gtd.ts` (nur nutzen), `scripts/`.

## Vorgaben
- Abgeschlossen = `state: "beendet"` oder kein k-ter Stichtag für k = `lastNumber + 1`. Pausiert ⇒ nicht abgeschlossen.
- Serienliste zeigt nur nicht abgeschlossene Serien. Darunter eingeklappt (`<details>` oder Knopf mit
  `aria-expanded`) „Abgeschlossene Serien (n)“, nur wenn n > 0; je Serie Muster, Zeitraum „Start – letzter Stichtag“
  (Datum `Mo 19.10.` wie sonst), „n Blätter“ (Anzahl Einträge mit dieser `seriesId`) und „Löschen“.
- „Löschen“ auch in der Zeile laufender Serien. Bestätigungsdialog mit dem Text aus SPEC §6.3.3.
- Löschen entfernt nur das Serienobjekt; Instanzen bleiben unverändert (kein Schreiben der Einträge).
- Serien-Instanzen, deren Serie nicht mehr existiert: kein „Fällt aus“-Knopf (prüfen, dass `SkipSeriesButton`
  das schon richtig macht, sonst anpassen).
- Fortschritt und „Nächstes …“ (102) passen sich ohne Sonderlogik an.

## Abnahmekriterien
1. `isSeriesFinished`: beendet, `count` erreicht, `endDate` erreicht ⇒ ja; aktiv mit weiterem Stichtag, pausiert ⇒
   nein (Test).
2. Projektansicht: abgeschlossene Serie nicht in der Liste, aber unter „Abgeschlossene Serien (1)“ (Test).
3. Löschen mit Bestätigung entfernt die Serie aus der Projektdatei (Outbox-Eintrag), Blätter bleiben (Test).
4. Abbrechen im Bestätigungsdialog ändert nichts (Test).
5. Nach dem Löschen kein „Fällt aus“ an den Blättern; keine neuen Instanzen beim nächsten Sync (Test).
6. `npm run lint`, `npm test`, `npm run build` grün.
