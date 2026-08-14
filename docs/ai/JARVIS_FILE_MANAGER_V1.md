# Jarvis File Manager V1 — Foundation

## Ziel

Der Jarvis File Manager soll ausgewählte Brain-, Playbook-, Policy- und spätere Knowledge-/Prompt-Dateien versioniert verwaltbar machen, ohne die bestehende Jarvis-Runtime oder Safety-Gates zu umgehen.

Die Foundation ist bewusst **opt-in**. Ohne explizite Aktivierung bleibt das bisherige Repository-Loading unverändert aktiv.

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

Tabellen:

### `jarvis_files`

Dateiregistry und Pointer auf die aktive Version.

### `jarvis_file_versions`

Unveränderliche Versionen mit Content, Versionsnummer, Ersteller, Status und Änderungszusammenfassung.

### `jarvis_file_change_requests`

Grundlage für spätere Jarvis-Vorschläge und Approval-Workflow. In der Foundation wird noch kein autonomer Änderungsworkflow aktiviert.

RLS ist auf allen drei Tabellen aktiviert. Für `activate_jarvis_file_version` wird die Ausführung auf `service_role` beschränkt.

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

Zusätzlich trägt ein geladener Core-Eintrag intern `runtimeSource` und `runtimeVersion`. Dadurch kann das spätere Brain Center anzeigen, ob eine Datei aus Git oder Supabase stammt.

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

## Was V1 Foundation noch NICHT macht

- keine UI im Brain Center,
- keine automatische Migration des Markdown-Inhalts in Supabase,
- keine Jarvis-Selbständerung,
- keine automatische Aktivierung nach Save,
- kein GitHub-Writeback,
- keine Änderung an Auth-/Safety-Gates,
- keine Änderung an eBay-/Supplier-/Refund-/Compliance-Permissions.

Diese Funktionen werden erst auf der getesteten Foundation aufgebaut.

## Rollback

Sofortiger Runtime-Rollback:

```text
JARVIS_FILE_STORE_ENABLED=false
```

Damit verwendet der Loader wieder ausschließlich die Repository-Dateien. Die Supabase-Versionen bleiben für Diagnose oder spätere Wiederaktivierung erhalten.

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
