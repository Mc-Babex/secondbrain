# 97 – Claude-Lauf: neue Kalender-Regel, Status, Projekte, Fälligkeit

## Ziel
Der Claude-Lauf plant nur noch bei fester Uhrzeit oder ausdrücklichem Einplanen in den Kalender, erkennt den GTD-Status,
hängt Einträge an bestehende Projekte, legt Projekte nur auf ausdrücklichen Wunsch an und setzt „fällig bis“
(SPEC §8.1–8.4 Phase 9, §3.3, §3.8, §3.12, §3.13, §6.3 Vorprüfung).

## Bereich
- `scripts/lauf/` (alle Dateien + Tests): `files.ts` (Entscheidungsformat), `plan.ts`, `start.ts`, `apply.ts`,
  `anwenden.ts`, `validate.ts`/`pruefen.ts` (`projects/` prüfen), `dataRepo.ts`, Fixtures
- `scripts/action/sortieren.ts` (+ Test): Vorprüfung
- `src/lib/sortWork.ts` (+ Test): Vorprüfung (wird von App **und** Action/Lauf benutzt)
- `docs/CLAUDE-LAUF.md`
- **Tabu:** `src/data/**` (nur Typen/Guards/`src/lib/gtdMigration.ts` aus 90 benutzen), `src/pages/**`,
  `src/components/**`, `docs/sortier-tests*.md` und Testsätze (kommen in 98), `docs/SPEC.md`.
- **Vorsicht:** Skripte, Workflow und `docs/CLAUDE-LAUF.md` wirken nach dem Veröffentlichen für alle Tester. Keine
  Pfade/Namen fest einbauen; bestehende Sicherungen (Formatversion, Sperre, max. 29 Einträge, Trockenlauf) behalten.

## Vorgaben
- **Vorprüfung:** `hasSortWork` = nur Inbox-Einträge ohne `sortError`. Phase e (`isPhaseEItem`, `phaseEItems`,
  Abschnitt „Einzuplanende Aufgaben“ in `lauf:start`, Einplanen vorhandener Aufgaben in `lauf:planen`/`anwenden`)
  entfällt vollständig – kein toter Code. `runs/last.json` ohne diesen Anteil (§3.8).
- **Entscheidungsformat** je Item zusätzlich (alle Pflichtangabe nur bei `type: "aufgabe"`, sonst weglassen oder
  `null`): `plan` (bool), `gtd` (`"naechster-schritt" | "warten" | "irgendwann"`), `dueDate` (`YYYY-MM-DD` | null),
  `waiting` (`{ person, since, followUpOn }` | null, Pflicht bei `warten`), `projectId` (ID eines aktiven Projekts,
  `"@neu"` oder null). Je Entscheidung `newProject`: `null` oder `{ "title", "notes", "categoryId" }`
  (`categoryId` darf `"@neu"` sein, wenn `newCategory` gesetzt ist). `"@neu"` als `projectId` nur mit `newProject` in
  derselben Entscheidung. `important` bleibt das Feld für ★ Fokus. Verständliche deutsche Meldungen bei Fehlern
  (wie bisher) – Claude soll sie korrigieren können.
- **Einplanen** exakt laut §8.4 Phase 9: a) Datum+Uhrzeit wie bisher; b) Datum ohne Uhrzeit nur bei `type: "termin"`
  oder `plan: true`; c) `plan: true` ohne Datum ab Tagesanfang (Dauer ≤ 15 zuerst, mind. 15 Min. Block); Aufgabe mit
  Datum ohne Uhrzeit und ohne `plan` ⇒ kein Termin, `dueDate` = Datum (das Skript setzt es, falls Claude es nicht
  getan hat); Notiz mit Datum ohne Uhrzeit ohne `plan` ⇒ kein Termin. „wichtig“ plant nichts.
  Dauer: ganze Minuten ≥ 1 werden übernommen (nicht mehr auf 15 gerundet); nur der Kalenderblock ist mind. 15 Min.
  und auf 15 aufgerundet.
- **Projekte:** `lauf:start` gibt die aktiven Projekte aus (ID, Titel, Ablage, Notiz gekürzt auf 200 Zeichen, offene
  Schritte als Titel) – unter einer klaren Überschrift. Projekt-Schritte bekommen `projectOrder` hinter allen Schritten
  (auch mehrere im selben Lauf in Reihenfolge der Entscheidungen) und die `categoryId` des Projekts. Neues Projekt ⇒
  `projects/<id>.json` laut §3.12 (`series: []`, `status: "aktiv"`, `v: 2`), ID im ID-Format, `notes` = Originaltext;
  die Items der Entscheidung mit `projectId: "@neu"` werden dessen Schritte. `runs/last.json` bekommt `projectIds`.
- Vom Lauf geschriebene Items tragen `v: 2` und die GTD-Felder; vorhandene Items liest der Lauf über `migrateItem`.
- `lauf:pruefen`/`validateDataRepo`: `projects/` prüfen (Form laut §3.12, unbekannte Felder erlaubt); neue Item-Felder
  mit falschem Typ ⇒ Warnung wie bei anderen Feldern, Item-Felder `≥ 1` für `durationMin`.
- `docs/CLAUDE-LAUF.md`: Regeln 5–10 laut SPEC §8.3 Phase 9 (Fokus statt wichtig, Status mit Beispielen, Projekt
  eindeutig/ausdrücklich, kurze Dauern, ausdrückliches Einplanen), neues Entscheidungsformat mit Beispiel, Abschnitt zu
  Phase e entfernen, Schritt 1 „ARBEIT 0 mit Einzuplanenden Aufgaben“ entfernen. Kurz und eindeutig bleiben.

## Abnahmekriterien
1. `hasSortWork`: offene wichtige Aufgabe ohne Termin und leere Inbox ⇒ `false` (App, Action, `lauf:start` – Tests).
2. Entscheidung `important: true`, ohne Datum, ohne `plan` ⇒ Item mit `important: true`, `schedule: null`, kein Event
   in `plan.json` (Test).
3. `plan: true` mit Datum morgen ohne Uhrzeit ⇒ Event an diesem Tag; `plan: true` ohne Datum ⇒ Event ab Tagesanfang
   (Tests).
4. Aufgabe mit `when` = Datum ohne Uhrzeit, ohne `plan` ⇒ kein Event, `dueDate` gesetzt; mit Uhrzeit ⇒ Event wie
   bisher; `type: "termin"` mit Datum ohne Uhrzeit ⇒ Block wie bisher (Tests).
5. `gtd: "warten"` ohne `waiting` ⇒ Fehlermeldung; mit `waiting` ⇒ Item korrekt (Test).
6. Schritt zu bestehendem Projekt ⇒ `projectId`, `projectOrder` hinten, Ablage des Projekts (Test); zwei im selben
   Lauf ⇒ fortlaufende Reihenfolge (Test).
7. `newProject` ⇒ `projects/<id>.json` gültig laut §3.12, Originaltext in `notes`, erster Schritt verknüpft,
   `runs/last.json.projectIds` (Test); `"@neu"` ohne `newProject` ⇒ Fehlermeldung (Test).
8. Dauer 2 ⇒ Item `durationMin: 2`; mit `plan` ⇒ Kalenderblock 15 Min. (Test).
9. Trockenlauf-Pfad (`--daten`, `--jetzt`, `--ohne-git`) funktioniert weiter; bestehende Tests angepasst, nicht
   abgeschwächt (jede entfernte Phase-e-Prüfung in der Zusammenfassung nennen).
10. `lauf:pruefen` akzeptiert ein Daten-Repo mit `projects/` und Items mit neuen Feldern; meldet ein ungültiges Projekt.
11. `npm run lint`, `npm test`, `npm run build` grün.
