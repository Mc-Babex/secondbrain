# Sortier-Testsatz 2: Titel und Notiz (Fehler A1)

Prüfstand für SPEC §8.3.4 („Titel und Notiz“). Gleiche Form wie `sortier-tests.md` (Satz 1), eigene
Ausgangslage. Aufruf: `npm run lauf:testdaten -- --ziel <ordner> --satz 2` und
`npm run lauf:vergleich -- --daten <ordner> --satz 2`. Ohne `--satz` gilt Satz 1.

**Phase 9:** Die Fälle 9–14 erwarten einen Kalenderblock; seit Phase 9 plant nur noch ein ausdrückliches „plane … ein“
(SPEC §8.3 Regel 10) oder eine feste Uhrzeit. Deshalb enthalten ihre Texte jetzt „plane … ein“; Erwartung und Zeiten
bleiben unverändert.

Geprüft werden Art, Ablage, Zeit **und** Titel/Notiz: `titleMaxLen` (Titel höchstens so viele Zeichen),
`notesContains` (Teilstrings in `notes`, ohne Groß-/Kleinschreibung, Leerraum normalisiert) und `notesEmpty`
(`notes` muss leer sein). Der Titel selbst wird nicht verglichen.

Die Nummern 1–8 prüfen Titel/Notiz, 9–13 die Pause (Aufgabe 59, SPEC §8.4 „Pause“), 14 die Serien-Vorkommen
(Aufgabe 66, SPEC §8.4 „Frei“); frei sind 15–29.

## Ausgangslage
- **Jetzt:** Mittwoch, 21.10.2026, 14:05 Uhr (Europe/Berlin, Sommerzeit +02:00). Am So 25.10. endet die
  Sommerzeit, ab dann +01:00.
- **Planungsfenster:** 09:00–19:00. **Pause:** 12:00–13:00 (aktiv).
- **Ablagen:** werden in den Testdaten ausdrücklich angelegt (`categories`, unabhängig von den Standardwerten der App):
  `privat`, `arbeit`, `studium`, `einkauf` (Einkaufsliste), `erledigt` (Archiv); keine weiteren.
- **Einkaufsliste und Aufgaben:** leer.
- **Termine im Kalender `primary`:**

| Wann | Titel |
|---|---|
| Do 22.10. 09:00–11:00 | Seminar |
| Fr 23.10. 09:00–12:00 | Praktikum |
| Sa 24.10. 09:00–11:30 | Workshop vormittags |
| Sa 24.10. 13:30–19:00 | Workshop nachmittags |
| Mo 26.10., Mi 28.10., Mo 02.11., Mi 04.11. je 09:00–10:30 (+01:00) | Vorlesung Statistik 2 (Vorkommen einer wöchentlichen Serie, je Vorkommen ein Termin mit `recurringEventId`) |

Die Serien-Vorkommen liegen bewusst nur auf Mo und Mi: Fälle 9–13 (Do 22.10., Sa 24.10., Fr 23.10., Di 27.10.) und die
feste Uhrzeit in Fall 11 (Mo 12:15) sind davon nicht berührt, ihre Erwartungen bleiben unverändert.

## Testsätze

| Nr. | Eingabe | Erwartet |
|---|---|---|
| 1 | Lange diktierte Notiz ohne Zeilenumbruch (5 Sätze, ~400 Zeichen) über ein Fotobuch für Oma | Notiz · Privat · kurzer Titel (≤ 60) · alle Sätze in `notes` |
| 2 | Mehrzeilige Aufgabe „Umzug vorbereiten“ mit drei Detailzeilen | Aufgabe · Privat · kurzer Titel · alle Zeilen in `notes` |
| 3 | Langer Termintext Fr 30.10. 15 Uhr, Besprechung mit Ort und Mitbringliste | Termin · Fr 30.10. 15:00 (+01:00), 60 Min. · kurzer Titel · Details in `notes` |
| 4 | Wohnung putzen | Aufgabe · Privat · `notes` leer |
| 5 | Mehrzeilige Notiz „Buchtipps“ mit drei Titeln | Notiz · kurzer Titel · alle Zeilen in `notes` |
| 6 | Milch kaufen | 1 × Notiz · Einkaufsliste · `notes` leer |
| 7 | Einzeilige lange Aufgabe (> 100 Zeichen) zur defekten Klingel | Aufgabe · Privat · kurzer Titel · Details in `notes` |
| 8 | Fahrradreifen aufpumpen | Aufgabe · Privat · `notes` leer |
| 9 | Wichtig: Kleiderschrank ausmisten, dauert 2 Stunden, plane das ein | Aufgabe · Privat · wichtig · Do 22.10. 13:00, 120 Min. (ohne Pause 11:00–13:00) |
| 10 | Plane am Samstag Auto waschen ein | bleibt im Eingangskorb mit Hinweis (Sa nur 11:30–13:30 frei, 90 Min. passen nicht um die Pause) |
| 11 | Montag 12:15 Mittagessen mit Anna | Termin · Mo 26.10. 12:15 (+01:00), 60 Min. (feste Uhrzeit, auch in der Pause) |
| 12 | Plane am Freitag Paket abholen ein, dauert 15 Minuten | Aufgabe · Privat · Fr 23.10. 13:00, 15 Min. (erster freier Slot 12:00 läge in der Pause) |
| 13 | Plane Dienstag 27.10. Konzept für das Seminar schreiben ein, dauert 7 Stunden | Aufgabe · Studium · Di 27.10. 09:00 (+01:00), 420 Min. (länger als der längere Fensterteil 6 h ⇒ darf über die Pause) |
| 14 | Plane am Montag Wäsche waschen ein | Aufgabe · Privat · Mo 26.10. 10:30 (+01:00), 90 Min. (09:00 ist durch das Serien-Vorkommen „Vorlesung Statistik 2“ belegt) |

### Rechenweg für die Pause-Fälle
Pause 12:00–13:00; Teile des Fensters: vorher 3 h, nachher 6 h (längerer Teil = 360 Min.).
- **11 (a):** genau Mo 12:15–13:15, Pause und Fenster spielen keine Rolle.
- **10 (b):** Sa frei 11:30–13:30. 90 Min. ab 11:30/11:45/12:00 … überlappen die Pause, ab 13:00 überlappt der Workshop
  (13:30) ⇒ kein Slot ⇒ `sortError`. Ohne Pause wäre 11:30–13:00 möglich.
- **12 (b):** Fr belegt bis 12:00, erster freier Start 12:00 liegt in der Pause (15 Min.) ⇒ 13:00–13:15.
- **13 (b):** 420 > 360 ⇒ Pause gilt für diesen Block nicht ⇒ Di 09:00–16:00.
- **14 (b):** Mo 26.10., Standarddauer 90 Min. (Datum ohne Uhrzeit, keine Angabe). Belegt: Vorlesung 09:00–10:30
  (Serien-Vorkommen zählt wie jeder Termin), Mittagessen 12:15–13:15 (Fall 11, in diesem Lauf zuerst vergeben, a vor b),
  Pause 12:00–13:00. 90 ≤ 360 ⇒ Pause gilt. Ab 09:00/09:15/… überlappt die Vorlesung, erster Start ohne Überlappung ist
  10:30; 10:30–12:00 endet genau mit Beginn der Pause (Berühren ist frei) ⇒ Mo 26.10. 10:30. Ohne die Serie wäre es 09:00.
- **9 (c):** Tagesanfang Do 09:00, Seminar bis 11:00. Ohne Pause 11:00–13:00; 11:00–12:45 überlappen die Pause
  (120 ≤ 360, Pause gilt) ⇒ 13:00–15:00.

## Erwartung (maschinenlesbar)
Felder wie in `sortier-tests.md`; zusätzlich `titleMaxLen`, `notesContains`, `notesEmpty` je erwartetem Item.

```json
{
  "now": "2026-10-21T14:05:00+02:00",
  "planningWindow": { "start": "09:00", "end": "19:00" },
  "pause": { "start": "12:00", "end": "13:00" },
  "categories": [
    { "id": "privat", "name": "Privat", "kind": "normal", "order": 1, "description": "Alles Persönliche: Steuererklärung, Krankenkasse, Putzen, Wohnung" },
    { "id": "arbeit", "name": "Arbeit", "kind": "normal", "order": 2, "description": "Alles zur Arbeit, z. B. Nebenjob" },
    { "id": "studium", "name": "Studium", "kind": "normal", "order": 3, "description": "" },
    { "id": "einkauf", "name": "Einkaufsliste", "kind": "einkauf", "order": 4, "description": "" },
    { "id": "erledigt", "name": "Erledigt", "kind": "archiv", "order": 5, "description": "Archiv für abgehakte Aufgaben" }
  ],
  "events": [
    { "start": "2026-10-22T09:00:00+02:00", "end": "2026-10-22T11:00:00+02:00", "title": "Seminar" },
    { "start": "2026-10-23T09:00:00+02:00", "end": "2026-10-23T12:00:00+02:00", "title": "Praktikum" },
    { "start": "2026-10-24T09:00:00+02:00", "end": "2026-10-24T11:30:00+02:00", "title": "Workshop vormittags" },
    { "start": "2026-10-24T13:30:00+02:00", "end": "2026-10-24T19:00:00+02:00", "title": "Workshop nachmittags" },
    { "id": "vorlesung_20261026T080000Z", "recurringEventId": "vorlesung", "start": "2026-10-26T09:00:00+01:00", "end": "2026-10-26T10:30:00+01:00", "title": "Vorlesung Statistik 2" },
    { "id": "vorlesung_20261028T080000Z", "recurringEventId": "vorlesung", "start": "2026-10-28T09:00:00+01:00", "end": "2026-10-28T10:30:00+01:00", "title": "Vorlesung Statistik 2" },
    { "id": "vorlesung_20261102T080000Z", "recurringEventId": "vorlesung", "start": "2026-11-02T09:00:00+01:00", "end": "2026-11-02T10:30:00+01:00", "title": "Vorlesung Statistik 2" },
    { "id": "vorlesung_20261104T080000Z", "recurringEventId": "vorlesung", "start": "2026-11-04T09:00:00+01:00", "end": "2026-11-04T10:30:00+01:00", "title": "Vorlesung Statistik 2" }
  ],
  "cases": [
    { "nr": 1, "text": "Idee für den Geburtstag von Oma: ich könnte ein Fotobuch mit den Bildern der letzten Jahre machen. Außerdem wäre es schön, wenn alle Cousins einen kurzen Gruß aufschreiben. Wir müssten die Bilder bis Mitte November gesammelt haben, damit die Druckerei genug Zeit hat. Vielleicht kann Lena die Gestaltung übernehmen, sie hat damit schon Erfahrung. Die Kosten sollten bei etwa 40 Euro liegen.", "expect": [{
      "type": "notiz", "categoryId": "privat", "important": false, "schedule": null, "titleMaxLen": 60,
      "notesContains": ["Fotobuch mit den Bildern der letzten Jahre", "alle Cousins einen kurzen Gruß", "bis Mitte November gesammelt", "Lena die Gestaltung übernehmen", "etwa 40 Euro"]
    }] },
    { "nr": 2, "text": "Umzug vorbereiten\nKartons im Keller holen\nBücher aussortieren\nMietvertrag für den Vermieter kopieren", "expect": [{
      "type": "aufgabe", "categoryId": "privat", "important": false, "schedule": null, "titleMaxLen": 60,
      "notesContains": ["Kartons im Keller holen", "Bücher aussortieren", "Mietvertrag für den Vermieter kopieren"]
    }] },
    { "nr": 3, "text": "Freitag 30.10. um 15 Uhr Besprechung mit Dr. Weber im Institut für Statistik, Raum 2.14, bitte den Zwischenbericht und die Simulationsergebnisse ausgedruckt mitbringen", "expect": [{
      "type": "termin", "schedule": { "start": "2026-10-30T15:00:00+01:00", "durationMin": 60 }, "titleMaxLen": 60,
      "notesContains": ["Dr. Weber", "Raum 2.14", "Zwischenbericht", "Simulationsergebnisse ausgedruckt"]
    }] },
    { "nr": 4, "text": "Wohnung putzen", "expect": [{
      "type": "aufgabe", "categoryId": "privat", "important": false, "schedule": null, "titleMaxLen": 60, "notesEmpty": true
    }] },
    { "nr": 5, "text": "Buchtipps\nDer Schwarm\nSapiens\nProjekt Hail Mary", "expect": [{
      "type": "notiz", "schedule": null, "titleMaxLen": 60,
      "notesContains": ["Der Schwarm", "Sapiens", "Projekt Hail Mary"]
    }] },
    { "nr": 6, "text": "Milch kaufen", "expect": [{
      "type": "notiz", "categoryId": "einkauf", "important": false, "schedule": null, "checked": false, "notesEmpty": true
    }] },
    { "nr": 7, "text": "Bei der Hausverwaltung wegen der kaputten Klingel im dritten Stock nachfragen und einen Reparaturtermin vereinbaren", "expect": [{
      "type": "aufgabe", "categoryId": "privat", "important": false, "schedule": null, "titleMaxLen": 60,
      "notesContains": ["Hausverwaltung", "kaputten Klingel im dritten Stock", "Reparaturtermin"]
    }] },
    { "nr": 8, "text": "Fahrradreifen aufpumpen", "expect": [{
      "type": "aufgabe", "categoryId": "privat", "important": false, "schedule": null, "titleMaxLen": 60, "notesEmpty": true
    }] },
    { "nr": 9, "text": "Wichtig: Kleiderschrank ausmisten, dauert 2 Stunden, plane das ein", "expect": [{
      "type": "aufgabe", "categoryId": "privat", "important": true, "durationMin": 120,
      "schedule": { "start": "2026-10-22T13:00:00+02:00", "durationMin": 120 }
    }] },
    { "nr": 10, "text": "Plane am Samstag Auto waschen ein", "expect": [{ "sortError": true }] },
    { "nr": 11, "text": "Montag 12:15 Mittagessen mit Anna", "expect": [{
      "type": "termin", "schedule": { "start": "2026-10-26T12:15:00+01:00", "durationMin": 60 }
    }] },
    { "nr": 12, "text": "Plane am Freitag Paket abholen ein, dauert 15 Minuten", "expect": [{
      "type": "aufgabe", "categoryId": "privat", "durationMin": 15,
      "schedule": { "start": "2026-10-23T13:00:00+02:00", "durationMin": 15 }
    }] },
    { "nr": 13, "text": "Plane Dienstag 27.10. Konzept für das Seminar schreiben ein, dauert 7 Stunden", "expect": [{
      "type": "aufgabe", "categoryId": "studium", "durationMin": 420,
      "schedule": { "start": "2026-10-27T09:00:00+01:00", "durationMin": 420 }
    }] },
    { "nr": 14, "text": "Plane am Montag Wäsche waschen ein", "expect": [{
      "type": "aufgabe", "categoryId": "privat",
      "schedule": { "start": "2026-10-26T10:30:00+01:00", "durationMin": 90 }
    }] }
  ]
}
```
