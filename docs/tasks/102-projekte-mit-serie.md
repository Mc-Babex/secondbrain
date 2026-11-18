# 102 – Projekte mit Serie: keine Warnung, Fortschritt mit geplanten Blättern

## Ziel
Ein Projekt mit aktiver Serie und weiterem Stichtag braucht keinen „nächsten Schritt“; der Fortschritt zählt die
geplanten Serien-Blätter mit (SPEC §3.12 Projekte, §6.3.1 Reiter „Projekte“, §6.3.3).

## Bereich
- `src/lib/gtd.ts` (bzw. dort, wo Warnung und Fortschritt berechnet werden) und `src/lib/series.ts` nur ergänzend
  (z. B. nächster Stichtag nach `lastDate`, Anzahl noch nicht angelegter Stichtage bis zum Ende) + Tests
- `src/components/ProjectCard.tsx`, `src/pages/tasks/projects/ProjectView.tsx`, `src/pages/tasks/useStepCompletion.ts`,
  `src/pages/tasks/CompletionNotices.tsx`, Ablagen-Ansicht nur soweit die Warnung dort berechnet wird (+ Tests)
- **Tabu:** `src/data/**` (außer Lesen), Kalender, `scripts/`.

## Vorgaben
- „Nächster Serientermin“ = erster Stichtag nach `lastDate` (Ausfälle berücksichtigt, Ende beachtet) einer aktiven
  Serie (nicht pausiert, nicht beendet) eines aktiven Projekts; Titel = Muster mit `{Nr}` = `lastNumber + 1`.
  Mehrere Serien ⇒ frühester.
- Ohne offenen Schritt, aber mit nächstem Serientermin: keine Warnung, stattdessen „Nächstes: Übungsblatt 6 ab Mo
  30.11.“ (Karte, Projektansicht, Ablage). Die Projektansicht zeigt das Eingabefeld für einen Schritt trotzdem
  (ohne Warnung).
- Abhaken des letzten offenen Schritts mit nächstem Serientermin ⇒ Meldung „Nächstes: … ab …“ (5 s), kein Dialog.
- Fortschritt y = alle Schritte + noch nicht angelegte Stichtage aktiver Serien mit `count` oder `endDate`; x =
  erledigte. Serie ohne Ende: nur angelegte. Pausierte Serie: nur angelegte (Ende kann sich verschieben).
- Rein berechnet; keine Datenänderung.

## Abnahmekriterien
1. Projekt nur mit Serie (10 Blätter per `count`, 5 angelegt und erledigt) ⇒ Fortschritt 5/10, keine Warnung,
   „Nächstes: Übungsblatt 6 ab …“ (Test).
2. Serie mit `endDate` ⇒ y zählt die Stichtage bis `endDate` ohne Ausfälle (Test).
3. Serie beendet oder letzter Stichtag angelegt ⇒ Warnung wie bisher (Test).
4. Pausierte Serie ⇒ Warnung wie bisher, Fortschritt nur angelegte (Test).
5. Abhaken des letzten offenen Blatts ⇒ Meldung „Nächstes …“, kein Dialog; ohne Serie weiterhin Dialog (Tests).
6. `npm run lint`, `npm test`, `npm run build` grün.
