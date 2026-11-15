# 81 – Updates in der App erkennen und laden

## Ziel
Eine neue Version auf `stable` erreicht alle Nutzer ohne Neuinstallation, auch in der installierten iPhone-App
(SPEC §6.8). Die App erkennt neue Versionen beim Start und bei der Rückkehr, lädt sofort neu, wenn nichts
ungespeichert ist, und zeigt sonst einen Hinweis. Nie Neuladen mitten in einer Eingabe (Aufgabe 69 bleibt gewahrt).

## Bereich
- `src/main.tsx`, `src/lib/serviceWorkerLog.ts` (+ Test), `vite.config.ts` (Erzeugen von `version.json`)
- neu `src/lib/appUpdate.ts` (+ Test): Erkennung, Entscheidung „sofort / Hinweis“
- neu `src/lib/unsavedWork.ts` (+ Test): kleines Register „gerade ungespeichert“ (Schlüssel → boolean, abonnierbar)
- Anmelden am Register: `src/pages/capture/CapturePage.tsx`/`draft.ts` (Text im Feld, Spracherkennung läuft),
  `src/components/Dialog.tsx` (Dialog offen), Ziehen von Terminen (`src/pages/calendar/` – nur das An-/Abmelden)
- neu `src/components/UpdateBanner.tsx` (+ CSS, Test), Einbau in `src/App.tsx`
- `src/pages/settings/InfoSection.tsx` (Version + Build-Stempel), `package.json` (`version` → `0.8.0`)
- **Tabu:** `src/data/**` (parallel in 78), `src/pages/settings/SettingsPage.tsx` (parallel in 85), Testsätze (80).

## Vorgaben
- `version.json` im Build-Ausgabeordner: `{ "version": "<package.json>", "build": "<__BUILD_STAMP__>" }`, gleicher
  Stempel wie im Code. Nicht in den Precache des Service Workers; Abruf mit `cache: 'no-store'`.
- Prüfung bei: App-Start (nach dem ersten Rendern) und `visibilitychange` → sichtbar (höchstens alle 60 s). Jede
  Prüfung: `registration.update()` und `version.json` abrufen. Offline/Fehler ⇒ still ignorieren (nur Diagnose-Eintrag
  höchstens einmal je Start).
- „Neue Version“ = `build` aus `version.json` ≠ eigener Stempel **oder** wartender/neu aktivierter Service Worker.
- **Nichts ungespeichert** (Register leer) ⇒ sofort neu laden (bei vorhandenem wartendem SW: aktivieren, dann neu laden;
  sonst `location.reload()`). Sonst Hinweis-Leiste „Neue Version – jetzt laden“ (Knopf, `aria-label`, Tastatur,
  nicht über der Punkte-Leiste/Safe Area, dunkles Thema). Wird das Register leer, während der Hinweis steht, und die
  App kehrt danach aus dem Hintergrund zurück ⇒ automatisch neu laden. Nie neu laden, solange etwas ungespeichert ist.
- Endlosschleifen verhindern: Nach einem Neuladen wegen Version X höchstens ein weiterer Versuch für dieselbe Version
  innerhalb von 5 Min. (z. B. CDN liefert noch alte Dateien) – danach nur der Hinweis.
- Bestehendes `reloadWhenHidden` wird durch die neue Logik ersetzt bzw. darin aufgenommen; Diagnose-Einträge
  („Anzeige“: Version erkannt, Neuladen, Hinweis gezeigt) bleiben.
- Die Outbox liegt in IndexedDB; vor dem Neuladen nichts weiter nötig.
- Version in Einstellungen/Info: „0.8.0 · Build <Datum, Commit>“.

## Abnahmekriterien
1. `version.json` liegt nach `npm run build` in `dist/`, enthält Version und denselben Stempel wie der Code, und ist
   nicht im Precache-Manifest. (Test oder Build-Prüfskript)
2. Neue Version + Register leer ⇒ Neuladen; neue Version + Erfassungsfeld mit Text ⇒ Hinweis, kein Neuladen. (Unit-Test
   der Entscheidungsfunktion + Komponententest)
3. Offener Dialog, laufende Spracherkennung und Ziehen eines Termins melden sich am Register an und ab. (Tests)
4. Prüfung beim Start und bei Rückkehr in die App, gedrosselt auf 60 s; offline kein Fehlerdialog. (Test mit Fake-Timern)
5. Schleifenschutz: zweimaliges Erkennen derselben Version nach Neuladen innerhalb 5 Min. ⇒ kein drittes Neuladen. (Test)
6. Hinweis-Leiste: Knopf lädt neu, per Tastatur bedienbar, `aria-label` vorhanden. (Test)
7. Einstellungen/Info zeigt Version 0.8.0 und Build-Stempel. (Test)
8. `npm run lint`, `npm test`, `npm run build` grün.
9. Manuell (Projektleiter/Nutzer, nach Deployment auf die Vorschau): iPhone-App offen lassen, neue Fassung auf `main`
   veröffentlichen, App in den Hintergrund und zurück ⇒ lädt neu bzw. zeigt Hinweis bei Text im Erfassungsfeld.
