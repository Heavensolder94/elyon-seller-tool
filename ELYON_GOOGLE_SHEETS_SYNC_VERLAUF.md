# Elyon Google Sheets Sync - Verlaufslog

## Kurzfassung

Wir wollten den Elyon Google-Sheets-Sync auf mehreren Geräten stabil zum Laufen bringen.

## Problemverlauf

Zuerst traten diese Fehler auf:

- `Key Column 'Sale-ID' nicht in 'InventarTracker' gefunden`
- `Key Column 'Kosten-ID' nicht in 'Laufende Kosten' gefunden`
- `Die Apps-Script-Web-App liefert HTML statt JSON`
- `Ungültiger Sync Token`
- `Beim Dienst "Tabellen" ist während des Zugriffs auf das Dokument ... ein Fehler aufgetreten`

## Ursache

Die Ursache war sehr wahrscheinlich nicht nur der Code, sondern vor allem eine alte oder falsche Google-Apps-Script-Bereitstellung beziehungsweise eine alte Schema-Version, die noch live ausgeliefert wurde.

Zusätzlich war das ursprüngliche Sheet zunächst eine XLSX-Datei und nicht eine native Google-Tabelle.

## Datenmodell

Das Zielschema lautet jetzt:

- `Inventar`
- `Supplier Liste`
- `Laufende Kosten`

Die alten Begriffe `InventarTracker`, `Sale-ID` und `Kosten-ID` sollten nicht mehr als Pflicht-Keys im Sync auftreten.

## Relevante technische Details

### Google Sheet

Neue native Google-Tabelle:

- Spreadsheet-ID: `1-PhVpyF44kxE09uRtwEKnGn9XBtStbp4wSWxeJ_zASI`

### Apps Script

Wichtige Datei:

- `apps-script/google-sheets-sync.gs`

Der lokale Code enthält einen Build-Marker:

- `2026-05-15-inventartracker-schema-v3`

### Sync-Token

Der Sync-Token wird separat in den Script Properties und im Elyon Frontend gepflegt.

Beispiel für den Test:

- `SYNC1234`

## Wichtige Erkenntnisse

1. Lokaler Repo-Code kann korrekt sein, während die live genutzte Apps-Script-Web-App noch alt ist.
2. Die Web-App muss immer über die richtige `/exec`-URL aufgerufen werden.
3. Ein Diagnose-/Build-Marker hilft, live geladene Versionen sicher zu unterscheiden.
4. Das Sheet muss eine native Google-Tabelle sein, nicht nur eine importierte XLSX-Datei.

## Aktueller Stand

Der lokale Code wurde auf das neue Schema angepasst.
Das Google Sheet wurde in eine native Google-Tabelle umgewandelt.

Wenn trotzdem noch alte Fehler kommen, ist sehr wahrscheinlich noch eine alte Web-App-Bereitstellung oder die falsche `/exec`-URL aktiv.

## Nächster sinnvoller Test

Die Web-App mit einem Diagnoseaufruf prüfen und sicherstellen, dass die live Antwort den aktuellen Build-Marker zurückgibt.

## Merksatz

Nicht nur den Code prüfen, sondern immer auch die aktive Apps-Script-Bereitstellung und die verwendete Web-App-URL.
