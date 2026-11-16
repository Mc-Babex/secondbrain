# 96 – Seite 4: Projekte und Status-Kennzeichen in den Ablagen

## Ziel
Eine geöffnete Ablage zeigt oben ihre Projekte und darunter die Aufgaben mit Status-Kennzeichen; „Erledigt“ zeigt
abgeschlossene Projekte mit Wiederherstellen (SPEC §6.4 Phase 9, §3.12).

## Bereich
- `src/pages/categories/NormalCategoryView.tsx` (+ CSS, Test), `ArchiveView.tsx` (+ CSS, Test)
- `src/lib/categoryView.ts` (+ Test) – reine Hilfsfunktionen für die Ansicht
- neu `src/components/StatusBadges.tsx` (+ CSS, Test): Kennzeichen (Status, ★, ⚡, fällig) – wird in 92–94
  wiederverwendet; Farben aus den vorhandenen Variablen `--status-*` in `src/styles/theme.css` (nicht ändern)
- neu `src/components/ProjectCard.tsx` (+ CSS, Test): Projekt mit Titel, Fortschritt x/y (Balken), nächster Schritt
  oder Warnung – wird im Reiter „Projekte“ (94) wiederverwendet; Antippen ruft `onOpen(project)` auf
- **Tabu:** `src/data/**`, `src/lib/gtd.ts` (nur benutzen), `src/pages/tasks/**`, `src/components/ItemEditor*`,
  `scripts/`.

## Vorgaben
- Projekte der Ablage: aktive, nach Titel. Antippen öffnet die Projektansicht. Da die Projektansicht erst in 94 entsteht,
  bekommt `NormalCategoryView` eine Eigenschaft `onOpenProject?: (id: string) => void`; ohne sie ist die Karte nicht
  antippbar. (94 verdrahtet sie.)
- Aufgaben mit `projectId` erscheinen nicht noch einmal in der Liste der Ablage.
- Kennzeichen: Nächster Schritt, Termin (mit Datum/Zeit), Warte auf (Person), Irgendwann, ★, ⚡, „fällig <Tag>“
  (überfällig in Warnfarbe). Text statt nur Farbe/Symbol (Barrierefreiheit), z. B. `aria-label`.
- **Erledigt:** oben Abschnitt „Projekte“ (abgeschlossene, neueste zuerst, mit Abschlussdatum) mit Wiederherstellen;
  mitarchivierte Schritte (`archivedWithProject`) stehen eingerückt unter ihrem Projekt, nicht noch einmal einzeln.
- Figur, Ring und Einkaufsliste bleiben unverändert.

## Abnahmekriterien
1. Ablage mit 2 aktiven Projekten, 1 erledigten Projekt und Aufgaben in allen Status: Projekte oben mit x/y und
   nächstem Schritt bzw. Warnung „⚠ Nächsten Schritt festlegen“; Projekt-Schritte nicht doppelt; Kennzeichen korrekt
   (Tests).
2. Erledigt zeigt das abgeschlossene Projekt mit seinen Schritten; Wiederherstellen ruft die Repository-Funktion aus 90
   auf und das Projekt verschwindet aus Erledigt (Test).
3. `StatusBadges` und `ProjectCard` mit eigenen Tests (alle Status, ⚡, fällig/überfällig, Warnung).
4. Suche findet weiter Titel und Notizen (bestehende Tests grün).
5. Manuell: iPhone-Breite ohne waagerechtes Scrollen.
6. `npm run lint`, `npm test`, `npm run build` grün.
