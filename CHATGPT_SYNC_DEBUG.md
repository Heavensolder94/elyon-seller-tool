# Elyon Google Sheets Sync - Problem Summary

## Ziel
Ich möchte den Google-Sheets-Sync in meinem Elyon-Tool stabil auf mehreren Geräten verwenden.

## Kurzbeschreibung des Problems
Der Sync zu Google Sheets läuft technisch an, aber die Live-Web-App liefert offenbar noch alte Daten-/Schema-Versionen.

Aktuell sehe ich im Sync immer noch Fehler bzw. alte Felder wie:
- `Key Column 'Sale-ID' nicht in 'InventarTracker' gefunden`
- `Key Column 'Kosten-ID' nicht in 'Laufende Kosten' gefunden`
- oder vorher: `Die Apps-Script-Web-App liefert HTML statt JSON`
- oder: `Ungültiger Sync Token`
- oder: `Beim Dienst "Tabellen" ist während des Zugriffs auf das Dokument ... ein Fehler aufgetreten`

## Was ich bereits geprüft habe

### Apps Script
Ich habe einen Google Apps Script Web-App-Sync aufgebaut.

Wichtige Datei im Projekt:
- `apps-script/google-sheets-sync.gs`

Aktueller Code-Stand im Repo:
- `SHEET_CONFIG.inventory` -> `Inventar`
- `SHEET_CONFIG.suppliers` -> `Supplier Liste`
- `SHEET_CONFIG.sales` -> `Inventar`
- `SHEET_CONFIG.costs` -> `Laufende Kosten`
- Build-Marker im Code:
  - `SCRIPT_BUILD = "2026-05-15-inventartracker-schema-v3"`

Die Web-App sollte JSON zurückgeben mit:
- `ok`
- `build`
- `action`
- `type`
- `records`

### Google Sheet
Ich habe die Datei von einer XLSX-Datei in eine native Google-Tabelle umgewandelt.

Neue Spreadsheet-ID:
- `1-PhVpyF44kxE09uRtwEKnGn9XBtStbp4wSWxeJ_zASI`

Neue Google-Sheet-URL:
- `https://docs.google.com/spreadsheets/d/1-PhVpyF44kxE09uRtwEKnGn9XBtStbp4wSWxeJ_zASI/edit?usp=drivesdk`

Tabs / Header:
- `Inventar`
  - `Artikel-ID`, `Bezeichnung`, `Typ`, `Preis EK`, `Versand mind.`, `PreisGesamt EK`, `Preis VK (ebay)`, `Ebay gebühren`, `Gewinn`, `Zielgewinn`, `Emph. Zielpreis`, `Versand ab`, `Stock`, `Status`, `Lieferant`, `Versandzeit`, `Ebay Link`, `Hinweise`
- `Supplier Liste`
  - `Supplier-ID`, `Name`, `Plattform`, `Website`, `Kontakt`, `Versandländer`, `Versandzeit`, `Rückgabe möglich`, `Zahlungsart`, `Bewertung`, `Status`, `Notizen`
- `Laufende Kosten`
  - `Name`, `Intervall`, `Betrag`, `Notiz`

## Was ich im Browser getestet habe

Die Web-App-URL wurde aufgerufen mit:
- `https://script.google.com/macros/s/AKfycbwsZlRUFBsr82NC3H3ZKD5S8xFnlWqgJrXUMBnmx26JHKxYmC7xZdrgFLKm6bq5ogSjgQ/exec`

Mit Token-Testaufruf:
- `.../exec?action=getRecords&type=sales&token=E18bk4g25!1994`

Zwischenergebnis:
- `ok: true`
- aber die Daten waren weiterhin im alten Schema:
  - `Datum`
  - `Produkt`
  - `Verkauf (€)`
  - `Einkauf (€)`
  - `Gewinn (€)`
  - `Klarna 50 %`
  - `Status`

Das bedeutet:
- die Web-App antwortet,
- aber es läuft sehr wahrscheinlich noch eine alte Deployment-Version oder das falsche Apps-Script-Projekt.

## Relevante lokale Frontend-Stellen

Die Sync-Settings werden im Frontend über localStorage gespeichert.

Wichtige Stellen:
- `public/index.html`
- `index.html`

Synckonfiguration:
- localStorage-Key für Token:
  - `elyon_google_sync_token`

UI-Element:
- `googleSheetsSyncToken`

Sync-Buttons:
- `InventarTracker synchronisieren`
- `Laufende Kosten synchronisieren`

## Beobachtungen / Verdacht

1. Die lokale Repo-Version scheint korrekt angepasst zu sein.
2. Das Sheet ist jetzt native Google Sheets und nicht mehr XLSX.
3. Die Live-Web-App liefert trotzdem noch alte Daten.
4. Sehr wahrscheinlich trifft Elyon noch eine alte Apps-Script-Bereitstellung oder ein anderes Projekt.

## Was ich von ChatGPT brauche

Bitte analysiere:
1. Warum die Apps-Script-Web-App trotz korrektem lokalem Code noch alte Schema-Daten zurückliefert.
2. Wie ich sicherstelle, dass die richtige Apps-Script-Web-App-Version live ist.
3. Ob es Sinn macht, den Sync komplett auf das neue Google Sheet und einen neuen Web-App-Deploy umzustellen.
4. Welche minimalen Änderungen im Apps-Script-Code oder Deployment nötig sind, damit `sales` wirklich das `Inventar`-Tab nutzt.

## Gewünschtes Ergebnis

Am Ende soll der Sync:
- auf das native Google Sheet zugreifen
- `Inventar` korrekt lesen und schreiben
- `Supplier Liste` korrekt lesen und schreiben
- `Laufende Kosten` korrekt lesen und schreiben
- keine alten `Sale-ID` / `Kosten-ID` Fehler mehr zeigen
- keine HTML-statt-JSON Fehler mehr liefern

## Hinweise

Bitte die geheimen Tokens nicht öffentlich wiederholen.
Der Token ist lokal gesetzt und sollte nur zur Fehleranalyse verwendet werden.
