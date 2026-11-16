# 91 – Schritt-Serien: Instanzen automatisch anlegen

## Ziel
Serien in Projekten (SPEC §3.12 „Schritt-Serien“) erzeugen ihre Instanzen automatisch in der App, fortlaufend
nummeriert, ohne Duplikate – auch mit zwei Geräten. Nur Logik und Datenschicht; die Oberfläche zum Bearbeiten kommt
in 94.

## Bereich
- neu `src/lib/series.ts` (+ Test): reine Funktionen
- neu `src/data/seriesInstances.ts` (+ Test): Anlage nach erfolgreichem Herunterladen; Einbau in `src/data/sync.ts`
  (nur der Aufrufpunkt) und ggf. kleine Ergänzung in `src/data/repository.ts` (Serie anlegen/ändern/pausieren/
  fortsetzen/beenden)
- `src/test/fakeGithub.ts` nur falls nötig
- **Tabu:** `src/pages/**`, `src/components/**`, `scripts/`, `src/lib/gtd.ts` (nur benutzen), `docs/` außer dieser Datei.

## Vorgaben
- **Reine Funktionen** (`src/lib/series.ts`), alle mit `today: string` (YYYY-MM-DD, Europe/Berlin) als Parameter:
  - `occurrences(series, fromExclusive, toInclusive)` ⇒ Stichtage laut §3.12 (erster Stichtag = erster `weekday` ab
    `startDate`, dann alle `every` Wochen; Ende `endDate` bzw. Nummer `count` unter Berücksichtigung von `lastNumber`)
  - `dueInstances(project, series, existingItems, today, max = 10)` ⇒ anzulegende Instanzen (Titel mit `{Nr}`,
    `dueDate` = erster `dueWeekday` ab Stichtag, `durationMin`, `categoryId`, `projectId`, `projectOrder` hinter allen
    Schritten, `seriesId`, `seriesNumber`, `gtd: "naechster-schritt"`, `notes: ""`) und neues `lastNumber`/`lastDate`.
    `lastNumber`/`lastDate` = Maximum aus Serie und vorhandenen Einträgen mit `seriesId` (auch archiviert).
  - `instanceId(projectId, seriesId, date)` ⇒ `YYYYMMDD-000000-xxxx`, 4 Zeichen `a-z0-9` aus einem festen,
    dokumentierten Hash (z. B. FNV-1a 32 Bit, Basis 36) – keine neue Abhängigkeit.
  - `previewNext(series, n = 3)` für die Vorschau im Serien-Dialog (94).
  - Titelmuster ohne `{Nr}` ⇒ Nummer wird angehängt („Übungsblatt 5“) – dokumentieren.
- **Anlage** (`seriesInstances.ts`): nur nach einem **erfolgreichen Herunterladen** im Sync, nie offline, nie ohne
  Token. Für jede Serie mit `state: "aktiv"` in einem aktiven Projekt: existiert `items/<instanceId>.json` lokal schon
  (offen oder archiviert) ⇒ nicht anlegen. Neue Instanzen und danach die Projektdatei lokal schreiben + Outbox
  (Reihenfolge der Outbox: Instanzen vor Projekt). Danach ein normaler Upload.
- **Konflikt beim Hochladen** einer Instanz (Datei existiert remote schon, weil ein anderes Gerät sie angelegt hat):
  muss über die bestehende Konfliktregel (§4) zu genau **einer** Datei führen, ohne Fehlermeldung an den Nutzer. Falls
  der bestehende Sync das nicht schon so tut, minimal ergänzen und in der Zusammenfassung erklären.
- **Pausieren:** Stichtage während `pausiert` entfallen. **Fortsetzen** setzt `lastDate` = gestern, falls größer;
  `lastNumber` bleibt (Nummerierung ohne Lücke). **Beenden:** `beendet`. **Bearbeiten** ändert nur die Serie,
  vorhandene Instanzen bleiben; `lastNumber`/`lastDate` bleiben erhalten.
- Ein erledigtes oder gelöschtes Instanz-Item entsteht nicht neu (Schutz über `lastDate`).

## Abnahmekriterien
1. Beispiel aus der Abnahme: Projekt „Analysis 1“, Serie „Übungsblatt {Nr}“, wöchentlich Mo, fällig Fr, Start
   2026-10-19, Ende 2027-02-12. Am 2026-10-19 entsteht Nr. 1 (fällig 2026-10-23); am 2026-10-20 nichts Neues;
   am 2026-10-26 Nr. 2. Kein Blatt nach dem 2027-02-12 (Tests).
2. App 3 Wochen nicht geöffnet ⇒ die fehlenden Blätter werden mit fortlaufenden Nummern nachgeholt (höchstens 10 je
   Sync, Rest beim nächsten) (Test).
3. **Zwei Geräte** (zwei lokale Speicher gegen ein `fakeGithub`): beide synchronisieren am selben Montag (auch
   verschränkt: A legt an, B lädt herunter, bevor A die Projektdatei hochlädt; und: beide legen gleichzeitig an) ⇒
   im Repo genau **eine** Datei je Blatt, gleiche Nummer, keine Fehlermeldung (Tests).
4. Erledigte bzw. gelöschte Instanz wird nicht wieder angelegt (Test).
5. Pausieren über zwei Wochen und Fortsetzen ⇒ keine Blätter für die Pause, nächste Nummer ohne Lücke (Test).
   `count` statt `endDate` begrenzt richtig (Test). „alle 2 Wochen“ (Test).
6. Offline / ohne Token / Download fehlgeschlagen ⇒ es wird nichts angelegt (Test).
7. Zeitzone: Stichtag Montag zählt ab 00:00 Europe/Berlin, auch wenn UTC noch Sonntag ist (Test).
8. `npm run lint`, `npm test`, `npm run build` grün.
