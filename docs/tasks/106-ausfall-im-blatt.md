# 106 – „Fällt aus“ im Blatt korrigieren, Ausfall zurücknehmen

## Ziel
„Fällt aus“ im Bearbeiten-Dialog eines Serien-Blatts verschiebt dauerhaft auch das Blatt selbst, und ein Ausfall
lässt sich am Blatt wieder zurücknehmen (SPEC §3.12 „Ausfall“, „Ausfälle eines Blatts“, „Ausfall zurücknehmen“;
§6.3.2).

## Befund
`skipSeriesInstance` verschiebt `dueDate` korrekt. Der offene `ItemEditor` hält aber im `gtdForm` noch das alte
`dueDate`; „Speichern“ schreibt es über `gtdFields(gtdForm)` zurück. Das Blatt bleibt so scheinbar stehen.

## Bereich
- `src/lib/series.ts`: reine Funktion für die Ausfälle eines Blatts (z. B. `instanceSkips(series, number)`: Tage aus
  `skippedDates` mit Stichtag(n) < Tag < Stichtag(n+1); gibt es kein Nr n+1, alle nach Stichtag(n)) + Test
- `src/data/repository.ts`: `unskipSeriesInstance(itemId, today?)` – letzten Ausfall des Blatts entfernen, `dueDate`
  um `every`·7 Tage zurück (nur wenn gesetzt), folgende offene Instanzen über `recomputeOpenInstances`
  (`refreshDue: false`, `exceptId` wie bei `skipSeriesInstance`), `lastNumber`/`lastDate` über `withPlanProgress`;
  alles in einem `commitLocal` (lokal + Outbox). Gibt `{ item, weeks, removed }` zurück. Fehler (verständlich,
  deutsch), wenn das Blatt nicht offen ist, die Serie fehlt oder beendet ist oder das Blatt keinen Ausfall hat. + Test
- `src/google/seriesEvents.ts`: `unskipInstanceWithEvents` analog zu `skipInstanceWithEvents`
- `src/components/SkipSeriesButton.tsx` (+ ggf. kleine neue Komponente), `src/components/ItemEditor.tsx` (nur
  Anbindung: neues `dueDate` ins Formular übernehmen), Tests
- **Tabu:** Kalender, Reiter-Leiste, Projektansicht/`SeriesList`/`SeriesSkips` (bleiben wie sie sind), `scripts/`,
  Datenformat (keine neuen Felder).

## Vorgaben
- Nach „Fällt aus“ und nach „Ausfall zurücknehmen“ meldet die Komponente das neue `dueDate` (bzw. `null`) per Callback
  an den `ItemEditor`, der damit `gtdForm.dueDate` setzt. Das Feld „fällig bis“ zeigt sofort das neue Datum;
  „Speichern“ behält es.
- Meldung nach „Fällt aus“ unverändert, dazu ein Knopf **„Rückgängig“**, der genau diesen Ausfall zurücknimmt
  (= `unskipSeriesInstance` am selben Blatt).
- Hat das offene Blatt Ausfälle (§3.12), zusätzlich der Knopf **„Ausfall zurücknehmen – fällig wieder <Tag>“**
  (`<Tag>` = `dueDate` − every·7 im Format `Fr 20.11.` wie sonst; ohne `dueDate` nur „Ausfall zurücknehmen“).
  Meldung danach: „Ausfall zurückgenommen – folgende Blätter wieder eine Woche früher“ bzw. „… zwei Wochen früher“
  (bei `every` > 2 „n Wochen früher“), ggf. mit Google-Hinweis wie bei „Fällt aus“.
- Die Knöpfe richten sich nach dem aktuellen Stand (Projekt aus `useProjects`, Blatt nach der Aktion), damit sie nach
  „Fällt aus“/„Zurücknehmen“ ohne Schließen des Dialogs stimmen.
- Keine Knöpfe bei erledigten Blättern, gelöschter oder beendeter Serie (wie bisher).
- Netzwerk/Offline: alles lokal, UI wartet nicht aufs Netz; Fehlertext wie bisher.

## Abnahmekriterien
1. `instanceSkips`: Ausfall zwischen Blatt n und n+1 gehört zu n; Ausfälle anderer Blätter nicht (Test).
2. „Fällt aus“ im Dialog, danach „Speichern“: `dueDate` des Blatts ist um eine Woche verschoben (Test, der vorher
   scheitert).
3. Nach „Fällt aus“ zeigt das Feld „fällig bis“ das neue Datum (Test).
4. „Rückgängig“ nach „Fällt aus“: `skippedDates` wie vorher, `dueDate` wie vorher, folgende offene Blätter wieder am
   alten Stichtag (Test).
5. Blatt mit Ausfall neu geöffnet: Knopf „Ausfall zurücknehmen – fällig wieder <Tag>“; Klick wirkt wie 4 und meldet
   den Text aus den Vorgaben (Test). Ohne Ausfall kein solcher Knopf (Test).
6. `unskipSeriesInstance`: entfernt bei zwei Ausfällen am selben Blatt nur den letzten; erledigte spätere Blätter
   bleiben unverändert; Fehler bei Blatt ohne Ausfall (Test).
7. Serie ohne `dueWeekday`: Zurücknehmen entfernt nur den Ausfall, Knopftext ohne Datum (Test).
8. `npm run lint`, `npm test`, `npm run build` grün.
