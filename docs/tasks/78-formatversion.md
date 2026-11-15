# 78 – Formatversion des Daten-Repos

## Ziel
Das Daten-Repo bekommt eine Formatversion (`secondbrain.json`, SPEC §3.11), damit Updates die Daten von Testern
nicht beschädigen: App und Lauf-Skripte schreiben nichts, wenn die Daten ein neueres Format haben, als sie kennen.
Bestehende Daten-Repos (ohne Datei) gelten als Format 1 und bleiben unverändert.

## Bereich
- neu `src/lib/dataFormat.ts` (+ Test): reine Funktionen, von App **und** Skripten genutzt (wie `src/lib/sortWork.ts`)
- `src/data/sync.ts`, `src/data/github.ts` (nur falls zum Lesen der Datei nötig), `src/data/syncStatus.ts`, zugehörige Tests
- `scripts/lauf/` (Lesen des Daten-Repos, `lauf:pruefen`, `lauf:start`, `lauf:anwenden`, `lauf:abschluss`) + Tests
- **Tabu:** `scripts/action/` (kommt in 84), `src/data/defaults.ts`, `src/pages/**`, Fixtures/Testsätze mit Inhalten
  (`sortierFixtures.ts`, `docs/sortier-tests*.md` – parallel in 80), `src/main.tsx`, `vite.config.ts` (parallel in 81).

## Vorgaben
- `SUPPORTED_DATA_FORMAT = 1`. `readDataFormat(json: unknown)`: fehlende Datei/fehlendes Feld ⇒ 1; `format` muss eine
  ganze Zahl ≥ 1 sein, sonst gilt die Datei als ungültig (wie ein höheres Format behandeln: nichts schreiben, Meldung).
- Gemeinsamer Meldungstext (deutsch): „Die Daten wurden mit einer neueren App-Version gespeichert. Bitte App neu laden
  bzw. aktualisieren.“ Für ungültige Datei: „secondbrain.json im Daten-Repo ist ungültig.“
- **App:** Der Sync liest `secondbrain.json` mit (nur bei geänderter `sha` neu). Ist das Format nicht unterstützt:
  kein Hochladen (Outbox bleibt vollständig erhalten), Herunterladen/Lesen und lokales Arbeiten gehen weiter,
  Sync-Status „Fehler“ mit obiger Meldung, Eintrag im Fehlerprotokoll (Bereich wie beim Sync). Der Start-Knopf
  „Jetzt sortieren“ startet in diesem Zustand nicht (gleiche Meldung) – nur falls ohne Änderung an `src/pages/**`
  über die Datenschicht machbar, sonst als Hinweis in der Zusammenfassung.
- Die App **schreibt und löscht** `secondbrain.json` nie; sie erscheint nicht als Eintrag/Ablage.
- **Skripte:** Alle schreibenden Lauf-Skripte brechen vor der ersten Änderung (Dateien, Git) mit Exit-Code ≠ 0 und der
  Meldung ab. `lauf:pruefen` kennt `secondbrain.json` (prüft die Form, meldet höheres Format als Fehler) und toleriert
  sie wie bisher alle bekannten Pfade.
- Unbekannte Felder in `secondbrain.json` bleiben unberührt (es schreibt ohnehin niemand außer der Vorlage).

## Abnahmekriterien
1. `readDataFormat`/`isSupportedDataFormat`: fehlt ⇒ 1 unterstützt; `{format:1}` ⇒ unterstützt; `{format:2}` ⇒ nicht;
   `{format:"1"}`, `{format:0}`, `{format:1.5}`, kein Objekt ⇒ ungültig. (Unit-Tests)
2. Sync mit Remote ohne `secondbrain.json` verhält sich exakt wie bisher (bestehende Sync-Tests grün, ein neuer Test).
3. Sync mit `{format:2}` remote: kein `PUT`/`DELETE` an GitHub, Outbox unverändert, Status „Fehler“ mit Meldung,
   Fehlerprotokoll-Eintrag; neue Remote-Einträge werden trotzdem lokal sichtbar. (Test mit gemocktem `fetch`)
4. Wird `secondbrain.json` remote wieder auf `{format:1}` gesetzt, lädt der nächste Sync die Outbox hoch. (Test)
5. Die App schreibt/löscht `secondbrain.json` in keinem Fall (Test: kein Request mit diesem Pfad außer GET).
6. `lauf:start`, `lauf:anwenden`, `lauf:abschluss` brechen bei `{format:2}` vor jeder Änderung ab (Exit ≠ 0, Meldung,
   Daten-Repo und Git unverändert). (Tests mit Test-Repo)
7. `lauf:pruefen` meldet `{format:2}` und ungültige Datei als Fehler, `{format:1}` und fehlende Datei als OK. (Tests)
8. Alle Tests auch mit `TZ=UTC` grün; `npm run lint`, `npm test`, `npm run build` grün.
