# Eigene Instanz betreiben (Entwickler)

Diese Anleitung ist für alle, die SecondBrain selbst hosten: Code-Repo, Hosting, Google-Client-ID und Kanäle.
Tester brauchen sie nicht – für sie gilt `docs/TESTER-ANLEITUNG.md`, die Verwaltung der Tester steht in
`docs/TESTER-VERWALTUNG.md`.

Reihenfolge: **A → B → C → D → E → F**. Was du nirgends eintragen oder weitergeben solltest, steht jeweils in **⚠**.
Platzhalter: `<dein-konto>` (GitHub-Name), `<projekt>` (Name des Cloudflare-Projekts).

---

## A. Code-Repo und Kanäle

1. Auf github.com → **+** → **New repository**: Name `secondbrain`, **Public** (Nutzer laden Workflow und Lauf-Anleitung
   von hier), *ohne* README.
2. Code hochladen (im Projektordner):

```bash
git remote add origin https://github.com/<dein-konto>/secondbrain.git
```

```bash
git push -u origin main
```

3. Zweig `stable` anlegen und pushen, in **Settings → Branches** als **Standardzweig** setzen:

```bash
git push origin main:stable
```

| Zweig | Zweck | Deployment |
|---|---|---|
| `main` | Entwicklung, nur für den Entwickler | Vorschau `main.<projekt>.pages.dev` |
| `stable` | für alle Nutzer, Standardzweig | Produktiv-Adresse `<projekt>.pages.dev` |

Veröffentlichen heißt: `main` nach `stable` übernehmen (Ablauf: `CLAUDE.md`, Abschnitt „Kanäle und Veröffentlichen“).

## B. GitHub-Token für die Daten (fine-grained)

Gilt für dein eigenes Daten-Repo (siehe F.1).

1. Direkt zum Formular: https://github.com/settings/personal-access-tokens/new
2. Name: `SecondBrain App`, Ablauf: z. B. 1 Jahr (Kalender-Erinnerung zum Erneuern setzen).
3. **Repository access:** „Only select repositories“ → nur dein Daten-Repo.
4. **Permissions → Repository permissions → Contents: Read and write.** Sonst nichts.
5. **Generate token** → Token kopieren (wird nur einmal angezeigt).
6. In der App: Zahnrad → GitHub → Repository `<dein-konto>/secondbrain-daten`, Token einfügen →
   **Speichern** → **Verbindung testen**.

⚠ Den Token nur in der App eintragen – nicht in Dateien, Chats oder Mails. Für jedes Gerät einen eigenen Token erstellen.

## C. Google Calendar freischalten (OAuth-Client-ID)

1. https://console.cloud.google.com → **Neues Projekt** → Name `SecondBrain`.
2. **APIs & Dienste → Bibliothek** → „Google Calendar API“ → **Aktivieren**.
3. **Google Auth Platform** (bzw. „OAuth-Zustimmungsbildschirm“) → **Jetzt starten**:
   App-Name `SecondBrain`, Support-E-Mail und Kontaktdaten: deine Adresse, Zielgruppe: **Extern**.
4. **Zielgruppe (Audience) → Testnutzer → Nutzer hinzufügen:** deine Google-Adresse und die deiner Tester
   (siehe `docs/TESTER-VERWALTUNG.md`). Die App bleibt im Testmodus, es ist keine Google-Prüfung nötig.
5. **Datenzugriff (Data access) → Bereiche hinzufügen:** `https://www.googleapis.com/auth/calendar.events`.
6. **Clients → Client erstellen:** Anwendungstyp **Webanwendung**, Name `SecondBrain Web`.
   - **Autorisierte JavaScript-Quellen:**
     - `http://localhost:5173` (Entwicklung)
     - `http://localhost:4173` (Vorschau)
     - `https://<projekt>.pages.dev` (Produktiv, aus Schritt D)
     - `https://main.<projekt>.pages.dev` (Vorschau des Zweigs `main`, aus Schritt D)
   - Weiterleitungs-URIs: **leer lassen**.
   - **Client-ID** kopieren (endet auf `.apps.googleusercontent.com`). Ein Client-Secret wird **nicht** gebraucht.
7. Für lokale Tests: Datei `.env.local` im Projektordner:

```
VITE_GOOGLE_CLIENT_ID=<deine-client-id>
```

Die Client-ID ist kein Geheimnis (sie steht in der ausgelieferten App); `.env.local` kommt trotzdem nicht ins Repo.

## D. Hosting auf Cloudflare Pages

1. https://dash.cloudflare.com → kostenloses Konto anlegen/anmelden.
2. **Workers & Pages → Erstellen**. Achtung: Standardmäßig öffnet sich das **Workers**-Formular. Stattdessen unten auf
   **„Looking to deploy Pages? Get started“** bzw. den Reiter **Pages** klicken → **„Import an existing Git repository“**.
3. GitHub verbinden, Zugriff **nur** auf das Repo `secondbrain` erlauben → auswählen.
4. Build-Einstellungen:
   - Framework-Voreinstellung: **Vite** (oder „Keine“)
   - Build-Befehl: `npm run build`, Ausgabeverzeichnis: `dist`
   - **Produktionszweig: `stable`.** Alle anderen Zweige (auch `main`) werden als Vorschau gebaut.
   - Umgebungsvariablen: `VITE_GOOGLE_CLIENT_ID` = deine Client-ID, `NODE_VERSION` = `24`
     (gilt für Produktion und Vorschau)
5. **Speichern und bereitstellen.** Nach 1–2 Minuten ist die App unter `https://<projekt>.pages.dev` erreichbar,
   die Vorschau von `main` unter `https://main.<projekt>.pages.dev`.
6. Beide Adressen in Schritt C.6 als JavaScript-Quellen eintragen (Google braucht dafür ein paar Minuten).
7. Jeder Push auf `stable` baut die Produktiv-Adresse neu, jeder Push auf `main` die Vorschau.

## E. Als App auf dem Desktop installieren (Edge)

1. Die Adresse in **Microsoft Edge** öffnen.
2. In der Adressleiste auf **„App verfügbar – Installieren“** klicken (oder Menü **…** → **Apps** → **Diese Website
   als App installieren**).
3. Die App startet im eigenen Fenster. Updates kommen automatisch; bei einer neuen Version erscheint
   **Neue Version – jetzt laden**.
4. Zahnrad → GitHub-Token eintragen (Schritt B.6) → Google verbinden.

## F. Daten-Repo und Claude-Lauf

### F.1 Daten-Repo aus der Vorlage
Das Daten-Repo entsteht aus der Vorlage `vorlage/daten-repo/` (Template-Repo `secondbrain-vorlage`):
https://github.com/new?template_owner=Mc-Babex&template_name=secondbrain-vorlage – bei einer eigenen Instanz das eigene
Template-Repo verwenden und die Adressen in `src/lib/links.ts` anpassen. Name z. B. `secondbrain-daten`, **Private**.

Die Vorlage enthält einen kurzen Workflow `.github/workflows/sortieren.yml`, der bei „Jetzt sortieren“ startet und
den **wiederverwendbaren Workflow** `.github/workflows/sortieren.yml@stable` des Code-Repos aufruft. Logik und
Skript kommen damit immer vom Zweig `stable`; im Daten-Repo muss nichts kopiert werden.

### F.2 Routine einrichten
Der Claude-Lauf läuft als **Cloud-Routine** im eigenen Claude-Konto und startet nur auf Knopfdruck. Der Weg: App → GitHub (`repository_dispatch`) → Workflow im Daten-Repo → Routine. Einstellungen
(Prompt, Setup-Skript, Repositories, Connector, Trigger) stehen in `docs/ROUTINE-PROMPT.md`.

1. https://claude.ai/code → Routine anlegen. Repositories: zuerst `<code-repo-besitzer>/secondbrain`, dann dein
   Daten-Repo. Modell Sonnet.
2. Prompt und Setup-Skript aus `docs/ROUTINE-PROMPT.md` übernehmen; Connector nur **Google Calendar**;
   Trigger nur **API**.
3. Claude-GitHub-App (https://github.com/apps/claude) nur für das Daten-Repo erlauben; das öffentliche Code-Repo
   braucht keinen Zugriff.

### F.3 Start-URL und Start-Token als Secrets
1. Beim API-Trigger der Routine die **URL** anzeigen und **Generate token** wählen. Token **sofort** kopieren.
2. Im Daten-Repo: **Settings → Secrets and variables → Actions → New repository secret**:
   `ROUTINE_FIRE_URL` (URL) und `ROUTINE_FIRE_TOKEN` (Token).
3. **Settings → Actions → General**: Actions müssen erlaubt sein (Standard).

⚠ URL und Token nur dort eintragen, nie in Chats, Dateien, Notizen oder Mails. Verloren? **Regenerate** und neu
eintragen.

### F.4 Nutzungsguthaben aus
https://claude.ai/settings/usage → **Zusätzliches Nutzungsguthaben (Extra usage)** muss **aus** sein. Dann kostet der
Lauf nie mehr als das Abo; bei erschöpftem Kontingent meldet die App „Start abgelehnt“.

### F.5 Einschalten und testen
In der App: Einstellungen → „Automatisches Sortieren“ → **Mit Claude sortieren** an; dann im Eingangskorb
**Jetzt sortieren**. Erwartet: „Sortierung gestartet“.

## G. iPhone

1. **Safari** öffnen → Adresse der App. Nur Safari kann auf dem iPhone eine Web-App im Vollbild ablegen.
2. **Teilen** → **Zum Home-Bildschirm** → **Hinzufügen**. Die App ab jetzt vom Home-Bildschirm starten.
3. Die geführte Ersteinrichtung der App durchlaufen (Schritt für Schritt für Tester in `docs/TESTER-ANLEITUNG.md`).
   Eigener Token fürs iPhone, nur Daten-Repo, Contents: Read and write (siehe B). Zeigt GitHub auf dem Handy eine
   abgespeckte Seite, in Safari „aA“ → **Desktop-Website anfordern**.
4. **Mikrofon:** Beim ersten Antippen **Erlauben**. Klappt die Spracheingabe nicht, die Mikrofon-Taste der Tastatur
   nutzen (Einstellungen → Allgemein → Tastatur → **Diktierfunktion aktivieren**).
5. **Daten und Speicher:** Alle Daten liegen im GitHub-Repo. Löscht iOS den App-Speicher, die Einrichtung wiederholen –
   alles kommt zurück. Nur noch nicht hochgeladene Änderungen („Änderungen ausstehend“) können verloren gehen.
6. **Google nach App-Neustart:** Mit einem Tipp neu verbinden; der Google-Zugriff liegt bewusst nur im Speicher.
7. **Bei Problemen:** Zahnrad → **Diagnose** → **Kopieren**. Der Text enthält keine Geheimnisse.
8. **Token verloren oder neues iPhone:** Alten Token bei GitHub löschen (Settings → Developer settings →
   Fine-grained tokens) und einen neuen anlegen.
