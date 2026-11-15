# SecondBrain – Projektregeln

Persönliche PWA zum Erfassen, Sortieren und Einplanen. Fachliche Beschreibung: **docs/SPEC.md**.
Fortschritt: **docs/PROGRESS.md**. Aufgaben: **docs/tasks/NN-name.md**.

Sprache: Doku, UI-Texte, Commit-Nachrichten **Deutsch**. Code-Bezeichner (Variablen, Funktionen,
Typen, Dateinamen) **Englisch**; Datenwerte laut SPEC (z. B. `"aufgabe"`, `"erledigt"`) bleiben deutsch.

## Stack
- React 18 + TypeScript (strict) + Vite
- vite-plugin-pwa (Manifest, Service Worker, installierbar in Edge/Safari)
- Vitest + @testing-library/react + jsdom; `fake-indexeddb` für IndexedDB-Tests
- ESLint (typescript-eslint, react-hooks) + Prettier
- `idb` als dünner IndexedDB-Wrapper
- Keine UI-Bibliothek, kein State-Management-Framework, kein Router-Framework nötig
  (4 feste Seiten + Einstellungen). Weitere Abhängigkeiten nur mit Begründung in der Aufgabe.
- Hosting: Cloudflare Pages (Build `npm run build`, Ausgabe `dist/`)

## Ordnerstruktur
```
src/
  main.tsx, App.tsx          Einstieg, Seiten-Container (Wischen, Punkte-Leiste, Zahnrad)
  pages/                     capture/, calendar/, tasks/, categories/, settings/ – je Seite ein Ordner
  components/                wiederverwendbare UI (Button, Dialog, DateTimePicker …)
  data/
    types.ts                 Typen laut SPEC §3 (einzige Quelle für Datenformen)
    ids.ts                   ID-Erzeugung
    localStore.ts            IndexedDB (Einträge, Outbox, lokale Zugangsdaten)
    github.ts                GitHub REST API (Contents)
    sync.ts                  Outbox, Abgleich, Konflikte
    hooks.ts                 React-Hooks für die UI (useItems, useInbox …)
  google/                    auth.ts (GIS), calendar.ts (Calendar API)
  speech/                    Web Speech API Wrapper
  lib/                       reine Hilfsfunktionen (Datum, Planungsfenster …)
  styles/                    globale CSS-Variablen (dunkles Thema)
public/                      Icons, statische Dateien
docs/                        SPEC, PROGRESS, tasks/, Anleitungen (setup-*.md)
```
Tests liegen neben dem Code: `foo.ts` → `foo.test.ts`.

## Befehle
| Befehl | Zweck |
|---|---|
| `npm install` | Abhängigkeiten |
| `npm run dev` | Entwicklungsserver (http://localhost:5173) |
| `npm run lint` | ESLint + `tsc --noEmit` |
| `npm test` | Vitest einmalig (`vitest run`) |
| `npm run build` | Produktions-Build nach `dist/` |
| `npm run preview` | Build lokal ansehen (PWA-Installation testen) |
| `npm run format` | Prettier |

**Fertig heißt:** `npm run lint`, `npm test` und `npm run build` sind grün.

## Kanäle und Veröffentlichen
- `main` = Entwicklung, deployt auf die Vorschau `main.<projekt>.pages.dev` (nur Entwickler). `stable` =
  Standardzweig, deployt auf die Produktiv-Adresse für alle.
- Der Projektleiter arbeitet und committet auf `main`; Push auf `main` nur nach Freigabe des Nutzers.
- **Veröffentlichen** nur auf ausdrücklichen Wunsch des Nutzers, nachdem er die Vorschau getestet hat:
  Version in `package.json` (+ Lockfile) erhöhen, lint/test/build grün, `main` → `stable` mergen
  (fast-forward bzw. Merge-Commit), `stable` pushen; danach prüfen, dass die Produktiv-Adresse die neue
  Version zeigt.
- Workflow, Skripte (`scripts/action`, `scripts/lauf`) und `docs/CLAUDE-LAUF.md` wirken für alle Tester ab
  `stable` ⇒ Änderungen daran besonders vorsichtig; Formatänderungen nur über SPEC §3.11.
- Öffentliches Repo: nie Geheimnisse, persönliche Daten oder echte Einträge committen.

## Code-Regeln
- TypeScript strict, **kein `any`**, keine `@ts-ignore`. Externe Daten (GitHub, Google, JSON) an
  der Grenze prüfen (Type Guards), nicht blind casten.
- Funktionskomponenten + Hooks. Logik in reine Funktionen (`lib/`, `data/`), damit sie testbar ist;
  Komponenten bleiben dünn.
- **UI greift nie direkt** auf GitHub, IndexedDB oder Google zu – nur über `data/` bzw. `google/`.
- Datenformate exakt laut SPEC §3. Unbekannte Felder beim Lesen erhalten und zurückschreiben.
  Änderungen am Format nur über die SPEC (Projektleiter).
- Jede Schreibaktion: zuerst lokal (IndexedDB) + Outbox, UI wartet nie auf das Netz.
- **Geheimnisse:** GitHub-Token nur in IndexedDB, Google-Access-Token nur im Speicher. Niemals in
  Code, Tests, Logs, URLs, Fehlermeldungen oder Commits. Google-Client-ID kommt aus `VITE_GOOGLE_CLIENT_ID`.
- Netzwerkfehler und Offline immer abfangen und für den Nutzer verständlich anzeigen (deutsch).
- Datum/Zeit: native `Date` + `Intl`, Zeitzone `Europe/Berlin`, ISO 8601 mit Offset speichern.
- Styling: CSS-Module oder schlichtes CSS mit Variablen aus `styles/`; dunkles Thema, gute Kontraste,
  Tastaturbedienung und `aria-label` für Symbolknöpfe.
- Kleine, fokussierte Dateien. Keine toten Codepfade, kein auskommentierter Code.
- Tests: jedes prüfbare Abnahmekriterium hat einen Test. Externe APIs werden gemockt (`fetch`,
  `google.accounts`, `SpeechRecognition`). Kein Test darf ins echte Netz gehen.

## Claude-Lauf (Phase 3)
Sagt der Nutzer **„verarbeite SecondBrain“**, führe genau `docs/CLAUDE-LAUF.md` aus (echter Lauf, keine
Projektleiter-Arbeit, keine Rückfragen). Der stündliche Lauf ist eine geplante Aufgabe mit demselben Auftrag.

## Workflow pro Feature (Projektleiter = Opus)
Der Projektleiter plant, delegiert und prüft; er schreibt möglichst keinen Code selbst.

1. **Aufgabe schreiben:** `docs/tasks/NN-name.md` (fortlaufende Nummer) mit
   - Ziel (1–3 Sätze, Verweis auf SPEC-Abschnitt)
   - Betroffene Dateien / Bereich (alles andere ist tabu)
   - Abnahmekriterien – nummeriert, einzeln prüfbar (automatisiert oder klar manuell)
   - ggf. erlaubte neue Abhängigkeiten, Hinweise, Nicht-Ziele
2. **Umsetzen:** Subagent `implementer` mit dem Pfad der Aufgabe starten.
3. **Prüfen:** Subagent `reviewer` mit demselben Pfad starten.
4. **Kritische Punkte** → neuer `implementer`-Auftrag mit genau diesen Korrekturen, danach erneut
   `reviewer`. **Höchstens 2 Korrekturrunden**, danach den Nutzer fragen.
5. Der Projektleiter liest **nur Zusammenfassung und Review**, Code nur bei Unklarheiten.
6. **Abschluss:** Git-Commit (Projektleiter), `docs/PROGRESS.md` aktualisieren, dem Nutzer sagen,
   **was** er **wie** testen soll (konkrete Schritte).
7. **Parallel** nur Aufgaben ohne gemeinsame Dateien.

Implementer und Reviewer committen und pushen nie. Freigaben (SPEC-Änderungen, Phasenwechsel,
Deployment, Einrichtung externer Dienste) holt der Projektleiter beim Nutzer ein.
