# 94 – Reiter „Projekte“, Projektansicht, Serien-Dialog, Abhaken-Hinweis

## Ziel
Projekte sind in der App vollständig bedienbar: Liste im Reiter „Projekte“, Projektansicht mit Schritten,
Reihenfolge, Serien und Abschließen; nach dem Abhaken eines Schritts der Hinweis auf den nächsten Schritt
(SPEC §6.3.1 „Projekte“, §6.3.3, §3.12).

## Bereich
- neu `src/pages/tasks/projects/` (z. B. `ProjectsTab.tsx`, `ProjectView.tsx`, `ProjectFormDialog.tsx`,
  `SeriesDialog.tsx`, `NextStepDialog.tsx`, + CSS + Tests); Einbau in die Reiter-Leiste
- neu `src/pages/tasks/useStepCompletion.ts` (+ Test): Erledigen mit Hinweis „Weiter mit …“ bzw. Dialog „Was ist der
  nächste Schritt?“ – benutzt in `TasksPage`, `ProjectView` und `src/pages/categories/NormalCategoryView.tsx`
- `src/pages/categories/CategoriesPage.tsx` / `CategoryView.tsx` / `NormalCategoryView.tsx`: nur die Verdrahtung
  `onOpenProject` (aus 96) und der Abhaken-Hinweis
- `src/pages/tasks/TasksPage.tsx` nur für Einbau und Abhaken-Hinweis
- **Tabu:** `src/data/**`, `src/lib/gtd.ts`, `src/lib/series.ts` (nur benutzen; fehlt etwas, melden),
  `src/components/ItemEditor*`, `scripts/`.

## Vorgaben
- **Reiter „Projekte“:** aktive Projekte nach Ablage gruppiert, je `ProjectCard` (aus 96); Knopf „Neues Projekt“
  (Titel Pflicht, Ablage Pflicht – keine Einkauf/Archiv, Notiz optional; Dialog zum Neu-Anlegen setzt Fokus ins erste
  Feld §5).
- **Projektansicht** als eigene Ansicht mit Zurück-Pfeil (wie eine geöffnete Ablage; Wischen/Pfeiltasten der Seiten
  verhalten sich wie dort). Von Seite 4 aus öffnet sie sich in der Ablagen-Seite, vom Reiter aus in der Aufgabenseite.
  Inhalt exakt laut §6.3.3: Kopf, Schritte mit ↑ ↓ (Knöpfe mit `aria-label` „Nach oben“/„Nach unten“, erster/letzter
  ohne Wirkung bzw. ausgeblendet), Checkbox, Titel ⇒ ItemEditor, „Schritt hinzufügen“ (Inline-Feld, Enter fügt
  hinzu), erledigte eingeklappt, Warnung mit Eingabefeld, Serien, „Projekt bearbeiten“, „Projekt abschließen“
  (Bestätigung), „Projekt löschen“ nur ohne Schritte.
- **Serien-Dialog:** Felder laut §6.3.3; `{Nr}`-Hinweis am Titelfeld; Ende „Datum“ oder „Anzahl“ (genau eins oder
  keins); Vorschau der nächsten 3 Instanzen (`previewNext`). Prüfungen mit deutschen Meldungen (Titel leer,
  Enddatum vor Start, Anzahl < 1). Pausieren/Fortsetzen und Beenden (Bestätigung) in der Serienzeile.
- **Abhaken-Hinweis** laut §6.3.3 überall, wo ein Projekt-Schritt erledigt wird (Aufgabenseite alle Reiter,
  Projektansicht, Ablage). Der Dialog „Was ist der nächste Schritt?“: Eingabefeld mit Fokus, „Hinzufügen“, „Später“,
  „Projekt abschließen“. Rückgängig des Erledigens bleibt möglich.
- Gestaltung: Fortschrittsbalken ruhig in `--status-next`, Warnung in `--color-danger` mit ⚠ und Text. Tippflächen
  ≥ 44 px, 360 px ohne waagerechtes Scrollen.

## Abnahmekriterien
1. Neues Projekt anlegen, bearbeiten, löschen (nur ohne Schritte) (Tests).
2. Schritte hinzufügen, ↑/↓ ändern die Reihenfolge, nächster Schritt in Karte und Reiter „Aktuell“ folgt (Tests).
3. Projekt ohne offenen Schritt zeigt die Warnung in Reiter, Ansicht und Ablage (Test).
4. Abhaken mit weiterem offenen Schritt ⇒ „Weiter mit: <Titel>“; ohne ⇒ Dialog mit den drei Wegen (Tests).
5. Projekt abschließen ⇒ verschwindet aus dem Reiter, steht in Erledigt (Test).
6. Serie „Übungsblatt {Nr}“, wöchentlich Mo, fällig Fr, Ende 12.02.2027 anlegen ⇒ gespeichert laut §3.12, Vorschau
   zeigt die nächsten 3 Termine; Pausieren/Fortsetzen/Beenden ändern `state` (Tests).
7. Projektansicht von Seite 4 aus öffnen und zurück (Test).
8. Manuell: iPhone und Desktop – Projektansicht, Serien-Dialog mit Tastatur, kein Konflikt mit dem Seiten-Wischen.
9. `npm run lint`, `npm test`, `npm run build` grün.
