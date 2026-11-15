# SecondBrain – Anleitung für Tester (iPhone)

## Was die App tut
SecondBrain ist eine App für dein iPhone, mit der du Gedanken sofort festhältst (tippen oder sprechen), sie in
Ablagen sortierst und Aufgaben in deinen Google-Kalender einplanst. Sie läuft im Browser Safari und wird wie eine
normale App auf deinem Home-Bildschirm abgelegt.

## Datenschutz einfach erklärt
- **Deine Einträge liegen nur bei dir:** in einem eigenen **privaten** GitHub-Repo (deinem „Daten-Repo“) und auf
  deinem iPhone. Der Entwickler kann sie nicht sehen und braucht dafür keinen Zugriff.
- **Dein Google-Kalender** wird nur von deinem iPhone aus angesprochen. Der Entwickler bekommt keinen Zugriff darauf.
- **Das sieht der Entwickler:** deine Google-E-Mail-Adresse (sie steht in der Testnutzer-Liste, sonst lässt Google
  dich nicht hinein) und die Feedback-Meldungen („Issues“), die du selbst abschickst. Diese Meldungen sind
  **öffentlich** – schreib keine persönlichen Inhalte hinein. Das Feedback-Formular ist mit App-Version und
  Gerät/Browser vorausgefüllt; du kannst das vor dem Absenden ändern oder löschen.
- **Technische Zugriffsdaten:** Wie bei jeder Website verarbeitet der Hosting-Anbieter (Cloudflare) beim Laden der App
  technische Daten wie die IP-Adresse. Deine Einträge sind darin nicht enthalten.
- **Claude ist optional.** Wenn du es nutzt, läuft es in deinem eigenen Claude-Konto, nicht im Konto des Entwicklers.

## Was du brauchst
- ein iPhone mit Safari
- ein Google-Konto
- ca. 20 Minuten
- optional: ein Claude-Abo (Pro oder Max), nur für das automatische Sortieren

In dieser Anleitung steht `APP_ADRESSE` für die Internetadresse der App. Der Entwickler schickt sie dir mit.

## Einrichtung

### 1. Dem Entwickler deine Google-E-Mail-Adresse schicken
Schick ihm die Adresse deines Google-Kontos. Er trägt dich als Testnutzer ein. Warte auf seine Rückmeldung.

**Woran du merkst, dass es geklappt hat:** Der Entwickler schreibt dir, dass du eingetragen bist, und schickt dir
`APP_ADRESSE`.

### 2. GitHub-Konto anlegen
1. Geh auf https://github.com und leg ein kostenloses Konto an (falls du schon eins hast, überspring das).
2. Schalte die Zwei-Faktor-Anmeldung ein (empfohlen): GitHub → Profilbild → **Settings** → **Password and
   authentication** → **Two-factor authentication** und der Anleitung folgen (z. B. mit einer Authenticator-App).

**Woran du merkst, dass es geklappt hat:** Du bist bei GitHub angemeldet und siehst dein Profilbild oben rechts.

### 3. Daten-Repo aus der Vorlage anlegen
1. Öffne diesen Link: https://github.com/new?template_owner=Mc-Babex&template_name=secondbrain-vorlage
2. Name: frei wählbar, Vorschlag `secondbrain-daten`.
3. Wähle unbedingt **Private**.
4. Tippe auf **Create repository**.

**Woran du merkst, dass es geklappt hat:** Du siehst dein neues Repo mit dem Hinweis „Private“ und Ordnern und
Dateien wie `inbox`, `items` und `settings.json`.

### 4. App auf den Home-Bildschirm legen
1. Öffne `APP_ADRESSE` in **Safari** (nur Safari kann die App auf dem iPhone ablegen).
2. Tippe auf **Teilen** → **Zum Home-Bildschirm** → **Hinzufügen**.
3. Starte die App ab jetzt vom Home-Bildschirm.

**Woran du merkst, dass es geklappt hat:** Auf dem Home-Bildschirm liegt das SecondBrain-Symbol, und die App öffnet
sich im Vollbild mit dem Willkommen-Bildschirm.

### 5. Ersteinrichtung in der App
Die App führt dich durch vier Schritte.

1. **Willkommen:** Tippe auf **Los geht’s**.
2. **Daten-Repo verbinden:**
   - Tippe auf **Token erstellen**. GitHub öffnet sich mit einem ausgefüllten Formular.
   - Wähle unter „Repository access“ **Only select repositories** und dort **nur dein Daten-Repo**.
   - Die Berechtigung „Contents: Read and write“ ist schon eingestellt, der Ablauf steht auf 11 Monate. Tippe auf
     **Generate token** und kopiere den Token mit **Copy** (er wird nur einmal angezeigt).
   - Wechsle zurück zur App (vom unteren Rand nach oben wischen bzw. App-Wechsler, dann SecondBrain wählen). Trag
     dein Daten-Repo ein (Form `dein-konto/secondbrain-daten`) und tippe auf **Token einfügen**. iOS fragt
     „Einfügen erlauben?“ – tippe auf **Einfügen erlauben**. Die App prüft die Verbindung selbst. Klappt das nicht,
     füge den Token in das erscheinende Feld ein (lange auf das Feld drücken) und tippe auf **Token übernehmen**.
   - Zeigt GitHub nur eine abgespeckte Seite ohne das Formular, öffne den Link in Safari statt in der
     Home-Bildschirm-App und tippe dort auf „aA“ → **Desktop-Website anfordern**.
3. **Google-Kalender:** Tippe auf **Mit Google verbinden**. Google meldet, dass die App nicht überprüft ist. Das ist
   im Testbetrieb normal: tippe auf **Erweitert** und dann auf **Weiter zu …** (englisch: „Advanced“ → „Go to …
   (unsafe)“). Erlaube den Zugriff auf den Kalender.
4. **Automatisch sortieren:** Tippe auf **Ohne Claude weiter** oder, wenn du ein Claude-Abo hast und es nutzen
   willst, auf **Ich richte Claude ein** (dann weiter mit dem Abschnitt „Claude einrichten“ unten).

**Woran du merkst, dass es geklappt hat:** Nach „Token einfügen“ springt die App von allein zum Schritt
„Google-Kalender“. Bei einem Fehler bleibt sie im Schritt und zeigt eine rote Meldung. Bei Google steht am Ende
„Mit Google verbunden.“, und nach dem letzten Schritt siehst du die Hauptseiten der App.

### 6. Erste Schritte
1. Auf der Seite **Erfassen**: Schreib etwas ins Textfeld (oder nutze das Mikrofon) und tippe auf **Ablegen**.
2. Wische zur Seite **Aufgaben**. Dort liegt dein Eintrag im **Eingangskorb**. Tippe auf **In Ablage…** und wähle
   eine Ablage.
3. Plane eine Aufgabe ein: tippe bei der Aufgabe auf das Uhr-Symbol (**Einplanen**) und wähle Datum und Uhrzeit.

**Woran du merkst, dass es geklappt hat:** Nach dem Ablegen erscheint „Im Eingangskorb“, der Eintrag verschwindet
aus dem Eingangskorb und liegt in seiner Ablage, und der Termin steht in deinem Google-Kalender.

## Claude einrichten (optional)
Nur mit eigenem Claude-Abo. Es wird kein Kontingent des Entwicklers verbraucht. Ohne Claude sortierst du neue Einträge
selbst über **In Ablage…**.

1. **Claude-GitHub-App** (https://github.com/apps/claude) nur für **dein Daten-Repo** erlauben. Das öffentliche
   Code-Repo braucht keinen Zugriff.
2. **Routine anlegen** auf https://claude.ai/code. Die genauen Einstellungen stehen in
   [`docs/ROUTINE-PROMPT.md`](https://github.com/Mc-Babex/secondbrain/blob/stable/docs/ROUTINE-PROMPT.md):
   - Repositories in dieser Reihenfolge: zuerst `Mc-Babex/secondbrain`, dann dein Daten-Repo.
   - Prompt und Setup-Skript aus der Datei kopieren.
   - Connector: nur **Google Calendar**.
   - Trigger: nur **API** (kein Zeitplan, kein GitHub-Ereignis).
3. **Start-URL und Start-Token** der Routine kopieren (beim API-Trigger: URL anzeigen, **Generate token**). Trag
   beide als Secrets in deinem Daten-Repo ein: GitHub → dein Daten-Repo → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**:
   - Name `ROUTINE_FIRE_URL`, Wert: die URL
   - Name `ROUTINE_FIRE_TOKEN`, Wert: der Token

   Leg beides nirgends sonst ab (nicht in Chats, Notizen oder Mails).
4. **Zusätzliches Nutzungsguthaben (Extra usage) auf https://claude.ai/settings/usage ausgeschaltet lassen.** Dann
   können keine Kosten entstehen.
5. In der App: **Einstellungen** (Zahnrad) → Abschnitt „Automatisches Sortieren“ → Schalter **Mit Claude sortieren**
   einschalten. Hast du in der Ersteinrichtung **Ich richte Claude ein** gewählt, ist er schon an; nur nach
   **Ohne Claude weiter** schaltest du ihn selbst ein.
6. Test: Erfasse einen Eintrag und tippe im Eingangskorb auf **Jetzt sortieren**.

**Woran du merkst, dass es geklappt hat:** Die App meldet „Sortierung gestartet“, und nach kurzer Zeit ist der
Eintrag einsortiert.

Was die Meldungen bedeuten:
- **Sortierung gestartet:** Claude arbeitet, das Ergebnis erscheint nach dem nächsten Abgleich.
- **Automatisches Sortieren ist nicht eingerichtet:** Schalter, Secrets oder Workflow fehlen; geh die Schritte oben
  noch einmal durch.
- **Start abgelehnt: Limit erreicht:** Dein Claude-Kontingent ist erschöpft; versuch es später erneut.
- **Nichts zu sortieren:** Der Eingangskorb ist leer.

Das Sortieren startest du in der App mit **Jetzt sortieren**.

## Updates
Updates kommen automatisch. Erscheint **Neue Version – jetzt laden**, tippe darauf. Du musst nichts neu installieren.

## Feedback
**Einstellungen** → **Feedback** → **Fehler melden** oder **Wunsch äußern**. Das öffnet GitHub; du brauchst dafür
deine GitHub-Anmeldung. Die Meldungen sind **öffentlich** – schreib keine persönlichen Inhalte hinein.

## Token erneuern
Nach 11 Monaten oder bei der Meldung „Token ungültig oder abgelaufen“: Erstelle einen neuen Token wie in Schritt 5 und
trag ihn unter **Einstellungen** → **GitHub** ein.

## Häufige Probleme
- **„Token ungültig oder abgelaufen“:** Neuen Token erstellen (siehe „Token erneuern“).
- **„Repository nicht gefunden oder kein Zugriff“:** Repo-Name falsch geschrieben oder beim Token ein anderes Repo
  gewählt. Der Token muss genau für dein Daten-Repo gelten.
- **Google zeigt „Zugriff blockiert“:** Deine Adresse ist noch nicht als Testnutzer eingetragen. Schreib dem
  Entwickler.
- **Google-Verbindung abgelaufen:** Wähle „Erneut verbinden“.
- **Offline:** Du kannst weiter erfassen; die Änderungen werden hochgeladen, sobald du wieder online bist.

## Aufhören
1. App vom Home-Bildschirm löschen.
2. Daten-Repo löschen: GitHub → dein Daten-Repo → **Settings** → ganz unten **Delete this repository**.
3. Token löschen: GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens**.
4. Google-Zugriff entfernen: https://myaccount.google.com → **Sicherheit** → Zugriff durch Drittanbieter → SecondBrain
   entfernen.
5. Falls angelegt: die Routine auf https://claude.ai/code löschen.
