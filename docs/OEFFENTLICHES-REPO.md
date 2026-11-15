# Öffentliches Repo – Prüfliste

Dieses Repo ist öffentlich. Vor jedem Push und vor jedem Veröffentlichen auf `stable` wird geprüft, dass nichts
Persönliches oder Geheimes enthalten ist.

## 1. Was nie ins Repo darf
- Tokens und Secrets (GitHub, Google, Cloudflare, Routine-Zugang), auch nicht in Tests oder Logs
- Client-IDs und Projekt-IDs der eigenen Dienste (die Client-ID kommt aus `VITE_GOOGLE_CLIENT_ID`, nur lokal)
- echte Einträge, Notizen, Termine und Inhalte der Daten-Repos
- E-Mail-Adressen
- Pfade mit Benutzernamen
- echte Kalender-, Vereins- und Arbeitgebernamen
- Dateien wie `.env.local*`, Logs, `.lauf/`, `runs/`-Dateien mit echten Inhalten, `node_modules`, `dist`

## 2. Prüfung vor jedem Veröffentlichen
Die Sperrliste mit persönlichen Suchbegriffen liegt **lokal außerhalb des Repos** (eine Regex je Zeile,
Groß-/Kleinschreibung egal) und wird nie eingecheckt.

a) Geheimnis-Scan:
```
npx --yes -p @secretlint/secretlint-rule-preset-recommend -p secretlint secretlint --secretlintrc <Konfig> "**/*"
```
Die Konfiguration (`.secretlintrc.json` außerhalb des Repos) enthält die Regel
`@secretlint/secretlint-rule-preset-recommend`.

b) Sperrliste:
```
git grep -n -i -I -E -f <Pfad-zur-lokalen-Sperrliste>
```
Dateien ohne Treffer-Ausgabe sind sauber. Binärdateien zusätzlich mit `git grep -n -i -a -E -f <Pfad>` prüfen.

c) Übersicht: `git diff --stat` (bzw. `git status --short`) auf unerwartete Dateien ansehen.

## 3. Git-Autor
- Autor: `Mc-Babex <211354821+Mc-Babex@users.noreply.github.com>`
- Bei GitHub aktiv: „Keep my email addresses private“ und „Block command line pushes that expose my email“.

## 4. Repo-Einstellungen
- Zwei-Faktor-Authentifizierung für das Konto
- Schutz von `stable` und `main` gegen Force-Push und Löschen
- Actions: Freigabe für Workflows aus Forks erforderlich
- Standard-Workflow-Rechte: nur „read“
- Labels `fehler` und `wunsch` vorhanden

## 5. Bei einem Fund
- Noch nicht gepusht: Commit nicht pushen, Inhalt entfernen, Prüfung wiederholen.
- Bereits gepusht: Ein Geheimnis sofort **widerrufen** bzw. erneuern – Löschen aus dem Repo genügt nicht, weil
  es in der Historie und in Forks bleibt. Danach bereinigen und die Prüfung wiederholen.
