# 93 – Reiter „Warte auf“ und „Irgendwann“

## Ziel
Die Reiter „Warte auf“ und „Irgendwann“ bekommen ihre vollständige Darstellung und Aktionen (SPEC §6.3.1).

## Bereich
- `src/pages/tasks/` (neue Komponenten z. B. `WaitingTab.tsx`, `SomedayTab.tsx`, + CSS + Tests; Einbau in die
  Reiter-Leiste aus 92)
- **Tabu:** `src/data/**`, `src/lib/gtd.ts` (nur benutzen), `src/components/**` (nur benutzen), übrige Seiten, `scripts/`.

## Vorgaben
- **Warte auf:** Sortierung und Darstellung laut §6.3.1 (Person/Was, „seit X Tagen“ – „seit heute“, „seit 1 Tag“,
  „seit N Tagen“; „nachhaken am <Wochentag Datum>“). `followUpOn` ≤ heute ⇒ deutlich hervorgehoben (Fläche/Kante in
  `--status-focus`, Text „heute nachhaken“ bzw. „nachhaken seit <Tag>“), nicht nur über Farbe.
  Knopf **„Antwort erhalten“** öffnet eine kleine Auswahl (Dialog): „Erledigt (archivieren)“ (wie Checkbox, mit
  Rückgängig) / „Daraus nächsten Schritt machen“ (Status wechseln, `waiting: null`, danach ItemEditor öffnen) /
  „Abbrechen“. Titel antippen ⇒ ItemEditor.
- **Irgendwann:** nach Ablage gruppiert, neueste zuerst; Knopf **„Aktivieren“** ⇒ Nächster Schritt, kurze Meldung
  „Aktiviert – steht jetzt unter Aktuell“. Titel antippen ⇒ ItemEditor.
- Projekt-Schritte mit diesem Status erscheinen ebenfalls (mit Projektname).
- Leere Zustände: „Du wartest gerade auf nichts.“ bzw. „Nichts für irgendwann – Ideen landen hier über die Erfassung.“
- **Nachtrag aus dem Review von 92** (SPEC §6.3.1): Der Fokus-Hinweis „Mehr als 5 …“ steht oben im Reiter „Aktuell“
  und erscheint auch, wenn der Abschnitt Fokus leer ist (alle Fokus-Aufgaben stehen z. B. unter Heute). Test dazu.
- Gestaltung ruhig, Status-Farben aus `--status-*`, Tippflächen ≥ 44 px, 360 px ohne waagerechtes Scrollen.

## Abnahmekriterien
1. Warte-auf-Liste sortiert (fällig zuerst), „seit X Tagen“ korrekt über Monatsgrenze und Zeitumstellung (Tests).
2. Nachhaken heute und gestern hervorgehoben (Text + Klasse), morgen nicht (Test).
3. „Antwort erhalten“ → beide Wege und Abbrechen (Tests).
4. „Aktivieren“ setzt den Status, Eintrag erscheint im Reiter „Aktuell“ (Test).
5. Anzahl in der Reiter-Leiste stimmt (Test).
6. `npm run lint`, `npm test`, `npm run build` grün.
