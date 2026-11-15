# 83 – Sortieren mit Claude optional (`autoSort`)

## Ziel
Wer keinen Claude-Lauf eingerichtet hat, sieht beim Sortieren keinen Fehler, sondern einen ruhigen Hinweis
(SPEC §3.6, §3.10, §6.3 „Ohne Claude“, §6.5 „Automatisches Sortieren“). Bestehende Daten-Repos ohne `autoSort`
verhalten sich unverändert (fehlt ⇒ `true`).

## Bereich
- `src/data/types.ts` (`Settings.autoSort?`, `TriggerResult` um `'nicht-eingerichtet'`, Type Guards) + Tests
- `src/lib/sortLock.ts` (Meldung je Ergebnis) + Test
- `src/data/sortTrigger.ts` (+ Test): Prüfung von `autoSort` vor allem anderen
- `src/pages/tasks/SortButton.tsx` (+ CSS, Test): Hinweis ohne Fehlerton, Link „Einstellungen“
- neu `src/pages/settings/AutoSortSection.tsx` (+ Test), Einbau in `SettingsPage.tsx`
- `src/App.tsx` nur für den Weg „Einstellungen öffnen“ aus dem Hinweis (z. B. kleiner Kontext oder Callback);
  keine anderen Änderungen dort
- neu `src/lib/links.ts`: gemeinsame Links (siehe unten); `src/lib/feedback.ts` darf `CODE_REPO` von dort beziehen
- **Tabu:** `SetupSection.tsx`, `SetupGithubStep.tsx`, `setupState.ts` (folgt in 82), `scripts/`, `.github/`,
  `vorlage/`, `docs/` außer dieser Aufgabe.

## Vorgaben
- `autoSort` lesen: `settings.autoSort !== false` ⇒ eingeschaltet. Unbekannte Felder in `settings.json` bleiben beim
  Speichern erhalten (prüfen, dass `PlanningSection` und der Sync `autoSort` nicht verlieren – Test).
- **Ohne Claude** (`autoSort === false`): „Jetzt sortieren“ startet nichts – **kein** Sync, **kein** Dispatch, kein
  GitHub-Aufruf, auch offline und ohne Token. Meldung exakt laut SPEC §6.3:
  „Automatisches Sortieren ist nicht eingerichtet. Einträge über ‚In Ablage…‘ einsortieren oder in den Einstellungen
  einrichten.“ Darstellung als Hinweis (nicht als Fehler, keine rote Farbe), das Wort bzw. ein Link „Einstellungen“
  öffnet die Einstellungen. Der Knopf bleibt danach wieder bedienbar.
- **Antwort `nicht-eingerichtet`** von der Action (§3.10): dieselbe Meldung, Knopf wieder frei, keine Sperre,
  kein Fehlereintrag im Fehlerprotokoll.
- **Einstellungen, Abschnitt „Automatisches Sortieren“** (§6.5), zwischen Google und Info: Schalter „Mit Claude
  sortieren“ (zugänglich: echtes Checkbox/Switch-Element mit Beschriftung), speichert `autoSort` in `settings.json`
  (lokal + Outbox wie die übrigen Einstellungen). Darunter:
  - an: „Claude sortiert den Eingangskorb über deine eigene Routine.“ + Link „Anleitung“
  - aus: „Einträge sortierst du selbst über ‚In Ablage…‘ im Eingangskorb.“ + Link „Anleitung zum Einrichten“
  - Link-Ziel: `TESTER_GUIDE_URL` (Abschnitt Claude); öffnet in neuem Tab (`noopener`).
- `src/lib/links.ts` exportiert: `CODE_REPO = 'Mc-Babex/secondbrain'`,
  `TESTER_GUIDE_URL = 'https://github.com/Mc-Babex/secondbrain/blob/stable/docs/TESTER-ANLEITUNG.md'`,
  `TEMPLATE_REPO_URL = 'https://github.com/new?template_owner=Mc-Babex&template_name=secondbrain-vorlage'`,
  `TOKEN_URL` = `https://github.com/settings/personal-access-tokens/new?name=SecondBrain&description=SecondBrain-App&expires_in=335&contents=write`
  (82 verwendet die letzten beiden). Keine Geheimnisse, keine Nutzerdaten in Links.
- Fehlt `settings.json` noch (frisches Gerät ohne Sync), gilt `autoSort` als `true` (bestehendes Verhalten).

## Abnahmekriterien
1. Type Guard: `settings.json` mit `autoSort: false`, `true`, ohne Feld wird akzeptiert; anderer Typ wird abgelehnt
   oder als „fehlt“ behandelt (klar begründet); `TriggerAnswer` mit `result: "nicht-eingerichtet"` wird akzeptiert (Tests).
2. `autoSort: false` ⇒ `start()` ruft weder `syncNow` noch `dispatchSort` noch `fetch` auf, Meldung exakt laut SPEC,
   Phase danach `idle` – auch offline und ohne Token (Test).
3. Antwort `nicht-eingerichtet` ⇒ gleiche Meldung, Phase `idle`, kein `logError` (Test).
4. `autoSort` fehlt oder `true` ⇒ bisheriges Verhalten unverändert (bestehende Tests grün).
5. SortButton: Hinweis als `role="status"` ohne Fehlerstil; „Einstellungen“ öffnet die Einstellungsseite (Test).
6. Einstellungen: Schalter zeigt den gespeicherten Wert (fehlt ⇒ an), Umschalten speichert `autoSort` und erhält
   Planungsfenster/Pause/unbekannte Felder; Texte und Link je Zustand (Test).
7. Speichern im Planungsfenster-Abschnitt erhält `autoSort` (Test).
8. `npm run lint`, `npm test`, `npm run build` grün.
9. Manuell (Nutzer): eigene App – Schalter steht auf „an“, „Jetzt sortieren“ startet wie bisher; Schalter aus ⇒
   Hinweis statt Start; wieder an ⇒ Start funktioniert.
