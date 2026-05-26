# Automations

Diese Datei beschreibt bekannte oder geplante Automatisierungen im Elyon Seller Tool.

## Bekannte Bereiche

### Backup-Automation

Ziel:

- lokale Daten sichern
- CSV-Exporte ermöglichen
- Google-Drive-Backups unterstützen
- Daten zwischen Geräten synchronisieren

## Google-Sheets-Sync

Bekannte Komponenten:

- Apps Script Web-App
- Google Sheets Sync
- localStorage-Token
- Sync-Buttons im Frontend

Bekannte Datei:

```txt
apps-script/google-sheets-sync.gs
```

Bekannte Tabellen:

- Inventar
- Supplier Liste
- Laufende Kosten

## Supplier-Sync

Geplante oder vorbereitete Bereiche:

- CJ Dropshipping
- AliExpress
- BigBuy
- VidaXL
- Amazon

Mögliche Funktionen:

- Produktimport
- Preisabgleich
- Supplier-Status
- Tracking-Updates

## Health-Checks

Bekannte oder geplante Checks:

- /api/ping
- /api/health
- /api/cj/status
- /api/ebay/status

## Regeln

- Automatisierungen defensiv umsetzen.
- Bestehende Daten nicht ungeprüft überschreiben.
- Synchronisation nachvollziehbar halten.
- Fehler sichtbar anzeigen.
- Sandbox und Sicherheitsmodus respektieren.
