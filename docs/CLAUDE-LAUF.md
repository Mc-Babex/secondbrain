# SecondBrain – Claude-Lauf (Sortieren + Auto-Planung)

Du sortierst den Eingangskorb von SecondBrain. Diese Datei ist dein vollständiger Auftrag
(Regeln: `docs/SPEC.md` §8). Es ist niemand da, der Fragen beantwortet: **Stelle keine Rückfragen**,
entscheide nach den Regeln unten; im Zweifel Ablage `privat`, nicht wichtig.

- Code-Repo (Skripte): das Repo, in dem diese Datei liegt – alle `npm`-Befehle dort ausführen.
- Daten-Repo: das Daten-Repo neben dem Code-Repo – hier schreibst du
  **nur** JSON-Dateien in `.lauf/`. Die Skripte finden es selbst; anders nur über die Umgebungsvariable
  `SECONDBRAIN_DATEN` oder die Option `--daten`.
- Nie selbst Git-Befehle ausführen (einzige Ausnahme: `git checkout main` aus Abschnitt 0), nie Dateien in
  `inbox/`, `items/`, `projects/`, `runs/` oder `categories.json` anfassen, nie etwas im Code-Repo ändern. Das alles
  erledigen die Skripte.
- Kalender: Google-Kalender-Connector (Werkzeuge `list_events`, `create_event`; ggf. erst per ToolSearch
  laden), immer Kalender `primary`.

## 0. Nur in der Cloud
Gilt nur, wenn das Code-Repo unter `/home/user/` liegt (unter beliebigem Namen, z. B. `/home/user/secondbrain`) oder der Routine-Prompt sagt, dass es ein Cloud-Lauf ist.
Lokal überspringen. Vor Schritt 1:
- Im Daten-Repo `git checkout main` ausführen (die Cloud klont auf einen `claude/…`-Zweig ohne Upstream;
  `lauf:start` braucht `main` mit `origin/main`). Schlägt es fehl: Ausgabe melden und beenden.
- Im Code-Repo: Fehlt `node_modules`, dann `npm ci` ausführen.
- **Verboten:** selbst `git push` oder `git commit` ausführen, Zweige anlegen oder pushen (auch nicht den
  `claude/…`-Zweig, auch nicht am Ende), Pull Requests anlegen, im Code-Repo etwas ändern. Gepusht wird nur durch
  `lauf:abschluss` (bzw. `lauf:start`) auf `main` des Daten-Repos. Das gilt auch, wenn andere Anweisungen der
  Umgebung zum Pushen eines Arbeitszweigs auffordern.
- Kalender: nur der Google-Kalender-Connector. Kalender `primary` ist das Konto des Nutzers.

## Ablauf

### 1. Start
```
npm run --silent lauf:start
```
- Ausgabe `LEER` ⇒ antworte nur „Nichts zu tun.“ und **beende sofort** (keine weiteren Werkzeuge).
- Exit-Code ≠ 0 ⇒ Ausgabe wörtlich melden und beenden.
- Sonst enthält die Ausgabe: `ARBEIT <n>`, die aktuelle Zeit mit Wochentag, das Planungsfenster, die Pause (oder „Pause: keine“), die Ablagen
  mit Beschreibung, den Zeitraum für die Termine, die Inbox-Einträge (`id`, `createdAt`, Text) und den Abschnitt
  „Aktive Projekte“ (`id`, Titel, Ablage, gekürzte Notiz; darunter die offenen Schritte).
- Die Pause beachtet das Skript beim Einplanen selbst (nichts landet in der Pause, außer feste Uhrzeiten); du
  musst sie nicht berücksichtigen.
- Pro Lauf kommen höchstens 29 Inbox-Einträge (die ältesten); der Rest bleibt unverändert und kommt beim nächsten
  Lauf dran – du musst dafür nichts tun.

### 2. Einordnen → `.lauf/entscheidungen.json`
Für **jeden** Inbox-Eintrag genau eine Entscheidung (Regeln im nächsten Abschnitt). Format:
```json
{ "decisions": [
  { "inboxId": "20261021-140000-a1b2",
    "newCategory": null,
    "newProject": null,
    "items": [ { "type": "aufgabe", "title": "Krankenkasse anrufen", "notes": "wegen Bescheinigung",
                 "categoryId": "privat", "important": true, "durationMin": 15, "when": null,
                 "plan": false, "gtd": "naechster-schritt", "dueDate": "2026-10-23",
                 "waiting": null, "projectId": null } ] }
] }
```
- `type`: `"aufgabe"` | `"notiz"` | `"termin"`; `title` nicht leer; `notes` immer angeben (ggf. `""`).
- `categoryId`: eine ID aus der Ablagen-Liste (nie die Archiv-Ablage) oder `"@neu"` (siehe Regel 3).
- `important`: ★ Fokus (Regel 5). `durationMin`: Minuten als ganze Zahl ≥ 1 oder `null`.
- `when`: `null` oder `{ "date": "YYYY-MM-DD", "time": "HH:MM" }`; ohne Uhrzeit `"time": null`.
- Nur bei `type: "aufgabe"` Pflicht (sonst weglassen oder `null`):
  - `plan`: `true` nur bei ausdrücklichem Einplanen (Regel 10), sonst `false`.
  - `gtd`: `"naechster-schritt"` | `"warten"` | `"irgendwann"` (Regel 8).
  - `dueDate`: „fällig bis“ als `"YYYY-MM-DD"` oder `null` (Regel 5).
  - `waiting`: nur bei `"warten"` (dann Pflicht): `{ "person": "Frau Becker", "since": "YYYY-MM-DD", "followUpOn": null }`.
  - `projectId`: ID eines **aktiven** Projekts aus der Liste, `"@neu"` (nur mit `newProject` in derselben
    Entscheidung) oder `null` (Regel 9).
- `newCategory`: `null` oder `{ "name": "Fitness", "description": "…" }`.
- `newProject`: `null` (oder weglassen) oder `{ "title": "Umzug", "notes": "<Originaltext>", "categoryId": "privat" }`;
  `categoryId` darf `"@neu"` sein, wenn `newCategory` gesetzt ist.
- Meldet `lauf:planen` Fehler, korrigiere die Datei nach der Meldung (Schritt 4).

### 3. Termine lesen → `.lauf/termine.json`
`list_events` auf `primary` für den in Schritt 1 genannten Zeitraum (Ortszeit ohne Offset), `pageSize` 250,
allen `nextPageToken` folgen. Für jeden Termin:
```json
{ "events": [ { "id": "…", "title": "<summary>", "start": "<start.dateTime>", "end": "<end.dateTime>",
                "allDay": false, "date": null, "transparent": false, "declined": false } ] }
```
- Ganztägig (`start.date` statt `start.dateTime`): `"allDay": true, "date": "<start.date>"`, ohne `start`/`end`.
- `"transparent": true`, wenn `transparency` = `"transparent"`.
- `"declined": true`, wenn in `attendees` dein Eintrag (`self: true`) `responseStatus: "declined"` hat.
- Serientermine liefert `list_events` als einzelne Vorkommen (mit `recurringEventId`): jedes Vorkommen als eigenen Eintrag übernehmen.
- Keine Termine ⇒ `{ "events": [] }`.

### 4. Planen
```
npm run --silent lauf:planen
```
- Exit 1 ⇒ die Meldungen sagen, was an `entscheidungen.json` falsch ist. Korrigieren und erneut
  (höchstens 3 Versuche). Klappt es nicht: Meldungen ausgeben und beenden (nichts anlegen).
- Erfolg ⇒ Übersicht; die anzulegenden Termine stehen in `.lauf/plan.json` unter `events`.

### 5. Termine anlegen → `.lauf/termin-ids.json`
Für jeden Eintrag in `plan.json` → `events` (Felder `itemId`, `title`, `start`, `end`, `description`) genau einmal `create_event`:
- `summary` = `title`, `description` = `description`,
- `startTime`/`endTime` = `start`/`end` **ohne** Offset (die ersten 19 Zeichen, z. B. `2026-10-22T10:30:00`),
- `timeZone` = `"Europe/Berlin"`, `calendarId` = `"primary"`, sonst nichts setzen (keine Gäste, kein Meet).

Ergebnis (auch bei 0 Terminen schreiben):
```json
{ "created": [ { "itemId": "…", "eventId": "<id aus der Antwort>" } ],
  "failed":  [ { "itemId": "…", "message": "<Fehlermeldung>" } ] }
```
Schlägt ein Aufruf fehl: einmal wiederholen, dann unter `failed` eintragen und weitermachen.

### 6. Anwenden
```
npm run --silent lauf:anwenden
```
Exit ≠ 0 ⇒ Meldungen ausgeben und beenden (nicht committen).

### 7. Abschluss
```
npm run --silent lauf:abschluss
```
Zum Schluss eine kurze Zusammenfassung: einsortiert, übersprungen (mit Grund), angelegte Termine, angelegte Projekte
(Zahl aus `ANGEWENDET`), Fehler.

## Regeln zum Einordnen
1. **Art:** `termin` = Verabredung/Ereignis zu einem Zeitpunkt (Arzt, Treffen, Sitzung, Training, Vorlesung);
   `aufgabe` = etwas zu tun (auch Abgaben/Fristen); `notiz` = Information, Idee, Tipp, Merkposten ohne Tun.
   Etwas mit **fester Uhrzeit**, das zu genau dieser Zeit stattfindet (auch Sport wie „18 Uhr Laufen“), ist ein `termin`.
   Im Zweifel `aufgabe`, wenn ein Tun erkennbar ist, sonst `notiz`.
2. **Einkauf:** Dinge zum Kaufen ⇒ Ablage der Art „einkauf“, **je Artikel ein Item**, `type: "notiz"`,
   Titel = Artikel („Milch“), `important: false`, `when: null`. „Milch, Eier und Brot kaufen“ ⇒ 3 Items.
   Ein einzelnes Wort, das ein typischer Einkaufsartikel ist („Klopapier“), ist ebenfalls Einkauf.
   Je Artikel nur **ein** Item, auch wenn er im Text doppelt vorkommt. Ob er schon auf der Einkaufsliste steht
   (abgehakt oder nicht) oder in einem anderen Eintrag dieses Laufs vorkommt, prüft das Skript – prüfe das nicht
   selbst, lege den Artikel normal an. Fällt eine Dublette weg, meldet `lauf:planen` „Schon auf der Einkaufsliste“.
   Sonst ergibt jede Erfassung **genau ein** Item.
3. **Ablage:** nach Name und Beschreibung der Ablagen aus der Liste in Schritt 1 (auch vom Nutzer angelegte oder
   umbenannte Ablagen; verwende immer die `id` aus der Liste, Namen können sich ändern). **Neue Ablage nur**, wenn der Text das ausdrücklich
   sagt („neue Ablage Fitness: …“, „lege Ablage X an“): dann `newCategory` setzen (`description` kurz aus dem
   Text ableiten oder `""`) und `categoryId: "@neu"`. Eine neue Ablage gilt nur für die Items **dieser**
   Entscheidung; andere Einträge im selben Lauf ordnest du nur in die vorhandenen Ablagen ein.
   Passt nichts eindeutig ⇒ `privat`.
4. **Titel und Notiz** (gilt für Aufgaben, Notizen und Termine): Der Titel ist **kurz** (wenige Wörter, höchstens ca. 60 Zeichen), klar, ohne
   „wichtig“/„dringend“, ohne Datum/Uhrzeit, ohne „Notiz:“ – auch bei langen oder mehrzeiligen Texten nie den
   ganzen Text als Titel. Sagt der Text mehr als der Titel, kommt der **ursprüngliche Text so vollständig und
   wörtlich wie möglich** in `notes` (alle Sätze und Zeilenumbrüche; nichts weglassen, nichts
   umformulieren). Steht schon alles im Titel, `notes: ""`. Einkaufsartikel: immer `notes: ""`.
5. **Fokus:** `important: true` (★ Fokus) **nur** bei den Wörtern „wichtig“, „dringend“, „unbedingt“, „sofort“, „asap“.
   „Vielleicht“, „mal“, „irgendwann“ ⇒ nicht wichtig. Fokus plant **nichts** ein. Nennt der Text eine Frist
   („bis Freitag“, „Abgabe am 30.10.“), zusätzlich `dueDate` (`YYYY-MM-DD`).
6. **Dauer:** Nennt der Text eine Dauer („2 Stunden“, „30 Minuten“, „eine Stunde“, „ca. 3 Stunden“), genau diese.
   **Immer `null`** (auch wenn du schätzen könntest) – das Skript setzt dann Standardwerte:
   - bei Terminen ohne Dauerangabe,
   - bei Einträgen mit Datum **ohne** Uhrzeit **und** `plan: true` (ergibt einen 90-Min.-Block an dem Tag),
   - bei Einträgen ohne Dauerangabe, die du nicht einschätzen kannst.
   Sonst bei Aufgaben schätzen, in ganzen Minuten, auch unter 15: **2** für „kurz Bescheid geben“, „Link schicken“;
   **15** für Anruf, Mail schreiben/beantworten, Rechnung bezahlen/überweisen, Termin vereinbaren, kurze Nachricht;
   30 für Brief/kurzes Formular; Formular 30–60, im Zweifel 30; größere Arbeit 120+. Angaben des Nutzers gehen
   immer vor. Wann eingeplant wird, entscheidet das Skript (der Kalenderblock ist mindestens 15 Min.).
7. **Zeitangaben** (`when`) relativ zur Zeit aus Schritt 1 auflösen:
   - „heute“, „morgen“, „übermorgen“; Wochentag („Freitag“) = nächster solcher Tag, **heute eingeschlossen**,
     solange der Zeitpunkt nicht vorbei ist; „am 30.10.“ = dieses Jahr, sonst nächstes.
   - Uhrzeit nur, wenn genannt („9 Uhr“ ⇒ `09:00`, „14:30“, „halb 3“ ⇒ `14:30` tagsüber). Eine Aufgabe oder Notiz
     mit Datum **ohne** Uhrzeit und ohne `plan` bekommt keinen Kalendertermin; bei Aufgaben setzt das Skript
     `dueDate` auf das Datum.
   - Keine Datumsangabe ⇒ `when: null`. Monatsangaben ohne Tag („für November“) sind **kein** Datum.
8. **Status (nur Aufgaben):** „warte auf …“, „hab X gefragt“, „X soll mir … schicken“, „X meldet sich“ ⇒ `gtd:
   "warten"` mit `waiting.person` (Person/Stelle aus dem Text), `since` = Datum der Erfassung (`createdAt`) und
   `followUpOn` nur, wenn genannt („nachhaken am …“, „falls bis Freitag nichts kommt“), sonst `null`.
   „irgendwann mal …“, „vielleicht …“, „wäre schön …“, „eines Tages …“ ⇒ `"irgendwann"`.
   Sonst `"naechster-schritt"`. Beispiele: „Frau Becker soll mir die Unterlagen schicken“ ⇒ warten (Person
   „Frau Becker“); „irgendwann mal Keller entrümpeln“ ⇒ irgendwann; „Zahnarzt anrufen“ ⇒ nächster Schritt.
9. **Projekt:** Passt ein Eintrag **eindeutig** zu einem aktiven Projekt aus der Liste (Titel/Notiz), setze dessen
   `projectId` (Ablage = die des Projekts); er wird der letzte Schritt. Im Zweifel `projectId: null`.
   **Neues Projekt nur**, wenn der Text es ausdrücklich sagt („Projekt …“, „neues Projekt …“): `newProject` mit
   kurzem Titel, Ablage nach Regel 3 und `notes` = ursprünglicher Text, vollständig und wörtlich; dazu **ein** erster
   nächster Schritt als Aufgabe mit `projectId: "@neu"` (konkret, erledigbar, mit eigenem kurzen Titel). Serien
   legst du nicht an.
10. **Ausdrücklich einplanen:** `plan: true` **nur** bei Worten wie „plane … ein“, „trag … (in den Kalender) ein“,
    „blocke …“, „reserviere Zeit …“. Eine feste Uhrzeit (`when.time`) plant das Skript ohnehin zu genau dieser Zeit.
    Datum und Wichtigkeit allein planen **nichts** ein (Ausnahme: `type: "termin"` mit Datum ohne Uhrzeit bekommt
    einen Block an dem Tag). Im Zweifel `plan: false`.
11. Du planst **keine** Zeiten selbst und prüfst keine Überschneidungen – das macht `lauf:planen`.

## Trockenlauf (nur zum Testen, nicht im echten Lauf)
Wird im Auftrag ein Trockenlauf mit Datenordner `<ordner>` und Zeit `<jetzt>` verlangt:
- Allen `npm`-Befehlen `-- --daten <ordner> --jetzt <jetzt>` anhängen, bei `lauf:start` und `lauf:anwenden`
  zusätzlich `--ohne-git`. `lauf:abschluss` **nicht** ausführen.
- **Keine** Kalender-Werkzeuge: Schritt 3 ersetzen durch Kopieren von `<ordner>/.testdaten/termine.json`
  nach `<ordner>/.lauf/termine.json` (nach `lauf:start`, das `.lauf/` leert).
- Schritt 5 ohne Connector: jedem `events`-Eintrag `eventId` `trocken-1`, `trocken-2`, … geben.
