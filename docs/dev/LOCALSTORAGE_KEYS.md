# LocalStorage Keys

Diese Datei dokumentiert bekannte localStorage-Keys des Elyon Seller Tools.

## Bestätigte Keys

### `elyon_ai_agents_settings`

Quelle: `CHATGPT_GUIDE.md` und `CHATGPT_AI_AGENTEN.md`.

Zweck:

- zentrale Agenten- und Sicherheitsdaten
- Sicherheitsmodus
- Sandbox-Modus
- Advanced Mode
- Autonomie-Sperre
- Pause-Status aller Agenten
- Status, Modi, Modellwahl und Tageslimits der Agenten

Wichtige Standardfelder:

```json
{
  "securityMode": true,
  "sandboxMode": true,
  "advancedMode": false,
  "autonomyLocked": true,
  "pauseAllAgents": false
}
```

### `elyon_google_sync_token`

Quelle: `CHATGPT_SYNC_DEBUG.md`.

Zweck:

- Token für den Google-Sheets-Sync
- UI-Element: `googleSheetsSyncToken`
- relevant für Sync-Buttons wie `InventarTracker synchronisieren` und `Laufende Kosten synchronisieren`

### `elyonProducts`

Zweck:

- bewusst erzeugte lokale Arbeitskopien aus der Company-OS-Product-Master-v2-Projection
- Grundlage der bestehenden Produktansicht sowie des Seller-Bereichs `Verkaufen`
- bleibt eine Arbeitskopie und nicht die verbindliche Hauptdatenquelle

Regeln:

- vorhandene Datensätze und unbekannte Felder erhalten
- Listing-Daten nur additiv ergänzen
- Änderungen bleiben lokale Working-Copy-/operative Snapshot-Daten; der kanonische Product Master wird ausschließlich in Company OS geändert
- keine neue Elyon-Artikelnummer aus dieser Arbeitskopie erzeugen

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

Die Designer-Daten werden in der Seller-Arbeitskopie nur für die lokale operative Vorbereitung gehalten. Der kanonische Listing-Stand bleibt Company-OS-owned.

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

Auto-Lister-Daten bleiben in dieser Phase lokale Arbeitskopie; der kanonische Listing-/Compliance-Stand wird aus Company OS gelesen und dort gepflegt.

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
