# 98 – Testsätze Phase 9 und Trockenlauf

## Ziel
Etwa 10 neue, neutrale Testsätze prüfen die neuen Sortierregeln (SPEC §8.3/§8.4 Phase 9); der Trockenlauf mit allen
Testsätzen (alt + neu) besteht.

## Bereich
- neu `docs/sortier-tests-3.md` (Format wie `docs/sortier-tests-2.md`)
- `scripts/lauf/sortierFixtures.ts`, `testdaten.ts`, `testspec.ts`, `vergleich.ts` (+ Tests) – nur soweit für die neuen
  Felder (`gtd`, `dueDate`, `waiting`, `projectId`, `plan`, neue Projekte) und ein Beispielprojekt in den Testdaten nötig
- vorhandene Testsätze in `docs/sortier-tests*.md` nur anpassen, wo sich das erwartete Ergebnis durch Phase 9 ändert
  (z. B. „wichtig“ ⇒ kein Termin mehr); jede Änderung in der Zusammenfassung nennen
- **Tabu:** `src/**`, übrige `scripts/`, `docs/CLAUDE-LAUF.md`, `docs/SPEC.md`.

## Vorgaben
- Neutrale Beispiele, keine persönlichen Daten, keine echten Namen außer Allerweltsvornamen.
- Testdaten enthalten ein aktives Projekt (z. B. „Analysis 1“ in einer Ablage „Studium“ und „Umzug“ in „Privat“).
- Mindestens diese Fälle:
  1. „Warte auf Rückmeldung von Jonas zum Angebot“ ⇒ `warten`, Person Jonas, kein Termin
  2. „Hab die Vermieterin wegen der Heizung gefragt, Freitag nachhaken“ ⇒ `warten`, `followUpOn` Freitag
  3. „Irgendwann mal Spanisch lernen“ ⇒ `irgendwann`
  4. „Vielleicht neues Fahrrad anschauen“ ⇒ `irgendwann` (kein Einkauf)
  5. „Neues Projekt Wohnung renovieren: Wände streichen, Boden neu“ ⇒ neues Projekt mit Originaltext in der Notiz und
     einem ersten nächsten Schritt
  6. „Analysis Übungsblatt Korrektur anschauen“ ⇒ Schritt im bestehenden Projekt Analysis 1
  7. „Umzugskartons besorgen“ ⇒ Schritt im Projekt Umzug (eindeutig) – oder ein zweideutiger Satz, der **kein** Projekt
     bekommt
  8. „Steuererklärung wichtig, bis Freitag“ ⇒ ★ Fokus, `dueDate` Freitag, **kein** Termin
  9. „Plane morgen 2 Stunden für die Hausarbeit ein“ ⇒ Kalenderblock morgen, 120 Min.
  10. „Freitag 15 Uhr Zahnarzt“ ⇒ Termin wie bisher
  11. „Morgen Krankenkasse anrufen“ ⇒ Nächster Schritt, `dueDate` morgen, kein Termin
  12. „Link an Mia schicken“ ⇒ Dauer ≤ 2 (⚡)
- Die erwarteten Ergebnisse in der Form, die `lauf:vergleich` prüfen kann; nicht prüfbare Teile (z. B. Wortlaut des
  vorgeschlagenen ersten Schritts) als „manuell“ kennzeichnen.

## Abnahmekriterien
1. `docs/sortier-tests-3.md` mit ≥ 10 Sätzen und erwarteten Ergebnissen.
2. `npm run lauf:testdaten` erzeugt einen Datenordner mit Projekten und allen Sätzen; Vergleich kennt die neuen Felder
   (Tests).
3. Angepasste alte Testsätze sind einzeln begründet.
4. `npm run lint`, `npm test`, `npm run build` grün.
(Den Trockenlauf selbst führt der Projektleiter danach aus.)
