# Sortier-Testsätze für den Claude-Lauf

Prüfstand für die Regeln aus SPEC §8. Ein Trockenlauf (Aufgaben 22 und 30) verarbeitet **alle Sätze in
einem Lauf** mit der festen Ausgangslage unten. Das Skript `lauf:vergleich` vergleicht das Ergebnis
mit dem JSON-Block am Ende. Titel werden nicht verglichen, nur Art, Ablage, wichtig, Dauer und Zeit.
Titel und Notiz (kurzer Titel, vollständige `notes`) prüft **Satz 2** in `sortier-tests-2.md`
(`--satz 2`); ohne Option gilt dieser Satz 1.

## Ausgangslage
- **Jetzt:** Mittwoch, 21.10.2026, 14:05 Uhr (Europe/Berlin, Sommerzeit +02:00).
  Achtung: Am So 25.10. endet die Sommerzeit, ab dann +01:00.
- **Planungsfenster:** 09:00–19:00. **Pause: aus** (`"pause": null` in `settings.json`), damit die Erwartungen unverändert bleiben.
- **Ablagen:** werden in den Testdaten ausdrücklich angelegt (`categories`, unabhängig von den Standardwerten der App):
  `privat`, `arbeit` (Beschreibung „Alles zur Arbeit, z. B. Nebenjob“), `studium` (heißt **„Uni“**, Beschreibung
  „Vorlesungen, Hausarbeiten, Prüfungen“), `einkauf`, `erledigt`, dazu `verein` „Verein“
  (Beschreibung: „TV Musterstadt: Training, Spiele, Vorstand“) und `garten` „Garten“
  (Beschreibung: „Balkon, Pflanzen, Rasen“).
- **Einkaufsliste:** enthält schon den abgehakten Artikel „Butter“.
- **Vorhandene Aufgabe ohne Termin:** „Steuerbescheid prüfen“ (Privat, wichtig, 30 Min., kein Termin) liegt schon in `items/`
  (z. B. nachträglich in der App als wichtig markiert). Der Lauf plant sie nach den neuen Einträgen ein (8.4 e).
- **Termine im Kalender `primary`:**

| Wann | Titel | Belegt? |
|---|---|---|
| Mi 21.10. 15:00–16:00 | Vorlesung Statistik | ja |
| Mi 21.10. 16:00–17:00 | Kaffee mit Tom (als „frei“ markiert) | nein |
| Do 22.10. 09:00–10:30 | Sprachkurs | ja |
| Fr 23.10. 09:00–18:00 | Klausurtag | ja |
| Fr 23.10. ganztägig | Geburtstag Oma | nein |

## Testsätze

| Nr. | Eingabe | Erwartet | Regel |
|---|---|---|---|
| 1 | Steuererklärung machen | Aufgabe · Privat · kein Termin | 8.3.3 |
| 2 | Wohnung putzen | Aufgabe · Privat | 8.3.3 |
| 3 | Milch, Eier und Brot kaufen | 3 × Notiz · Einkaufsliste | 8.3.2 |
| 4 | Donnerstag 9 Uhr Zahnarzt | Termin · Privat · Do 22.10. 09:00, 60 Min. (trotz Sprachkurs) | 8.4a |
| 5 | Morgen 14:30 Treffen mit Dozentin Frau Becker wegen Hausarbeit, eine Stunde | Termin · Studium · Do 22.10. 14:30, 60 Min. | 8.4a |
| 6 | Wichtig: Krankenkasse wegen Bescheinigung anrufen | Aufgabe · Privat · wichtig · 15 Min. · Do 22.10. 10:30 | 8.4c |
| 7 | Dringend Bewerbung für Werkstudentenstelle überarbeiten, dauert 2 Stunden | Aufgabe · Arbeit · wichtig · Do 22.10. 11:30, 120 Min. | 8.4d |
| 8 | Hausarbeit Statistik Kapitel 3 schreiben, wichtig, ca. 3 Stunden | Aufgabe · Studium · wichtig · Do 22.10. 15:30, 180 Min. | 8.4d |
| 9 | Notiz: WLAN im Büro heißt Gast-5G | Notiz · Arbeit | 8.3.1 |
| 10 | Buchtipp von Lena: Der Schwarm | Notiz · Privat | 8.3.1 |
| 11 | Freitag Steuerberater-Unterlagen abgeben | bleibt im Eingangskorb mit Hinweis (Fr nur 18–19 Uhr frei, < 90 Min.) | 8.4b |
| 12 | Am Montag Zimmer streichen | Aufgabe · Privat · Mo 26.10. 09:00 (+01:00), 90 Min. | 8.4b |
| 13 | Neue Ablage Fitness: Laufschuhe recherchieren | neue Ablage `fitness` · Aufgabe · Fitness | 8.3.3 |
| 14 | Vorstandssitzung TV Musterstadt Montag 19:30 | Termin · Verein · Mo 26.10. 19:30 (+01:00), 60 Min. (außerhalb Fenster) | 8.4a |
| 15 | Spielanmeldung für November ausfüllen | Aufgabe · Verein · kein Termin | 8.3.3 |
| 16 | Klopapier | 1 × Notiz · Einkaufsliste | 8.3.2 |
| 17 | Mama zurückrufen, wichtig, 15 Minuten | Aufgabe · Privat · wichtig · Do 22.10. 10:45 | 8.4c |
| 18 | Vielleicht mal wieder Gitarre üben | Aufgabe · Privat · nicht wichtig | 8.3.3 (im Zweifel) |
| 19 | Wichtig! Mietvertrag kündigen, Brief schreiben 30 Minuten | Aufgabe · Privat · wichtig · Do 22.10. 13:30, 30 Min. | 8.4d |
| 20 | Heute 18 Uhr Laufen gehen | Termin · Privat · Mi 21.10. 18:00, 60 Min. | 8.4a |
| 21 | Abgabe Laborbericht ist am 30.10. | Aufgabe · Studium · Fr 30.10. 09:00 (+01:00), 90 Min. | 8.4b |
| 22 | asdf qwer | Notiz · Privat | 8.3.1 (im Zweifel) |
| 23 | Knoblauch kaufen | 1 × Notiz · Einkaufsliste | 8.3.2 |
| 24 | Knoblauch nicht vergessen zu kaufen | kein neues Item (Knoblauch kam in 23 schon vor), Eingangskorb trotzdem verarbeitet | 8.3.2, 3.9 |
| 25 | Butter kaufen | kein neues Item (Butter steht abgehakt auf der Liste), Eingangskorb trotzdem verarbeitet | 8.3.2, 3.9 |
| 26 | Tomaten auf dem Balkon umtopfen | Aufgabe · Garten · kein Termin | 8.3.3 |
| 27 | Skript für die Uni-Vorlesung ausdrucken | Aufgabe · Studium (heißt „Uni“) · kein Termin | 8.3.3 |
| 28 | Dringend Mail an den Vermieter schreiben wegen Heizung | Aufgabe · Privat · wichtig · 15 Min. · Do 22.10. 11:00 | 8.4c |
| 29 | Wichtig: Stromrechnung bezahlen | Aufgabe · Privat · wichtig · 15 Min. · Do 22.10. 11:15 | 8.4c |

### Rechenweg für die Zeiten
Reihenfolge a → b → c → d (SPEC 8.4), innerhalb nach Nummer (= `createdAt`).
- **a:** 4 → Do 09:00–10:00 · 5 → Do 14:30–15:30 · 14 → Mo 19:30–20:30 · 20 → Mi 18:00–19:00.
- **b:** 11 → Fr frei nur 18:00–19:00 (60 Min.) ⇒ Hinweis · 12 → Mo 09:00–10:30 · 21 → Fr 30.10. 09:00–10:30.
- **c:** Heutiges Fenster hat begonnen ⇒ Tagesanfang ist Do 09:00; belegt bis 10:30 (Sprachkurs, Zahnarzt) ⇒
  6 → 10:30–10:45 · 17 → 10:45–11:00 · 28 → 11:00–11:15 · 29 → 11:15–11:30.
- **d:** ebenfalls ab Do 09:00, nach den c-Einträgen (nie mehr am laufenden Tag) · 7 (120) → 11:30–13:30 ·
  8 (180) → 13:30–14:30 zu kurz (Treffen 14:30), erster freier Start 15:30–18:30 · 19 (30) → 13:30–14:00.
- **e:** ebenfalls ab Do 09:00, nach allen neuen Einträgen · „Steuerbescheid prüfen“ (30) → 14:00–14:30 (Lücke zwischen
  19 und dem Treffen).

## Erwartung (maschinenlesbar)
`categories` legt alle Ablagen der Ausgangslage ausdrücklich an, `existingItems` liegen vorab in `items/` (`expectSchedule` = Termin, den der Lauf einer solchen Aufgabe geben soll).
`expect: []` = es darf kein Item entstehen (der Eingangskorb-Eintrag gilt trotzdem als verarbeitet).
`start` als ISO 8601 mit Offset; `durationMin` als Zahl oder `[min, max]` bei Schätzungen
(nicht angegeben = nicht geprüft); `sortError: true` = bleibt im Eingangskorb.

```json
{
  "now": "2026-10-21T14:05:00+02:00",
  "planningWindow": { "start": "09:00", "end": "19:00" },
  "pause": null,
  "categories": [
    { "id": "privat", "name": "Privat", "kind": "normal", "order": 1, "description": "Alles Persönliche: Steuererklärung, Krankenkasse, Putzen, Wohnung" },
    { "id": "arbeit", "name": "Arbeit", "kind": "normal", "order": 2, "description": "Alles zur Arbeit, z. B. Nebenjob" },
    { "id": "studium", "name": "Uni", "kind": "normal", "order": 3, "description": "Vorlesungen, Hausarbeiten, Prüfungen" },
    { "id": "einkauf", "name": "Einkaufsliste", "kind": "einkauf", "order": 4, "description": "" },
    { "id": "erledigt", "name": "Erledigt", "kind": "archiv", "order": 5, "description": "Archiv für abgehakte Aufgaben" },
    { "id": "verein", "name": "Verein", "kind": "normal", "order": 6, "description": "TV Musterstadt: Training, Spiele, Vorstand" },
    { "id": "garten", "name": "Garten", "kind": "normal", "order": 7, "description": "Balkon, Pflanzen, Rasen" }
  ],
  "existingItems": [
    { "title": "Butter", "categoryId": "einkauf", "checked": true },
    { "title": "Steuerbescheid prüfen", "categoryId": "privat", "type": "aufgabe", "important": true, "durationMin": 30,
      "expectSchedule": { "start": "2026-10-22T14:00:00+02:00", "durationMin": 30 } }
  ],
  "events": [
    { "start": "2026-10-21T15:00:00+02:00", "end": "2026-10-21T16:00:00+02:00", "title": "Vorlesung Statistik" },
    { "start": "2026-10-21T16:00:00+02:00", "end": "2026-10-21T17:00:00+02:00", "title": "Kaffee mit Tom", "transparent": true },
    { "start": "2026-10-22T09:00:00+02:00", "end": "2026-10-22T10:30:00+02:00", "title": "Sprachkurs" },
    { "start": "2026-10-23T09:00:00+02:00", "end": "2026-10-23T18:00:00+02:00", "title": "Klausurtag" },
    { "date": "2026-10-23", "title": "Geburtstag Oma", "allDay": true }
  ],
  "cases": [
    { "nr": 1, "text": "Steuererklärung machen", "expect": [{ "type": "aufgabe", "categoryId": "privat", "important": false, "schedule": null }] },
    { "nr": 2, "text": "Wohnung putzen", "expect": [{ "type": "aufgabe", "categoryId": "privat", "important": false, "schedule": null }] },
    { "nr": 3, "text": "Milch, Eier und Brot kaufen", "expect": [
      { "type": "notiz", "categoryId": "einkauf", "important": false, "schedule": null, "checked": false },
      { "type": "notiz", "categoryId": "einkauf", "important": false, "schedule": null, "checked": false },
      { "type": "notiz", "categoryId": "einkauf", "important": false, "schedule": null, "checked": false }
    ] },
    { "nr": 4, "text": "Donnerstag 9 Uhr Zahnarzt", "expect": [{ "type": "termin", "categoryId": "privat", "schedule": { "start": "2026-10-22T09:00:00+02:00", "durationMin": 60 } }] },
    { "nr": 5, "text": "Morgen 14:30 Treffen mit Dozentin Frau Becker wegen Hausarbeit, eine Stunde", "expect": [{ "type": "termin", "categoryId": "studium", "schedule": { "start": "2026-10-22T14:30:00+02:00", "durationMin": 60 } }] },
    { "nr": 6, "text": "Wichtig: Krankenkasse wegen Bescheinigung anrufen", "expect": [{ "type": "aufgabe", "categoryId": "privat", "important": true, "durationMin": 15, "schedule": { "start": "2026-10-22T10:30:00+02:00", "durationMin": 15 } }] },
    { "nr": 7, "text": "Dringend Bewerbung für Werkstudentenstelle überarbeiten, dauert 2 Stunden", "expect": [{ "type": "aufgabe", "categoryId": "arbeit", "important": true, "durationMin": 120, "schedule": { "start": "2026-10-22T11:30:00+02:00", "durationMin": 120 } }] },
    { "nr": 8, "text": "Hausarbeit Statistik Kapitel 3 schreiben, wichtig, ca. 3 Stunden", "expect": [{ "type": "aufgabe", "categoryId": "studium", "important": true, "durationMin": 180, "schedule": { "start": "2026-10-22T15:30:00+02:00", "durationMin": 180 } }] },
    { "nr": 9, "text": "Notiz: WLAN im Büro heißt Gast-5G", "expect": [{ "type": "notiz", "categoryId": "arbeit", "important": false, "schedule": null }] },
    { "nr": 10, "text": "Buchtipp von Lena: Der Schwarm", "expect": [{ "type": "notiz", "categoryId": "privat", "important": false, "schedule": null }] },
    { "nr": 11, "text": "Freitag Steuerberater-Unterlagen abgeben", "expect": [{ "sortError": true }] },
    { "nr": 12, "text": "Am Montag Zimmer streichen", "expect": [{ "type": "aufgabe", "categoryId": "privat", "schedule": { "start": "2026-10-26T09:00:00+01:00", "durationMin": 90 } }] },
    { "nr": 13, "text": "Neue Ablage Fitness: Laufschuhe recherchieren", "newCategory": { "id": "fitness", "name": "Fitness" }, "expect": [{ "type": "aufgabe", "categoryId": "fitness", "important": false, "schedule": null }] },
    { "nr": 14, "text": "Vorstandssitzung TV Musterstadt Montag 19:30", "expect": [{ "type": "termin", "categoryId": "verein", "schedule": { "start": "2026-10-26T19:30:00+01:00", "durationMin": 60 } }] },
    { "nr": 15, "text": "Spielanmeldung für November ausfüllen", "expect": [{ "type": "aufgabe", "categoryId": "verein", "important": false, "schedule": null }] },
    { "nr": 16, "text": "Klopapier", "expect": [{ "type": "notiz", "categoryId": "einkauf", "important": false, "schedule": null, "checked": false }] },
    { "nr": 17, "text": "Mama zurückrufen, wichtig, 15 Minuten", "expect": [{ "type": "aufgabe", "categoryId": "privat", "important": true, "durationMin": 15, "schedule": { "start": "2026-10-22T10:45:00+02:00", "durationMin": 15 } }] },
    { "nr": 18, "text": "Vielleicht mal wieder Gitarre üben", "expect": [{ "type": "aufgabe", "categoryId": "privat", "important": false, "schedule": null }] },
    { "nr": 19, "text": "Wichtig! Mietvertrag kündigen, Brief schreiben 30 Minuten", "expect": [{ "type": "aufgabe", "categoryId": "privat", "important": true, "durationMin": 30, "schedule": { "start": "2026-10-22T13:30:00+02:00", "durationMin": 30 } }] },
    { "nr": 20, "text": "Heute 18 Uhr Laufen gehen", "expect": [{ "type": "termin", "categoryId": "privat", "schedule": { "start": "2026-10-21T18:00:00+02:00", "durationMin": 60 } }] },
    { "nr": 21, "text": "Abgabe Laborbericht ist am 30.10.", "expect": [{ "type": "aufgabe", "categoryId": "studium", "schedule": { "start": "2026-10-30T09:00:00+01:00", "durationMin": 90 } }] },
    { "nr": 22, "text": "asdf qwer", "expect": [{ "type": "notiz", "categoryId": "privat", "important": false, "schedule": null }] },
    { "nr": 23, "text": "Knoblauch kaufen", "expect": [{ "type": "notiz", "categoryId": "einkauf", "important": false, "schedule": null, "checked": false }] },
    { "nr": 24, "text": "Knoblauch nicht vergessen zu kaufen", "expect": [] },
    { "nr": 25, "text": "Butter kaufen", "expect": [] },
    { "nr": 26, "text": "Tomaten auf dem Balkon umtopfen", "expect": [{ "type": "aufgabe", "categoryId": "garten", "important": false, "schedule": null }] },
    { "nr": 27, "text": "Skript für die Uni-Vorlesung ausdrucken", "expect": [{ "type": "aufgabe", "categoryId": "studium", "important": false, "schedule": null }] },
    { "nr": 28, "text": "Dringend Mail an den Vermieter schreiben wegen Heizung", "expect": [{ "type": "aufgabe", "categoryId": "privat", "important": true, "durationMin": 15, "schedule": { "start": "2026-10-22T11:00:00+02:00", "durationMin": 15 } }] },
    { "nr": 29, "text": "Wichtig: Stromrechnung bezahlen", "expect": [{ "type": "aufgabe", "categoryId": "privat", "important": true, "durationMin": 15, "schedule": { "start": "2026-10-22T11:15:00+02:00", "durationMin": 15 } }] }
  ]
}
```
