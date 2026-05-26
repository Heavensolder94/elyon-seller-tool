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
