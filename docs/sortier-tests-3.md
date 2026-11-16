# Sortier-Testsatz 3: GTD-Regeln (Phase 9)

Prüfstand für SPEC §8.3 Regeln 5, 6, 8, 9, 10 und §8.4 (Phase 9): Status (`warten`, `irgendwann`), Projekte,
Fokus ohne Termin, ausdrückliches Einplanen. Gleiche Form wie `sortier-tests.md` (Satz 1), eigene Ausgangslage.
Aufruf: `npm run lauf:testdaten -- --ziel <ordner> --satz 3` und
`npm run lauf:vergleich -- --daten <ordner> --satz 3`. Ohne `--satz` gilt Satz 1.

Zusätzlich zu den Feldern der Sätze 1 und 2 prüft `lauf:vergleich` hier: `gtd` (Status), `dueDate` („fällig bis“),
`waiting` (`person` enthält den Teilstring, `followUpOn` genau; `null` = wartet nicht), `projectId` (`null` = kein
Projekt, ID eines vorhandenen Projekts oder `"@neu"` = das neue Projekt derselben Entscheidung) und je Fall
`newProject` (`titleMaxLen`, `categoryId`, `notesContains`; fehlt `newProject`, darf kein Projekt entstehen).
Nicht automatisch prüfbar und daher **manuell** zu lesen: der Wortlaut des vorgeschlagenen ersten Schrittes (Fall 5),
Titel der übrigen Einträge und die Dauer-Schätzung außerhalb der Fälle 11 und 12.

## Ausgangslage
- **Jetzt:** Mittwoch, 21.10.2026, 14:05 Uhr (Europe/Berlin, Sommerzeit +02:00).
- **Planungsfenster:** 09:00–19:00. **Pause: aus** (`"pause": null`).
- **Ablagen:** `privat`, `arbeit`, `studium` („Studium“, Beschreibung „Vorlesungen, Hausarbeiten, Prüfungen“),
  `einkauf` (Einkaufsliste), `erledigt` (Archiv); keine weiteren.
- **Aktive Projekte** (`projects/`, mit je einem offenen Schritt):
  - „Analysis 1“ (Ablage `studium`), Notiz „Vorlesung Analysis 1: Übungsblätter, Klausurvorbereitung“, Schritt
    „Übungsblatt 3 lösen“ – ID `20261020-100000-p001`.
  - „Umzug“ (Ablage `privat`), Notiz „Umzug in die neue Wohnung Anfang Dezember: Kartons, Nachsendeauftrag, Möbel“,
    Schritt „Nachsendeauftrag stellen“ – ID `20261020-100000-p002`.
- **Termine im Kalender `primary`:** Do 22.10. 09:00–10:30 „Sprachkurs“.
- Keine weiteren Einträge.

## Testsätze

| Nr. | Eingabe | Erwartet |
|---|---|---|
| 1 | Warte auf Rückmeldung von Jonas zum Angebot | Aufgabe · `warten` · Person Jonas · `followUpOn` leer · kein Termin |
| 2 | Hab die Vermieterin wegen der Heizung gefragt, Freitag nachhaken | Aufgabe · `warten` · Person Vermieterin · `followUpOn` Fr 23.10. · **keine** Frist (`dueDate` leer) · kein Termin |
| 3 | Irgendwann mal Spanisch lernen für den Urlaub | Aufgabe · Privat · `irgendwann` · nicht wichtig · kein Termin |
| 4 | Vielleicht neues Fahrrad anschauen | Aufgabe (kein Einkauf) · Privat · `irgendwann` · kein Termin |
| 5 | Neues Projekt Wohnung renovieren: Wände streichen, Boden neu | neues Projekt (Titel ≤ 60, Ablage Privat, Originaltext in der Notiz) · genau ein Schritt im neuen Projekt (Wortlaut manuell) |
| 6 | Analysis Übungsblatt Korrektur anschauen | Aufgabe · Studium · Schritt im Projekt „Analysis 1“ · kein neues Projekt |
| 7 | Umzugsfirma nach Preisen fragen | Aufgabe · Privat · Schritt im Projekt „Umzug“ · kein neues Projekt |
| 8 | Steuererklärung wichtig, bis Freitag | Aufgabe · Privat · ★ Fokus · fällig Fr 23.10. · **kein** Termin |
| 9 | Plane morgen 2 Stunden für die Hausarbeit ein | Aufgabe · Studium · Do 22.10. 10:30 (+02:00), 120 Min. (09:00–10:30 ist durch den Sprachkurs belegt) |
| 10 | Freitag 15 Uhr Zahnarzt | Termin · Privat · Fr 23.10. 15:00 (+02:00), 60 Min. |
| 11 | Morgen Krankenkasse anrufen | Aufgabe · Privat · fällig Do 22.10. · nächster Schritt · 5–15 Min. · **kein** Termin |
| 12 | Link an Mia schicken | Aufgabe · Privat · Dauer 1–2 Min. (⚡) · kein Termin |
| 13 | Unterlagen sortieren | Aufgabe · **kein** Projekt (passt zu „Analysis 1“ und „Umzug“, also nicht eindeutig) · kein neues Projekt |

### Rechenweg
- **9 (b):** Datum ohne Uhrzeit, `plan: true`, Dauer 120 Min. Do 22.10.: belegt 09:00–10:30; erster freier Start
  10:30 (Pause aus) ⇒ 10:30–12:30.
- **10 (a):** feste Uhrzeit ⇒ genau Fr 15:00–16:00, kein weiterer Einfluss auf Fall 9 (anderer Tag).
- **8, 11:** Datum ohne Uhrzeit und ohne `plan` ⇒ kein Kalender, `dueDate` = Datum (Fall 8: „bis Freitag“ liefert
  Claude als `dueDate`, Fokus plant nichts ein).

## Erwartung (maschinenlesbar)
Felder wie in `sortier-tests.md` und `sortier-tests-2.md`, zusätzlich `gtd`, `dueDate`, `waiting`, `projectId`,
`existingProjects` (mit `steps`) und je Fall `newProject`.

```json
{
  "now": "2026-10-21T14:05:00+02:00",
  "planningWindow": { "start": "09:00", "end": "19:00" },
  "pause": null,
  "categories": [
    { "id": "privat", "name": "Privat", "kind": "normal", "order": 1, "description": "Alles Persönliche: Steuererklärung, Krankenkasse, Putzen, Wohnung" },
    { "id": "arbeit", "name": "Arbeit", "kind": "normal", "order": 2, "description": "Alles zur Arbeit, z. B. Nebenjob" },
    { "id": "studium", "name": "Studium", "kind": "normal", "order": 3, "description": "Vorlesungen, Hausarbeiten, Prüfungen" },
    { "id": "einkauf", "name": "Einkaufsliste", "kind": "einkauf", "order": 4, "description": "" },
    { "id": "erledigt", "name": "Erledigt", "kind": "archiv", "order": 5, "description": "Archiv für abgehakte Aufgaben" }
  ],
  "existingProjects": [
    { "title": "Analysis 1", "notes": "Vorlesung Analysis 1: Übungsblätter, Klausurvorbereitung", "categoryId": "studium", "steps": ["Übungsblatt 3 lösen"] },
    { "title": "Umzug", "notes": "Umzug in die neue Wohnung Anfang Dezember: Kartons, Nachsendeauftrag, Möbel", "categoryId": "privat", "steps": ["Nachsendeauftrag stellen"] }
  ],
  "events": [
    { "start": "2026-10-22T09:00:00+02:00", "end": "2026-10-22T10:30:00+02:00", "title": "Sprachkurs" }
  ],
  "cases": [
    { "nr": 1, "text": "Warte auf Rückmeldung von Jonas zum Angebot", "expect": [{
      "type": "aufgabe", "gtd": "warten", "waiting": { "person": "Jonas", "followUpOn": null }, "projectId": null, "schedule": null
    }] },
    { "nr": 2, "text": "Hab die Vermieterin wegen der Heizung gefragt, Freitag nachhaken", "expect": [{
      "type": "aufgabe", "gtd": "warten", "waiting": { "person": "Vermieterin", "followUpOn": "2026-10-23" }, "dueDate": null, "schedule": null
    }] },
    { "nr": 3, "text": "Irgendwann mal Spanisch lernen für den Urlaub", "expect": [{
      "type": "aufgabe", "categoryId": "privat", "important": false, "gtd": "irgendwann", "waiting": null, "schedule": null
    }] },
    { "nr": 4, "text": "Vielleicht neues Fahrrad anschauen", "expect": [{
      "type": "aufgabe", "categoryId": "privat", "important": false, "gtd": "irgendwann", "schedule": null
    }] },
    { "nr": 5, "text": "Neues Projekt Wohnung renovieren: Wände streichen, Boden neu",
      "newProject": { "titleMaxLen": 60, "categoryId": "privat", "notesContains": ["Neues Projekt Wohnung renovieren: Wände streichen, Boden neu"] },
      "expect": [{
        "type": "aufgabe", "categoryId": "privat", "gtd": "naechster-schritt", "projectId": "@neu", "schedule": null, "titleMaxLen": 60
    }] },
    { "nr": 6, "text": "Analysis Übungsblatt Korrektur anschauen", "expect": [{
      "type": "aufgabe", "categoryId": "studium", "gtd": "naechster-schritt", "projectId": "20261020-100000-p001", "schedule": null
    }] },
    { "nr": 7, "text": "Umzugsfirma nach Preisen fragen", "expect": [{
      "type": "aufgabe", "categoryId": "privat", "gtd": "naechster-schritt", "projectId": "20261020-100000-p002", "schedule": null
    }] },
    { "nr": 8, "text": "Steuererklärung wichtig, bis Freitag", "expect": [{
      "type": "aufgabe", "categoryId": "privat", "important": true, "dueDate": "2026-10-23", "schedule": null
    }] },
    { "nr": 9, "text": "Plane morgen 2 Stunden für die Hausarbeit ein", "expect": [{
      "type": "aufgabe", "categoryId": "studium", "durationMin": 120,
      "schedule": { "start": "2026-10-22T10:30:00+02:00", "durationMin": 120 }
    }] },
    { "nr": 10, "text": "Freitag 15 Uhr Zahnarzt", "expect": [{
      "type": "termin", "categoryId": "privat", "schedule": { "start": "2026-10-23T15:00:00+02:00", "durationMin": 60 }
    }] },
    { "nr": 11, "text": "Morgen Krankenkasse anrufen", "expect": [{
      "type": "aufgabe", "categoryId": "privat", "gtd": "naechster-schritt", "dueDate": "2026-10-22", "durationMin": [5, 15], "schedule": null
    }] },
    { "nr": 12, "text": "Link an Mia schicken", "expect": [{
      "type": "aufgabe", "categoryId": "privat", "durationMin": [1, 2], "schedule": null
    }] },
    { "nr": 13, "text": "Unterlagen sortieren", "expect": [{
      "type": "aufgabe", "gtd": "naechster-schritt", "projectId": null, "schedule": null
    }] }
  ]
}
```
