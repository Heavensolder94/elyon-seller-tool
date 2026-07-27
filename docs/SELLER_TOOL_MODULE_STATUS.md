# Elyon Seller Tool – aktive und inaktive Module

**Stand: 27.07.2026**

## Verbindliche Rolle

```text
Elyon Nova sammelt Produktdaten.
Company OS nimmt Rohimporte auf, prüft Produkte und erstellt das vollständige Listing-Paket.
Das Seller Tool übernimmt erst final freigegebene Produkte und verwaltet danach den Seller-Betrieb.
```

## Aktiver Workflow

```text
Nova
→ Nova Eingang im Company OS
→ Company-OS-Produktprüfung
→ Status ready_for_seller_tool / bereit_manuell_einstellen
→ Seller Product Master
→ bewusste lokale Arbeitskopie
→ Listing-Paket prüfen und manuell bei eBay einstellen
→ eBay-Artikelnummer intern dokumentieren
→ Orders
→ Versand und Tracking
→ Rechnung
→ Retouren
→ tatsächlicher Gewinn und Auswertung
```

## Aktiv

| Modul | Aufgabe |
|---|---|
| Seller-Zugangsschutz | Zugriff auf interne Seller-Daten und geschützte APIs |
| Dashboard | Seller-Status, offene Aufgaben und Geschäftszahlen |
| Company-OS-Eingang | Nur final freigegebene Produkte aus dem Server Product Master anzeigen |
| Product Master | Verbindliche serverseitige Produktquelle |
| Lokale Arbeitskopie | Nur nach bewusstem Klick; kein automatischer Import |
| Listing-Paket / eBay-Freigabe | Paket kontrollieren, kopieren und manuelles Listing dokumentieren |
| eBay OAuth und Orders | eBay verbinden und Bestellungen abrufen |
| Versand und Tracking | Erfüllung nach einem Verkauf verwalten |
| Rechnungen | Rechnungen und Belege verwalten |
| Retouren | Rückgaben, Erstattungen und Verluste dokumentieren |
| Google Drive / Backup | Daten sichern und wiederherstellen |
| Integrationsstatus | Tatsächliche Verbindungen prüfen |

## Inaktiv im normalen Seller-Workflow

| Modul | Grund |
|---|---|
| Direkter Nova-/Browserimport | Würde die Company-OS-Prüfung umgehen |
| Produktbeschaffung | Aufgabe von Nova und Company OS |
| Doppelte Produktanalyse | Aufgabe der Company-OS-Produktprüfung |
| Zweite Vorab-Kalkulation | Company OS liefert die verbindliche Kostenrechnung |
| Vollständiger Listing-Generator | Company OS erstellt das Listing-Paket |
| Shopify Lab | Erst nach stabilen eBay-Verkäufen relevant |
| Virtuelle Mitarbeiter / Autonomie | Erst nach echten, stabilen Prozessen aktivieren |
| Agenten-Cron | Deaktiviert; keine Hintergrundausführung |
| Mobiler Produktscanner im Seller Tool | Company OS ist die mobile Arbeitsoberfläche |
| Google-Sheets-Vollsync als Hauptspeicher | Product Master ist die verbindliche Datenquelle |

## Sicherheitsregeln

- Keine automatische eBay-Veröffentlichung.
- Keine automatische Lieferantenbestellung.
- Keine automatische Kundennachricht.
- Keine ungeprüften Nova-Rohimporte im Seller Product Master.
- Keine finale Seller-Freigabe ohne Company-OS-Status `ready_for_seller_tool` bzw. `bereit_manuell_einstellen`.
- Mindestens 20 % Marge nach realistischen Kosten oder mindestens 5 € realistischer Gewinn.
- Einkaufspreis und Verkaufspreis werden getrennt behandelt.
- LocalStorage ist nur eine bewusst erzeugte Arbeitskopie, nicht die Hauptdatenquelle.

## Rückweg

Der Stand vor der Rollenbereinigung liegt auf:

```text
backup/pre-seller-role-cleanup-2026-07-27
```

Die älteren Module bleiben zunächst als inaktiver Quellbestand erhalten. Sie werden nicht in die aktive Produktionsoberfläche geladen und können bei Bedarf kontrolliert wiederhergestellt oder später endgültig archiviert werden.
