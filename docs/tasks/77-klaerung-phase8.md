# 77 – Klärung Phase 8 (Projektleiter, Proben mit dem Nutzer)

Ziel: offene technische Fragen für Phase 8 klären, bevor die Umsetzungsaufgaben geschrieben werden (SPEC §1.1, §6.8,
§8.1). Kein Code.

## Fragen und Ergebnisse

### K1 – Kann die Routine eines Testers das öffentliche Code-Repo des Entwicklers verwenden?
**Ja (laut Doku).** Claude Code in der Cloud mit verbundener Claude-GitHub-App erreicht „jedes öffentliche Repository
und private Repositories, auf denen die App installiert ist“ (code.claude.com/docs/en/claude-code-on-the-web,
Abschnitt „GitHub authentication options“). Der Tester installiert die Claude-GitHub-App nur auf **seinem**
Daten-Repo und wählt in der Routine zusätzlich das öffentliche Repo `<entwickler>/secondbrain`.
- Geklont wird der **Standardzweig** ⇒ E4 (Standardzweig `stable`) liefert automatisch die stabile Fassung.
- Der Lauf pusht nie ins Code-Repo (CLAUDE-LAUF Abschnitt 0); ohnehin hätte der Tester dort keine Schreibrechte.
- Ersatzweg, falls die Auswahl in der Oberfläche doch nicht geht: Routine nur mit dem Daten-Repo, Abschnitt 0 klont
  `https://github.com/<entwickler>/secondbrain` (Zweig `stable`) selbst – Netzwerkstufe „Trusted“ erlaubt GitHub.
  **Nicht** über das Setup-Skript, dessen Ergebnis gecacht wird (Updates kämen nicht an).
- **Nachweis:** in Aufgabe 88 mit dem zweiten Testkonto (echte Routine).

### K2 – Wiederverwendbarer Workflow aus dem öffentlichen Code-Repo
**Ja, mit einer Einschränkung.** Workflows in öffentlichen Repos dürfen von jedem Repo per
`uses: <entwickler>/secondbrain/.github/workflows/sortieren.yml@stable` aufgerufen werden; sie laufen im Kontext des
**aufrufenden** Repos (dessen `GITHUB_TOKEN`, dessen Rechte `contents: write`, dessen Secrets).
- `secrets: inherit` gilt nur innerhalb derselben Organisation/Enterprise ⇒ das Daten-Repo reicht die zwei Secrets
  **ausdrücklich** weiter (`secrets: { ROUTINE_FIRE_URL: …, ROUTINE_FIRE_TOKEN: … }`); im wiederverwendbaren Workflow
  sind beide `required: false` (fehlen ⇒ `nicht-eingerichtet`, SPEC §8.1 Schritt 0). **SPEC §8.1 entsprechend
  korrigiert** („Secrets ausdrücklich weitergereicht“ statt `secrets: inherit`).
- Das Skript holt der wiederverwendbare Workflow per `actions/checkout` aus `<entwickler>/secondbrain@stable`
  (öffentlich, kein Token nötig) in einen Unterordner; das Daten-Repo wird wie bisher ausgecheckt.
- Der Workflow im Code-Repo hat nur `on: workflow_call` ⇒ läuft im Code-Repo selbst nie.
- Vertrauen: Wer `@stable` aufruft, führt Code des Entwicklers mit Schreibrecht auf sein Daten-Repo aus – genau wie
  die App selbst. Steht ehrlich in der Tester-Anleitung (Code öffentlich einsehbar).
- **Nachweis:** in Aufgabe 84 (Probe-Daten-Repo) und 88.

### K3 – Cloudflare: bestehendes Projekt auf ein anderes Repo umstellen?
**Voraussichtlich nein.** Die Doku beschreibt nur das Verwalten der GitHub-Verbindung (Settings → Builds → Git
Repository → Manage), nicht das Wechseln des Repos; Berichte aus der Community bestätigen, dass das Repo nicht
wechselbar ist. ⇒ **E1: neues Pages-Projekt** aus dem öffentlichen Repo (Produktionszweig `stable`, Vorschau nur
`main`). Das alte Projekt baut weiter aus dem Archiv, bis deine Geräte umgezogen sind.
- **Probe P1 (Nutzer, 1 Min.):** siehe unten.
- Vorschau-Adresse: Branch-Alias `https://main.<projekt>.pages.dev`; „Preview deployments“ auf „Custom branches:
  main“ beschränken; optional Cloudflare Access für Vorschauen („nur für mich“, kostenlos).

### K4 – Updates auf dem iPhone erkennen
iOS prüft den Service Worker nur bei Navigation; die installierte App navigiert beim Zurückkehren nicht. Deshalb
(SPEC §6.8): bei `visibilitychange` → sichtbar `registration.update()` **und** `version.json` (Build-Stempel,
`cache: 'no-store'`) mit dem eigenen Build vergleichen. Neuladen nur ohne Ungespeichertes (Aufgabe 69 bleibt gewahrt).
- **Nachweis:** in Aufgabe 81 auf der Vorschau mit dem iPhone (zwei Builds nacheinander).

### K5 – Vorausgefüllte Links
- **Token:** GitHub unterstützt vorausgefüllte Links für fine-grained Tokens
  (`https://github.com/settings/personal-access-tokens/new?name=…&description=…&expires_in=…&contents=write`).
  Das **Repository lässt sich nicht vorauswählen** ⇒ die Anleitung sagt „Only select repositories → dein Daten-Repo“.
  **Probe P2 (Nutzer):** siehe unten.
- **Feedback:** Issue-Formulare (`.github/ISSUE_TEMPLATE/*.yml`) lassen sich per Query-Parameter mit den Feld-IDs
  vorausfüllen (`/issues/new?template=fehler.yml&version=…&geraet=…`). Nachweis in Aufgabe 85.

### K6 – Google im Testmodus
Testnutzer (max. 100) unter „Google Auth Platform → Audience → Test users“. Tester sehen „Google hat diese App nicht
überprüft“ → „Weiter“. Das Token-Modell (GIS, ohne Refresh-Token) ist vom 7-Tage-Ablauf für Testmodus-Refresh-Tokens
nicht betroffen. Scope `calendar.events` bleibt. Nachweis in 88.

## Proben für den Nutzer
- **P1 Cloudflare:** dash.cloudflare.com → Workers & Pages → dein Projekt → Settings → Builds → „Git repository“.
  Gibt es dort eine Möglichkeit, ein **anderes Repository** auszuwählen (nicht nur „Manage“ der GitHub-App)?
  Erwartet: nein.
- **P2 Token-Link:** am Computer, angemeldet bei GitHub, diesen Link öffnen (nichts erzeugen, nur ansehen):
  `https://github.com/settings/personal-access-tokens/new?name=SecondBrain-Test&description=SecondBrain-App&expires_in=366&contents=write`
  Erwartet: Name und Beschreibung vorausgefüllt, unter „Repository permissions“ steht **Contents: Read and write**,
  Ablauf ca. 1 Jahr. Danach Seite schließen, **nicht** „Generate token“ klicken.

## Ergebnis (Proben 2026-11-01)
- **P1:** Unter Settings → Builds steht fest `Mc-Babex/secondbrain`, daneben nur „Disconnect“ und „Manage“. „Manage“
  öffnet auf GitHub die Repo-Freigabe der **Cloudflare-GitHub-App** (welche Repos Cloudflare sehen darf) – das ändert
  nicht, aus welchem Repo das Projekt baut. Ein Wechsel des Repos ist also nicht vorgesehen ⇒ **E1 bleibt: neues
  Pages-Projekt.** Wichtig für 87: Das Archiv-Repo muss in der Freigabe der Cloudflare-App bleiben, sonst baut das
  alte Projekt nicht mehr; das neue öffentliche Repo kommt hinzu. Produktionszweig des alten Projekts ist `main`.
- **P2:** `expires_in=366` ist bei GitHub nicht möglich. Nutzer legt **11 Monate** fest ⇒ Link mit
  `expires_in=335`. Ob Name/Beschreibung/`contents=write` übernommen werden, wird in 82 mit dem endgültigen Link
  geprüft; die Anleitung beschreibt die Felder trotzdem ausdrücklich (Rückfall, falls GitHub die Parameter ändert).
- K1, K2, K4–K6 werden in 81, 84, 85 und 88 nachgewiesen.
