# 79 – Neutrale Standardwerte und Erkennung des Daten-Repos

## Ziel
Nichts in App und Skripten ist mehr auf den Entwickler zugeschnitten (SPEC §1.1, §3.5, §3.7, §3.11, §8.1): keine
Vorbelegung des Repos, neutrale Start-Ablagen, Daten-Repo mit beliebigem Namen. Bestehende Daten bleiben unverändert.

## Bereich
- `src/data/defaults.ts` (+ Test), Stellen, die `DEFAULT_GITHUB_REPO` nutzen (`src/pages/settings/SetupGithubStep.tsx`,
  `GithubSection.tsx`, `githubForm.ts`, zugehörige Tests, `SetupSection.test.tsx`)
- `scripts/lauf/dataDir.ts` (+ Test), `scripts/lauf/start.test.ts` (Beschreibung der Ablage „Arbeit“)
- `docs/CLAUDE-LAUF.md` (nur Abschnitt zum Datenordner und Abschnitt 0, kein Regelinhalt), `docs/ROUTINE-PROMPT.md`
- **Tabu:** `scripts/action/`, `.github/`, `vorlage/` (parallel in 84), `src/data/sync*.ts`, `src/lib/appUpdate.ts`,
  Testsätze `docs/sortier-tests*.md`.

## Vorgaben
- **Start-Ablagen** exakt laut SPEC §3.5: privat „Alles Persönliche: Haushalt, Arzttermine, Behörden, Freizeit …“,
  arbeit „Alles zu Beruf, Job oder Ausbildung“, einkauf, erledigt (Reihenfolge 1–4). Kein `studium` mehr. Sie gelten
  nur, wenn `categories.json` fehlt – vorhandene Dateien werden nie verändert (bestehende Tests dazu müssen grün bleiben).
- **Repo-Feld** ohne Vorbelegung: leer, Platzhalter `dein-konto/secondbrain-daten`. `DEFAULT_GITHUB_REPO` entfällt.
  Geräte, auf denen bereits ein Repo gespeichert ist, zeigen weiter ihren Wert.
- **Datenordner der Skripte** (SPEC §3.11): `--daten` vor `SECONDBRAIN_DATEN` vor einem **Nachbarordner des Code-Repos
  mit `secondbrain.json`** vor `../secondbrain-daten`. Mehrere Nachbarordner mit `secondbrain.json` ⇒ verständlicher
  Fehler (Pfad mit `--daten` angeben). Das Code-Repo selbst zählt nicht. Fehlermeldung nennt alle Wege.
- **CLAUDE-LAUF.md:** Datenordner neutral beschreiben („das Daten-Repo neben dem Code-Repo; die Skripte finden es
  selbst“), keine festen Namen. In Abschnitt 0: Code-Repo kann unter beliebigem Namen unter `/home/user/` liegen.
- **ROUTINE-PROMPT.md** für alle Nutzer: Routine im eigenen Claude-Konto; Repositories: zuerst das öffentliche Code-Repo
  `Mc-Babex/secondbrain` (Standardzweig `stable`), dann das eigene Daten-Repo; Setup-Skript `cd /home/user/secondbrain &&
  npm ci || true`; Connector nur Google Calendar; Trigger nur API. Der kopierbare Routine-Prompt bleibt kurz und verweist
  auf `docs/CLAUDE-LAUF.md` im Code-Repo (kommt automatisch von `stable`). Keine persönlichen Angaben.

## Abnahmekriterien
1. `defaultCategories()` entspricht SPEC §3.5 (4 Ablagen, Texte exakt); Test.
2. Fehlt `categories.json`, nutzen App und `lauf:start` die neuen Start-Ablagen; vorhandene `categories.json` mit
   `studium` bleibt unverändert und wird vollständig angezeigt/ausgegeben (Tests).
3. Einrichtung und GitHub-Abschnitt: Repo-Feld leer mit Platzhalter; gespeicherter Wert wird angezeigt (Tests).
4. `git grep -n "Mc-Babex" -- src scripts` findet nur noch die Konstante des Code-Repos in `src/lib/feedback.ts`.
5. `resolveDataDir`: Reihenfolge laut Vorgabe, Erkennung über `secondbrain.json`, Fehler bei zwei Kandidaten,
   Rückfall `../secondbrain-daten` (Tests mit temporären Ordnern).
6. `npm run lint`, `npm test`, `npm run build` grün.
