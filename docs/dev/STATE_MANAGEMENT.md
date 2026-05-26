# State Management

## Ziel

Diese Datei beschreibt, wo Zustände und Daten im Elyon Seller Tool gespeichert werden.

## Lokale Speicherung

Bekannte Bereiche:

- localStorage
- Sync-Token
- Agenten-Settings
- UI-Zustände

## Bekannte Keys

- elyon_ai_agents_settings
- elyon_google_sync_token

## Sync-Bereiche

- Google Sheets Sync
- CSV Import / Export
- mögliche Google-Drive-Backups

## Regeln

- Bestehende Userdaten erhalten.
- Neue Felder defensiv ergänzen.
- Keine bestehenden Keys ungeprüft überschreiben.
