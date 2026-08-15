# Jarvis File Manager V1 — Foundation + Brain-Center-UI

## Ziel

Der Jarvis File Manager macht ausgewählte Brain-, Playbook- und Policy-Dateien zentral sichtbar und später kontrolliert versioniert verwaltbar, ohne die bestehende Jarvis-Runtime oder Safety-Gates zu umgehen.

Die Runtime bleibt bewusst **opt-in**. Ohne explizite Aktivierung bleibt das bisherige Repository-Loading unverändert aktiv.

## Sicherheitsprinzip

```text
JARVIS_FILE_STORE_ENABLED != true
→ Repository brain/*.md
→ bestehendes Verhalten

JARVIS_FILE_STORE_ENABLED = true
→ aktive Supabase-Version versuchen
→ fehlt die Version oder schlägt der Read fehl: Repository-Fallback
```

Das `brain/BRAIN_MANIFEST.json` bleibt weiterhin lokal versioniert und bestimmt Pfade, Pflicht-Core, Abschnitte, Budgets und Playbook-Routing. Nutzertext kann weiterhin keine beliebigen Dateipfade in die Runtime einschleusen.

## Managed Registry

`lib/jarvis-file-registry.js` enthält die explizite Allowlist der verwaltbaren Dateien.

V1 umfasst nur:

- `brain/IDENTITY.md`
- `brain/ELYON_CONTEXT.md`
- `brain/OPERATING_RULES.md`
- `brain/CAPABILITIES.md`
- `brain/GOALS.md`
- `brain/PLAYBOOKS.md`

`.env`, Source Code, API-Routen, Secrets und beliebige Repository-Dateien sind nicht registriert und dadurch nicht über den File Manager adressierbar.

## Protected Files

Folgende Dateien sind in V1 als `protected` markiert:

- Identity
- Operating Rules
- Capabilities

Normale Version-Writes auf geschützte Dateien werden in `lib/jarvis-file-store.js` blockiert. Eine spätere Admin-/Review-Runtime darf einen Protected-Write nur über einen expliziten, serverseitig kontrollierten Pfad erlauben.

## Supabase-Schema

Migration:

`supabase/migrations/20260815014500_jarvis_file_manager_v1.sql`

Security-Hardening:

`supabase/migrations/20260815015200_jarvis_file_manager_v1_security_hardening.sql`

Tabellen:

### `jarvis_files`

Dateiregistry und Pointer auf die aktive Version.

### `jarvis_file_versions`

Unveränderliche Versionen mit Content, Versionsnummer, Ersteller, Status und Änderungszusammenfassung.

### `jarvis_file_change_requests`

Grundlage für spätere Jarvis-Vorschläge und Approval-Workflow. In V1 wird noch kein autonomer Änderungsworkflow aktiviert.

RLS ist auf allen drei Tabellen aktiviert. Für `activate_jarvis_file_version` ist die Ausführung auf `service_role` beschränkt.

## Versionierung

Neue Inhalte werden zuerst als `draft` angelegt.

Aktivierung erfolgt separat über die DB-Funktion:

`activate_jarvis_file_version(file_id, version)`

Damit wird ein Write nicht automatisch zur Runtime-Version.

Zusätzlich unterstützt der Store `expectedActiveVersion`. Damit können spätere UI-Writes veraltete Bearbeitungsstände erkennen und mit `jarvis_file_version_conflict` abbrechen, statt Änderungen still zu überschreiben.

## Runtime Resolver

`lib/jarvis-file-resolver.js` entscheidet pro registrierter Datei zwischen Supabase und Repository-Fallback.

`lib/jarvis-brain-files.js` behält weiterhin:

- die feste Manifest-Allowlist,
- Pflicht-Core-Checks,
- Abschnittsextraktion,
- Zeichenbudgets,
- Playbook-Auswahl,
- Fail-Closed bei wirklich fehlendem Pflicht-Core.

Zusätzlich trägt ein geladener Core-Eintrag intern `runtimeSource` und `runtimeVersion`.

## Brain-Center-UI

`seller-jarvis-file-manager.js` integriert den File Manager additiv in den bestehenden `jarvisCommandCenterTab`.

Die Oberfläche übernimmt die bestehende Jarvis-Command-Center-Sprache:

- dunkle Glas-Karten,
- blaue/violette Akzente,
- kompakte Status-Pills,
- responsive Kartenstruktur,
- keine neue parallele Navigation.

### V1.1 UX-Struktur

Die Dateien werden nicht mehr als reine Dateiliste dargestellt, sondern funktional gruppiert:

- **Core Brain**: Identity, Elyon Context, Goals
- **Rules & Safety**: Operating Rules, Capabilities
- **Execution**: Playbooks

Jede Datei zeigt zusätzlich eine kurze fachliche Erklärung, damit die Funktion der Brain-Datei ohne Kenntnis des Repository-Pfads verständlich ist.

### Brain Health

Die Read-only API berechnet einen transparenten Brain-Health-Status aus Registry- und Versionsmetadaten:

- `healthy`: alle Pflicht-Core-Dateien registriert, keine Versionskonflikte, kein offener Draft
- `attention`: Pflicht-Core vollständig, aber mindestens ein Draft wartet auf Review
- `critical`: eine Pflichtdatei fehlt oder `active_version` verweist auf keine bekannte Versionsmetadatei

Die UI zeigt dazu:

- Core Ready,
- Protected Ready,
- Draft-Anzahl,
- Conflict-Anzahl.

Ein Draft gilt bewusst nicht als Runtime-Fehler. Er führt nur zu `attention`, weil die aktive Quelle unverändert bleibt.

### Dateistatus

Jede Datei erhält einen expliziten operativen Status:

- `ACTIVE`: aktive Supabase-Version vorhanden und konsistent
- `DRAFT`: mindestens ein nicht aktiver Draft wartet auf Review
- `FALLBACK`: Repository ist die aktive Quelle
- `CONFLICT`: aktive Versionsreferenz ist inkonsistent
- `MISSING`: erforderlicher Registry-Eintrag fehlt
- `UNREGISTERED`: optionaler Registry-Eintrag fehlt
- `PROTECTED`: zusätzlicher UI-Hinweis für besonders geschützte Dateien

Aktive Quelle und Draft-Zustand bleiben getrennt. Ein Supabase-Draft wird niemals als aktiv dargestellt.

### Diff und Versionshistorie

Die Detailansicht enthält in V1.1 drei Ebenen:

1. **Zeilenbasierter Diff** ohne externe Bibliothek:
   - Grün = hinzugefügt
   - Rot = entfernt
   - unveränderte Zeilen werden auf Kontext reduziert
2. **Vollständiger Side-by-Side-Vergleich** von aktiver Quelle und neuestem Draft
3. **Versionshistorie** mit Versionsnummer, Status, Änderungszusammenfassung, Ersteller und Zeitpunkt

Die Historie ist read-only. Es gibt noch keine Auswahl einer alten Version als aktive Runtime-Version.

### Read-only API

`GET /api/jarvis-files`

liefert Metadaten für Übersicht, Health, operative Statuswerte und eine begrenzte Versionshistorie pro verwalteter Datei.

`GET /api/jarvis-files?key=brain.goals`

liefert die aktive Datei, den neuesten Draft und die Versionshistorie für die Detail-/Diff-Ansicht.

Der Endpunkt:

- erfordert die bestehende Seller-Session über `requireSellerAccess`,
- verwendet serverseitig den Supabase-Service-Role-Zugriff,
- akzeptiert nur Dateien aus der festen Jarvis-Registry,
- erlaubt in dieser Stufe ausschließlich `GET`,
- bietet keine Aktivierungs-, Delete- oder Write-Operation an.

Die Browser-UI erhält daher keinen Supabase-Service-Key und kann keinen Draft versehentlich aktivieren.

## Aktueller GOALS-Pilot

`brain/GOALS.md` liegt zusätzlich als Supabase-Version `1` mit Status `draft` vor.

Aktueller Zustand:

```text
aktive Quelle: Repository / GitHub
Supabase Draft: v1
active_version: NULL
```

Die UI muss genau diesen Unterschied anzeigen.

## Feature Flag

```text
JARVIS_FILE_STORE_ENABLED=false
```

Standard ist AUS.

Der Flag darf erst nach diesen Schritten auf `true` gesetzt werden:

1. Supabase-Migration erfolgreich ausgeführt.
2. Registry-Zeilen vorhanden.
3. Gewünschte Dateien als Versionen angelegt.
4. Versionen bewusst aktiviert.
5. Preview-Smoke-Test bestätigt Repository-Fallback und Managed Loading.
6. Pflicht-Core (`identity`, `operating_rules`, `goals`) vollständig geprüft.

## Was diese V1-Stufe noch NICHT macht

- keine Jarvis-Selbständerung,
- keine automatische Aktivierung nach Save,
- kein Browser-Write auf Brain-Dateien,
- kein GitHub-Writeback,
- kein Aktivieren/Rollback aus der UI,
- keine Änderung an Auth-/Safety-Gates,
- keine Änderung an eBay-/Supplier-/Refund-/Compliance-Permissions.

Die sichtbare UI ist absichtlich read-only, bis Draft-Erstellung, Freigabe, Aktivierung und Rollback als separater sicherer Workflow implementiert und getestet sind.

## Rollback

Sofortiger Runtime-Rollback:

```text
JARVIS_FILE_STORE_ENABLED=false
```

Damit verwendet der Loader wieder ausschließlich die Repository-Dateien. Die Supabase-Versionen bleiben für Diagnose oder spätere Wiederaktivierung erhalten.

Die UI selbst ist additiv über `seller-jarvis-bootstrap.js` geladen und verändert keine bestehenden Tabs oder lokalen Datenstrukturen.

## Tests

`tests/jarvis-file-manager-v1.test.mjs` prüft unter anderem:

- feste Registry und Blockade unbekannter Pfade,
- Opt-in-Verhalten,
- Repository-Fallback bei deaktiviertem Store,
- Repository-Fallback bei Supabase-Fehlern,
- Laden einer aktiven Managed-Version,
- gemischtes Laden aus Supabase + Repository,
- Protected-Write-Blockade,
- Secret-Filter,
- Größenlimit,
- Draft-first bei neuen Versionen,
- Optimistic-Concurrency-Konflikte.

`tests/jarvis-file-manager-ui.test.mjs` prüft zusätzlich:

- korrekte Trennung von aktiver Repository-Quelle und Supabase-Draft,
- Brain-Health `attention` bei offenem Draft,
- `critical` bei fehlendem Pflicht-Core oder Versionskonflikt,
- operative Statuswerte `draft`, `fallback`, `active`, `conflict`,
- Detailvergleich und Versionshistorie,
- weiterhin explizites Opt-in für den Runtime Store,
- Laden/Kopieren des UI-Assets nach dem bestehenden Jarvis Command Center,
- sichtbare Gruppierung in Core Brain, Rules & Safety und Execution,
- vorhandene Diff-Logik und den Read-only-/Aktivierung-gesperrt-Sicherheitsstatus.
