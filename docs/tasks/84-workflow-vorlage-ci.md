# 84 – Wiederverwendbarer Workflow, Vorlage für das Daten-Repo, CI

## Ziel
Tester bekommen ein Daten-Repo aus einer Vorlage, dessen Workflow nur einen kurzen Aufruf enthält; Logik und Skript
kommen immer von `stable` des Code-Repos (SPEC §3.1, §3.10, §8.1; Klärung 77 K2). Fehlen die Secrets, meldet die Action
`nicht-eingerichtet`. Dazu ein CI-Workflow für das Code-Repo (Voraussetzung für den Branch-Schutz).

## Bereich
- `scripts/action/sortieren.ts` (+ Test); `scripts/action/sortieren.yml` (alte Kopier-Vorlage) entfällt
- neu `.github/workflows/sortieren.yml` (nur `on: workflow_call`), neu `.github/workflows/ci.yml`
- neu `vorlage/daten-repo/` (Inhalt der späteren öffentlichen Vorlage `secondbrain-vorlage`) + Test
- Lesen/Importieren erlaubt: `src/lib/dataFormat.ts`, `src/lib/sortWork.ts`, `src/lib/sortLock.ts`
- **Tabu:** `src/data/defaults.ts`, `scripts/lauf/dataDir.ts`, `docs/CLAUDE-LAUF.md`, `docs/ROUTINE-PROMPT.md`
  (parallel in 79), `.github/ISSUE_TEMPLATE/` (fertig), `src/pages/**`.

## Vorgaben
### Wiederverwendbarer Workflow `.github/workflows/sortieren.yml`
- `on: workflow_call` mit `inputs.request-id` (string, required), `inputs.code-repo` (Standard `Mc-Babex/secondbrain`),
  `inputs.code-ref` (Standard `stable`); `secrets: ROUTINE_FIRE_URL`, `ROUTINE_FIRE_TOKEN` jeweils `required: false`.
- Ein Job, `permissions: contents: write`, `timeout-minutes: 5`, `concurrency: { group: sortieren, cancel-in-progress:
  false }`. Schritte: Daten-Repo (aufrufendes Repo) auf `main` mit `fetch-depth: 0` auschecken; Code-Repo per
  `actions/checkout` (`repository: inputs.code-repo`, `ref: inputs.code-ref`, `path: .secondbrain-code`, ohne
  Zugangsdaten, nur nötige Ordner per `sparse-checkout`); Node 24; Git-Identität `github-actions[bot]` wie bisher;
  Skript aus `.secondbrain-code/scripts/action/sortieren.ts` im Daten-Repo ausführen. Der Code-Ordner darf nie
  committet werden (Skript stellt sicher, dass nur `runs/started.json`/`runs/trigger.json` committet werden).
- Keine Secrets im Log, keine Ausgabe der URL.

### Skript `scripts/action/sortieren.ts`
- Neu Schritt 0: fehlt `ROUTINE_FIRE_URL` oder `ROUTINE_FIRE_TOKEN` (leer zählt als fehlt) ⇒ `runs/trigger.json` mit
  `result: "nicht-eingerichtet"` schreiben, **keine** Sperre, kein Start, Exit 0.
- Neu: Formatversion (SPEC §3.11) wie die Lauf-Skripte prüfen – nicht unterstützt ⇒ `result: "fehler"`, `message` mit
  der gemeinsamen Meldung, nichts gestartet, keine Sperre. Möglichst `src/lib/dataFormat.ts` wiederverwenden (Import
  mit Pfad relativ zum Code-Checkout); falls technisch nicht möglich, begründen.
- Bisheriges Verhalten (Arbeit, Sperre, genau ein Start, Ergebnisse) unverändert; bestehende Tests grün.

### Vorlage `vorlage/daten-repo/`
- `secondbrain.json` `{ "format": 1 }`, `categories.json` mit den Start-Ablagen **exakt** laut SPEC §3.5, `settings.json`
  mit Planungsfenster 09:00–19:00, Pause 12:00–13:00, `timezone`, `"autoSort": false`, `inbox/.gitkeep`,
  `items/.gitkeep`, `.gitignore` mit `.lauf/`, `README.md` (kurz, deutsch: was das Repo ist, privat lassen, Verweis auf
  die Tester-Anleitung im Code-Repo).
- `.github/workflows/sortieren.yml` (Aufrufer, ~15 Zeilen): `on: repository_dispatch: types: [sortieren]`, ein Job mit
  `uses: Mc-Babex/secondbrain/.github/workflows/sortieren.yml@stable`, `with: request-id: ${{ github.event.client_payload.requestId }}`,
  `secrets:` beide **ausdrücklich** weitergereicht (kein `inherit`), `permissions: contents: write`.

### CI `.github/workflows/ci.yml`
- `on: push` und `pull_request` für `main` und `stable`; `permissions: contents: read`; `npm ci`, `npm run lint`,
  `npm test`, `npm run build`; keine Secrets (Build ohne `VITE_GOOGLE_CLIENT_ID` muss durchlaufen).

## Abnahmekriterien
1. Skript: ohne Secrets ⇒ `nicht-eingerichtet`, kein `started.json`, kein Start-Aufruf (Test).
2. Skript: `{format:2}` ⇒ `fehler` mit Meldung, keine Sperre, kein Start (Test).
3. Bisherige Skript-Tests grün (Arbeit, Sperre, genau ein Start, Netzfehler, 429).
4. Vorlage: `lauf:pruefen --daten vorlage/daten-repo` meldet OK; App-Type-Guards akzeptieren `categories.json` und
   `settings.json`; Ablagen entsprechen SPEC §3.5 (Test).
5. Test prüft die YAML-Dateien als Text: wiederverwendbarer Workflow hat nur `workflow_call`, Secrets `required: false`,
   Code-Checkout ohne `persist-credentials`; Aufrufer nutzt `@stable` und reicht beide Secrets einzeln weiter, kein
   `secrets: inherit`; CI hat `permissions: contents: read` und keine `secrets.`-Verweise.
6. `npm run lint`, `npm test`, `npm run build` grün.
7. Manuell (Projektleiter mit Nutzer, nach 87): Probe-Daten-Repo aus der Vorlage, `repository_dispatch` ohne Secrets ⇒
   `nicht-eingerichtet`; mit Secrets ⇒ `gestartet`.
