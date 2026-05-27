# Sync Architecture

## Zweck

Diese Datei beschreibt bekannte oder geplante Synchronisationswege des Elyon Seller Tools.

## Lokale Speicherung

Bereiche:

- localStorage
- UI-Zustände
- Agentenstatus
- lokale Einstellungen

## Google Sheets Sync

Bekannte Bereiche:

- Inventar
- Supplier Liste
- Laufende Kosten

Bekannte Datei:

```txt
apps-script/google-sheets-sync.gs
```

## Google Drive

Geplante oder vorbereitete Bereiche:

- CSV Backups
- Exportdateien
- Geräteübergreifende Sicherung

## CSV Import / Export

Mögliche Bereiche:

- Inventar
- Produktlisten
- Supplierdaten
- Kosten

## Regeln

- Datenfluss nachvollziehbar halten.
- Bestehende Daten nicht ungeprüft überschreiben.
- Synchronisationsfehler sichtbar machen.
- Sicherheits- und Sandboxlogik respektieren.
