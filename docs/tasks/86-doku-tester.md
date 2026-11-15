# 86 – Doku: Tester-Anleitung, Tester-Verwaltung, Kanäle

## Ziel
Ein Tester ohne Vorwissen richtet SecondBrain allein auf seinem iPhone ein. Der Entwickler weiß, wie er Tester
aufnimmt, entfernt und Updates veröffentlicht (SPEC §1.1, §3.1, §3.7, §6.3, §6.5, §6.8, §7, §8.1).

## Bereich
- neu `docs/TESTER-ANLEITUNG.md`, neu `docs/TESTER-VERWALTUNG.md`
- `docs/EINRICHTUNG.md`: wird zur Anleitung „eigene Instanz betreiben (Entwickler)“ – neutral, ohne persönliche
  Adressen/Namen (Platzhalter `<projekt>.pages.dev`, `<dein-konto>`), Abschnitt F auf die Vorlage
  `vorlage/daten-repo/` bzw. den wiederverwendbaren Workflow umstellen (die alte Datei `scripts/action/sortieren.yml`
  gibt es nicht mehr), Daten-Repo aus der Vorlage, Kanäle main/stable.
- `docs/ROUTINE-PROMPT.md` nur, falls nötig, damit sie zur Tester-Anleitung passt (keine Regeländerung am Lauf).
- `CLAUDE.md`: **nur** neuer Abschnitt „Kanäle und Veröffentlichen“ (nach „Befehle“), sonst nichts ändern.
- `vorlage/daten-repo/README.md`: Verweis auf die Tester-Anleitung prüfen/anpassen (Link auf
  `https://github.com/Mc-Babex/secondbrain/blob/stable/docs/TESTER-ANLEITUNG.md`).
- **Tabu:** `src/`, `scripts/`, `.github/`, SPEC, PROGRESS, `docs/tasks/` außer dieser Datei.

## Vorgaben
### TESTER-ANLEITUNG.md (für Tester, iPhone, Du-Form, einfache Sprache)
- Oben: in 3–5 Sätzen, was die App tut; **Datenschutz einfach erklärt**: deine Einträge liegen in deinem eigenen
  privaten GitHub-Repo und auf deinem iPhone; der Entwickler sieht sie nicht; Google-Kalender-Zugriff nur von deinem
  iPhone aus, der Entwickler bekommt keinen Zugriff; was der Entwickler sieht (nur deine Google-E-Mail-Adresse in der
  Testnutzer-Liste, und Feedback-Issues, die du selbst abschickst – öffentlich!). Claude ist optional und läuft
  in deinem eigenen Konto.
- Was du brauchst: iPhone mit Safari, Google-Konto, ca. 20 Minuten; optional Claude-Abo (Pro/Max).
- Schritte, nummeriert, je Schritt „Woran du merkst, dass es geklappt hat“:
  1. Dem Entwickler deine Google-E-Mail-Adresse schicken (er trägt dich als Testnutzer ein) und auf seine Rückmeldung warten.
  2. GitHub-Konto anlegen (kostenlos), Zwei-Faktor-Anmeldung einschalten (empfohlen, kurz wie).
  3. Daten-Repo aus der Vorlage anlegen: Link `https://github.com/new?template_owner=Mc-Babex&template_name=secondbrain-vorlage`,
     Name frei (Vorschlag `secondbrain-daten`), **Private** wählen.
  4. App in Safari öffnen (`https://<app-adresse>` als Platzhalter `APP_ADRESSE`, der Entwickler schickt sie mit;
     im Text einmal klar sagen), „Teilen“ → „Zum Home-Bildschirm“, App vom Home-Bildschirm starten.
  5. Ersteinrichtung in der App: ① Willkommen ② Daten-Repo: Token über den Link in der App erstellen – „Repository
     access: Only select repositories“ → **nur dein Daten-Repo**, Berechtigung „Contents: Read and write“ ist
     vorbelegt, Ablauf 11 Monate; Token kopieren, in der App „Einfügen“, „Verbindung testen“. ③ Google verbinden:
     Warnung „Google hat diese App nicht überprüft“ ist im Testbetrieb normal → „Erweitert“ → „Weiter zu …“;
     Kalender-Zugriff erlauben. ④ „Ohne Claude weiter“ oder „Ich richte Claude ein“ (→ Abschnitt Claude).
  6. Erste Schritte: etwas erfassen, im Eingangskorb über „In Ablage…“ einsortieren, einplanen.
- Abschnitt **Claude (optional)** – nur mit eigenem Claude-Abo; kein Kontingent des Entwicklers wird genutzt.
  Schritte: Routine auf claude.ai/code anlegen (laut `docs/ROUTINE-PROMPT.md`: Repositories zuerst
  `Mc-Babex/secondbrain`, dann dein Daten-Repo; Setup-Skript; Connector nur Google Calendar; Trigger nur API),
  Claude-GitHub-App nur für dein Daten-Repo erlauben (das öffentliche Code-Repo braucht keinen Zugriff), Start-URL
  und Start-Token der Routine als Secrets `ROUTINE_FIRE_URL` / `ROUTINE_FIRE_TOKEN` im Daten-Repo (Settings →
  Secrets and variables → Actions), **zusätzliches Nutzungsguthaben (Extra usage) aus** lassen, damit keine Kosten
  entstehen; in der App Einstellungen → „Mit Claude sortieren“ an; Test mit „Jetzt sortieren“. Was die Meldungen
  bedeuten (gestartet / nicht eingerichtet / Limit erreicht). Stündlicher Lauf optional (Zeitplan der Routine).
- **Updates:** kommen automatisch; wenn „Neue Version – jetzt laden“ erscheint, antippen. Nichts neu installieren.
- **Feedback:** Einstellungen → Feedback → „Fehler melden“/„Wunsch äußern“; braucht GitHub-Anmeldung; Issues sind
  **öffentlich**, keine persönlichen Inhalte hineinschreiben.
- **Token erneuern** (nach 11 Monaten bzw. bei Meldung „Token abgelaufen“): neuen Token wie in Schritt 5 erstellen,
  in Einstellungen → GitHub eintragen.
- **Häufige Probleme** (kurz): Token falsch/abgelaufen, falsches Repo gewählt, Google „Zugriff blockiert“ (noch nicht
  als Testnutzer eingetragen), offline.
- **Aufhören:** App vom Home-Bildschirm löschen, Daten-Repo löschen (GitHub → Settings → Delete), Token löschen,
  Google-Zugriff unter myaccount.google.com → Sicherheit → Drittanbieter-Zugriff entfernen, ggf. Routine löschen.
- Keine persönlichen Daten des Entwicklers (keine echte App-Adresse nötig, keine E-Mail, keine Namen).

### TESTER-VERWALTUNG.md (für den Entwickler)
- Tester aufnehmen: Google-Cloud-Konsole → OAuth-Zustimmungsbildschirm/Zielgruppe → Testnutzer hinzufügen (max. 100),
  Nachricht an den Tester mit App-Adresse + Link zur Tester-Anleitung (Textvorlage zum Kopieren).
- Tester entfernen: Testnutzer entfernen; der Tester löscht seine Daten selbst (Verweis „Aufhören“). Klarstellen:
  der Entwickler hat keinen Zugriff auf Daten-Repos der Tester und braucht keinen.
- Feedback bearbeiten: Issues mit Labels `fehler`/`wunsch`; Issues auf persönliche Daten prüfen und ggf. bearbeiten
  bzw. löschen.
- Updates veröffentlichen: siehe CLAUDE.md „Kanäle und Veröffentlichen“ (kurz wiederholen, Prüfliste).
- Formatänderungen: nur über SPEC §3.11, Tester mit altem Format werden von der App gewarnt.
- Grenzen des Testmodus: Google-Token läuft im Testmodus nach 7 Tagen ab ⇒ Tester muss gelegentlich neu verbinden
  (nur erwähnen, falls in SPEC §7 so beschrieben; sonst weglassen).

### CLAUDE.md – Abschnitt „Kanäle und Veröffentlichen“
- `main` = Entwicklung, deployt auf die Vorschau `main.<projekt>.pages.dev` (nur Entwickler); `stable` =
  Standardzweig, deployt auf die Produktiv-Adresse für alle.
- Projektleiter arbeitet und committet auf `main`; Push auf `main` nur nach Freigabe des Nutzers.
- **Veröffentlichen** nur auf ausdrücklichen Wunsch des Nutzers, nachdem er die Vorschau getestet hat:
  Version in `package.json` (+ Lockfile) erhöhen, lint/test/build grün, `main` → `stable` mergen (fast-forward bzw.
  Merge-Commit), `stable` pushen; danach prüfen, dass Produktiv-Adresse die neue Version zeigt.
- Workflow, Skripte (`scripts/action`, `scripts/lauf`) und `docs/CLAUDE-LAUF.md` wirken für alle Tester ab `stable`
  ⇒ Änderungen daran besonders vorsichtig; Formatänderungen nur über SPEC §3.11.
- Öffentliches Repo: nie Geheimnisse, persönliche Daten oder echte Einträge committen (Prüfliste in 87).

## Abnahmekriterien
1. TESTER-ANLEITUNG enthält alle oben genannten Abschnitte in dieser Reihenfolge; jeder Schritt hat „Woran du
   merkst …“; Datenschutz-Abschnitt nennt ausdrücklich, was der Entwickler sieht und was nicht.
2. Links und Namen stimmen mit dem Code überein: Vorlagen-Link = `TEMPLATE_REPO_URL`, Token-Hinweise passen zu
   `TOKEN_URL` (11 Monate, Contents), Secret-Namen = `ROUTINE_FIRE_URL`/`ROUTINE_FIRE_TOKEN`, Texte der App-Knöpfe
   („Ohne Claude weiter“, „Ich richte Claude ein“, „Mit Claude sortieren“, „Fehler melden“ …) wörtlich wie im Code
   (Reviewer prüft per grep).
3. TESTER-VERWALTUNG enthält Aufnehmen (mit Textvorlage), Entfernen, Feedback, Veröffentlichen.
4. CLAUDE.md hat den neuen Abschnitt, sonst keine Änderung (`git diff CLAUDE.md`).
5. EINRICHTUNG.md verweist nicht mehr auf `scripts/action/sortieren.yml`, enthält keine persönliche Adresse
   (Suche mit der lokalen Sperrliste über `docs/EINRICHTUNG.md` und `docs/TESTER-*.md` leer).
6. `npm run lint`, `npm test`, `npm run build` grün (Doku-Tests, falls vorhanden).
7. Manuell (88): ein Tester richtet sich mit der Anleitung ohne Rückfragen ein.
