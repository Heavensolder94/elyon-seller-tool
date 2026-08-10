# LocalStorage Keys

Diese Datei dokumentiert bekannte localStorage-Keys des Elyon Seller Tools.

## Bestätigte Keys

### `elyon_ai_agents_settings`

Quelle: `CHATGPT_GUIDE.md`, `CHATGPT_AI_AGENTEN.md` und AI-Workforce-Runtime.

Zweck:

- zentrale Agenten- und Sicherheitsdaten
- Sicherheitsmodus
- Sandbox-Modus
- Advanced Mode
- Autonomie-Sperre
- Pause-Status aller Agenten
- Status, Modi, Modellwahl und Tageslimits der Agenten
- Elyon Manager V1 normalisiert vorhandene Autonomiewerte defensiv auf Stufe `0..3`
- externe irreversible Agentenrechte bleiben deaktiviert

Wichtige Standardfelder:

```json
{
  "securityMode": true,
  "sandboxMode": true,
  "advancedMode": false,
  "autonomyLocked": true,
  "pauseAllAgents": false,
  "maxAutonomyLevel": 3,
  "externalActionsLocked": true
}
```

### `elyon_ai_workforce_tasks`

Zweck:

- bestehende gemeinsame Task-Mappe der AI Workforce
- speichert Agentenaufgaben und strukturierte Ergebnisse
- bleibt die Task-Source-of-Truth für den Elyon Manager; es wird keine zweite Agenten-Task-Datenbank eingeführt
- Elyon Manager V1 ergänzt bei delegierten Aufgaben nur Workflow-Metadaten wie `workflowId`, `parentTaskId`, `workflowDepth`, `workflowStep`, `dedupeKey`, `retryCount` und `approvalRequired`

Regeln:

- normale erfolgreiche interne Prüfungen werden nicht automatisch zur Nutzerfreigabe hochgestuft
- Listing- und Support-Entwürfe bleiben freigabepflichtig
- Compliance-/Profit-Fälle werden bei Blockern, fehlenden Fakten oder nicht erfüllter Mindestregel eskaliert
- vorhandene Tasks werden bei identischem Deduplizierungs-Key wiederverwendet statt erneut kostenpflichtig ausgeführt

### `elyon_ai_manager_workflows_v1`

Zweck:

- begrenztes, lokales Workflow-/Audit-Protokoll des Elyon Managers
- enthält keine zweite Agenten-Task-Struktur, sondern ausschließlich Orchestrierungsmetadaten
- dokumentiert u. a. `workflowId`, Parent-Task, Workflow-Typ, Event, Agentenlaufzahl, Child-Task-IDs, wiederverwendete Tasks, Blocker, Freigaben und Audit-Ereignisse
- wird auf maximal 40 aktuelle Workflows begrenzt

Sicherheitsgrenzen:

- keine Secrets
- keine Provider-Keys
- keine Lieferantenbestellungen
- keine gesendeten Kundennachrichten
- keine LIVE-Publikationen
- keine Rückerstattungs- oder Zahlungsaktionen

### `elyon_google_sync_token`

Quelle: `CHATGPT_SYNC_DEBUG.md`.

Zweck:

- Token für den Google-Sheets-Sync
- UI-Element: `googleSheetsSyncToken`
- relevant für Sync-Buttons wie `InventarTracker synchronisieren` und `Laufende Kosten synchronisieren`

### `elyonProducts`

Zweck:

- bewusst erzeugte lokale Arbeitskopien aus dem Seller Product Master
- Grundlage der bestehenden Produktansicht sowie des Seller-Bereichs `Verkaufen`
- bleibt eine Arbeitskopie und nicht die verbindliche Hauptdatenquelle

Regeln:

- vorhandene Datensätze und unbekannte Felder erhalten
- Listing-Daten nur additiv ergänzen
- nach Änderungen den geschützten Server Product Master aktualisieren

### `elyonSelectedSellerProductId`

Zweck:

- aktuell bewusst ausgewählte Seller-Arbeitskopie
- verbindet Produkte, Listing Designer, Auto Lister und manuellen Abschluss

### `elyon_seller_selling_flow_v1`

Zweck:

- ausschließlich UI-Zustand des Seller-Bereichs `Verkaufen`
- aktuell geöffneter Unterbereich: `designer`, `auto` oder `ready`
- keine Produktdaten, Tokens oder Secrets

Beispiel:

```json
{
  "activePanel": "designer",
  "updatedAt": "2026-07-27T12:00:00.000Z"
}
```

### `elyon_seller_visual_designer_v1`

Zweck:

- ausschließlich UI-Zustand des visuellen Elyon Listing Designers
- aktuell geöffneter Designer-Modus
- Desktop- oder Mobil-Vorschau
- DeepSeek-Stärke-Regler
- keine Listing-Texte, Bilder, Product-Master-Daten, Tokens oder Secrets

Beispiel:

```json
{
  "activeMode": "visual",
  "previewMode": "desktop",
  "aiStrength": 45,
  "updatedAt": "2026-07-27T12:00:00.000Z"
}
```

Die eigentlichen Designer-Daten werden additiv im Product Master unter `listing.descriptionDesign` und `listing.descriptionDesignDraft` gespeichert.

### `elyon_seller_auto_lister_parity_v1`

Zweck:

- ausschließlich UI-Zustand des vollständigen Auto Listers
- aktuell geöffneter Unterbereich
- DeepSeek-Stärke-Regler
- keine Produkt-, GPSR-, Varianten-, Taxonomy-, Token- oder Secret-Daten

Beispiel:

```json
{
  "activeTab": "taxonomy",
  "aiStrength": 45,
  "updatedAt": "2026-07-27T12:00:00.000Z"
}
```

Die eigentlichen Auto-Lister-Daten werden additiv im Product Master unter `listing.autoListerDraft`, `listing.categoryMetadata`, `listing.compliance`, `listing.gpsr` und den Variantenfeldern gespeichert.

## Vorbereitete oder zu prüfende Keys

### `elyon_backup_settings`

Zweck:

- Backup-Konfiguration
- lokale oder Cloud-Sync-Einstellungen

Status:

- als Dokumentationspunkt vorbereitet
- vor produktiver Nutzung im Code prüfen

### `elyon_supplier_cache`

Zweck:

- Zwischenspeicherung von Supplier-Daten
- mögliche Nutzung für Produktimport oder Supplier-Hub

Status:

- als Dokumentationspunkt vorbereitet
- vor produktiver Nutzung im Code prüfen

## Regeln für Änderungen

- Bestehende Keys nicht löschen.
- Bestehende Userwerte nicht überschreiben.
- Neue Felder defensiv ergänzen.
- Bei Migrationen Backward Compatibility beachten.
- Nie echte Tokens oder Secrets in GitHub speichern.
- Neue UI-Keys dürfen keine Product-Master-Daten duplizieren.
- `listing.autoListerDraft` ist ein Feld im Produktdatensatz und kein eigener LocalStorage-Hauptspeicher.
- Designer-, Taxonomy-, GPSR- und Varianten-Daten gehören in den Product Master, nicht in neue lokale Hauptspeicher.
