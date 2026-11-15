# Umstellung auf das öffentliche Repo (Phase 8, einmalig)

Für den Entwickler. Reihenfolge einhalten; nach jedem Block dem Projektleiter (Claude) Bescheid geben.
Platzhalter: `<projekt>` = Name des neuen Cloudflare-Projekts.

## Block 1 – Konto absichern und altes Repo umbenennen
1. GitHub → Profilbild → **Settings → Password and authentication**: Zwei-Faktor-Anmeldung ist an (sonst einschalten).
2. **Settings → Emails**: „Keep my email addresses private“ ✔ und „Block command line pushes that expose my email“ ✔.
3. Bisheriges privates Repo `secondbrain` → **Settings → General → Repository name** → `secondbrain-archiv` →
   **Rename**. Es bleibt privat. Die alte App-Adresse und deine Routine laufen unverändert weiter.
4. Neues Repo: https://github.com/new → Owner `Mc-Babex`, Name `secondbrain`, **Public**, **kein** README, keine
   .gitignore, keine Lizenz → **Create repository**.

→ Bescheid geben. Claude schiebt den Start-Commit nach `main` und `stable`.

## Block 2 – Einstellungen des öffentlichen Repos
1. **Settings → General**
   - **Default branch**: Stift-Symbol → `stable` → Update.
   - **Features**: Issues ✔; Wikis, Projects, Discussions aus.
2. **Issues → Labels → New label**: `fehler` (rot) und `wunsch` (blau). Die übrigen Standard-Labels dürfen bleiben.
3. **Settings → Rules → Rulesets → New ruleset → New branch ruleset**
   - Name `Schutz`, Enforcement status **Active**.
   - Target branches → **Add target**: „Include default branch“ und „Include by pattern“ `main`.
   - Rules: **Restrict deletions** ✔, **Block force pushes** ✔. Sonst nichts (kein Pull-Request-Zwang, Claude pusht
     direkt) → **Create**.
4. **Settings → Actions → General**
   - „Approval for running fork pull request workflows from contributors“: **Require approval for all external
     contributors**.
   - „Workflow permissions“: **Read repository contents and packages permissions**; „Allow GitHub Actions to create
     and approve pull requests“ **aus** → Save.
5. **Settings → Advanced Security** (bzw. „Code security“): **Secret Protection** und **Push protection** einschalten
   (für öffentliche Repos kostenlos).
6. **Actions**: Der Lauf „CI“ für `stable` und `main` ist grün.

## Block 3 – Vorlage für Daten-Repos
1. https://github.com/new → Name `secondbrain-vorlage`, **Public**, leer → Create.
→ Bescheid geben. Claude schiebt den Inhalt von `vorlage/daten-repo/` hinein.
2. Danach im Repo **Settings → General**: **Template repository** ✔.

## Block 4 – Neues Cloudflare-Projekt
1. Altes Projekt öffnen → **Settings → Variables and Secrets**: Werte von `VITE_GOOGLE_CLIENT_ID` und `NODE_VERSION`
   notieren (das alte Projekt bleibt unverändert).
2. **Workers & Pages → Create → Pages → Connect to Git** → bei GitHub **Manage** → in der Cloudflare-App unter
   „Repository access“ zusätzlich `secondbrain` auswählen (`secondbrain-archiv` **drin lassen**) → Save.
3. Repo `secondbrain` wählen → **Begin setup**:
   - Project name: frei, z. B. `secondbrain-app` → Adresse wird `<projekt>.pages.dev`.
   - Production branch: **stable**.
   - Framework preset: None; Build command `npm run build`; Build output directory `dist`.
   - Environment variables: `VITE_GOOGLE_CLIENT_ID` (Wert von oben), `NODE_VERSION` = `24`.
   → **Save and Deploy**. Der erste Build muss grün sein.
4. Projekt → **Settings → Variables and Secrets**: dieselben zwei Variablen auch für **Preview** anlegen.
5. **Settings → Builds → Branch control**: Production branch `stable`; Preview branches **Custom branches** →
   Include `main` → Save.
6. Optional, empfohlen: **Settings → General → Access policy** (bzw. „Enable access policy“ für Preview
   deployments) einschalten – dann ist die Vorschau `main.<projekt>.pages.dev` nur nach Anmeldung mit deiner
   E-Mail erreichbar.

→ Bescheid geben mit `<projekt>`. Claude pusht `main`, damit die Vorschau entsteht.

## Block 5 – Google
1. https://console.cloud.google.com → dein Projekt → **APIs & Services → Credentials** → OAuth-Client (Web) →
   **Authorized JavaScript origins**: `https://<projekt>.pages.dev` und `https://main.<projekt>.pages.dev` hinzufügen.
   Die alte Adresse **noch drin lassen** → Save. (Kann einige Minuten dauern.)
2. **Google Auth Platform → Audience → Test users**: deine eigene Adresse muss drinstehen.

## Block 6 – Deine Geräte umziehen
1. **Alte App** auf jedem Gerät öffnen: Einstellungen → Info zeigt „synchron“ und 0 ausstehende Änderungen.
   Erst dann weiter (sonst gehen nicht hochgeladene Änderungen verloren).
2. Neue Adresse `https://<projekt>.pages.dev` öffnen (Desktop: Edge → als App installieren; iPhone: Safari →
   Teilen → Zum Home-Bildschirm). Ersteinrichtung: Daten-Repo `…/secondbrain-daten` mit neuem Token (Link in der
   App), Google verbinden, „Ich richte Claude ein“.
3. Prüfen: Einträge, Ablagen, Termine sind da. Dann alte App-Symbole löschen.

## Block 7 – Deine Routine
1. claude.ai/code → deine Routine → Bearbeiten → **Repositories**: `Mc-Babex/secondbrain` (öffentlich) an erster
   Stelle, danach dein Daten-Repo; `secondbrain-archiv` entfernen, falls es dort steht.
2. Prompt und Setup-Skript wie in `docs/ROUTINE-PROMPT.md` (Branch `stable`).
3. GitHub → Settings → Applications → Claude → Configure: Zugriff nur auf dein Daten-Repo (das öffentliche Repo
   braucht keinen; `secondbrain-archiv` darf raus).
4. Test: neue App → Eingangskorb → „Jetzt sortieren“ → „Sortierung gestartet“, kurz danach einsortiert.

## Block 8 – Später aufräumen (nach ein paar Tagen ohne Probleme)
- Altes Cloudflare-Projekt löschen, alte Adresse aus den Google-Ursprüngen entfernen.
- Optional: dein Daten-Repo auf den gemeinsamen Workflow umstellen (Claude macht das auf Wunsch: Workflow-Aufruf
  aus der Vorlage, `secondbrain.json`, alte Kopie des Skripts entfernen).
