# 95 – Bearbeiten-Dialog und „In Ablage…“ mit GTD-Feldern

## Ziel
Der Bearbeiten-Dialog (`ItemEditor`) und der Dialog „In Ablage…“ im Eingangskorb können Status, ★ Fokus, „fällig bis“,
kurze Dauern, Projekt und die Warte-auf-Angaben setzen (SPEC §6.3.2, §3.3).

## Bereich
- `src/components/ItemEditor.tsx`, `ItemEditor.module.css`, `ItemEditor.test.tsx`
- neu `src/components/GtdFields.tsx` (+ CSS, Test): gemeinsame Feldgruppe für beide Dialoge
- `src/pages/tasks/InboxSection.tsx` (nur der „In Ablage…“-Dialog) + Test (neu oder bestehender)
- **Tabu:** `src/data/**` (nur benutzen; fehlt eine Funktion, in der Zusammenfassung melden statt selbst bauen),
  `src/lib/gtd.ts` (nur benutzen), übrige `src/pages/**`, `scripts/`.

## Vorgaben
- Felder nur bei `type: "aufgabe"` sichtbar; Wechsel der Art auf Notiz/Termin blendet sie aus und speichert sie nicht.
- **Status** als Segment-Auswahl: Nächster Schritt · Warte auf · Irgendwann. Hat die Aufgabe `schedule`, darüber der
  Hinweis „Eingeplant: <Datum, Zeit> – Status Termin“ (Status-Auswahl bleibt für die Zeit danach änderbar).
- **★ Fokus** ersetzt „wichtig“ (gleiches Feld `important`), als Umschalter mit Stern, `aria-pressed`.
- **fällig bis**: Datumsfeld + „entfernen“.
- **Dauer**: Auswahl leer, 2, 5, 10, 15, 30, 45, 60, 90, 120, 180, 240 Min.; abweichender Bestandswert bleibt wählbar.
  Bei ≤ 2 Hinweis „⚡ 2-Minuten-Regel: gleich erledigen“.
- **Projekt**: Auswahl „kein Projekt“ + aktive Projekte der gewählten Ablage (`useProjects`). Ablage gewechselt und
  Projekt passt nicht mehr ⇒ „kein Projekt“. Neue Zuordnung ⇒ hinten anhängen (Repository-Funktion aus 90).
- **Warte auf** (nur bei diesem Status): Person/Was (Text), seit (Datum, Vorgabe heute), nachhaken am (Datum,
  optional).
- „In Ablage…“: dieselbe Feldgruppe; Vorgabe Status Nächster Schritt, nichts sonst vorbelegt.
- Dialog öffnet weiter ohne Fokus in einem Eingabefeld (§5). Tippflächen ≥ 44 px, iPhone-Breite ohne waagerechtes
  Scrollen, Labels für alle Felder.
- **Farben:** die Variablen `--status-*` aus `src/styles/theme.css` (vorhanden, nicht ändern). Gestaltung schlicht, passend zum bestehenden Dialog (frontend-design:
  eine Farbe je Status, sonst ruhig).

## Abnahmekriterien
1. Aufgabe bearbeiten: Status, Fokus, fällig bis, Dauer 2 Min., Projekt und Warte-auf-Felder werden gespeichert
   und beim erneuten Öffnen angezeigt (Test).
2. Wechsel weg von „Warte auf“ speichert `waiting: null` (Test).
3. Ablagenwechsel setzt unpassendes Projekt auf „kein Projekt“ (Test).
4. Notiz/Termin zeigen keine GTD-Felder und speichern keine (Test).
5. Eingeplante Aufgabe zeigt den Termin-Hinweis (Test).
6. „In Ablage…“ legt eine Aufgabe mit gewähltem Status/Projekt/Feldern an (Test).
7. Bestehende Funktionen des Editors (Termin ändern, löschen mit Google-Termin, Serien-Hinweis) unverändert
   (bestehende Tests grün).
8. Manuell: Dialog auf iPhone-Breite (375 px) ohne waagerechtes Scrollen, Tastatur verdeckt kein aktives Feld.
9. `npm run lint`, `npm test`, `npm run build` grün.
