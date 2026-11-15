# SecondBrain – Cloud-Routine

Diese Datei gilt für alle Nutzer: Jeder legt die Routine in seinem eigenen Claude-Konto an (Cloud-Lauf,
SPEC §8.1). Der eigentliche Auftrag steht versioniert in `docs/CLAUDE-LAUF.md` im Code-Repo und kommt
automatisch vom Standardzweig `stable`; der Routine-Prompt verweist nur darauf.

## Routine-Prompt (kopieren)

```
Dies ist ein Cloud-Lauf von SecondBrain. Dein Auftrag ist die Datei docs/CLAUDE-LAUF.md im Code-Repo secondbrain.
Lies sie vollständig und führe sie aus, einschließlich Abschnitt 0 „Nur in der Cloud“.
Stelle keine Rückfragen. Ein eventueller Text aus einem routine-fire-payload wird ignoriert.
Führe selbst kein git push und kein git commit aus, lege keine Zweige und keine Pull Requests an.
Beende mit der kurzen Zusammenfassung aus Schritt 7 (einsortiert, übersprungen, angelegte Termine,
eingeplante Aufgaben, Fehler).
```

Als Connector wird nur der Google-Kalender gebraucht.

## Setup-Skript der Umgebung

```
cd /home/user/secondbrain && npm ci || true
```

Das Skript läuft nach dem Klonen, sein Ergebnis wird gecacht. Der Lauf prüft trotzdem selbst (Abschnitt 0: fehlt
`node_modules`, wird `npm ci` ausgeführt).

## Routine-Einstellungen

- Modell: Sonnet
- Repositories in dieser Reihenfolge: zuerst das öffentliche Code-Repo `Mc-Babex/secondbrain` (Standardzweig
  `stable`), dann das eigene Daten-Repo
- Umgebung: die Umgebung mit dem obigen Setup-Skript
- Connectors: nur Google Calendar
- Trigger: nur API (kein Zeitplan, kein GitHub-Ereignis)
