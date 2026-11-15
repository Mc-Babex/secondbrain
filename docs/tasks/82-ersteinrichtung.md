# 82 – Geführte Ersteinrichtung beim ersten Start

## Ziel
Ein neuer Tester ohne Vorwissen kommt beim ersten Öffnen Schritt für Schritt zu einer funktionierenden App
(SPEC §6.5 „Ersteinrichtung beim ersten Start“). Geräte mit vorhandener Einrichtung sehen davon nichts.
Baut auf 83 auf (`autoSort`, `src/lib/links.ts`).

## Bereich
- neu `src/pages/welcome/` (Komponenten der Ersteinrichtung + CSS-Modul + Tests)
- neu `src/lib/firstRun.ts` (reine Entscheidung, ob die Ersteinrichtung erscheint) + Test
- `src/App.tsx`: Ersteinrichtung statt der Seiten anzeigen, solange sie läuft
- `src/pages/settings/SetupGithubStep.tsx` (Wiederverwendung im Schritt ②; Token-Link aus `src/lib/links.ts`)
- `src/pages/settings/setupState.ts` (Merker erweitern, falls nötig)
- Lesen/Nutzen: `src/data/localStore.ts`, `src/data/repository.ts` (`saveSettings`), `src/google/`, `googleConnect.ts`
- **Tabu:** `src/data/sync*.ts`, `src/data/sortTrigger.ts`, `scripts/`, `.github/`, `vorlage/`, `docs/` außer dieser Aufgabe.

## Vorgaben
- **Wann:** beim App-Start, wenn auf dem Gerät **weder** Token **noch** Repo gespeichert ist **und** lokal keine
  Einträge (Inbox, Items) vorhanden sind **und** der lokale Merker „Ersteinrichtung abgeschlossen“ fehlt. Während die
  Prüfung läuft, wird nichts Störendes angezeigt (kein Aufblitzen der Ersteinrichtung bei Bestandsgeräten).
  Bestandsgeräte (Token oder Repo oder Einträge vorhanden) setzen den Merker sofort und sehen sie nie.
- **Schritte** (Vollbild, dunkles Thema, „Schritt n von 4“, Zurück-Knopf ab ②):
  1. **Willkommen:** 3–5 kurze Sätze: Gedanken festhalten, in Ablagen sortieren, in den Kalender einplanen. Daten
     liegen in **deinem eigenen privaten GitHub-Repo** und auf diesem Gerät; der Entwickler sieht sie nicht. Knopf
     „Los geht’s“. (Nicht überspringbar.)
  2. **Daten-Repo:** kurze Anleitung in 3 Punkten: (a) Link „Daten-Repo aus Vorlage anlegen“ (`TEMPLATE_REPO_URL`,
     Hinweis: **Private** wählen), (b) Link „Token erstellen“ (`TOKEN_URL`, Hinweis: unter „Repository access“ **nur
     dieses Repo** wählen, Ablauf ist auf 11 Monate gesetzt), (c) Repo + Token eintragen und „Verbindung testen“ –
     dafür `SetupGithubStep` wiederverwenden. Erfolg ⇒ weiter. „Später“ überspringt.
  3. **Google-Kalender:** kurzer Text (wofür, Hinweis „App nicht verifiziert“ ist im Testbetrieb normal, „Erweitert“ →
     „Weiter zu …“), Knopf „Mit Google verbinden“ (bestehender Ablauf). Fehlt `VITE_GOOGLE_CLIENT_ID`, verständlicher
     Hinweis statt Knopf. „Später“ überspringt.
  4. **Automatisch sortieren (optional):** Erklärung: ohne Claude sortierst du selbst über „In Ablage…“; mit eigenem
     Claude-Abo kann Claude stündlich sortieren (Link „Anleitung“ = `TESTER_GUIDE_URL`). Knöpfe
     „Ohne Claude weiter“ (setzt `autoSort: false`) und „Ich richte Claude ein“ (setzt `autoSort: true`). Ist GitHub
     nicht verbunden, wird `autoSort` nur lokal gemerkt bzw. über den normalen Speicherweg (lokal + Outbox) gesichert –
     nie ein Netzzugriff, auf den die UI wartet.
  - Danach: Merker setzen, App normal anzeigen (Seite Erfassen). Nach einer Verbindung mit GitHub wie bisher
    ersten Abgleich anstoßen (bestehende Funktion), Fehler verständlich anzeigen, nicht blockieren.
- **Wichtig zu `autoSort`:** Wählt jemand in ④ etwas, darf ein bereits vorhandenes `settings.json` im verbundenen
  Repo nicht überschrieben werden außer im Feld `autoSort` (übrige und unbekannte Felder erhalten).
- **Token-Sicherheit** wie bisher: Token nie in URL, Log, Fehlermeldung; verdecktes Feld.
- Tastatur: alle Knöpfe/Links erreichbar, Fokus beim Schrittwechsel auf die Überschrift, `aria-label` für Symbolknöpfe.
- Die bisherige geführte Einrichtung in den Einstellungen (Phase 6) bleibt unverändert für alle, die überspringen.
- Neuladen mitten in der Ersteinrichtung (z. B. Update): Ersteinrichtung erscheint erneut bei Schritt ①, bereits
  gespeicherte Angaben (Repo/Token) führen aber dazu, dass sie **nicht** mehr erscheint (Regel oben) – das ist gewollt.
- Unsaved-Work: Eingaben im Repo/Token-Feld gelten über den bestehenden Fokus-Schutz als ungespeichert; zusätzlich
  meldet die Ersteinrichtung sich als ungespeichert, solange Schritt ② mit Eingaben offen ist.

## Abnahmekriterien
1. `firstRun`: erscheint nur ohne Token, ohne Repo, ohne Einträge und ohne Merker; jede einzelne Bedingung verhindert
   sie (Tests).
2. App zeigt bei Bestandsgerät sofort die Seiten, ohne die Ersteinrichtung je zu rendern (Test).
3. Ablauf ①→②→③→④→App, jeder Schritt ab ② mit „Später“ überspringbar; Zurück funktioniert; Merker danach gesetzt (Test).
4. ② verlinkt `TEMPLATE_REPO_URL` und `TOKEN_URL` (mit `expires_in=335`), nutzt `SetupGithubStep`; erfolgreiche
   Verbindung führt zu ③ (Test mit gemocktem `fetch`).
5. ④ „Ohne Claude weiter“ speichert `autoSort: false`, „Ich richte Claude ein“ `true`; vorhandene Felder von
   `settings.json` bleiben erhalten (Test).
6. Kein Token in DOM-Attributen außer dem verdeckten Feld, nicht in Logs (bestehende Regeln; Test).
7. Tastaturbedienung: Fokus auf Überschrift beim Schrittwechsel (Test).
8. `npm run lint`, `npm test`, `npm run build` grün.
9. Manuell (Nutzer, Vorschau/neues Profil): privates Fenster bzw. Safari-Profil ohne Daten zeigt die Ersteinrichtung;
   eigene App zeigt sie nicht.
