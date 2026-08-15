# Jarvis File Manager V1.2 — Brain Control + vereinfachter JARVIS Hub

## Ziel

Der Jarvis File Manager macht die ausgewählten Brain-Dateien zentral sichtbar und kontrolliert versioniert bearbeitbar, ohne bestehende Safety-, Auth- oder Runtime-Gates zu umgehen.

Die aktive Brain-Runtime bleibt weiterhin **opt-in**:

```text
JARVIS_FILE_STORE_ENABLED != true
→ Repository brain/*.md bleibt Runtime-Quelle

JARVIS_FILE_STORE_ENABLED = true
→ aktive Supabase-Version versuchen
→ bei fehlender/fehlerhafter Managed-Version: Repository-Fallback
```

Ein gespeicherter Draft ändert dadurch nicht automatisch das Verhalten von Jarvis.

## Vereinfachter JARVIS Hub

Der Seller Tool Hauptbereich zeigt nur noch einen zentralen Eintrag:

```text
◉ JARVIS
```

Der frühere separate Hauptmenüpunkt `Jarvis Integration Center` ist kein eigener Navigationsbereich mehr. Seine bestehenden Funktionen bleiben erhalten und werden intern über den JARVIS Hub verwendet.

Die normale Oberfläche hat nur drei primäre Bereiche:

- **JARVIS** — Auftragseingabe, Hinweise mit Handlungsbedarf und letzte Aktionen
- **Gehirn** — Identität, Elyon-Wissen, Ziele, Regeln, Fähigkeiten und Abläufe
- **System** — einfacher Gesundheitscheck für Brain, Memory, Pipeline und Safety

Technische Informationen sind bewusst eine Ebene tiefer gelegt:

- Auf der JARVIS-Startseite blendet **Mehr anzeigen** zusätzliche Metriken, Agenten, Jobs, Pipeline und Chat-Historie ein.
- Im Gehirn blendet **Technische Details** Health-Metriken, Runtime-/Versionsstatus, Dateipfade und weitere Diagnoseinformationen ein.
- Im System blendet **Technische Details** die Unterbereiche Status, Integrationen, KI-Modelle, Routing, Kosten und Logs ein.

Damit bleibt die tägliche Bedienung auf Entscheidungen und Aufgaben fokussiert, während Diagnose- und Entwicklerdaten weiterhin verfügbar sind.

Technisch bleibt `jarvisCommandCenterTab` der kompatible Top-Level-Route-Key. `seller-jarvis-hub.js` steuert die interne Ansicht und verwendet die vorhandenen Module weiter, statt ihre Business-Logik zu duplizieren.

Das bisherige `jarvisIntegrationCenterTab` bleibt nur ein internes Legacy-/Kompatibilitätsziel. Der Hub entfernt seinen Menüeintrag und fängt direkte Legacy-Aktivierungen ab.

## Managed Registry

`lib/jarvis-file-registry.js` enthält die explizite Allowlist.

V1.2 verwaltet:

- `brain/IDENTITY.md`
- `brain/ELYON_CONTEXT.md`
- `brain/OPERATING_RULES.md`
- `brain/CAPABILITIES.md`
- `brain/GOALS.md`
- `brain/PLAYBOOKS.md`

Nicht verwaltbar sind insbesondere:

- `.env`
- Secrets / Credentials
- Source Code
- API-Routen
- beliebige nicht registrierte Repository-Dateien

Das `brain/BRAIN_MANIFEST.json` bleibt repository-lokal und kontrolliert Pfade, Pflicht-Core, Abschnitte, Budgets und Playbook-Routing.

## Protected Files

Als besonders geschützt gelten:

- Identity
- Operating Rules
- Capabilities

Protected-Dateien benötigen im V1.2-Workflow eine zusätzliche explizite Bestätigung. Der Browser allein kann den Schutz nicht umgehen; die Prüfung erfolgt serverseitig.

## Supabase-Schema

Basis-Migration:

`supabase/migrations/20260815014500_jarvis_file_manager_v1.sql`

Security-Hardening:

`supabase/migrations/20260815015200_jarvis_file_manager_v1_security_hardening.sql`

V1.2 Workflow-Erweiterung ergänzt den kontrollierten Draft-/Approval-/Activation-/Rollback-Pfad.

Tabellen:

### `jarvis_files`

Dateiregistry und Pointer auf die aktive Managed-Version.

### `jarvis_file_versions`

Immutable Versionen mit Inhalt, Versionsnummer, Status, Ersteller und Änderungszusammenfassung.

### `jarvis_file_change_requests`

Änderungsvorschläge und Approval-Zustand. Eine Freigabe bleibt getrennt von der späteren Aktivierung.

Die File-Manager-RPCs sind ausschließlich serverseitig über `service_role` erreichbar; `anon` und `authenticated` erhalten keinen direkten Execute-Zugriff.

## V1.2 Edit-Workflow

Der Benutzerfluss lautet:

```text
Bearbeiten
→ Änderung als Draft speichern
→ Diff / Review
→ Freigeben
→ Aktivieren
```

Zusätzlich ist ein Rollback auf ältere immutable Versionen bzw. auf den Repository-Fallback möglich.

Wichtige Regeln:

1. **Save ist nicht Activate.** Ein neuer Inhalt wird zunächst Draft.
2. **Approval ist nicht Activate.** Freigabe und Aktivierung sind zwei separate Aktionen.
3. **Protected Files** benötigen zusätzliche bewusste Bestätigung.
4. **Optimistic Concurrency** verhindert stille Überschreibungen, wenn sich die aktive Basis seit Beginn der Bearbeitung geändert hat.
5. Eine neue Bearbeitung darf keine bereits genehmigte ältere Fassung still wiederverwenden.
6. Secret-/Credential-artige Inhalte werden serverseitig abgelehnt.
7. Die Runtime übernimmt Managed-Versionen nur, wenn `JARVIS_FILE_STORE_ENABLED=true` ist.

## Runtime Resolver

`lib/jarvis-file-resolver.js` entscheidet pro registrierter Datei zwischen Supabase und Repository-Fallback.

`lib/jarvis-brain-files.js` behält weiterhin:

- feste Manifest-Allowlist
- Pflicht-Core-Checks
- Abschnittsextraktion
- Zeichenbudgets
- Playbook-Auswahl
- Fail-Closed bei wirklich fehlendem Pflicht-Core

Geladene Core-Einträge tragen intern `runtimeSource` und `runtimeVersion`.

## Brain Control

`seller-jarvis-file-manager.js` stellt die Brain-Dateien dar.

In der normalen Gehirn-Ansicht werden technische Dateinamen durch verständliche Begriffe ergänzt bzw. ersetzt:

- **Identität** — wer Jarvis ist
- **Elyon-Wissen** — stabiler Systemkontext
- **Ziele** — permanente Prioritäten und Optimierungsrichtung
- **Regeln** — verbindliche Arbeits- und Sicherheitsregeln
- **Fähigkeiten** — was Jarvis darf und kann
- **Abläufe** — wiederverwendbare Playbooks

Die bestehende technische Gruppierung und alle Runtime-/Versionsinformationen bleiben unter **Technische Details** erhalten.

### Brain Health

- `healthy` — Pflicht-Core vollständig, keine Konflikte, kein offener Draft
- `attention` — Pflicht-Core vollständig, aber mindestens ein Draft wartet auf Review
- `critical` — Pflichtdatei fehlt oder aktive Versionsreferenz ist inkonsistent

Ein Draft ist kein Runtime-Fehler. Er verändert die aktive Quelle nicht automatisch.

### Dateistatus

Technisch verfügbar bleiben:

- `ACTIVE`
- `DRAFT`
- `FALLBACK`
- `CONFLICT`
- `MISSING`
- `UNREGISTERED`
- zusätzlicher `PROTECTED`-Hinweis

### Diff und Historie

Die Review-Ansicht enthält:

1. zeilenbasierten Diff
2. vollständigen Side-by-Side-Vergleich
3. Versionshistorie mit Version, Status, Zusammenfassung, Ersteller und Zeitpunkt

## API-Sicherheit

`GET /api/jarvis-files`

liefert Übersicht, Brain Health, operative Statuswerte und Versionsmetadaten.

`GET /api/jarvis-files?key=brain.goals`

liefert Detaildaten, aktive Quelle, neuesten Draft und Historie.

V1.2 Mutation-Aktionen laufen getrennt über die geschützte File-Actions-API. Alle Browserzugriffe benötigen die bestehende Seller-Session. Supabase-Service-Role-Schlüssel werden niemals an den Browser ausgegeben.

Die Mutations-API bietet ausschließlich klar definierte Workflow-Aktionen; es existiert kein freier „beliebige Datei überschreiben“-Endpunkt.

## GOALS-Pilot

Der initiale GOALS-Pilot wurde als Supabase Draft angelegt. Solange keine Version aktiv geschaltet und der Runtime Store nicht aktiviert wird, bleibt das Repository die Runtime-Quelle.

Beispielzustand:

```text
aktive Quelle: Repository / GitHub
Supabase Draft: vorhanden
JARVIS_FILE_STORE_ENABLED: false
```

## Feature Flag

Standard:

```text
JARVIS_FILE_STORE_ENABLED=false
```

Vor einer Runtime-Aktivierung müssen mindestens geprüft sein:

1. Migrationen erfolgreich
2. Registry vollständig
3. gewünschte Versionen vorhanden
4. Versionen bewusst freigegeben und aktiviert
5. Preview-Smoke-Test erfolgreich
6. Pflicht-Core (`identity`, `operating_rules`, `goals`) vollständig
7. Preview-ENV separat von Production geprüft

Production darf nicht beiläufig über einen UI-Test eingeschaltet werden.

## Was V1.2 weiterhin NICHT erlaubt

- keine autonome Jarvis-Selbständerung ohne Benutzerworkflow
- keine automatische Aktivierung nach Save
- keine freie Bearbeitung beliebiger Source-Dateien
- kein Zugriff auf Secrets oder Environment-Variablen über Brain Control
- kein automatischer GitHub-Writeback
- keine Ausweitung von Auth-/Safety-Gates
- keine automatische eBay-Live-Veröffentlichung
- keine Supplier Orders, Refunds, Kundennachrichten oder Legal-Data-Writes durch diesen File-Manager-Workflow

## Rollback

Runtime-Fallback:

```text
JARVIS_FILE_STORE_ENABLED=false
```

Damit verwendet der Loader wieder Repository-Dateien. Supabase-Versionen bleiben für Audit, Diagnose und spätere Wiederaktivierung erhalten.

Ein Versions-Rollback löscht keine Historie, sondern setzt kontrolliert eine frühere immutable Version als Ziel.

## UI-Stabilität

Brain Control verwendet den persistenten Host `jarvisBrainControlPersistentHost`, damit Command-Center-Re-Renders seine Oberfläche nicht zerstören.

Der Hub verschiebt Command Center oder Brain Control nicht zwischen Render-Bäumen. Er steuert ihre Sichtbarkeit über einen stabilen Top-Level-Zustand und verwendet das bestehende Integration Center intern weiter.

Der Hub ist event-/observer-basiert und verwendet kein Hintergrund-Polling.

## Tests

Die Testabdeckung umfasst unter anderem:

- Registry-Allowlist und unbekannte Pfade
- Repository-Fallback
- Runtime-Opt-in
- Protected-Write-Gates
- Secret-Filter
- Größenlimit
- Draft-first
- Optimistic Concurrency
- Draft → Approval → Activation → Rollback
- Brain Health und Dateistatus
- Diff und Versionshistorie
- stabilen Brain-Control-Mount
- Bootstrap-Recovery
- genau einen sichtbaren JARVIS-Einstieg
- genau drei primäre Hub-Bereiche: JARVIS, Gehirn, System
- technische Details als Opt-in statt Standardansicht
- Entfernung des Legacy-Integration-Center-Menüpunkts
- Wiederverwendung der bestehenden Integration-Center-Funktionen
- keine Polling-Schleife im JARVIS Hub
