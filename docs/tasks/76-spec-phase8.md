# 76 – SPEC Phase 8 (Projektleiter)

Freigegeben vom Nutzer 2026-10-28 (Plan, SPEC-Änderungen und E1–E5 wie empfohlen).

## Entscheidungen
- E1: Lässt sich das Cloudflare-Projekt nicht auf das neue Repo umstellen, neues Projekt mit neuer Adresse; eigene
  Geräte einmal neu einrichten, altes Projekt baut bis zum Umzug weiter aus dem Archiv.
- E2: Öffentliches Repo ohne `docs/tasks/01–75`, ohne `offene-fehler-*`, mit neutraler Kurzfassung von PROGRESS.
  Nummern laufen ab 76 weiter.
- E3: „Studium“ bleibt in Tests als allgemeine eigene Ablage; persönliche Details (Liste nur lokal) werden
  ersetzt.
- E4: Privates Repo → `secondbrain-archiv`, öffentliches Repo `secondbrain`, Standardzweig `stable`, Entwicklung `main`.
- E5: Keine Lizenz (alle Rechte beim Entwickler).

## Änderungen
- Kopf, §1 Hosting, neu §1.1 Nutzer und Kanäle (getrennte Daten-Repos, öffentliches Code-Repo, main/stable,
  Claude optional).
- §2 Architektur: wiederverwendbarer Workflow @stable, Routine des Nutzers.
- §3.1 Daten-Repo-Name frei, Vorlage `secondbrain-vorlage`, `secondbrain.json`, kurzer Workflow.
- §3.4 Beispiel neutral. §3.5 Start-Ablagen Privat, Arbeit, Einkaufsliste, Erledigt (ohne Studium), neutrale
  Beschreibungen. §3.6 `autoSort` (fehlt ⇒ `true`, Vorlage `false`). §3.7 Token nur eigenes Repo, keine Vorbelegung.
- §3.10 Ergebnis `nicht-eingerichtet`. Neu §3.11 Formatversion und Migration, Erkennung des Daten-Repos.
- §6.3 „Jetzt sortieren“ ohne Claude. §6.5 Automatisches Sortieren, sichtbare Version, Feedback senden,
  Ersteinrichtung beim ersten Start. Neu §6.8 Updates.
- §7 Testmodus, Testnutzer, Vorschau-Adresse. §8.1 Routine je Nutzer, Code von stable, Schritt 0 der Action,
  Rückfallebene nur Entwickler. §9, §10 Phase 8.
