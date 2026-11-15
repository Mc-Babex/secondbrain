# 87 – Öffentliches Code-Repo: bereinigte Kopie, Prüfung, Prüfliste

## Ziel
Das neue öffentliche Repo `secondbrain` startet mit **einem** Commit ohne Historie, ohne Geheimnisse und ohne
persönliche Daten (Phase-8-Entscheidungen E2, E4, E5; SPEC §1.1). Diese Aufgabe bereitet die Kopie vor und prüft
sie; Commit, Push und alle Einstellungen bei GitHub/Cloudflare/Google macht der Projektleiter mit dem Nutzer.

## Bereich
- Im Projekt-Repo: neu `README.md` (Wurzel), neu `docs/OEFFENTLICHES-REPO.md` (Prüfliste), neu
  `docs/PROGRESS-oeffentlich.md` (wird in der Kopie zu `docs/PROGRESS.md`, siehe unten).
- Außerhalb des Repos: Kopie im Nachbarordner `secondbrain-oeffentlich` neben dem Projekt-Repo (neu anlegen;
  existiert er, abbrechen und melden), Sperrliste und Prüfskript im Nachbarordner `secondbrain-pruefung`
  (**nie** im Repo, nie in der Kopie).
- **Tabu:** alle übrigen Dateien im Projekt-Repo, `git commit`, `git push`, `git init` in der Kopie (macht der
  Projektleiter), jeder Netzzugriff außer `npx`-Paketdownload und `npm ci` in der Kopie.

## Vorgaben
### Kopie erzeugen
- Quelle ist **nur** der committete Stand: `git archive HEAD` in die Kopie entpacken (keine unversionierten Dateien,
  kein `node_modules`, kein `dist`, kein `.git`).
- In der Kopie entfernen: `docs/tasks/01-*` bis `docs/tasks/75-*` (alle Dateien mit Nummer < 76),
  `docs/offene-fehler-*.md`, `.env.local.txt`, `docs/PROGRESS.md`, `docs/PROGRESS-oeffentlich.md` (nach dem Umbenennen).
- `docs/PROGRESS-oeffentlich.md` → in der Kopie `docs/PROGRESS.md`.
- Sonst nichts ändern. Muss etwas Weiteres raus oder geändert werden (Fund der Prüfung), **im Projekt-Repo**
  ändern (erlaubt: Ersetzen persönlicher Begriffe in Doku/Tests/Fixtures durch neutrale, ohne Bedeutung zu ändern),
  Kopie neu erzeugen und melden.

### Neue Dateien im Projekt-Repo
- `README.md`: 10–20 Zeilen deutsch: was SecondBrain ist (persönliche PWA: erfassen, sortieren, einplanen),
  „Testphase – Teilnahme nur auf Einladung“, Verweise auf `docs/TESTER-ANLEITUNG.md`, `docs/SPEC.md`,
  `docs/EINRICHTUNG.md`; Feedback über die Issue-Vorlagen; **keine Lizenz** – Satz „Alle Rechte vorbehalten. Der Code
  ist zum Lesen öffentlich; Nutzung nur im Rahmen der Testphase.“ (E5). Keine App-Adresse, keine persönlichen Daten.
- `docs/PROGRESS-oeffentlich.md`: kurzer neutraler Stand: Phasentabelle 1–8 (Titel + Status, ohne Praxistest-
  Details, Daten, Echtlauf-Ergebnisse), Phase-8-Tabelle der Aufgaben 76–88 mit Status, Hinweis „Aufgaben ab 76 liegen
  in `docs/tasks/`; frühere Aufgaben sind nicht öffentlich.“
- `docs/OEFFENTLICHES-REPO.md` (Prüfliste, öffentlich, **ohne** die persönlichen Suchbegriffe selbst):
  1. Was nie ins Repo darf (Tokens, Secrets, Client-IDs/Projekt-IDs, echte Einträge, E-Mail-Adressen, Pfade mit
     Benutzernamen, echte Kalender-/Vereins-/Arbeitgebernamen, Daten-Repo-Inhalte).
  2. Vor jedem Veröffentlichen auf `stable` und vor jedem Push: Befehle für (a) Geheimnis-Scan mit secretlint per
     `npx` (genauer Befehl), (b) `git grep` mit der **lokalen** Sperrliste (Pfad außerhalb des Repos, Format eine
     Regex je Zeile), (c) Blick in `git diff --stat` auf unerwartete Dateien.
  3. Git-Autor: `Mc-Babex <211354821+Mc-Babex@users.noreply.github.com>`; Einstellung „Keep my email addresses
     private“ und „Block command line pushes that expose my email“.
  4. Repo-Einstellungen, die gesetzt sein müssen (nur aufzählen; Anleitung macht der Projektleiter): 2FA,
     Schutz von `stable`/`main` gegen Force-Push und Löschen, Actions: Freigabe für Workflows aus Forks, Standard-
     Workflow-Rechte „read“, Labels `fehler`/`wunsch`.
  5. Was bei einem Fund zu tun ist (Commit nicht pushen; wurde gepusht: Geheimnis sofort widerrufen, nicht nur löschen).

### Prüfung (außerhalb des Repos)
- Sperrliste: liegt bereits (vom Projektleiter angelegt) außerhalb des Repos im Ordner `secondbrain-pruefung` neben
  dem Projekt-Repo, Datei `sperrliste.txt` (eine Regex je Zeile, Groß/klein egal). Ergänzen um die echte
  Google-Client-ID aus `.env.local.txt` des Projekt-Repos (Wert nur in die Sperrliste schreiben, **nie ausgeben**, auch
  nicht in der Zusammenfassung). Die Begriffe der Sperrliste nie in Dateien im Repo oder in der Kopie schreiben
  (auch nicht in diese Aufgabe oder die Prüfliste).
- Prüfen in der Kopie: (a) `npx secretlint` mit empfohlener Regelvoreinstellung über alle Dateien,
  (b) Sperrliste über alle Dateien (inkl. Binärdateien als Text, z. B. SVG/PNG-Metadaten),
  (c) Liste aller Dateien der Kopie, gruppiert nach Ordner, gegen die Erwartung prüfen (keine Logs, kein `.claude/worktrees`,
  keine Lauf-Ausgaben `.lauf/`, keine `runs/`-Dateien mit echten Inhalten),
  (d) `.claude/` sichten: nur `agents/implementer.md`, `agents/reviewer.md`, `launch.json` – Inhalt auf Persönliches prüfen,
  (e) Fixtures/Testdaten stichprobenartig auf echte Termine/Namen.
- Funde, die harmlos sind (z. B. `Mc-Babex` als Repo-Besitzer in Links, Workflow-Verweis, Feedback-Link; die Figur;
  „Studium“ als allgemeine Test-Ablage laut E3), einzeln begründet auflisten.
- In der Kopie `npm ci`, `npm run lint`, `npm test -- --maxWorkers=2`, `npm run build` grün (Tests dürfen nicht von
  entfernten Dateien abhängen; falls doch: im Projekt-Repo beheben).

## Abnahmekriterien
1. Kopie existiert, enthält genau den committeten Stand abzüglich der Ausschlüsse; `docs/tasks/` enthält nur 76+.
2. secretlint: 0 Funde (oder jeder Fund als Platzhalter begründet).
3. Sperrliste: 0 Funde außer begründeten Ausnahmen; die Sperrliste liegt nicht in Repo oder Kopie.
4. `README.md`, `docs/OEFFENTLICHES-REPO.md`, neues PROGRESS wie vorgegeben; kein persönlicher Suchbegriff darin.
5. lint, test, build in der Kopie grün; im Projekt-Repo ebenfalls (falls dort etwas geändert wurde).
6. Zusammenfassung nennt: Anzahl Dateien der Kopie, Ausschlüsse, Funde + Begründungen, geänderte Dateien im
   Projekt-Repo – **ohne** die Client-ID oder andere persönliche Werte zu zitieren.
