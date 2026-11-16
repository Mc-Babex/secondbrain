# Sortier-Testsätze für den Claude-Lauf

Prüfstand für die Regeln aus SPEC §8. Ein Trockenlauf (Aufgaben 22 und 30) verarbeitet **alle Sätze in
einem Lauf** mit der festen Ausgangslage unten. Das Skript `lauf:vergleich` vergleicht das Ergebnis
mit dem JSON-Block am Ende. Titel werden nicht verglichen, nur Art, Ablage, Fokus (wichtig), Dauer und Zeit.
Titel und Notiz (kurzer Titel, vollständige `notes`) prüft **Satz 2** in `sortier-tests-2.md`
(`--satz 2`), die GTD-Regeln (Status, Projekte, Fokus ohne Termin) **Satz 3** in `sortier-tests-3.md`
(`--satz 3`); ohne Option gilt dieser Satz 1.

**Phase 9:** „wichtig“ plant nichts mehr ein (SPEC §8.4). Wo ein Fall früher durch „wichtig“ oder ein bloßes Datum einen
Kalenderblock bekam, steht jetzt ausdrücklich „plane … ein“ im Text (Regel 10) – oder der Fall erwartet bewusst keinen
Termin (28, 29).

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
| 6 | Wichtig: Krankenkasse wegen Bescheinigung anrufen, plane das ein | Aufgabe · Privat · wichtig · 15 Min. · Do 22.10. 10:30 | 8.4c |
| 7 | Dringend Bewerbung für Werkstudentenstelle überarbeiten, dauert 2 Stunden, plane das ein | Aufgabe · Arbeit · wichtig · Do 22.10. 11:00, 120 Min. | 8.4c |
| 8 | Hausarbeit Statistik Kapitel 3 schreiben, wichtig, ca. 3 Stunden, plane das ein | Aufgabe · Studium · wichtig · Do 22.10. 15:30, 180 Min. | 8.4c |
| 9 | Notiz: WLAN im Büro heißt Gast-5G | Notiz · Arbeit | 8.3.1 |
| 10 | Buchtipp von Lena: Der Schwarm | Notiz · Privat | 8.3.1 |
| 11 | Plane am Freitag Steuerberater-Unterlagen abgeben ein | bleibt im Eingangskorb mit Hinweis (Fr nur 18–19 Uhr frei, < 90 Min.) | 8.4b |
| 12 | Plane am Montag Zimmer streichen ein | Aufgabe · Privat · Mo 26.10. 09:00 (+01:00), 90 Min. | 8.4b |
| 13 | Neue Ablage Fitness: Laufschuhe recherchieren | neue Ablage `fitness` · Aufgabe · Fitness | 8.3.3 |
| 14 | Vorstandssitzung TV Musterstadt Montag 19:30 | Termin · Verein · Mo 26.10. 19:30 (+01:00), 60 Min. (außerhalb Fenster) | 8.4a |
| 15 | Spielanmeldung für November ausfüllen | Aufgabe · Verein · kein Termin | 8.3.3 |
| 16 | Klopapier | 1 × Notiz · Einkaufsliste | 8.3.2 |
| 17 | Mama zurückrufen, wichtig, 15 Minuten, plane das ein | Aufgabe · Privat · wichtig · Do 22.10. 10:45 | 8.4c |
| 18 | Vielleicht mal wieder Gitarre üben | Aufgabe · Privat · nicht wichtig · `irgendwann` | 8.3.3 (im Zweifel) |
| 19 | Wichtig! Mietvertrag kündigen, Brief schreiben 30 Minuten, plane das ein | Aufgabe · Privat · wichtig · Do 22.10. 13:00, 30 Min. | 8.4c |
| 20 | Heute 18 Uhr Laufen gehen | Termin · Privat · Mi 21.10. 18:00, 60 Min. | 8.4a |
| 21 | Trag die Abgabe Laborbericht am 30.10. in den Kalender ein | Aufgabe · Studium · Fr 30.10. 09:00 (+01:00), 90 Min. | 8.4b |
| 22 | asdf qwer | Notiz · Privat | 8.3.1 (im Zweifel) |
| 23 | Knoblauch kaufen | 1 × Notiz · Einkaufsliste | 8.3.2 |
| 24 | Knoblauch nicht vergessen zu kaufen | kein neues Item (Knoblauch kam in 23 schon vor), Eingangskorb trotzdem verarbeitet | 8.3.2, 3.9 |
| 25 | Butter kaufen | kein neues Item (Butter steht abgehakt auf der Liste), Eingangskorb trotzdem verarbeitet | 8.3.2, 3.9 |
| 26 | Tomaten auf dem Balkon umtopfen | Aufgabe · Garten · kein Termin | 8.3.3 |
| 27 | Skript für die Uni-Vorlesung ausdrucken | Aufgabe · Studium (heißt „Uni“) · kein Termin | 8.3.3 |
| 28 | Dringend Mail an den Vermieter schreiben wegen Heizung | Aufgabe · Privat · wichtig · 15 Min. · **kein** Termin (Fokus plant nichts ein) | 8.3.5 |
| 29 | Wichtig: Stromrechnung bezahlen | Aufgabe · Privat · wichtig · 15 Min. · **kein** Termin (Fokus plant nichts ein) | 8.3.5 |

### Rechenweg für die Zeiten
Reihenfolge a → b → c (SPEC 8.4, Phase 9), innerhalb nach Nummer (= `createdAt`); in c zuerst die Einträge mit Dauer ≤ 15 Min.
- **a:** 4 → Do 09:00–10:00 · 5 → Do 14:30–15:30 · 14 → Mo 19:30–20:30 · 20 → Mi 18:00–19:00.
- **b:** 11 → Fr frei nur 18:00–19:00 (60 Min.) ⇒ Hinweis · 12 → Mo 09:00–10:30 · 21 → Fr 30.10. 09:00–10:30.
- **c** (`plan: true` ohne Datum): Heutiges Fenster hat begonnen ⇒ Tagesanfang ist Do 09:00; belegt bis 10:30 (Sprachkurs,
  Zahnarzt). Zuerst die Einträge ≤ 15 Min.: 6 → 10:30–10:45 · 17 → 10:45–11:00. Danach nach Nummer: 7 (120) → 11:00–13:00 ·
  8 (180) → 13:00–14:30 zu kurz (Treffen 14:30), erster freier Start 15:30–18:30 · 19 (30) → 13:00–13:30.
- **28, 29:** „wichtig“/„dringend“ ⇒ ★ Fokus, aber `plan: false` ⇒ kein Termin (SPEC §8.4: früheres c/d entfallen).
- **Entfallen:** früheres „e“ (vorhandene wichtige Aufgabe ohne Termin automatisch einplanen) – die Aufgabe „Steuerbescheid
  prüfen“ ist deshalb aus der Ausgangslage gestrichen.

## Erwartung (maschinenlesbar)
`categories` legt alle Ablagen der Ausgangslage ausdrücklich an, `existingItems` liegen vorab in `items/`, `existingProjects` (mit `steps`) vorab in `projects/` und `items/`.
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
    { "title": "Butter", "categoryId": "einkauf", "checked": true }
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
    { "nr": 6, "text": "Wichtig: Krankenkasse wegen Bescheinigung anrufen, plane das ein", "expect": [{ "type": "aufgabe", "categoryId": "privat", "important": true, "durationMin": 15, "schedule": { "start": "2026-10-22T10:30:00+02:00", "durationMin": 15 } }] },
    { "nr": 7, "text": "Dringend Bewerbung für Werkstudentenstelle überarbeiten, dauert 2 Stunden, plane das ein", "expect": [{ "type": "aufgabe", "categoryId": "arbeit", "important": true, "durationMin": 120, "schedule": { "start": "2026-10-22T11:00:00+02:00", "durationMin": 120 } }] },
    { "nr": 8, "text": "Hausarbeit Statistik Kapitel 3 schreiben, wichtig, ca. 3 Stunden, plane das ein", "expect": [{ "type": "aufgabe", "categoryId": "studium", "important": true, "durationMin": 180, "schedule": { "start": "2026-10-22T15:30:00+02:00", "durationMin": 180 } }] },
    { "nr": 9, "text": "Notiz: WLAN im Büro heißt Gast-5G", "expect": [{ "type": "notiz", "categoryId": "arbeit", "important": false, "schedule": null }] },
    { "nr": 10, "text": "Buchtipp von Lena: Der Schwarm", "expect": [{ "type": "notiz", "categoryId": "privat", "important": false, "schedule": null }] },
    { "nr": 11, "text": "Plane am Freitag Steuerberater-Unterlagen abgeben ein", "expect": [{ "sortError": true }] },
    { "nr": 12, "text": "Plane am Montag Zimmer streichen ein", "expect": [{ "type": "aufgabe", "categoryId": "privat", "schedule": { "start": "2026-10-26T09:00:00+01:00", "durationMin": 90 } }] },
    { "nr": 13, "text": "Neue Ablage Fitness: Laufschuhe recherchieren", "newCategory": { "id": "fitness", "name": "Fitness" }, "expect": [{ "type": "aufgabe", "categoryId": "fitness", "important": false, "schedule": null }] },
    { "nr": 14, "text": "Vorstandssitzung TV Musterstadt Montag 19:30", "expect": [{ "type": "termin", "categoryId": "verein", "schedule": { "start": "2026-10-26T19:30:00+01:00", "durationMin": 60 } }] },
    { "nr": 15, "text": "Spielanmeldung für November ausfüllen", "expect": [{ "type": "aufgabe", "categoryId": "verein", "important": false, "schedule": null }] },
    { "nr": 16, "text": "Klopapier", "expect": [{ "type": "notiz", "categoryId": "einkauf", "important": false, "schedule": null, "checked": false }] },
    { "nr": 17, "text": "Mama zurückrufen, wichtig, 15 Minuten, plane das ein", "expect": [{ "type": "aufgabe", "categoryId": "privat", "important": true, "durationMin": 15, "schedule": { "start": "2026-10-22T10:45:00+02:00", "durationMin": 15 } }] },
    { "nr": 18, "text": "Vielleicht mal wieder Gitarre üben", "expect": [{ "type": "aufgabe", "categoryId": "privat", "important": false, "gtd": "irgendwann", "schedule": null }] },
    { "nr": 19, "text": "Wichtig! Mietvertrag kündigen, Brief schreiben 30 Minuten, plane das ein", "expect": [{ "type": "aufgabe", "categoryId": "privat", "important": true, "durationMin": 30, "schedule": { "start": "2026-10-22T13:00:00+02:00", "durationMin": 30 } }] },
    { "nr": 20, "text": "Heute 18 Uhr Laufen gehen", "expect": [{ "type": "termin", "categoryId": "privat", "schedule": { "start": "2026-10-21T18:00:00+02:00", "durationMin": 60 } }] },
    { "nr": 21, "text": "Trag die Abgabe Laborbericht am 30.10. in den Kalender ein", "expect": [{ "type": "aufgabe", "categoryId": "studium", "schedule": { "start": "2026-10-30T09:00:00+01:00", "durationMin": 90 } }] },
    { "nr": 22, "text": "asdf qwer", "expect": [{ "type": "notiz", "categoryId": "privat", "important": false, "schedule": null }] },
    { "nr": 23, "text": "Knoblauch kaufen", "expect": [{ "type": "notiz", "categoryId": "einkauf", "important": false, "schedule": null, "checked": false }] },
    { "nr": 24, "text": "Knoblauch nicht vergessen zu kaufen", "expect": [] },
    { "nr": 25, "text": "Butter kaufen", "expect": [] },
    { "nr": 26, "text": "Tomaten auf dem Balkon umtopfen", "expect": [{ "type": "aufgabe", "categoryId": "garten", "important": false, "schedule": null }] },
    { "nr": 27, "text": "Skript für die Uni-Vorlesung ausdrucken", "expect": [{ "type": "aufgabe", "categoryId": "studium", "important": false, "schedule": null }] },
    { "nr": 28, "text": "Dringend Mail an den Vermieter schreiben wegen Heizung", "expect": [{ "type": "aufgabe", "categoryId": "privat", "important": true, "durationMin": 15, "schedule": null }] },
    { "nr": 29, "text": "Wichtig: Stromrechnung bezahlen", "expect": [{ "type": "aufgabe", "categoryId": "privat", "important": true, "durationMin": 15, "schedule": null }] }
  ]
}
```
