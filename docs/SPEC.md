# SecondBrain – Spezifikation

Stand: 2026-11-18 · Status: **freigegeben** (Phase 5 „Cloud-Lauf per Knopf“ freigegeben 2026-10-19;
Mail-Phase gestrichen und Phase 6 „iPhone“ freigegeben 2026-10-19; Phase 7 Teil A „Fehler und Feinschliff“
und Teil B „Vollwertiger Kalender“ freigegeben 2026-10-20; Phase 8 „Testphase mit weiteren Nutzern“
freigegeben 2026-10-28; Phase 9 „Aufgabenseite nach GTD“ freigegeben 2026-11-16, Korrekturen aus dem
Vorschau-Test freigegeben 2026-11-18)

Persönliche App zum schnellen Erfassen von Gedanken, Aufgaben und Terminen. Erfasstes landet
im Eingangskorb; ein Claude-Lauf (außerhalb der App, in der Cloud, per Knopf gestartet, optional) sortiert es
in Ablagen und plant Aufgaben in den Google Kalender ein. Die App selbst enthält **keine** KI.

---

## 1. Zielplattformen

| Phase | Plattform | Installation |
|---|---|---|
| 1 | Windows, Microsoft Edge | „Als App installieren" → Desktop-Icon, eigenes Fenster |
| 6 | iPhone, Safari | „Zum Home-Bildschirm" (gleicher Code, gleiche Adresse) |

- PWA, gehostet kostenlos auf **Cloudflare Pages** aus dem öffentlichen GitHub-Code-Repo `secondbrain` (§1.1).
- Dunkles Design, ausschließlich deutsche Oberfläche.
- Bedienbar mit Maus, Tastatur und Touch.
- **iPhone (Phase 6):** kein App Store, kein Mac, keine Kosten. Start vom Home-Bildschirm im Vollbild
  (ohne Safari-Leisten), dunkle Statusleiste, kein weißes Aufblitzen beim Start. Inhalte respektieren
  die Safe Areas (Notch, Home-Leiste); Höhen mit `dvh`; die Bildschirmtastatur verdeckt kein aktives
  Eingabefeld; keine waagerechte Verschiebung, kein Auto-Zoom; Tippflächen mindestens 44 × 44 px.
  Wischen zwischen den Seiten kollidiert nicht mit Scrollen oder iOS-Gesten.
- iOS kann den lokalen Speicher einer Home-Bildschirm-App leeren. Das ist unkritisch: Alle Daten liegen
  im Daten-Repo und sind nach erneuter Einrichtung (Token, Google) vollständig wiederhergestellt; nur
  noch nicht hochgeladene Änderungen (Outbox) können verloren gehen. Die App fragt dauerhaften Speicher an
  (`navigator.storage.persist()`).
- Die Desktop-Version (Edge) darf sich durch iPhone-Anpassungen nicht verschlechtern.

### 1.1 Nutzer und Kanäle (Phase 8)
- **Mehrere Nutzer, strikt getrennt:** Jeder Nutzer hat ein eigenes **privates Daten-Repo** (aus der öffentlichen
  Vorlage, §3.1) und einen eigenen fine-grained GitHub-Token nur für dieses Repo. Die App kennt keine Benutzerkonten;
  wer welche Daten sieht, ergibt sich allein aus Token und Repo auf dem Gerät. Der Entwickler hat keinen Zugriff auf
  die Daten der Nutzer; die Daten gehen nur zwischen Gerät, GitHub und Google hin und her (Cloudflare liefert nur die
  App-Dateien aus).
- **Code-Repo öffentlich** (`<entwickler>/secondbrain`, neues Repo ohne alte Historie). Enthält keine Geheimnisse und
  keine persönlichen Daten. Das frühere private Repo bleibt als Archiv (`secondbrain-archiv`).
- **Zwei Kanäle:**

  | Zweig | Zweck | Adresse |
  |---|---|---|
  | `main` | Entwicklung, nur für den Entwickler | Cloudflare-Vorschau (`main.<projekt>.pages.dev`) |
  | `stable` | für alle Nutzer, Standardzweig des Repos | Produktiv-Adresse (`<projekt>.pages.dev`) |

  **Veröffentlichen** = `main` nach `stable` übernehmen, erst nach dem Test des Entwicklers auf der Vorschau. Alle
  Nutzer verwenden dieselbe Produktiv-Adresse; ein Update erreicht alle automatisch (§6.8).
- Workflow, Skripte und Lauf-Anleitung für Nutzer kommen immer von `stable` (§8.1).
- **Claude-Lauf optional:** Nutzer mit eigenem Claude-Abo richten eine eigene Cloud-Routine ein (eigenes Konto,
  eigenes Kontingent, eigener Start-Token als Secret im eigenen Daten-Repo). Ohne Claude funktioniert alles außer
  dem automatischen Sortieren (§6.3).

## 2. Architektur

```
┌──────────────── PWA (Browser) ────────────────┐
│ React-UI ──► Datenschicht ──► IndexedDB       │   lokal, offline-fähig
│                    │                          │
│                    └─► Sync ──► GitHub REST API ──► eigenes Daten-Repo des Nutzers (privat)
│ Google Identity Services ──► Google Calendar API
│ Web Speech API (Spracheingabe)                │
└───────────────────────────────────────────────┘
           │ Knopf „Jetzt sortieren“ ──► repository_dispatch (GitHub REST API)   [nur mit autoSort, §3.6]
           ▼
  GitHub Action im Daten-Repo (kurzer Aufruf) ──► wiederverwendbarer Workflow im Code-Repo @stable
     ──► prüft Arbeit + Sperre + Secrets ──► POST …/routines/<id>/fire (Anthropic, Routine des Nutzers)
                                                                   │
  Claude-Lauf = Cloud-Routine von Claude Code des Nutzers ◄────────┘
     Lauf-Anleitung und Skripte von stable, liest/schreibt das Daten-Repo des Nutzers,
     Kalender über den Google-Kalender-Connector des Nutzers
```

- **Quelle der Wahrheit:** Das Daten-Repo. IndexedDB ist lokaler Puffer + Offline-Speicher.
- **Kein eigener Server.** Alles läuft im Browser; Zugangsdaten bleiben auf dem Gerät. Die GitHub Action
  ist ein Workflow im Daten-Repo (läuft bei GitHub), kein eigener Server.

## 3. Datenmodell

### 3.1 Daten-Repo (Vorschlag: `secondbrain-daten`)

Der Name ist frei wählbar; neue Nutzer legen es aus der öffentlichen Vorlage `secondbrain-vorlage` an
(„Use this template“, privat). Die Vorlage enthält `secondbrain.json`, `categories.json` (Start-Ablagen, §3.5),
`settings.json` (mit `"autoSort": false`), leere Ordner `inbox/`, `items/`, `.gitignore` und den Workflow.

```
secondbrain.json       Formatversion (§3.11); Markerdatei, an der die Skripte das Daten-Repo erkennen
inbox/<id>.json        unsortierte Erfassungen (App schreibt, Claude-Lauf liest + löscht)
items/<id>.json        einsortierte Einträge (Aufgaben, Notizen, Termine, Einkauf)
projects/<id>.json     Projekte inkl. Schritt-Serien (Phase 9, §3.12; App schreibt, Claude-Lauf liest und legt neue an)
suggestions/<id>.json  Vorschläge von Claude (Claude schreibt, App nimmt an/lehnt ab)
categories.json        Ablagen
settings.json          geräteübergreifende Einstellungen (OHNE Zugangsdaten)
runs/last.json         Protokoll des letzten Claude-Laufs mit Einträgen (Claude-Lauf schreibt, App liest)
runs/started.json      Sperre: zuletzt gestarteter Cloud-Lauf (Action schreibt, App liest), siehe 3.10
runs/trigger.json      Antwort auf die letzte Start-Anfrage (Action schreibt, App liest), siehe 3.10
.github/               kurzer Workflow, ruft den wiederverwendbaren Workflow des Code-Repos @stable auf
                       (App und Claude-Lauf ignorieren den Ordner)
.gitignore             enthält `.lauf/` (Arbeitsordner des Claude-Laufs, nie im Repo)
```
App-Sync, Lauf-Skripte und `lauf:pruefen` tolerieren alle hier nicht genannten Pfade und lassen sie unverändert.
Fehlen `categories.json` oder `settings.json`, gelten App und Claude-Lauf gleichermaßen die
Standardwerte aus 3.5 bzw. 3.6.

Alle Dateien: UTF-8, JSON, 2 Leerzeichen eingerückt, Zeitstempel als ISO 8601 mit Zeitzonen-Offset
(z. B. `2026-10-17T09:30:00+02:00`). Unbekannte Felder werden beim Lesen erhalten und beim
Schreiben unverändert zurückgeschrieben (Vorwärtskompatibilität mit dem Claude-Lauf).

**ID-Format:** `YYYYMMDD-HHmmss-xxxx` (Ortszeit der Erstellung + 4 zufällige Zeichen `a-z0-9`),
z. B. `20261017-093000-k3f9`. Sortierbar, als Dateiname gültig.

### 3.2 `inbox/<id>.json` – Eingangskorb

```json
{
  "id": "20261017-093000-k3f9",
  "text": "Morgen Krankenkasse wegen Bescheinigung anrufen, wichtig",
  "createdAt": "2026-10-17T09:30:00+02:00",
  "source": "sprache"
}
```
`source`: `"sprache"` | `"text"`.

Optional, nur vom Claude-Lauf gesetzt, wenn er den Eintrag nicht einsortieren konnte
(z. B. kein freier Block am genannten Tag):
```json
"sortError": { "message": "Am Fr 23.10. ist im Planungsfenster kein freier 90-Min-Block.", "at": "2026-10-21T14:05:00+02:00" }
```
Einträge mit `sortError` überspringt der Lauf künftig; der Nutzer sortiert sie von Hand ein oder löscht sie.

### 3.3 `items/<id>.json` – Eintrag

```json
{
  "id": "20261017-093000-k3f9",
  "type": "aufgabe",
  "title": "Krankenkasse anrufen (Bescheinigung)",
  "notes": "",
  "categoryId": "privat",
  "status": "offen",
  "important": true,
  "durationMin": 15,
  "schedule": {
    "start": "2026-10-18T09:00:00+02:00",
    "durationMin": 15,
    "calendarEventId": "abc123googleid"
  },
  "originalCategoryId": null,
  "createdAt": "2026-10-17T09:30:00+02:00",
  "updatedAt": "2026-10-17T10:00:00+02:00",
  "completedAt": null
}
```

| Feld | Typ | Bedeutung |
|---|---|---|
| `type` | `"aufgabe"` \| `"notiz"` \| `"termin"` | Art des Eintrags |
| `title` | string | Kurztext (Pflicht) |
| `notes` | string | Freitext, optional |
| `categoryId` | string | Ablage (siehe 3.5) |
| `status` | `"offen"` \| `"erledigt"` | Notizen sind immer `offen` |
| `important` | boolean | **★ Fokus** (Phase 9; früher „wichtig“). Löst **keine** automatische Einplanung aus |
| `durationMin` | number \| null | geschätzte Dauer in Minuten, ganze Zahl ≥ 1 (Phase 9; bisher ab 15) |
| `schedule` | object \| null | eingeplanter Kalendertermin; `null` = nicht im Kalender |
| `originalCategoryId` | string \| null | Ablage vor dem Archivieren nach „Erledigt" |
| `checked` | boolean | nur Einkaufsliste: abgehakt |
| `completedAt` | string \| null | Zeitpunkt des Erledigens |

**Überfällig** = `type: "aufgabe"`, `status: "offen"`, `schedule != null` und
`schedule.start + schedule.durationMin < jetzt`.

**GTD-Felder (Phase 9, nur `type: "aufgabe"`, alle optional):**

| Feld | Typ | Bedeutung | fehlt ⇒ |
|---|---|---|---|
| `gtd` | `"naechster-schritt"` \| `"warten"` \| `"irgendwann"` | gespeicherter GTD-Status | `"naechster-schritt"` |
| `dueDate` | `"YYYY-MM-DD"` \| null | „fällig bis“ (nur Datum, Europe/Berlin) | `null` |
| `waiting` | `{ "person": string, "since": "YYYY-MM-DD", "followUpOn": "YYYY-MM-DD" \| null }` \| null | nur bei `gtd: "warten"`: Person/Was, seit, nachhaken am | `person` `""`, `since` = Datum von `updatedAt`, `followUpOn` `null` |
| `projectId` | string \| null | Projekt (§3.12), zu dem der Schritt gehört | `null` |
| `projectOrder` | number | Reihenfolge im Projekt (aufsteigend, Kommazahlen erlaubt) | nach `createdAt` hinter allen mit `projectOrder` |
| `seriesId`, `seriesNumber` | string, number | nur Serien-Instanzen (§3.12) | – |
| `archivedWithProject` | boolean | beim Projektabschluss mitarchiviert (für Wiederherstellen) | `false` |
| `v` | number | `2` = von einer App ab Phase 9 geschrieben | – |

- **Angezeigter Status** einer offenen Aufgabe: `schedule != null` ⇒ **Termin**, sonst der Wert aus `gtd`
  (**Nächster Schritt**, **Warte auf**, **Irgendwann**). „Termin“ wird nie gespeichert; wird der Termin entfernt, gilt
  wieder `gtd`.
- **⚡ < 2 Min.** (2-Minuten-Regel) bei `durationMin ≤ 2`. Einplanen in den Kalender belegt immer mindestens 15 Min.
- Notizen, Termine (`type: "termin"`) und Einkaufsartikel haben keinen GTD-Status; die Felder fehlen dort.

### 3.4 `suggestions/<id>.json` – Vorschlag von Claude

```json
{
  "id": "20261017-110000-p2x8",
  "kind": "neue-aufgabe",
  "text": "Antwort an Frau Becker wegen Abgabetermin",
  "proposedItem": { "type": "aufgabe", "title": "…", "categoryId": "arbeit", "durationMin": 30 },
  "reason": "Mail vom 17.10. bittet um Rückmeldung bis Freitag",
  "createdAt": "2026-10-17T11:00:00+02:00"
}
```
- **Annehmen** → `proposedItem` wird als neuer Eintrag in `items/` angelegt, Vorschlag gelöscht.
- **Ablehnen** → Vorschlag gelöscht.
- `kind` nur `"neue-aufgabe"`. Die Vorschlagsliste bleibt im Code, wird aber nicht weiter ausgebaut
  (Mail-Phase gestrichen 2026-10-19); derzeit erzeugt nichts Vorschläge.

### 3.5 `categories.json` – Ablagen

```json
{
  "categories": [
    { "id": "privat",      "name": "Privat",       "kind": "normal",  "order": 1, "description": "Alles Persönliche: Haushalt, Arzttermine, Behörden, Freizeit …" },
    { "id": "arbeit",      "name": "Arbeit",       "kind": "normal",  "order": 2, "description": "Alles zu Beruf, Job oder Ausbildung" },
    { "id": "einkauf",     "name": "Einkaufsliste","kind": "einkauf", "order": 3, "description": "" },
    { "id": "erledigt",    "name": "Erledigt",     "kind": "archiv",  "order": 4, "description": "Archiv für abgehakte Aufgaben" }
  ]
}
```
- Das sind die **Start-Ablagen** (Phase 8) – Standardwerte bei fehlender Datei und Inhalt der Vorlage. Weitere
  Ablagen legt jeder Nutzer selbst an. Vorhandene `categories.json` bleiben unverändert.
- `kind`: `"normal"` | `"einkauf"` | `"archiv"`. Genau eine Ablage je `einkauf` und `archiv`; diese
  beiden lassen sich nicht löschen.
- `description` dient dem Claude-Lauf als Sortierhilfe.
- Eigene Ablagen: `id` aus dem Namen abgeleitet (klein, ohne Umlaute/Leerzeichen, eindeutig), neue
  Ablagen bekommen `order` = bisher größte + 1.
- **Umbenennen** ändert nur `name` (und ggf. `description`), nie die `id` – bei allen Ablagen erlaubt.
- **Löschen** (nicht `einkauf`/`archiv`): alle Einträge mit `categoryId` dieser Ablage wandern in eine
  gewählte Zielablage (Standard `privat`); archivierte Einträge mit `originalCategoryId` dieser Ablage
  bekommen die Zielablage als `originalCategoryId`; Projekte (§3.12) dieser Ablage wandern ebenfalls in die Zielablage.
  Danach wird die Ablage aus `categories.json` entfernt.

### 3.9 Einkaufsartikel – gleiche Artikel
Zwei Einkaufsartikel sind **gleich**, wenn ihre Titel nach Kleinschreibung, Trimmen und Zusammenfassen
von Leerzeichen übereinstimmen („ Knoblauch“ = „knoblauch“; „Knoblauchzehen“ ist ein anderer Artikel).
Steht ein gleicher Artikel schon in der Einkaufsliste (abgehakt oder nicht), wird **kein** neuer angelegt;
der vorhandene bleibt unverändert. Gilt für die App und den Claude-Lauf (auch innerhalb eines Laufs).

### 3.6 `settings.json` – gemeinsame Einstellungen

```json
{ "planningWindow": { "start": "09:00", "end": "19:00" }, "pause": { "start": "12:00", "end": "13:00" }, "timezone": "Europe/Berlin", "autoSort": true }
```
- `autoSort` (Phase 8): `true` = automatisches Sortieren mit Claude ist eingerichtet (§6.3, §8.1). **Fehlt das Feld,
  gilt `true`** (bestehende Daten-Repos bleiben unverändert); die Vorlage setzt `false`. Umschalten in den
  Einstellungen (§6.5).
- `pause` (Phase 7): Pausenfenster innerhalb des Planungsfensters, gilt an allen Wochentagen. `null` = keine Pause
  (abgeschaltet). **Fehlt das Feld, gilt der Standard 12:00–13:00.** Eine ungültige Pause (Ende ≤ Beginn oder nicht
  vollständig im Planungsfenster) gilt für App und Claude-Lauf als „keine Pause“; die App lässt sie nicht speichern.
  Regeln für das Einplanen: §8.4.

### 3.7 Nur lokal (nie ins Repo, nie in Logs/URLs)

| Wert | Speicherort |
|---|---|
| GitHub-Token (fine-grained, nur das eigene Daten-Repo, Contents: Read & Write) | IndexedDB |
| Repo-Angabe (`besitzer/name`, keine Vorbelegung) | IndexedDB |
| Google-Client-ID | Build-Variable `VITE_GOOGLE_CLIENT_ID` (ist öffentlich, kein Geheimnis) |
| Google-Access-Token | nur im Arbeitsspeicher (läuft nach ~1 h ab, wird still erneuert) |

Der GitHub-Token reicht auch für den Start-Knopf (`repository_dispatch` braucht „Contents: write“).

Nur als **GitHub-Secrets im Daten-Repo des jeweiligen Nutzers** (nie in der App, im Code-Repo, in Logs, URLs oder
Commits; nur nötig mit Claude-Lauf):

| Secret | Inhalt |
|---|---|
| `ROUTINE_FIRE_URL` | `https://api.anthropic.com/v1/claude_code/routines/<trig_…>/fire` |
| `ROUTINE_FIRE_TOKEN` | Start-Token der Routine (`sk-ant-oat01-…`, nur zum Starten dieser einen Routine) |

### 3.8 `runs/last.json` – Protokoll des letzten Laufs

```json
{
  "startedAt": "2026-10-21T14:05:00+02:00",
  "finishedAt": "2026-10-21T14:07:30+02:00",
  "processed": 3,
  "itemIds": ["20261021-140100-a1b2", "20261021-140300-c3d4", "20261021-140301-x9z8"],
  "skipped": [{ "inboxId": "20261021-140200-e5f6", "message": "Am Fr 23.10. ist im Planungsfenster kein freier 90-Min-Block." }],
  "errors": [{ "inboxId": "20261021-140300-c3d4", "message": "Kalendertermin konnte nicht angelegt werden." }]
}
```
| Feld | Bedeutung |
|---|---|
| `processed` | Anzahl einsortierter Inbox-Einträge (ohne `skipped`) |
| `itemIds` | alle in diesem Lauf angelegten Einträge (eine Erfassung kann mehrere ergeben, z. B. Einkauf) |
| `projectIds` | (Phase 9, optional) in diesem Lauf angelegte Projekte |
| `skipped` | in diesem Lauf neu mit `sortError` im Eingangskorb belassene Einträge |
| `errors` | sonstige Fehler (`inboxId` darf `null` sein); der Lauf macht trotzdem weiter |

Wird nur geschrieben, wenn der Lauf mindestens einen Inbox-Eintrag bearbeitet oder einen Fehler zu melden hat.

### 3.10 `runs/started.json` und `runs/trigger.json` – Start per Knopf

Beide schreibt nur die GitHub Action (§8.1), die App liest sie. Zeitstempel in Europe/Berlin mit Offset,
`requestId` im ID-Format aus 3.1 (von der App erzeugt).

`runs/started.json` – Sperre gegen doppelte Läufe:
```json
{ "requestId": "20261021-140000-r7k2", "startedAt": "2026-10-21T14:00:05+02:00", "status": "gestartet" }
```
| `status` | Bedeutung |
|---|---|
| `"gestartet"` | Start-Aufruf erfolgreich (oder steht unmittelbar bevor) |
| `"unklar"` | Netzfehler/Zeitüberschreitung beim Start-Aufruf – ob der Lauf läuft, ist unbekannt |
| `"abgelehnt"` | Start-Aufruf mit Fehlerantwort; es läuft nichts |

**Sperre aktiv** ⇔ `status` ist `"gestartet"` oder `"unklar"` **und** jetzt < `startedAt` + 20 Min. **und**
`runs/last.json` fehlt oder `finishedAt` ≤ `startedAt`.

`runs/trigger.json` – Antwort auf die letzte Anfrage:
```json
{ "requestId": "20261021-140000-r7k2", "at": "2026-10-21T14:00:06+02:00", "result": "gestartet", "message": "" }
```
`result`: `"gestartet"` · `"nichts"` (keine Arbeit) · `"laeuft"` (Sperre aktiv) · `"abgelehnt"` (Fehlerantwort
der Routine, `message` mit HTTP-Status; bei 429 optional `"retryAfter"` als Zeitstempel) · `"unklar"` ·
`"fehler"` (Action konnte die Sperre nicht schreiben, nichts gestartet) · `"nicht-eingerichtet"` (Phase 8: die
Secrets aus 3.7 fehlen; nichts gestartet, keine Sperre geschrieben).

### 3.11 Formatversion und Migration (Phase 8)
`secondbrain.json` im Wurzelordner des Daten-Repos:
```json
{ "format": 1 }
```
- **Fehlt die Datei oder das Feld, gilt `format: 1`** (bestehende Daten-Repos bleiben unverändert). Unbekannte Felder
  bleiben erhalten. Die App legt die Datei nicht von sich aus an.
- App und Lauf-Skripte kennen eine höchste Formatversion. Ist `format` **höher**, schreiben sie **nichts** ins Repo
  (App: kein Hochladen, Outbox bleibt erhalten; Skripte: Abbruch vor jeder Änderung) und zeigen „Die Daten wurden
  mit einer neueren App-Version gespeichert. Bitte App neu laden bzw. aktualisieren.“ Lesen und lokales Arbeiten
  bleiben möglich.
- **Änderungen am Datenformat** sind grundsätzlich **additiv** (neue optionale Felder/Dateien mit Standardwert bei
  Fehlen) und brauchen keine neue Version. Nur wenn das nicht geht, wird `format` erhöht und eine **Migration**
  beschrieben (wer migriert, wann, idempotent, ohne Datenverlust); vorher Freigabe über diese SPEC.
- Die Skripte erkennen das Daten-Repo an `secondbrain.json` (Reihenfolge: `--daten`, `SECONDBRAIN_DATEN`, Nachbarordner
  mit `secondbrain.json`, Nachbarordner `secondbrain-daten`).
- **Phase 9 bleibt bei `format: 1`** (nur neue optionale Felder und der neue Ordner `projects/`). Ein `format: 2` hätte
  den Claude-Lauf von `stable` und nicht aktualisierte Apps schon während des Vorschau-Tests gesperrt (Entscheidung des
  Nutzers, 2026-11-16).

### 3.12 `projects/<id>.json` – Projekte (Phase 9)

```json
{
  "id": "20261116-090000-p7a2",
  "title": "Analysis 1",
  "notes": "",
  "categoryId": "studium",
  "status": "aktiv",
  "series": [
    {
      "id": "s1",
      "titlePattern": "Übungsblatt {Nr}",
      "every": 1,
      "weekday": 1,
      "startDate": "2026-10-19",
      "endDate": "2027-02-12",
      "count": null,
      "dueWeekday": 5,
      "durationMin": 180,
      "state": "aktiv",
      "skippedDates": ["2026-11-02"],
      "lastNumber": 4,
      "lastDate": "2026-11-16"
    }
  ],
  "createdAt": "2026-11-16T09:00:00+01:00",
  "updatedAt": "2026-11-16T09:00:00+01:00",
  "completedAt": null,
  "v": 2
}
```
- Projekt = Ziel mit mehreren Schritten, gehört zu einer Ablage (`categoryId`, nie Einkauf/Archiv). `status`:
  `"aktiv"` | `"erledigt"`. `id` im ID-Format aus 3.1. Unbekannte Felder bleiben erhalten. `series` fehlt ⇒ `[]`.
- **Schritte** = Aufgaben mit `projectId` (§3.3), sortiert nach `projectOrder`. **Nächster Schritt des Projekts** =
  offener Schritt mit kleinstem `projectOrder` (gleich welcher angezeigte Status). Aktives Projekt ohne offenen
  Schritt ⇒ Warnung „⚠ Nächsten Schritt festlegen“ – **außer** es hat eine aktive Serie mit einem weiteren Stichtag
  (nach `lastDate`, vor dem Ende); dann steht statt der Warnung „Nächstes: <Titel mit Nr> ab <Wochentag Datum>“.
  Fortschritt x/y = erledigte / alle Schritte; dazu zählen in y die **noch nicht angelegten Instanzen** aktiver
  Serien mit festem Ende (`count` oder `endDate`). Serien ohne Ende zählen nur ihre angelegten Instanzen.
- **Abschließen:** `status: "erledigt"`, `completedAt`; alle offenen Schritte werden wie ✓ Erledigt archiviert und
  bekommen `archivedWithProject: true`; Serien → `state: "beendet"`. **Wiederherstellen** (aus „Erledigt“): Projekt
  `aktiv`, `completedAt: null`, genau die Schritte mit `archivedWithProject: true` wieder offen (Feld entfällt); Serien
  bleiben beendet.
- **Ablage löschen** (§3.5): Projekte der Ablage wandern mit in die Zielablage.
- Projekt löschen: nur ohne Schritte (sonst erst abschließen); Bestätigung.

**Schritt-Serien** (`series[]`): `every` 1 = wöchentlich, 2 = alle 2 Wochen; `weekday`/`dueWeekday` 1 = Mo … 7 = So
(`dueWeekday` optional, `null` = ohne Fälligkeit); Ende über `endDate` **oder** `count` (beide `null` = ohne Ende);
`durationMin` optional; `state` `"aktiv"` | `"pausiert"` | `"beendet"`; `id` eindeutig im Projekt.
`skippedDates` = ausgefallene Stichtage (`YYYY-MM-DD`, sortiert, ohne Doppelte; fehlt ⇒ `[]`).
`lastNumber`/`lastDate` = Nummer und Stichtag der zuletzt angelegten Instanz (anfangs `0` / `null`).
- **Stichtage:** `startDate` und alle `every` Wochen danach am `weekday` (erster Stichtag = erster `weekday` ab
  `startDate`), **ohne** die Tage aus `skippedDates`, bis einschließlich `endDate` bzw. bis Nummer `count`. Nummer
  n gehört damit eindeutig zum n-ten Stichtag.
- **Anlage nur durch die App**, nach jedem erfolgreichen Herunterladen (§4), nie offline. Der Claude-Lauf legt keine
  Instanzen an. Für jede aktive Serie eines aktiven Projekts:
  1. `lastNumber`/`lastDate` = jeweils Maximum aus Projektdatei **und** vorhandenen Einträgen mit dieser `seriesId`
     (auch archivierten).
  2. Für k = `lastNumber + 1`, `+ 2`, …: Ist der k-te Stichtag vorhanden (vor dem Ende) und ≤ heute (Europe/Berlin),
     ergibt er eine Aufgabe (höchstens 10 je Sync, der Rest beim nächsten): Titel = `titlePattern` mit `{Nr}` = k, `gtd:
     "naechster-schritt"`, `dueDate` = erster `dueWeekday` ab Stichtag, `durationMin`, `categoryId` des Projekts,
     `projectId`, `projectOrder` hinter allen vorhandenen Schritten, `seriesId`, `seriesNumber`, `notes: ""`.
  3. **ID deterministisch:** `<Stichtag YYYYMMDD>-000000-<4 Zeichen a-z0-9 aus einem festen Hash von Projekt-ID,
     Serien-ID und Stichtag>`. Zwei Geräte erzeugen so dieselbe Datei; existiert sie lokal oder im Repo schon, wird
     nichts angelegt. Beim Hochladen gilt eine schon vorhandene Remote-Datei als dieselbe Instanz (Konfliktregel §4) –
     es entsteht nie eine zweite Datei.
  4. Danach Projektdatei mit neuem `lastNumber`/`lastDate` speichern (Instanzen vor der Projektdatei hochladen).
- Gelöschte oder erledigte Instanzen entstehen nicht neu (`lastDate`).
- **Ausfall** („Fällt aus – 1 Woche später“ bzw. „2 Wochen später“ bei `every` 2, an einer offenen Instanz): Der erste
  Stichtag nach dem Stichtag der Instanz, der noch nicht in `skippedDates` steht, kommt in `skippedDates`; `dueDate`
  der Instanz rückt um `every` Wochen nach hinten (ohne `dueDate`: nur der Ausfall). Alle folgenden Instanzen rücken
  damit bei gleicher Nummerierung nach hinten. **Ausfall eintragen** an der Serie: einen künftigen Stichtag (nach
  `lastDate`) in `skippedDates` aufnehmen. Ende per `count` rückt dadurch mit; Ende per `endDate` bleibt (ein Blatt
  weniger). Ausfälle sind über die Serie wieder entfernbar, solange der Stichtag nach `lastDate` liegt.
- **Pausieren:** Stichtage während der Pause entfallen; die Nummerierung läuft ohne Lücke weiter. **Fortsetzen**
  trägt alle Stichtage von `lastDate` (exklusiv) bis gestern in `skippedDates` ein und setzt `lastDate` auf den
  letzten davon (falls größer). **Beenden:** `state: "beendet"`. **Bearbeiten** von Muster, Ende oder Dauer wirkt ab
  der nächsten Instanz. **Bearbeiten von Start, Wochentag, Rhythmus oder Fälligkeit** berechnet zusätzlich die
  **offenen** Instanzen neu (erledigte bleiben unverändert): Instanz Nr n bekommt den n-ten Stichtag der neuen Regel
  und `dueDate` neu; ändert sich ihr Stichtag, ersetzt eine Datei mit der ID des neuen Stichtags (Regel 3) die alte
  (übrige Felder, Titel und `createdAt` bleiben; Google-Termin bleibt verknüpft). Liegt der neue Stichtag nach heute,
  wird die offene Instanz stattdessen gelöscht (Google-Termin wie §6.6) und entsteht an ihrem Stichtag neu.
  Wurden dabei künftige Instanzen gelöscht, wird `lastNumber` auf (kleinste gelöschte Nummer − 1) gesetzt und
  `lastDate` auf deren Stichtag nach der neuen Regel (Nr 0 ⇒ `null`); sonst bleibt `lastNumber` (so entstehen von
  Hand gelöschte Instanzen nicht neu) und `lastDate` wird der Stichtag von Nr `lastNumber` nach der neuen Regel. `skippedDates` vor dem neuen Start entfallen.
- **Abgeschlossen** ist eine Serie mit `state: "beendet"` oder ohne weiteren Stichtag (k-ter Stichtag für
  k = `lastNumber + 1` existiert nicht, weil `count` bzw. `endDate` erreicht ist). Pausierte Serien gelten nicht als
  abgeschlossen.
- **Serie löschen** (jede Serie, mit Bestätigung): Das Serienobjekt wird aus `series[]` entfernt. Angelegte Instanzen
  (offen und erledigt) bleiben als normale Schritte unverändert; ihr `seriesId`/`seriesNumber` bleibt nur als
  Herkunftsangabe (Aktionen wie „Fällt aus“ entfallen für sie). Es entstehen keine weiteren Instanzen; der Fortschritt
  zählt nur noch vorhandene Schritte.

### 3.13 Migration auf GTD (Phase 9)
Reine, idempotente Lese-Funktion, gemeinsam für App und Lauf-Skripte (wie `src/lib/sortWork.ts`):
- offene Aufgabe ohne `gtd` ⇒ `gtd: "naechster-schritt"` (mit `schedule` erscheint sie als „Termin“);
- `important: true` ⇒ ist ★ Fokus (keine Umrechnung nötig);
- Notizen, Einkaufsartikel, Termine (`type: "termin"`) und Erledigtes bleiben unverändert.
- Die Dateien im Repo werden **nicht** auf einmal umgeschrieben; die migrierte Form wird erst bei der nächsten
  Änderung eines Eintrags gespeichert (dann mit `"v": 2`). So gibt es kein Massen-Hochladen, keine Konflikte zwischen
  Geräten, und ältere Apps sehen weiterhin gültige Einträge.
- **Ältere App-Versionen** und ältere Lauf-Skripte erhalten unbekannte Felder (§3.1) und ignorieren `projects/`. Sie
  behandeln Projekt-Schritte, Warte-auf- und Irgendwann-Aufgaben als normale offene Aufgaben; dabei geht nichts
  verloren.

## 4. Synchronisation & Offline

- Jede Änderung wird **sofort in IndexedDB** gespeichert und in eine **Ausgangs-Warteschlange**
  (Outbox) eingetragen. Die UI wartet nie auf das Netz.
- Sync läuft bei: App-Start, Rückkehr ins Fenster (`visibilitychange`), `online`-Ereignis,
  nach jeder Änderung (entprellt ~2 s) und alle 5 Minuten.
- **Hochladen:** Outbox der Reihe nach über die GitHub Contents API (`PUT`/`DELETE` mit `sha`).
- **Herunterladen:** Verzeichnisse `inbox/`, `items/`, `suggestions/`, `projects/` (Phase 9) + `categories.json` +
  `settings.json` + `runs/last.json` (nur lesen, die App schreibt es nie) lesen; nur geänderte Dateien (abweichende `sha`) nachladen.
  `runs/started.json` und `runs/trigger.json` liest die App nur für den Start-Knopf (§6.3), nicht im normalen Sync.
- **Konflikt** (`409`/`422` wegen veralteter `sha`): Remote-Fassung laden; die Fassung mit dem
  neueren `updatedAt` gewinnt; bei Gleichstand gewinnt die Remote-Fassung. Gelöschte Remote-Dateien
  (z. B. vom Claude-Lauf einsortierte Inbox-Einträge) werden lokal entfernt, sofern sie nicht
  ungesendet in der Outbox liegen.
- Statusanzeige klein oben rechts: „synchron" · „X ausstehend" · „offline" · „Fehler" (antippbar → Details).
- Fehlt der Token, funktioniert die App rein lokal; Hinweis führt zu den Einstellungen.

## 5. Bedienkonzept

- Vier Seiten nebeneinander in fester Reihenfolge: **Kalender → Erfassung → Aufgaben → Ablagen**.
- Wechsel per Wischgeste, per Pfeiltasten ← → und per Punkte-Leiste unten (antippbar).
  Wischen von rechts nach links (Finger bewegt sich nach links) = **nächste Seite rechts**.
- **Flüssiges Wischen (Phase 7)** wie auf dem iPhone-Home-Bildschirm: Die Seiten liegen nebeneinander und folgen
  dem Finger bzw. der Maus (`translateX`), die Nachbarseite schiebt sich sichtbar herein. Loslassen rastet ein:
  ab ⅓ der Breite oder bei schnellem Wischen auf die Nachbarseite, sonst federt es zurück. Am ersten/letzten Rand
  federnder Widerstand (kein Wechsel). Pfeiltasten und Punkte-Leiste animieren genauso. Nur `transform`/`opacity`
  werden animiert; bei „reduzierter Bewegung“ wechselt die Seite ohne Animation. Senkrechtes Scrollen,
  Eingabefelder, Dialoge und Bereiche mit eigener Ziehgeste (z. B. später Termine verschieben) lösen kein Wischen aus.
- Alle Seiten bleiben geladen (Scrollposition und Eingaben bleiben erhalten); nicht aktive Seiten sind nicht
  bedienbar (`inert`). Beim Verlassen einer Seite stoppt die Spracherkennung; regelmäßige Abfragen laufen nur auf
  der sichtbaren Seite.
- Startseite: Erfassung (zweite Seite; links davon der Kalender, rechts Aufgaben und Ablagen).
- **Zahnrad oben links** auf jeder Seite → Einstellungen (eigene Ansicht, Zurück-Pfeil).
- **Dialoge (Phase 7):** Dialoge zum Ansehen/Bearbeiten vorhandener Einträge und Termine öffnen **ohne** Fokus in einem
  Eingabefeld (keine Bildschirmtastatur); der Fokus liegt auf dem Dialog selbst, Tab führt zu den Feldern. Nur Dialoge
  zum Neu-Anlegen (z. B. neuer Termin, neue Ablage) setzen den Fokus ins erste Feld.
- Bis eine Seite gebaut ist (siehe Phasen), wird sie nicht angezeigt.

## 6. Seiten

### 6.1 Erfassung
- Großer **Mikrofonknopf** mittig. Antippen startet die Spracherkennung (Web Speech API, `de-DE`);
  erkannter Text erscheint live in der Textleiste. Nochmal antippen oder Pause → Stopp.
- **Textleiste unten** (mehrzeilig wachsend) zum Tippen oder Korrigieren des erkannten Texts.
- **Bestätigen vor dem Absenden:** Knopf „Ablegen" (bzw. Strg+Enter). Erst dann wird ein
  `inbox/<id>.json` angelegt. Kurze Bestätigung („Im Eingangskorb"), Feld wird geleert.
- Leerer Text kann nicht abgelegt werden.
- Ohne Spracherkennung (Browser unterstützt sie nicht / Mikrofon verweigert): Mikrofonknopf
  deaktiviert mit Hinweis „Diktat mit Win + H" (Windows).
- **iPhone:** Ist die Spracherkennung dort nicht verfügbar oder nicht zuverlässig (Ergebnis Aufgabe 46),
  zeigt das Antippen des Mikrofonknopfs den Hinweis „Diktat: Mikrofon-Taste auf der iPhone-Tastatur“
  und setzt den Fokus in die Textleiste, damit die Tastatur mit Diktat-Taste erscheint.
- Darunter dezent: Anzahl Einträge im Eingangskorb und „Zuletzt sortiert: HH:MM“ aus
  `runs/last.json` (`finishedAt`; nicht heute ⇒ „Zuletzt sortiert: Fr 16.10., 14:00“; fehlt die Datei ⇒ nichts).

### 6.2 Kalender (Phase 2)
- Zeigt den **heutigen Tag** aus dem primären Google Kalender (Zeitleiste, Planungsfenster hervorgehoben).
- Umschalter **Tag / Woche** (Woche = Mo–So, aktuelle Woche), Vor/Zurück-Pfeile, „Heute".
- Termine, die zu einem Eintrag gehören (`calendarEventId`; bei Serien auch über die Serien-ID
  `recurringEventId`), sind markiert.
- **Termine bearbeiten (Phase 7):** Antippen eines Termins öffnet den **Termin-Dialog** (§6.7); bei verknüpften
  Terminen zusätzlich Knopf „Eintrag öffnen“. Bearbeitbar sind alle Termine im Kalender `primary`, deren
  Organisator du bist (oder ohne Organisator-Angabe). Einladungen anderer Organisatoren sind **nur lesbar**
  (Dialog ohne Eingabefelder, Hinweis „Einladung – nur lesen“).
- **Neuer Termin:** Knopf „+“ (Vorgabe: nächste volle Viertelstunde, heute bzw. am angezeigten Tag) und **langes
  Drücken** (~0,4 s, Touch und Maus) auf eine freie Zeit in der Zeitleiste (Vorgabe: diese Viertelstunde; kurze
  Vibration und sichtbare Markierung der Viertelstunde, wo unterstützt). Kurzes Antippen freier Zeit tut nichts, damit
  nicht versehentlich Termine entstehen. **Halten und Ziehen (Phase 9):** Bleibt der Finger bzw. die Maustaste nach
  dem langen Drücken unten, folgt die Markierung (Block in Standarddauer) beim Ziehen im 15-Min.-Raster, in der
  Wochenansicht auch seitlich auf andere Tage; am oberen/unteren Rand scrollt die Zeitleiste mit (wie beim Ziehen von
  Terminen). Erst das Loslassen öffnet den Termin-Dialog mit dieser Startzeit; die Seite wechselt dabei nicht.
  Neue Termine sind reine Google-Termine ohne SecondBrain-Eintrag, außer „Auch als Aufgabe ablegen“ (§6.7) ist
  gewählt; Standarddauer 60 Min.
- **Termine ziehen (Phase 7, B4):** Langes Drücken (~0,4 s) auf einen bearbeitbaren, nicht ganztägigen Termin hebt
  ihn an (kurze Vibration, wo unterstützt); Ziehen senkrecht verschiebt im 15-Min.-Raster, in der Wochenansicht
  seitlich auf einen anderen Tag; ein Griff am unteren Rand ändert die Dauer (min. 15 Min.). Am oberen/unteren Rand
  scrollt die Zeitleiste mit. Vor Ablauf der 0,4 s gilt die Bewegung als Wischen/Scrollen; danach wechselt die Seite
  nicht. Loslassen speichert sofort, Meldung „Verschoben auf Do 22.10., 10:15 · Rückgängig“ (5 s). Termine mit
  Gästen: danach Rückfrage wie §6.7. Bei Serien verschiebt Ziehen nur diesen Termin. Auf Terminen sind Kontextmenü
  und Textauswahl beim langen Drücken abgeschaltet. Gilt für Touch und Maus.
- Die Pause (§3.6) ist in Tages- und Wochenansicht dezent markiert (z. B. leicht getöntes Band, ohne Text).
- Nicht verbunden → Knopf „Mit Google verbinden".

### 6.3 Aufgaben
Von oben nach unten (Phase 9: Abschnitte 1–3 stehen über den Reitern, alles Weitere in den Reitern, siehe 6.3.1):
1. **Vorschläge von Claude** (nur wenn vorhanden): Text, Begründung, Ziel-Ablage;
   Knöpfe **Annehmen** / **Ablehnen**.
2. **Hinweise vom letzten Lauf** (nur wenn `runs/last.json` < 24 h alt ist und `errors` enthält):
   kurze Liste der Fehlermeldungen. (Die frühere Liste „Neu einsortiert“ entfällt.)
3. **Eingangskorb** mit Anzahl (unsortierte Erfassungen, die der Claude-Lauf noch nicht bearbeitet hat oder nicht
   einsortieren konnte): je Eintrag „In Ablage…" (wandelt in eine Aufgabe/Notiz in gewählter Ablage um)
   oder Löschen. **„In Ablage…“ übernimmt den Text vollständig (Phase 7):** Titel = erste Zeile; ist sie länger
   als 80 Zeichen, wird sie an einer Wortgrenze auf höchstens 60 Zeichen gekürzt. Alles, was nicht im Titel steht
   (Rest der ersten Zeile und alle weiteren Zeilen), kommt vollständig und ohne Doppelung in `notes`. Titel und
   Notiz (mehrzeilig) sind im Dialog sichtbar und änderbar. Hat ein Eintrag `sortError`, steht dessen `message` als Hinweis am Eintrag.
   „In Ablage…“ bietet zusätzlich die GTD-Felder wie der Bearbeiten-Dialog (6.3.2).
   Über der Liste der Knopf **„Jetzt sortieren“** (auch bei leerem Eingangskorb sichtbar):
   - **Ohne Claude (Phase 8):** Ist `autoSort` (§3.6) `false`, startet nichts (kein Sync, kein Dispatch) und der Knopf
     zeigt ohne Fehlerton den Hinweis „Automatisches Sortieren ist nicht eingerichtet. Einträge über ‚In Ablage…‘
     einsortieren oder in den Einstellungen einrichten.“ (mit Link zu den Einstellungen). Dieselbe Meldung bei
     `result: "nicht-eingerichtet"`.
   - Antippen sperrt den Knopf sofort. Ohne Netz ⇒ „Offline – Sortieren braucht Internet.“, ohne GitHub-Token ⇒
     „GitHub in den Einstellungen verbinden.“
   - Zuerst Sync (Outbox hochladen); bleibt etwas ausstehend ⇒ „Noch nicht alles hochgeladen – bitte gleich
     erneut versuchen.“
   - Keine Inbox-Einträge ohne `sortError` ⇒ sofort **„Nichts zu sortieren“**, kein Start (Phase 9: vorhandene
     wichtige Aufgaben zählen nicht mehr als Arbeit).
   - Sperre laut `runs/started.json` aktiv (3.10) ⇒ „Sortierung läuft bereits.“
   - Sonst `repository_dispatch` (`event_type: "sortieren"`, `client_payload: { "requestId": … }`) an das Daten-Repo,
     danach `runs/trigger.json` alle 5 s lesen (höchstens 2 Min.), bis die `requestId` passt. Meldungen je `result`:
     `gestartet` ⇒ **„Sortierung gestartet“**; `nichts` ⇒ „Nichts zu sortieren“; `laeuft` ⇒ „Sortierung läuft bereits.“;
     `abgelehnt` ⇒ „Start abgelehnt: Limit erreicht, bitte später erneut versuchen (ab HH:MM).“ (429) bzw.
     „Start abgelehnt (Fehler NNN).“; `unklar` ⇒ „Start unklar – in 20 Min. erneut versuchen.“;
     `fehler` / keine Antwort in 2 Min. ⇒ „Start fehlgeschlagen – bitte später erneut versuchen.“ GitHub-Fehler
     (401/403/404/422, Netz) ⇒ verständliche Meldung wie beim Sync.
   - Nach „gestartet“ bleibt der Knopf gesperrt („Sortierung läuft …“), bis `runs/last.json` ein `finishedAt` nach
     `startedAt` hat oder 20 Min. vergangen sind. In der Zeit liest die App `runs/last.json` alle 30 s (nur bei
     sichtbarer Seite); danach voller Sync, „Zuletzt sortiert“ aktualisiert sich.
   - Die Sperre gilt auch nach einem Neuladen der App (sie ergibt sich aus `runs/started.json`).

#### 6.3.1 Reiter (Phase 9)
Unter dem Eingangskorb eine Reiter-Leiste: **Aktuell · Projekte · Warte auf · Irgendwann** (ab 600 px Breite jeweils
mit Anzahl, außer Aktuell; darunter nur die Namen). Wechsel **nur per Tippen** (und Tastatur: Tab/Enter, Pfeiltasten innerhalb der Leiste) – Wischen wechselt
weiter nur die Seite. Die App merkt sich den gewählten Reiter je Gerät (lokal, nicht im Repo). Passt ohne
waagerechtes Scrollen ab 360 px Breite (Beschriftung ggf. gekürzt, z. B. „Irgendw.“, voller Name als `aria-label`).

**Gemeinsam für Aufgabenzeilen in allen Reitern:**
- Checkbox → erledigt: `status: "erledigt"`, `completedAt` setzen, `originalCategoryId` merken, `categoryId` = Archiv
  (Google-Termin: §6.6). Bei Projekt-Schritten danach Hinweis wie in 6.3.3.
- **Uhr-Symbol** → Dialog Datum, Uhrzeit, Dauer (Vorgabe: nächste volle Viertelstunde im Planungsfenster, Dauer
  `durationMin` oder 30 Min., mindestens 15 Min.) → Google-Kalender-Termin anlegen, `schedule` setzen (⇒ Status
  „Termin“). Eingeplante Aufgaben zeigen den Termin; Uhr-Symbol = umplanen.
- Antippen des Titels → Bearbeiten (6.3.2).
- Kennzeichen: ★ (Fokus), ⚡ < 2 Min., „fällig <Tag>“ (überfällig in Warnfarbe), Dauer, Projektname bei Schritten,
  „neu“ für Aufgaben aus `itemIds` des letzten Laufs (24 h).

**Reiter „Aktuell“**, von oben nach unten:
1. **★ Fokus** – offene Aufgaben mit `important: true`, außer Status „Irgendwann“; Reihenfolge wie Nächste Schritte.
   Mehr als 5 ⇒ dezenter Hinweis „Mehr als 5 Aufgaben im Fokus – was davon ist wirklich wichtig?“.
2. **Heute / Überfällig** – Aufgaben mit Termin heute (auch schon vorbei) und überfällige (§3.3), nach Beginn
   sortiert. Überfällige haben vier Knöpfe:
   - **✓ Erledigt** wie die Checkbox. Kalendertermin bleibt als Historie im Kalender.
   - **✗ Nicht erledigt** → automatisch neu einplanen: erster freier Slot ab dem **Tagesanfang** (§8.4),
     Dauer = `schedule.durationMin`; Kalendertermin wird dorthin verschoben. Kurze Bestätigung
     „Neu geplant: Do 22.10., 09:00“. Kein freier Slot in 14 Tagen ⇒ Hinweis, Dialog wie Uhr-Symbol.
     Ohne Google-Verbindung ⇒ Hinweis „Mit Google verbinden“.
   - **Uhr-Symbol (Neu planen)** → Dialog Datum, Uhrzeit, Dauer → Kalendertermin wird verschoben.
   - **– Aus Kalender** → Kalendertermin löschen, `schedule: null` (⇒ wieder gespeicherter GTD-Status).
3. **Nächste Schritte** – Aufgaben mit Status „Nächster Schritt“ ohne Fokus, gruppiert nach Ablage (Reihenfolge laut
   `order`, ohne Archiv und Einkauf). Von jedem Projekt erscheint **nur dessen nächster Schritt** (falls er den Status
   „Nächster Schritt“ hat), mit Projektname. Sortierung: überfällig (`dueDate` < heute) zuerst, dann nach `dueDate`
   aufsteigend, ohne `dueDate` zuletzt; bei Gleichstand Dauer aufsteigend (ohne Dauer zuletzt), dann `createdAt`.
   **Zeitfilter** über der Liste: **≤ 15 Min. · alle** (Standard „alle“, Wahl je Gerät gemerkt; ein früher gemerkter
   anderer Wert gilt als „alle“); „≤ 15 Min.“ blendet Aufgaben mit größerer **oder fehlender** Dauer aus. Gilt nur für diesen Abschnitt.
4. **Eingeplant (n)** – eingeklappt; offene Aufgaben mit Termin nach heute, nach Beginn sortiert.

Jede Aufgabe erscheint im Reiter „Aktuell“ nur einmal, Vorrang: Heute/Überfällig vor Fokus vor Eingeplant (Fokus-
Aufgaben behalten dort ihre Fokus-Kante). Der Hinweis „Mehr als 5 …“ zählt alle offenen Fokus-Aufgaben außer Irgendwann
und steht oben im Reiter, auch wenn der Abschnitt Fokus leer ist.

Leerer Reiter: kurze Einladung (z. B. „Keine nächsten Schritte. Neues über die Erfassung anlegen.“).

**Reiter „Projekte“:** aktive Projekte gruppiert nach Ablage; je Projekt Titel, Fortschritt x/y (Balken), nächster
Schritt mit Fälligkeit oder „⚠ Nächsten Schritt festlegen“. Knopf „Neues Projekt“ (Titel, Ablage, Notiz). Antippen ⇒
Projektansicht (6.3.3).

**Reiter „Warte auf“:** Aufgaben mit Status „Warte auf“, nach `followUpOn` (fällige zuerst), dann `since`. Je Eintrag
Person/Was (`waiting.person`, Titel), „seit X Tagen“ (ab `waiting.since`), „nachhaken am <Tag>“. Ist `followUpOn` ≤ heute,
ist der Eintrag deutlich hervorgehoben („nachhaken seit <Tag>“/„heute nachhaken“). Knopf **„Antwort erhalten“** ⇒
Auswahl **„Erledigt (archivieren)“** (wie Checkbox) oder **„Daraus nächsten Schritt machen“** (`gtd:
"naechster-schritt"`, `waiting: null`, Bearbeiten-Dialog öffnet sich zum Anpassen des Titels).

**Reiter „Irgendwann“:** Aufgaben mit Status „Irgendwann“, nach Ablage gruppiert, neueste zuerst. Knopf **„Aktivieren“**
⇒ `gtd: "naechster-schritt"`.

#### 6.3.2 Bearbeiten-Dialog und „In Ablage…“ (Phase 9)
Für Aufgaben zusätzlich: **Status** (Nächster Schritt · Warte auf · Irgendwann; „Termin“ steht nur als Hinweis da,
wenn `schedule` gesetzt ist, und entsteht über das Uhr-Symbol), **★ Fokus** (ersetzt „wichtig“), **fällig bis**
(Datum, löschbar), **Dauer** (Auswahl 2, 5, 10, 15, 30, 45, 60, 90, 120, 180, 240 Min. oder leer), **Projekt** (aktive
Projekte der gewählten Ablage oder „kein Projekt“; Wechsel der Ablage setzt ein nicht passendes Projekt auf „kein“;
neuer Schritt wird hinten angehängt), bei „Warte auf“: **Person/Was**, **seit** (Vorgabe heute), **nachhaken am**
(optional). Wechsel weg von „Warte auf“ setzt `waiting: null`. Bei offenen Instanzen einer Schritt-Serie zusätzlich der
Knopf **„Fällt aus – 1 Woche später“** (bei `every` 2: „2 Wochen später“), Wirkung §3.12; Meldung „Fällig jetzt <Tag>
– folgende Blätter eine Woche später“ bzw. „… zwei Wochen später“.

#### 6.3.3 Projektansicht (Phase 9)
Eigene Ansicht mit Zurück-Pfeil (wie eine geöffnete Ablage), erreichbar aus dem Reiter „Projekte“ und von Seite 4:
- Titel, Ablage, Notiz (bearbeitbar über „Projekt bearbeiten“), Fortschritt.
- **Schritte** offen in `projectOrder`-Reihenfolge, mit Status-Kennzeichen; je Schritt Knöpfe **↑ ↓** (Reihenfolge
  ändern, kein Ziehen), Checkbox, Titel antippen ⇒ Bearbeiten. **„Schritt hinzufügen“** (Titel, Dauer optional,
  hinten angehängt, Status Nächster Schritt). Erledigte Schritte eingeklappt darunter.
- **Serien:** Liste mit Muster, Rhythmus, Fälligkeit, Ende, zuletzt angelegter Nummer, Zustand. „Serie hinzufügen“ /
  „Bearbeiten“ (Titelmuster mit `{Nr}`, wöchentlich/alle 2 Wochen, Wochentag, Startdatum, Ende per Datum oder Anzahl,
  optional „fällig am Wochentag“, optional Dauer, Vorschau der nächsten 3 Instanzen), **Pausieren/Fortsetzen**,
  **Beenden** (mit Bestätigung), **„Ausfall eintragen“** (Auswahl unter den nächsten 8 künftigen Stichtagen) und die
  eingetragenen künftigen Ausfälle mit „Entfernen“. Ändert das Bearbeiten Start, Wochentag, Rhythmus oder Fälligkeit
  und gibt es offene Instanzen, weist der Dialog vor dem Speichern darauf hin („Offene Blätter werden neu berechnet“).
  Die Liste zeigt nur nicht abgeschlossene Serien (§3.12); darunter eingeklappt **„Abgeschlossene Serien (n)“** (nur
  wenn n > 0) mit Muster, Zeitraum (Start – letzter Stichtag), Anzahl angelegter Blätter und **„Löschen“**. „Löschen“
  gibt es auch bei laufenden Serien. Bestätigung: „Serie ‚<Muster>‘ löschen? Die vorhandenen Blätter bleiben als
  Schritte erhalten, neue entstehen nicht mehr.“
- **„Projekt abschließen“** (Bestätigung, §3.12). Ohne Schritte zusätzlich „Projekt löschen“.
- Ohne offenen Schritt: Warnung „⚠ Nächsten Schritt festlegen“ mit Eingabefeld – bzw. bei aktiver Serie mit weiterem
  Stichtag „Nächstes: <Titel> ab <Tag>“ (§3.12) und das Eingabefeld ohne Warnung.

**Abhaken eines Projekt-Schritts** (überall): Gibt es danach einen offenen Schritt ⇒ Meldung „Weiter mit: <Titel>“
(5 s). Sonst, bei aktiver Serie mit weiterem Stichtag ⇒ Meldung „Nächstes: <Titel> ab <Tag>“ (5 s), kein Dialog. Sonst
kleiner Dialog **„Was ist der nächste Schritt?“** mit Eingabefeld und den Knöpfen „Hinzufügen“, „Später“ (Projekt
zeigt die Warnung) und „Projekt abschließen“.
- Termin-Titel im Kalender = Aufgabentitel; Beschreibung enthält den Hinweis „SecondBrain" und die Eintrags-ID.
- Der Vorschlag im Uhr-Dialog (nächste volle Viertelstunde im Planungsfenster) überspringt die Pause; gewählt
  werden darf jede Zeit, auch in der Pause.

### 6.4 Ablagen (Phase 4)
- **Figur** (SVG, Mii-Stil: großer runder Kopf, schwarze Cap, blaues Shirt) steht in der Mitte,
  die Ablagen liegen als Kacheln (Name + Anzahl Einträge) ringsum im Kreis.
- **Ring:** Einkaufsliste und Erledigt haben feste Plätze unten rechts/links. Die übrigen 6 Plätze
  zeigen die normalen Ablagen nach `order`; sind es mehr als 6, blättert man mit den Knöpfen **‹ ›**
  unter der Figur (Anzeige „1/2“). Kein Blättern per Wischen/Pfeiltasten (wechselt die Seite).
  Funktioniert ab 360 px Breite ohne waagerechtes Scrollen.
- **Anordnung (Phase 7):** Figur und Ring stehen mittig im freien Raum zwischen Kopfzeile und Knopf „Neue Ablage“;
  Ring, Kacheln und Figur nutzen den Platz (größer als bisher), auf dem iPhone (375–430 px) wie auf dem Desktop,
  auch mit 8 und mehr Ablagen. Der Knopf „Neue Ablage“ sitzt am unteren Rand direkt über der Punkte-Leiste.
- **Namen** sind vollständig lesbar: Umbruch nur an Wortgrenzen oder mit korrekter deutscher Silbentrennung
  (`lang="de"`, `hyphens: auto`), notfalls wird die Schrift der Kachel verkleinert. Nie Umbruch mitten im Wort
  ohne Trennstrich, nie abgeschnitten („…“).
- Antippen einer Ablage → Figur zeigt mit dem Arm auf ihrer Seite auf die Kachel, Kopf und Blick
  folgen (~0,25 s, sanft); nach ~0,35 s öffnet sich die Ablage als eigene Ansicht mit Zurück-Pfeil.
  Bei „reduzierter Bewegung“ ohne Animation. Tastatur: Kacheln sind Knöpfe (Tab, Enter).
- **Ablage geöffnet (normal), Phase 9:** oben die **Projekte** der Ablage (aktive; Titel, Fortschritt x/y, Warnung
  „⚠ Nächsten Schritt festlegen“; antippen ⇒ Projektansicht §6.3.3), darunter die Aufgaben mit Status-Kennzeichen
  (Nächster Schritt, Termin, Warte auf, Irgendwann, ★, ⚡; einheitliche Farben wie auf der Aufgabenseite) – Projekt-
  Schritte stehen beim Projekt, nicht noch einmal in der Liste.
- **Ablage geöffnet (normal):** offene Aufgaben, Notizen und Termine dieser Ablage, Suchfeld
  (Titel und Notizen, ohne Groß-/Kleinschreibung). Notizen sind vollständig lesbar (mit Zeilenumbrüchen, lange
  Notizen ggf. aufklappbar, nie unwiederbringlich abgeschnitten). Antippen → Bearbeiten (ItemEditor, dort auch
  Ablage wechseln = verschieben). Umbenennen und Löschen der Ablage aus der Ansicht.
- **Ablage anlegen** (Name, Beschreibung) über einen Knopf auf der Ringseite. **Löschen** fragt nach der
  Zielablage für die Einträge (Standard Privat), siehe 3.5. Einkaufsliste und Erledigt sind nicht löschbar.
- **Einkaufsliste:** Artikel hinzufügen (Eingabefeld, gleiche Artikel laut 3.9 werden nicht doppelt
  angelegt, Hinweis „Steht schon auf der Liste“), abhaken (`checked`); unten Knopf
  **„Ausgewählte eingekauft"** (nur wenn etwas abgehakt ist) mit Bestätigung → abgehakte Artikel
  werden gelöscht.
- **Erledigt:** archivierte Aufgaben, neueste zuerst, mit Erledigt-Datum; **Wiederherstellen** →
  zurück in `originalCategoryId` (fehlt sie, in Privat), `status: "offen"`. Phase 9: Abgeschlossene Projekte stehen
  oben eigens („Projekte“) mit Abschlussdatum und **Wiederherstellen** (§3.12); ihre mitarchivierten Schritte stehen
  unter dem Projekt, nicht noch einmal einzeln. Wird ein einzelner Schritt wiederhergestellt, dessen Projekt erledigt
  ist, wird das Projekt mit wiederhergestellt.
- **Vergangene Termine (Phase 7):** Einträge `type: "termin"`, `status: "offen"` mit `schedule`, deren Ende
  (`schedule.start + schedule.durationMin`) vorbei ist, verschiebt die App automatisch nach „Erledigt“ – wie ✓ Erledigt
  (`status: "erledigt"`, `originalCategoryId` merken, `categoryId` = Archiv), aber `completedAt` = Ende des Termins.
  Der Google-Termin bleibt unverändert (kein Google-Aufruf). Geprüft beim App-Start, bei Rückkehr ins Fenster und
  regelmäßig (alle 5 Min.), auch ohne GitHub-Token (lokal + Outbox). In „Erledigt“ steht bei Terminen „Termin am …“
  statt „Erledigt am …“. **Wiederherstellen** eines vergangenen Termins setzt zusätzlich `schedule: null` (der Termin
  bleibt in Google, Hinweis „Termin bleibt im Kalender“), damit er nicht sofort wieder verschoben wird. Einträge an
  einer Serie werden ebenso verschoben (die Serie bleibt in Google).

### 6.5 Einstellungen
- **Planungsfenster** Beginn/Ende (Standard 09:00–19:00) → `settings.json`.
- **Pause** (Phase 7): Schalter „Pause“ (Standard an) mit Beginn/Ende (Standard 12:00–13:00) → `settings.json`
  (`pause`, aus ⇒ `null`). Speichern nur, wenn Ende > Beginn und die Pause vollständig im Planungsfenster liegt;
  sonst verständliche Meldung.
- **GitHub:** Repo (`besitzer/name`, ohne Vorbelegung) + Token eintragen, „Verbindung testen", Token entfernen.
  Kurze Anleitung zum Erstellen des fine-grained Tokens (nur das eigene Daten-Repo).
- **Google:** Verbinden / Trennen, angezeigtes Konto.
- **Automatisches Sortieren (Phase 8):** Schalter „Mit Claude sortieren“ (`autoSort`, §3.6) und Link zur Anleitung
  (Routine im eigenen Claude-Konto, Secrets im eigenen Daten-Repo). Aus ⇒ kurzer Text, dass Einträge von Hand
  einsortiert werden.
- **Info:** App-Version (sichtbar, z. B. „Version 0.8.0 · Build …“), Sync-Status, Anzahl ausstehender Änderungen.
- **Feedback senden (Phase 8):** öffnet im Browser ein neues GitHub-Issue im öffentlichen Code-Repo (Vorlage
  „Fehler“ oder „Wunsch“), vorausgefüllt **nur** mit App-Version, Build, Gerät/Browser, iOS-Version und Anzeigemodus.
  **Keine** Inhalte, Einträge, Ablagen-Namen, Repo-Namen, Kontonamen, Fehlertexte oder Tokens. Hinweis vor dem Öffnen:
  „Issues sind öffentlich sichtbar – bitte keine persönlichen Daten hineinschreiben.“
- **Ersteinrichtung beim ersten Start (Phase 8):** Ist auf dem Gerät weder Token noch Repo gespeichert und gibt es
  lokal keine Einträge, zeigt die App statt der Seiten eine geführte Einrichtung: ① Willkommen (was die App tut, wo die
  Daten liegen) ② Daten-Repo verbinden (Link zur Vorlage, Link zur Token-Seite, Repo + Token, „Verbindung testen“)
  ③ Google verbinden ④ optional „Automatisches Sortieren mit Claude einrichten“ (Anleitung, setzt `autoSort`) bzw.
  „Ohne Claude weiter“. Jeder Schritt außer ① ist überspringbar („Später“); danach gilt die Einrichtung in den
  Einstellungen wie bisher. Geräte mit vorhandener Einrichtung sehen sie nie.
- **Geführte Einrichtung (Phase 6):** Solange GitHub oder Google nicht eingerichtet ist, führen die
  Einstellungen Schritt für Schritt: ① GitHub-Repo und Token (Knopf „Einfügen“ aus der Zwischenablage,
  verdecktes Feld, „Verbindung testen“) ② Google verbinden ③ erster Abgleich, dauerhafter Speicher.
  Der Token gelangt nie in URL, QR-Code, Logs oder Diagnose.
- **Diagnose (Phase 6):** App-Version und Build-Stand, Anzeigemodus (Browser/installiert), Gerät/Browser,
  Sync-Status, ausstehende Änderungen, letzter Abgleich, Speicherstatus, die letzten 20 Fehler (Zeit,
  Bereich, Meldung) **ohne Geheimnisse** (Token-Muster und URL-Parameter werden entfernt). Knopf
  „Kopieren“ kopiert alles als Text in die Zwischenablage.

### 6.6 Löschen und Google-Termine (Phase 7)
Was mit dem Google-Termin (`schedule.calendarEventId`) eines Eintrags passiert:

| Aktion | Google-Termin |
|---|---|
| Eintrag löschen (Bearbeiten-Dialog, von jeder Seite aus) | wird gelöscht; vorher Bestätigung „Eintrag und Google-Termin löschen?“ |
| „– Aus Kalender“ | wird gelöscht, `schedule: null` |
| ✓ Erledigt / Checkbox | Beginn **in der Zukunft** ⇒ wird gelöscht, `schedule: null`, kurze Meldung „Termin entfernt“; schon begonnen oder vorbei ⇒ bleibt als Historie |
| Projekt abschließen (Phase 9) | je Schritt wie ✓ Erledigt |
| „Antwort erhalten“, „Aktivieren“, Statuswechsel (Phase 9) | bleibt unverändert |
| Wiederherstellen aus Erledigt | bleibt unverändert |
| In andere Ablage verschieben, Art ändern, Ablage löschen (Einträge wandern) | bleibt unverändert |
| „Ausgewählte eingekauft“ | wie Eintrag löschen (ohne zusätzliche Bestätigung) |
| Claude-Lauf | löscht nie Einträge |

- Erst den Google-Termin löschen, dann lokal. Ist der Termin in Google schon weg (404/410), gilt das als Erfolg.
- **Nicht mit Google verbunden:** Die Bestätigung bietet „Mit Google verbinden und löschen“ (Anmelde-Popup direkt
  aus dem Klick) und „Abbrechen“.
- **Offline / Google-Fehler:** Meldung „Offline – der Google-Termin kann gerade nicht gelöscht werden.“ bzw. die
  verständliche Google-Fehlermeldung, Auswahl „Nur Eintrag löschen (Termin bleibt)“ oder „Abbrechen“. Beim Erledigen
  ohne Verbindung wird erledigt und der Termin bleibt (Hinweis). Kein späteres Nachholen.
- **Verknüpfte Termine (Phase 7):** Ändert man Titel oder Zeit im Termin-Dialog (oder per Ziehen), übernimmt der
  Eintrag `title` bzw. `schedule.start`/`schedule.durationMin`. Ändert man den Titel im Bearbeiten-Dialog des
  Eintrags, wird auch der Termintitel in Google geändert (ohne Verbindung: Hinweis, Eintrag wird trotzdem gespeichert).
  Löschen eines verknüpften Termins im Termin-Dialog fragt: „Nur Termin löschen (Eintrag bleibt)“ (⇒ `schedule: null`)
  oder „Termin und Eintrag löschen“. Die Markierung „SecondBrain“ + Eintrags-ID in der Beschreibung bleibt beim
  Bearbeiten der Notiz erhalten.
- Der Bearbeiten-Dialog eines eingeplanten Eintrags (und der Uhr-Dialog) ändert Datum, Startzeit und Dauer.
- **Eintrag an einer Serie** (`schedule.calendarEventId` ist eine Serien-ID, z. B. später in Google zur Serie
  gemacht): Kein Weg über den Eintrag ändert oder löscht die Serie. Der Termin-Abschnitt im Bearbeiten-Dialog ist nur
  lesbar („Serientermin – im Kalender bearbeiten“); Umbenennen, Verschieben (Uhr, ✗ „Nicht erledigt“) und Erledigen
  lassen die Serie unverändert. **Eintrag löschen** löscht nur den Eintrag, die Serie bleibt in Google.
  **„– Aus Kalender“** löst nur die Verknüpfung (`schedule: null`) und löscht in Google nichts (Hinweis „Serie bleibt
  im Kalender“). Die Serie selbst bearbeitet man im Termin-Dialog (§6.7).

### 6.7 Termin-Dialog (Phase 7)
- **Felder:** Titel, ganztägig (Schalter), Datum, Startzeit, Dauer bzw. Ende (beides möglich, gekoppelt; ganztägig:
  Start- und Enddatum), Ort, Notiz (Beschreibung), Wiederholung.
- **Wiederholung:** keine · täglich · wöchentlich (Wochentage wählbar, Vorgabe Wochentag des Datums) · alle 2 Wochen
  (Wochentage wählbar) · monatlich (gleicher Tag im Monat). Ende: nie · bis Datum · nach Anzahl Terminen. Gespeichert
  als `RRULE` in Google. Regeln, die der Dialog nicht abbilden kann, erscheinen als „Wiederholung: benutzerdefiniert“
  und bleiben beim Speichern unverändert (andere Felder bleiben änderbar).
- **Serien:** Beim Speichern oder Löschen eines Serientermins fragt die App „Nur dieser Termin“ oder „Ganze Serie“.
  „Nur dieser Termin“ ändert/löscht nur dieses Vorkommen; „Ganze Serie“ ändert/löscht die Serie (Zeitänderungen gelten
  für alle Termine der Serie). „Dieser und folgende“ gibt es nicht (nicht robust genug).
- **Gäste:** Hat der Termin Gäste und bist du Organisator, fragt die App vor dem Speichern oder Löschen „Gäste
  benachrichtigen?“ – **Nein** (Vorauswahl, `sendUpdates=none`) / **Ja** (`sendUpdates=all`). Ohne Gäste: `none`.
- **Löschen** mit Bestätigung (bei verknüpften Terminen: §6.6).
- **Auch als Aufgabe ablegen (Phase 9):** Nur beim **Neu-Anlegen** ein Schalter (Standard aus); an ⇒ Auswahl Ablage
  (ohne Einkauf/Archiv, Vorgabe erste Ablage laut `order`) und optional Projekt (aktive Projekte dieser Ablage).
  Gesperrt mit Hinweis bei ganztägigen Terminen und bei Wiederholung. Beim Speichern entsteht zuerst der
  Google-Termin, danach ein Eintrag `type: "aufgabe"` mit Titel = Termintitel, `notes` = Beschreibung,
  `gtd: "naechster-schritt"`, `schedule` (Beginn, Dauer) und `calendarEventId` (lokal + Outbox, §4); mit Projekt
  hinten angehängt (`projectOrder`). Er erscheint damit als „Termin“ auf der Aufgabenseite. Scheitert der
  Google-Termin, entsteht kein Eintrag.
- Ohne Verbindung/offline: Dialog zeigt den Termin, Speichern/Löschen mit verständlicher Meldung; nichts geht verloren,
  solange der Dialog offen ist. Die App arbeitet für Termine direkt mit Google (keine Outbox).

### 6.8 Updates (Phase 8)
- Die App erkennt eine neue Version **beim Start** und **bei Rückkehr in die App** (`visibilitychange` → sichtbar):
  Service-Worker-Update anstoßen und zusätzlich `version.json` (Build-Stempel, ohne Cache) mit dem eigenen Build
  vergleichen – das funktioniert auch in der installierten iPhone-App.
- Neue Version bereit und **nichts ungespeichert** (Erfassungsfeld leer, kein Dialog offen, kein Ziehen, keine
  laufende Spracherkennung) ⇒ sofort neu laden. Sonst dezenter Hinweis „Neue Version – jetzt laden“; Antippen lädt
  neu. Nie Neuladen mitten in einer Eingabe. Die Outbox liegt in IndexedDB und übersteht das Neuladen.
  „Ungespeichert“ heißt: Dialog offen, Einstellungen offen, Text im Erfassungsfeld, Spracherkennung läuft, Termin wird
  gezogen oder ein Eingabefeld hat den Fokus. Bewusste Grenze: Text in einem anderen Feld **ohne** Fokus (z. B.
  Einkaufsliste nach Tippen daneben) ist nicht geschützt; geprüft wird ohnehin nur beim Start und bei der Rückkehr.
- Versionsnummer `MAJOR.MINOR.PATCH` aus `package.json` + Build-Stempel; sichtbar in Einstellungen/Info und Diagnose.
  Bei jedem Veröffentlichen auf `stable` wird die Version erhöht.

## 7. Google Calendar

- Google Identity Services, **Token-Modell** (`initTokenClient`), Scope
  `https://www.googleapis.com/auth/calendar.events`. Kein Client-Secret in der App.
- Access-Token nur im Speicher; bei Ablauf stilles Erneuern (`prompt: ''`), sonst Knopf „Erneut verbinden".
- Kalender: nur `primary` (andere Kalender werden nicht angezeigt). Zeitzone `Europe/Berlin`.
- Termine ändern per `PATCH` (nur geänderte Felder; unbekannte Felder bleiben in Google unverändert), Serien über
  die Serie (`recurringEventId`) bzw. das einzelne Vorkommen; Gäste-Benachrichtigung über `sendUpdates`.
- Einrichtung (Google-Cloud-Projekt, OAuth-Zustimmungsbildschirm, Client-ID mit erlaubten
  Ursprüngen `http://localhost:5173`, der Produktiv- und der Vorschau-Adresse, §1.1) macht der Entwickler selbst
  mit Schritt-für-Schritt-Anleitung.
- **Phase 8:** Eine Client-ID für alle. Die App bleibt im Google-Status „Testing“; der Entwickler trägt jeden Tester
  als Testnutzer ein (max. 100). Tester sehen bei der ersten Anmeldung „Google hat diese App nicht überprüft“ und
  bestätigen über „Weiter“; die Tester-Anleitung erklärt das. Jeder Nutzer verbindet sein eigenes Google-Konto.

## 8. Sortier-Regeln für den Claude-Lauf (Phase 3/5, außerhalb der App)

### 8.1 Rahmen
- **Cloud-Routine von Claude Code** (claude.ai/code/routines) **im Konto des jeweiligen Nutzers** (optional, §1.1),
  Modell Sonnet, Code-Repo `secondbrain` auf Stand `stable` und das eigene Daten-Repo nebeneinander, als Connector
  **nur** der Google-Kalender-Connector des Nutzers (Kalender `primary`). Wie das Code-Repo in die Routine kommt
  (Routine wählt das öffentliche Repo direkt aus und klont dessen Standardzweig `stable`; Ausweg: Lauf klont selbst,
  nie über das gecachte Setup-Skript), steht in `docs/ROUTINE-PROMPT.md` (Aufgabe 77).
  Der Routine-Prompt der Nutzer ist kurz und verweist auf `docs/ROUTINE-PROMPT.md`/`docs/CLAUDE-LAUF.md` von
  `stable`, damit Verbesserungen ohne Neueinrichtung ankommen. Läuft ohne Laptop. Kosten nur über das Abo des
  Nutzers; Nutzungsguthaben bleiben aus (ist das Abo-Kontingent erschöpft, wird der Start abgelehnt). Kein Nutzer
  verbraucht das Kontingent eines anderen.
- **Kein Zeitplan.** Start nur über den API-Trigger der Routine, ausgelöst vom Knopf „Jetzt sortieren“ (§6.3):
  App → `repository_dispatch` → **GitHub Action im Daten-Repo** (`concurrency` ohne Abbruch, Rechte nur
  `contents: write`). Der Workflow im Daten-Repo ist nur ein kurzer Aufruf des **wiederverwendbaren Workflows**
  `.github/workflows/sortieren.yml@stable` im Code-Repo; die beiden Secrets aus 3.7 reicht er ausdrücklich weiter
  (`secrets: inherit` gilt nicht über Kontogrenzen). Logik und Skript kommen von `stable`.
  Die Action:
  0. (Phase 8) fehlt ein Secret aus 3.7 ⇒ `nicht-eingerichtet`, sonst nichts;
  1. prüft dasselbe wie die App: Inbox-Einträge ohne `sortError` (Phase 9: ohne die frühere Regel §8.4 e); sonst
     `nichts`;
  2. prüft die Sperre (3.10); aktiv ⇒ `laeuft`;
  3. schreibt `runs/started.json` (`gestartet`), commit + push auf `main`; scheitert das ⇒ `fehler`, kein Start;
  4. ruft **genau einmal** `POST <ROUTINE_FIRE_URL>` auf (ohne `text`; kein automatisches Wiederholen, der Endpunkt
     ist nicht idempotent). Fehlerantwort ⇒ `started.json` auf `abgelehnt`; Netzfehler/Zeitüberschreitung ⇒ `unklar`
     (Sperre bleibt bis zum Zeitlimit);
  5. schreibt das Ergebnis nach `runs/trigger.json`.
  Start-URL und Start-Token stehen nur in den GitHub-Secrets (3.7); die App kennt sie nie (der Anthropic-Endpunkt
  erlaubt ohnehin kein CORS).
- Limits der Routine: 30 Starts pro Stunde und Routine, kein Tageslimit; dazu das Abo-Kontingent.
- In der Cloud: im Daten-Repo zuerst auf `main` wechseln, Commits/Push nur durch die Skripte und nur auf `main`,
  **nie** `claude/`-Zweige pushen, keine Pull Requests. Git-Identität der Cloud-Commits: `Claude <noreply@anthropic.com>`.
  Zeitzone der VM ist UTC; alle Zeiten rechnen ausdrücklich in Europe/Berlin.
- **Rückfallebene (nur Entwickler):** Die lokale geplante Aufgabe „SecondBrain sortieren“ (Claude-Desktop-App,
  lokale Kopie des Daten-Repos, Git mit den Zugangsdaten des Nutzers) bleibt eingerichtet, ist aber pausiert. Sie
  nutzt denselben Prompt und muss weiter funktionieren; Cloud- und lokaler Lauf nie gleichzeitig aktiv.
- Prompt: `docs/CLAUDE-LAUF.md` im Code-Repo (versioniert, ohne feste Pfade und Namen; Datenordner laut §3.11).
  Testsätze: `docs/sortier-tests.md`, `docs/sortier-tests-2.md`, `docs/sortier-tests-3.md` (Phase 9; neutrale
  Beispiele, keine persönlichen Daten).
- Keine Mail-Prüfung (gestrichen 2026-10-19); die Routine nutzt nur den Kalender-Connector.
- **Aufgabenteilung:** Claude versteht und ordnet nur ein und bedient den Connector. Alles Feste
  erledigen Skripte im Code-Repo (`npm run lauf:*`): Git, Kontext ausgeben, Entscheidungen prüfen,
  Slots berechnen, Dateien schreiben, Daten-Repo prüfen, Protokoll. Claude schreibt nur
  Zwischendateien in `.lauf/`; ins Repo kommt nur, was die Skripte geprüft haben.

### 8.2 Ablauf eines Laufs
1. `git pull`. Keine Inbox-Einträge ohne `sortError` ⇒ **sofort beenden** (kein Commit, kein Kalender). Höchstens **29** Inbox-Einträge pro Lauf (die ältesten nach
   `createdAt`); die übrigen bleiben für den nächsten Lauf im Eingangskorb.
2. Claude ordnet jeden Eintrag ein (8.3) und schreibt die Entscheidungen nach `.lauf/`.
3. Claude liest die Termine der nächsten 14 Tage über den Connector nach `.lauf/`.
4. Skript prüft die Entscheidungen und berechnet die Zeiten (8.4).
5. Claude legt die Kalendertermine über den Connector an und notiert die Termin-IDs.
6. Skript schreibt `items/` (mit `calendarEventId`), löscht die Inbox-Dateien, setzt `sortError`
   bei nicht einplanbaren Einträgen, prüft das ganze Daten-Repo und schreibt `runs/last.json`.
7. Commit + Push; bei Konflikt `pull --rebase` und bis zu 3 neue Versuche. Bei Dateikonflikten
   gewinnt die Fassung im Repo; der Lauf vermerkt das in `errors`.
- Schlägt das Anlegen eines Termins fehl, wird der Eintrag ohne `schedule` gespeichert und der
  Fehler in `errors` vermerkt. **Keine Rückfragen**, nie.

### 8.3 Einordnen
1. **Art:** `termin` = Verabredung/Ereignis zu einem bestimmten Zeitpunkt (Arzt, Treffen,
   Sitzung, Training); `aufgabe` = etwas zu tun; `notiz` = Information, Idee, Merkposten ohne Tun.
   Im Zweifel `aufgabe`, wenn ein Tun erkennbar ist, sonst `notiz`.
2. **Einkauf:** Zu kaufende Dinge ⇒ Ablage der Art `einkauf`, je Artikel ein Eintrag
   (`type: "notiz"`, `checked: false`). „Milch, Eier und Brot kaufen“ ⇒ 3 Einträge.
   Gleiche Artikel (3.9) werden nicht doppelt angelegt – weder gegenüber der vorhandenen Liste noch
   innerhalb eines Laufs; das prüft das Skript. Sonst ergibt eine Erfassung genau einen Eintrag.
3. **Ablage:** anhand Name und `description` in `categories.json`; nie die Ablage der Art
   `archiv`. **Neue Ablage nur**, wenn der Text das ausdrücklich verlangt („neue Ablage Fitness …“);
   `id` laut 3.5. **Im Zweifel `privat`.**
4. **Titel und Notiz** (gilt für Aufgaben, Notizen und Termine): Claude erkennt selbst einen **kurzen** Titel
   (wenige Wörter, höchstens ca. 60 Zeichen), ohne Füllwörter wie „wichtig“ und ohne Zeitangabe – auch bei langen
   oder mehrzeiligen Texten nie den ganzen Text als Titel. Sagt der Text mehr als der Titel, kommt der
   **ursprüngliche Text so vollständig und wörtlich wie möglich** in `notes` (alle Sätze und Zeilenumbrüche); nichts
   geht verloren. Steht schon alles im Titel, `notes: ""`. Einkaufsartikel: `notes: ""`.
5. **Fokus (Phase 9, früher „Wichtig“):** `important: true` nur bei ausdrücklichen Wörtern („wichtig“, „dringend“,
   „unbedingt“, „sofort“, „asap“). Im Zweifel nicht. Fokus führt **nicht** zu einem Kalendertermin. Nennt der Text eine
   Frist („bis Freitag“), zusätzlich `dueDate`.
6. **Dauer:** Angabe des Nutzers, sonst Schätzung in ganzen Minuten (Phase 9: auch unter 15, z. B. 2 für „kurz Bescheid
   geben“, „Link schicken“; ≤ 2 ⇒ ⚡), max. die Länge des Planungsfensters. Termine mit Uhrzeit ohne Angabe: 60 Min.
7. **Zeitangaben** löst Claude relativ zum Lauf-Zeitpunkt auf („morgen“, „Freitag“ = nächster
   Freitag, heute eingeschlossen, solange der Zeitpunkt noch nicht vorbei ist) und gibt sie als
   Ortszeit an; das Skript ergänzt den Offset (Europe/Berlin).
8. **Status (Phase 9, nur Aufgaben):** „warte auf …“, „hab X gefragt“, „X soll mir … schicken“, „X meldet sich“ ⇒
   `warten` (`waiting.person` = Person/Stelle aus dem Text, `since` = Datum der Erfassung, `followUpOn` nur, wenn
   genannt: „nachhaken am …“, „falls bis Freitag nichts kommt“). „irgendwann mal …“, „vielleicht …“, „wäre schön …“,
   „eines Tages …“ ⇒ `irgendwann`. Sonst `naechster-schritt`.
9. **Projekt (Phase 9):** Passt ein Eintrag **eindeutig** zu einem aktiven Projekt (Titel/Notiz, Liste aus
   `lauf:start`), wird er dessen letzter Schritt (`projectId`, gleiche Ablage wie das Projekt). Im Zweifel kein Projekt.
   **Neues Projekt nur**, wenn der Text es ausdrücklich sagt („Projekt …“, „neues Projekt …“): Projekt mit kurzem Titel,
   Ablage nach Regel 3, `notes` = Originaltext (immer vollständig) und **ein** erster nächster Schritt als Aufgabe,
   den Claude vorschlägt (konkret, erledigbar). Serien legt der Lauf nicht an.
10. **Ausdrücklich einplanen (Phase 9):** nur bei Worten wie „plane … ein“, „trag … (in den Kalender) ein“, „blocke …“,
   „reserviere Zeit …“ (`plan: true`) oder bei einer festen Uhrzeit (Regel a in 8.4).

### 8.4 Einplanen (Skript)
Phase 9: Kalendertermine entstehen **nur** bei fester Uhrzeit oder ausdrücklichem Einplanen (8.3 Regel 10); „wichtig“
plant nichts mehr ein. Reihenfolge innerhalb eines Laufs: a → b → c, jeweils nach `createdAt`. Bereits in diesem Lauf
vergebene Zeiten gelten als belegt.
- **a) Datum + Uhrzeit** (jede Art): Kalendertermin **genau** zu dieser Zeit, auch außerhalb des
  Planungsfensters und auch bei Überschneidung. Liegt der Zeitpunkt in der Vergangenheit ⇒ `sortError`.
- **b) Datum ohne Uhrzeit**, nur bei `type: "termin"` oder `plan: true`: Block mit der Dauer des Nutzers, sonst
  **90 Min.**, im ersten freien Slot im Planungsfenster **an genau diesem Tag** (heute: ab jetzt). Kein freier
  Slot oder Datum vorbei ⇒ Eintrag bleibt mit `sortError` im Eingangskorb.
- **c) `plan: true` ohne Datum:** erster freier Slot ab dem **Tagesanfang** = Beginn des Planungsfensters des nächsten
  Tages, dessen Fenster noch nicht begonnen hat (hat das Fenster heute schon begonnen, also nie mehr heute; läuft der
  Lauf vor Fensterbeginn, ist der Tagesanfang heute). Einträge mit Dauer ≤ 15 Min. zuerst. Dauer des Nutzers, sonst
  Schätzung, mindestens 15 Min. Findet sich nichts ⇒ Eintrag ohne `schedule`, Hinweis in `errors`.
- **Aufgabe mit Datum ohne Uhrzeit und ohne `plan`** („morgen Krankenkasse anrufen“): kein Kalender, `dueDate` = Datum.
  Notizen mit Datum ohne Uhrzeit und ohne `plan`: kein Kalender (Datum bleibt im Text).
- **Entfallen (Phase 9):** automatische Einplanung wichtiger Einträge (frühere c/d) und vorhandener wichtiger Aufgaben
  (frühere e).
- Sonst: kein Kalendertermin (`schedule: null`).
- **Frei** = keine Überschneidung mit belegten Terminen des Kalenders `primary`. Nicht belegend:
  ganztägige Termine, als „frei“ markierte (`transparency: transparent`) und abgesagte.
  Slots beginnen auf Viertelstunden, Suche über 14 Tage, alle Wochentage.
- **Pause (§3.6, Phase 7):** Die Pause zählt bei b und c (und bei ✗ „Nicht erledigt“ in der App) an jedem Tag als
  belegt; ein automatisch eingeplanter Block läuft **nie über die Pause**. Einzige Ausnahme: Die Dauer ist länger als
  der längere Teil des Planungsfensters vor bzw. nach der Pause – dann darf der Block über die Pause laufen (sonst
  wäre er nie einplanbar). Feste Uhrzeiten (a) und manuelles Einplanen gelten genau wie angegeben, auch in der Pause.
- Kalendertermin: Titel = Eintragstitel; Beschreibung „SecondBrain“ + Eintrags-ID; Zeitzone Europe/Berlin.

### 8.5 Später
- Nichts geplant. Mail-Prüfung ist gestrichen (2026-10-19).

## 9. Nicht-Ziele

- Keine Claude-/KI-API in der App. Die App spricht nur mit GitHub und Google; den Claude-Lauf startet die
  GitHub Action im Daten-Repo.
- Kein eigener Backend-Server, keine Benutzerkonten in der App. Mehrere Nutzer nur strikt getrennt über eigene
  Daten-Repos (§1.1); kein Teilen von Daten zwischen Nutzern, kein Zugriff des Entwicklers.
- Kein App Store; Google-App bleibt im Testmodus (keine Verifizierung).
- Keine Mehrsprachigkeit, kein helles Design.

## 10. Phasen

| Phase | Inhalt |
|---|---|
| 0 | Gerüst: Doku, Agenten, Projekt-Setup |
| 1 | MVP: Erfassung, Aufgabenliste (inkl. Eingangskorb), manuelle Kalendertermine, Einstellungen (Token, Google), Sync, Hosting + Desktop-Icon |
| 2 | Kalenderseite, Einstellungen komplett (Planungsfenster) |
| 3 | Stündlicher Claude-Lauf: Sortieren + Auto-Planung |
| 4 | Ablagenseite inkl. Einkaufsliste |
| 5 | Cloud-Lauf per Knopf (ohne Laptop) |
| 6 | iPhone (Safari, Home-Bildschirm) |
| 7 | Fehler, Feinschliff (Teil A), vollwertiger Kalender (Teil B) |
| 8 | Testphase mit 3–4 weiteren Nutzern: öffentliches Code-Repo, Kanäle main/stable, Updates, Formatversion, Ersteinrichtung, Claude optional, Daten-Repo-Vorlage, Feedback |
| 9 | Aufgabenseite nach GTD: Status, Fokus, Projekte mit Schritt-Serien, Reiter, Kalender nur noch ausdrücklich |

Die frühere Phase „Mail-Vorschläge“ ist gestrichen (Entscheidung des Nutzers, 2026-10-19).
