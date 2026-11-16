# 90 – GTD-Datenmodell, Projekte, Migration

## Ziel
Die Datenschicht kennt die GTD-Felder an Aufgaben (SPEC §3.3 „GTD-Felder“), Projekte in `projects/` (§3.12, ohne
Serien-Anlage – die kommt in 91) und die Migration beim Lesen (§3.13). Dazu reine Hilfsfunktionen für Status,
Sortierung und Filter, die die Oberfläche (92–96) nutzt. Keine sichtbare Änderung an der Oberfläche.

## Bereich
- `src/data/types.ts` (+ Test): neue optionale Item-Felder, Typ `Project`/`StepSeries`, Type Guards, Normalisierung
- neu `src/lib/gtd.ts` (+ Test): reine Funktionen (siehe unten)
- neu `src/lib/gtdMigration.ts` (+ Test): `migrateItem` – rein, ohne Abhängigkeit von `src/data/`, damit 97 sie aus
  den Lauf-Skripten benutzen kann (wie `src/lib/sortWork.ts`)
- `src/data/repository.ts` (+ Tests): Projekt-Funktionen, `v: 2`, Abschließen/Wiederherstellen, Ablage löschen
- `src/data/sync.ts` (+ Test): `projects/` herunterladen/hochladen wie `items/`
- `src/data/hooks.ts`: `useProjects()`
- `src/test/fakeGithub.ts` nur falls für `projects/` nötig
- **Tabu:** `src/pages/**`, `src/components/**`, `src/lib/sortWork.ts`, `scripts/`, `docs/` außer dieser Datei.

## Vorgaben
- **Item-Felder** exakt laut §3.3 (`gtd`, `dueDate`, `waiting`, `projectId`, `projectOrder`, `seriesId`,
  `seriesNumber`, `archivedWithProject`, `v`). Type Guard: ungültige Werte in **neuen** Feldern machen den Eintrag
  **nicht** ungültig, sondern werden beim Normalisieren wie „fehlt“ behandelt; das Rohfeld bleibt im lokalen Speicher
  unverändert (gleiches Muster wie `sortError` bei Inbox). Unbekannte Felder bleiben wie bisher erhalten.
- `durationMin` darf jede ganze Zahl ≥ 1 sein (prüfen, dass nichts in `src/data/` auf 15 rundet oder abweist).
- **Migration (`migrateItem`)**: rein und idempotent laut §3.13: offene Aufgabe ohne gültiges `gtd` ⇒
  `"naechster-schritt"`; alles andere unverändert; `important` bleibt. `normalizeItem` benutzt sie.
  Kein Massen-Schreiben beim Start; geschrieben wird nur bei einer Änderung des Eintrags.
- **`v: 2`**: Jede Schreibaktion der App auf `items/<id>.json` und `projects/<id>.json` setzt `v: 2`.
- **Projekt** (`projects/<id>.json`) laut §3.12 inkl. `series` (fehlt ⇒ `[]`; Serien nur lesen/speichern, keine
  Anlage). Type Guard + Normalisierung wie bei Items, unbekannte Felder erhalten (auch in Serien-Objekten).
- **Repository-Funktionen** (Namen frei, sinnvoll): Projekte auflisten/anlegen/ändern/löschen (löschen nur ohne
  Schritte, sonst Fehler mit deutscher Meldung); Schritt anlegen (hinten anhängen: `projectOrder` = größtes + 1);
  Schritt verschieben (↑/↓: Tausch bzw. Neuberechnung, sodass nur nötige Dateien geschrieben werden); Projekt
  abschließen und wiederherstellen exakt laut §3.12; GTD-Status setzen inkl. `waiting` (Wechsel weg von „warten“ ⇒
  `waiting: null`; Wechsel auf „warten“ ohne Angabe ⇒ `since` = heute, `person` = ""); „Antwort erhalten“ als
  Erledigen bzw. Umwandeln in Nächster Schritt; „Aktivieren“.
- `completeItem`/`restoreItem` bleiben wie bisher (Google-Termin-Regeln unverändert). Zusätzlich: Wiederherstellen
  eines Schritts, dessen Projekt `erledigt` ist ⇒ Projekt wieder `aktiv` (§6.4 Erledigt).
- `deleteCategory`: Projekte der Ablage wandern in die Zielablage (§3.5).
- Alle Schreibaktionen: lokal + Outbox wie bisher, UI wartet nie aufs Netz.
- **`src/lib/gtd.ts`** – reine Funktionen mit `now: Date` als Parameter, Zeitzone Europe/Berlin:
  - `displayStatus(item)` ⇒ `'termin' | 'naechster-schritt' | 'warten' | 'irgendwann' | null` (null für Nicht-Aufgaben
    und Erledigtes)
  - `isQuick(item)` (⚡, `durationMin ≤ 2`), `isDueOverdue(item, now)`, `followUpDue(item, now)`,
    `waitingDays(item, now)`
  - `nextStepOf(project, items)`, `projectProgress(project, items)` ⇒ `{ done, total }`, `needsNextStep(project, items)`
  - `sortNextSteps(items)` laut §6.3.1 Punkt 3; `filterByTime(items, limit: 15 | 30 | 60 | null)` (fehlende Dauer
    fällt bei gesetztem Limit heraus)
  - `focusItems`, `todayAndOverdue`, `nextStepsSection` (nur nächster Schritt je Projekt), `plannedLater`,
    `waitingItems` (Sortierung laut §6.3.1), `somedayItems` – jeweils aus `items` (+ `projects`) und `now`
  - `focusOverLimit(items)` (> 5)

## Abnahmekriterien
1. Ein Eintrag im Format von heute (ohne neue Felder) wird gelesen als: offene Aufgabe ⇒ `gtd: "naechster-schritt"`;
   mit `schedule` ⇒ `displayStatus` `'termin'`; `important: true` bleibt (Fokus); Notiz, Einkauf, Termin, Erledigtes
   unverändert. `migrateItem(migrateItem(x))` = `migrateItem(x)` (Tests).
2. Ein Eintrag mit ungültigen neuen Feldern (z. B. `gtd: "xyz"`, `dueDate: 5`) bleibt sichtbar, Felder gelten als
   „fehlt“, Rohdaten im Speicher unverändert (Test).
3. **Abwärtskompatibilität:** Ein Eintrag mit allen neuen Feldern und einem unbekannten Feld übersteht
   `updateItem` (z. B. Titel ändern), `completeItem`, `restoreItem`, `setChecked`, Ablage löschen und einen
   Sync-Hin-und-Rückweg ohne Verlust eines Feldes (Tests). Diese Wege gab es schon in 0.8.1 – das sichert, dass
   ältere Apps die Felder behalten. Ergebnis in der Zusammenfassung ausdrücklich nennen, auch ob `ItemEditor`
   (unverändert, nur lesen!) beim Speichern ein vollständiges Patch oder nur geänderte Felder schickt.
4. Schreibaktionen setzen `v: 2` an Item- und Projektdateien; reine Lesevorgänge schreiben nichts (Outbox leer nach
   Start mit 20 alten Einträgen – Test).
5. Projekte: anlegen, ändern, Schritt anhängen, ↑/↓, löschen (mit/ohne Schritte), abschließen (offene Schritte
   archiviert mit `archivedWithProject`, Serien `beendet`), wiederherstellen (genau diese Schritte zurück, Feld
   entfernt, bereits vorher erledigte Schritte bleiben erledigt) – Tests.
6. Wiederherstellen eines einzelnen Schritts reaktiviert das erledigte Projekt (Test).
7. Ablage löschen verschiebt auch Projekte (Test).
8. Sync lädt `projects/` herunter und hoch, Konfliktregel wie bei `items/` (Test mit `fakeGithub`).
9. `src/lib/gtd.ts`: je Funktion Tests inkl. Grenzfälle (Sortierung überfällig/fällig/ohne Datum/Dauer, Zeitfilter mit
   fehlender Dauer, nur nächster Schritt je Projekt, Warte-auf-Sortierung, Nachhaken heute/gestern/morgen, Zeitzone
   um Mitternacht Europe/Berlin).
10. `npm run lint`, `npm test`, `npm run build` grün.

## Hinweise
- Datenformen nur in `types.ts`; keine `any`, keine blinden Casts.
- Ältere Lauf-Skripte und die GitHub Action werden hier nicht angefasst (97).
