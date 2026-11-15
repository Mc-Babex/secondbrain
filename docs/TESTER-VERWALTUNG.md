# SecondBrain – Tester verwalten (Entwickler)

Jeder Tester hat sein eigenes Daten-Repo und seine eigene Claude-Routine. Der Entwickler hat **keinen Zugriff** auf
Daten-Repos oder Kalender der Tester und braucht keinen (SPEC §1.1).

## Tester aufnehmen
1. Google-Cloud-Konsole → Projekt der App → **Google Auth Platform** (bzw. OAuth-Zustimmungsbildschirm) →
   **Zielgruppe (Audience)** → **Testnutzer** → **Nutzer hinzufügen** → Google-Adresse des Testers eintragen →
   Speichern. Höchstens 100 Testnutzer.
2. Dem Tester schreiben (Textvorlage zum Kopieren; `<app-adresse>` ersetzen):

```
Hallo, du bist als Tester für SecondBrain eingetragen.
App-Adresse: https://<app-adresse>   (bitte in Safari auf dem iPhone öffnen)
Anleitung: https://github.com/Mc-Babex/secondbrain/blob/stable/docs/TESTER-ANLEITUNG.md
Die Einrichtung dauert ca. 20 Minuten. Deine Daten liegen in deinem eigenen privaten GitHub-Repo,
ich sehe sie nicht. Bei Fragen melde dich einfach.
```

## Tester entfernen
- Google-Cloud-Konsole → Zielgruppe → Testnutzer → Adresse entfernen. Danach kann sich der Tester nicht mehr mit
  Google verbinden.
- Der Tester löscht seine Daten selbst (Abschnitt „Aufhören“ der Tester-Anleitung). Der Entwickler hat keinen Zugriff
  auf Daten-Repos der Tester und löscht dort nichts.

## Feedback bearbeiten
- Meldungen kommen als Issues im Code-Repo, mit den Labels `fehler` bzw. `wunsch`.
- Issues sind öffentlich: auf persönliche Daten prüfen und gegebenenfalls bearbeiten oder löschen.

## Updates veröffentlichen
Ausführlich in `CLAUDE.md`, Abschnitt „Kanäle und Veröffentlichen“. Kurzfassung:
- [ ] Vorschau (`main`) selbst getestet
- [ ] Version in `package.json` (und Lockfile) erhöht
- [ ] `npm run lint`, `npm test`, `npm run build` grün
- [ ] `main` nach `stable` gemergt, `stable` gepusht
- [ ] Produktiv-Adresse zeigt die neue Version
- [ ] Änderungen an Workflow, `scripts/action`, `scripts/lauf` oder `docs/CLAUDE-LAUF.md` besonders geprüft (wirken für
  alle Tester)

## Formatänderungen
Nur über SPEC §3.11. Tester mit altem Datenformat werden von der App gewarnt.
