# Elyon Seller Tool – Daten- & Synchronisierungs-Audit

**Stand:** 20.08.2026  
**Scope:** Einstellungen → bisheriger Bereich `Daten & Synchronisierung`

## Ergebnis

Der bisherige Google-Sheets-Bereich ist technisch noch funktionsfähig, entspricht aber nicht mehr der aktuellen Elyon-Datenarchitektur.

Verbindliche Rollen:

1. **Seller Product Master** – führende Quelle für Produkt- und Listingdaten.
2. **Server Operations / Finance** – zentrale Bestellungen, Bestand, Rechnungen und Retouren.
3. **Lokale Browserdaten / localStorage** – Arbeitskopie und Fallback.
4. **Google Sheets** – optionaler Export-, Backup- und Migrationskanal; kein Datenmaster.

## Audit der vorhandenen Google-Sheets-Funktionen

| Funktion | Technischer Ist-Zustand | Neuer Status |
|---|---|---|
| Sync-Einstellungen speichern | Speichert Apps-Script-URL/Token | **Behalten** – optionale Integration |
| Alles ins Sheet senden | Schreibt Inventar, Supplier, Verkäufe und Kosten aus lokalen Seller-Daten nach Sheets | **Behalten als Export** – UI-Name geändert |
| Alles aus Google Sheets laden | Lädt Sheet-Daten zurück und ersetzt lokale Sammlungen | **Gesperrt** – bis Vorschau/Diff-Import existiert |
| Alles abgleichen | Lädt zuerst Sheet-Daten und schreibt danach wieder zurück | **Gesperrt** – bidirektionaler Legacy-Abgleich |
| Verkäufe/Inventar synchronisieren | Nutzt lokale Collections als Sync-Quelle | **Legacy / erweitert** |
| Supplier synchronisieren | Nutzt `elyonSuppliers` bzw. Ableitung aus lokalen Produkten | **Legacy / erweitert** |
| Laufende Kosten synchronisieren | Nutzt lokale `elyonCosts` | **Legacy / erweitert** |
| Lokale Verkäufe leeren | Löscht lokale Sales-Arbeitsdaten | **Gesperrt** – destruktive Legacy-Funktion |
| Auto-Abgleich | Periodischer bidirektionaler Abgleich | **Deaktiviert** – passt nicht mehr zum Source-of-Truth-Modell |

## Warum der Rückimport problematisch ist

Der alte Inventar-Import ruft `replaceInventoryFromSheetRecords(...)` auf und ersetzt anschließend die lokale `products`-Collection. Der bidirektionale Abgleich lädt zusätzlich Inventar, Supplier, Verkäufe und Kosten aus Google Sheets, bevor wieder Daten zurückgeschrieben werden.

Das ist mit der aktuellen Architektur nicht mehr die gewünschte Richtung. Ein altes oder unvollständiges Sheet darf weder aktuelle Seller-Arbeitskopien ersetzen noch indirekt mit dem serverseitigen Product Master konkurrieren.

## Umsetzung in diesem Refactor

Der Einstellungsbereich wird zu **`2. ☁️ Daten, Backup & Export`**.

Neu sichtbar:

- Product Master = verbindliche Produktquelle
- Server Operations = zentrale operative Daten
- LocalStorage = Arbeitskopie/Fallback
- Google Sheets = optionaler Export/Legacy
- `Alles ins Sheet senden` wird als **`Nach Google Sheets exportieren`** bezeichnet

Legacy-Werkzeuge bleiben im DOM erhalten, werden aber unter **`Erweiterte Legacy- & Migrationswerkzeuge`** verschoben.

Explizit gesperrt:

- `Alles aus Google Sheets laden`
- `Alles abgleichen`
- `Lokale Verkäufe leeren`

Der bisherige automatische bidirektionale Google-Sheets-Abgleich wird beim Laden der modernisierten Einstellungen deaktiviert. War er zuvor aktiv, wird die Migration lokal markiert und der Timer neu geplant, ohne Product-Master-Daten zu löschen oder zu überschreiben.

## Nächster sinnvoller Ausbau

Wenn Google-Sheets-Rückimport weiterhin benötigt wird, sollte kein direkter Replace-Import mehr verwendet werden. Stattdessen:

`Google Sheet → lesen → normalisieren → Diff/Vorschau → Konflikte anzeigen → bewusste Auswahl → additive Übernahme`

Dabei gelten folgende Regeln:

- keine automatische Überschreibung serverseitiger Product-Master-Felder
- unbekannte Felder erhalten
- Product-Master-ID und Provenance beachten
- Orders, Finance und Retouren nicht aus einem allgemeinen Sheet-Rückimport ersetzen
- vor jeder Schreibaktion Anzahl neuer/geänderter/konfligierender Datensätze anzeigen
- Import erst nach bewusster Bestätigung durchführen

## Nicht Teil dieses Refactors

- Product-Master-Schema ändern
- Orders-/Finance-Speicher ändern
- Google Apps Script entfernen
- bestehende Sheet-Daten löschen
- automatische Veröffentlichung oder andere Seller-Safety-Gates verändern
