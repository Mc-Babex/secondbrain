# 85 – Feedback senden und Issue-Vorlagen

## Ziel
Tester können aus den Einstellungen ein vorausgefülltes GitHub-Issue im öffentlichen Code-Repo öffnen (SPEC §6.5
„Feedback senden“) – mit technischen Angaben, aber **ohne** persönliche Inhalte, Daten oder Tokens.

## Bereich
- neu `src/lib/feedback.ts` (+ Test): baut die Issue-URL (reine Funktion)
- neu `src/pages/settings/FeedbackSection.tsx` (+ Test), Einbau in `src/pages/settings/SettingsPage.tsx`
- neu `.github/ISSUE_TEMPLATE/fehler.yml`, `.github/ISSUE_TEMPLATE/wunsch.yml`, `.github/ISSUE_TEMPLATE/config.yml`
- Lesen (nicht ändern) erlaubt: `src/lib/platform.ts`, `src/lib/diagnostics.ts` (Gerät/Browser/Anzeigemodus)
- **Tabu:** `src/pages/settings/InfoSection.tsx`, `src/main.tsx`, `vite.config.ts`, `package.json` (parallel in 81),
  `src/data/**` (78), Testsätze (80).

## Vorgaben
- Code-Repo als **eine** Konstante (z. B. `CODE_REPO = 'Mc-Babex/secondbrain'` in `src/lib/feedback.ts`).
- URL: `https://github.com/<CODE_REPO>/issues/new?template=<fehler|wunsch>.yml&<feld-id>=<wert>…`; Werte mit
  `encodeURIComponent`. Vorausgefüllt **nur**: App-Version, Build-Stempel, Gerät/Browser (wie Diagnose, ohne
  Bildschirm-Inhalte), iOS-Version (falls erkennbar, sonst „–“), Anzeigemodus (Browser/installiert).
  **Nie**: Repo-Name, Kontoname, Google-Konto, Einträge, Ablagen, Fehlertexte, Diagnoseliste, Tokens.
- Abschnitt „Feedback“ in den Einstellungen: zwei Knöpfe „Fehler melden“ und „Wunsch äußern“, darüber der Hinweis
  „Öffnet GitHub im Browser. Issues sind öffentlich sichtbar – bitte keine persönlichen Daten hineinschreiben.“
  Öffnen per `window.open(url, '_blank', 'noopener')` bzw. Link mit `target="_blank" rel="noopener"` (iPhone: öffnet
  Safari). Funktioniert ohne GitHub-Token und offline (dann öffnet der Browser eben die Seite später/zeigt Fehler).
- Issue-Formulare (deutsch): **Fehler**: Was ist passiert (Pflicht), Was hast du erwartet, Schritte, Version, Build,
  Gerät, iOS-Version, Anzeigemodus (die letzten fünf mit `id`, die zur URL passen). **Wunsch**: Was wünschst du dir
  (Pflicht), Wofür, Version. Jeweils oben ein Markdown-Hinweis: keine persönlichen Daten, keine Tokens, keine
  Screenshots mit privaten Inhalten. Labels `fehler` bzw. `wunsch`. `config.yml`: `blank_issues_enabled: false`.

## Abnahmekriterien
1. `buildFeedbackUrl('fehler', info)` ergibt die erwartete URL mit genau den erlaubten Parametern, korrekt kodiert.
   (Unit-Test)
2. Test: Selbst wenn Repo, Token, Google-Konto und Einträge gespeichert sind, enthält die URL keinen dieser Werte
   (Token-Muster, Repo-Name, Kontoname, Eintragstitel).
3. Die `id`s in `fehler.yml`/`wunsch.yml` stimmen mit den URL-Parametern überein (Test liest die YAML-Dateien als Text
   und prüft die IDs).
4. Einstellungen zeigen den Abschnitt mit Hinweis und zwei Knöpfen; Klick öffnet die richtige URL in neuem Fenster.
   (Komponententest, `window.open` gemockt)
5. `npm run lint`, `npm test`, `npm run build` grün.
6. Manuell (nach Veröffentlichung des öffentlichen Repos, in 88): Knopf auf dem iPhone öffnet das vorausgefüllte
   Formular in Safari.
