# 80 – Testsätze und Tests ohne persönliche Daten

## Ziel
Das Code-Repo wird öffentlich (SPEC §1.1). Testsätze, Fixtures und Tests enthalten heute Details aus dem Alltag des
Entwicklers. Sie werden durch neutrale, erfundene Beispiele ersetzt – **ohne** die geprüfte Logik zu ändern.

## Bereich
- `docs/sortier-tests.md`, `docs/sortier-tests-2.md`, `docs/CLAUDE-LAUF.md` (nur Beispieltexte)
- `scripts/lauf/sortierFixtures.ts`, `scripts/lauf/testdaten.ts`/`testspec.ts` (nur falls für Ablagen nötig, s. u.),
  Tests in `scripts/lauf/` (`files`, `plan`, `validate`, `vergleich`, `vergleich.satz2`, …)
- Tests in `src/` mit solchen Inhalten: `src/components/ItemEditor.test.tsx`, `src/data/repository.test.ts`,
  `src/google/eventActions.test.ts`, `src/google/itemEvents.test.ts`, `src/pages/calendar/EventDialog.series.test.tsx`,
  `src/pages/tasks/TasksPageWithCalendar.test.tsx` (und weitere, die die Suche unten findet)
- **Tabu:** `src/data/defaults.ts`, `src/data/defaults.test.ts`, `scripts/lauf/start.test.ts` (kommt in 79),
  `scripts/lauf/dataRepo.ts`, `src/data/sync*.ts` (parallel in 78), `docs/SPEC.md`, `docs/PROGRESS.md`, `docs/tasks/`.
  Platzhalter-Tokens in Tests bleiben (Prüfung in 87).

## Ersetzungen
Persönliche Begriffe (Liste nur lokal, außerhalb des Repos) wurden durch neutrale ersetzt, z. B. Sportverein
„TV Musterstadt“, Nebenjob/Werkstudentenstelle, „Notiz: WLAN im Büro heißt Gast-5G“, Sprachkurs, Frau Becker /
Herr Wagner, Projektbericht.
Ablage „Studium“ (id `studium`) **bleibt** als allgemeine eigene Ablage (Entscheidung E3).

## Vorgaben
- Bedeutung jedes Testfalls bleibt gleich (Art, Ablage-Zuordnung, Zeiten, Dauer, Regel). Texte so wählen, dass die
  Zuordnung für Claude ebenso eindeutig ist wie vorher (z. B. Verein-Ablage mit passender Beschreibung).
- **Ablagen der Testsätze unabhängig von den Standardwerten:** Satz 1 und 2 legen ihre Ablagen ausdrücklich in den
  Testdaten an (inkl. `studium`), denn in 79 entfällt `studium` aus den Standard-Ablagen. `sortier-tests-2.md` Zeile
  „nur die Standard-Ablagen (privat, arbeit, studium, …)“ entsprechend umformulieren.
- Suche zum Abschluss (darf nichts mehr finden außer in den Tabu-Dateien):
  `git grep -n -i -E -f <lokale Sperrliste>`

## Abnahmekriterien
1. Die Suche oben findet außerhalb der Tabu-Dateien nichts.
2. Satz 1 und Satz 2 sind inhaltlich gleichwertig (gleiche Fallnummern, Regeln, erwartete Zeiten/Dauern/Arten);
   `lauf:vergleich`-Tests grün.
3. `npm run lauf:testdaten` erzeugt für beide Sätze die Ablagen ausdrücklich (ohne sich auf Standardwerte zu stützen);
   Test dafür.
4. `npm run lint`, `npm test`, `npm run build` grün.
5. Trockenlauf mit Claude (Sonnet) gegen beide Sätze macht der **Projektleiter** nach dem Review (nicht Teil dieser
   Aufgabe für den Implementer); die Zusammenfassung nennt die nötigen Befehle.
