# Elyon Seller Tool – aktive und inaktive Module

**Stand: 27.07.2026**

## Verbindliche Rolle

```text
Elyon Nova sammelt Produktdaten.
Company OS nimmt Rohimporte auf, prüft Produkte und gibt geeignete Produkte für das Seller Tool frei.
Das Seller Tool übernimmt final freigegebene Produkte, erstellt und finalisiert das Listing und verwaltet danach den Seller-Betrieb.
```

## Aktiver Workflow

```text
Nova
→ Nova Eingang im Company OS
→ Company-OS-Produktprüfung
→ Status ready_for_seller_tool / bereit_manuell_einstellen
→ Seller Product Master
→ bewusste lokale Arbeitskopie
→ Seller Tool: Verkaufen
   → Listing Designer
   → eBay Auto Lister
   → Bereit zum Einstellen
→ Listing bewusst manuell bei eBay einstellen
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
| Verkaufen | Gemeinsamer Bereich für Listing Designer, Auto Lister und manuellen eBay-Abschluss |
| Listing Designer | Bestehender vollständiger Titel-, SEO-, KI-, Beschreibungs- und Draft-Generator; Produktdaten nur nach bewusstem Klick übernehmen |
| eBay Auto Lister | Pflichtfelder prüfen und einen internen, unveröffentlichten Seller-Entwurf im Product Master speichern |
| Bereit zum Einstellen | Paket kontrollieren, kopieren und das bewusst manuelle eBay-Listing dokumentieren |
| eBay OAuth und Orders | eBay verbinden und Bestellungen abrufen |
| Versand und Tracking | Erfüllung nach einem Verkauf verwalten |
| Rechnungen | Rechnungen und Belege verwalten |
| Retouren | Rückgaben, Erstattungen und Verluste dokumentieren |
| Google Drive / Backup | Daten sichern und wiederherstellen |
| Integrationsstatus | Tatsächliche Verbindungen prüfen |

## Auto-Lister-Status

Der aktive Auto Lister erstellt derzeit ausschließlich einen internen Seller-Entwurf:

- Titel, Beschreibung, Kategorie, Condition ID, Artikelmerkmale, Bilder, Preis und Menge prüfen
- Company-OS-Freigabe und Product-Master-Blocker berücksichtigen
- Elyon-Mindestregel berücksichtigen
- Entwurf additiv unter `listing.autoListerDraft` speichern
- unbekannte Produkt- und Listing-Felder erhalten
- keine automatische Veröffentlichung auslösen

Die direkte eBay-Inventory-API-Übergabe bleibt sichtbar gesperrt, bis Scopes, Richtlinienprofile und der konkrete Entwurfsendpunkt geprüft und separat freigegeben sind.

## Inaktiv im normalen Seller-Workflow

| Modul | Grund |
|---|---|
| Direkter Nova-/Browserimport | Würde die Company-OS-Prüfung umgehen |
| Produktbeschaffung | Aufgabe von Nova und Company OS |
| Doppelte Produktanalyse | Aufgabe der Company-OS-Produktprüfung |
| Zweite Vorab-Kalkulation | Company OS liefert die verbindliche Kostenrechnung |
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
- Neue Listing-Daten werden additiv gespeichert; unbekannte vorhandene Felder bleiben erhalten.
- Die Auto-Lister-API-Schaltfläche bleibt deaktiviert, solange kein geprüfter eBay-Inventory-Entwurfsendpunkt vorhanden ist.

## Rückweg

Der Ausgangsstand dieser Änderung ist der Commit:

```text
7b3f9accb7ce293311c1f707fabced51785e0683
```

Die Integration wird auf dem separaten Branch `feat/seller-tool-selling-flow` entwickelt. Ein Rückweg ist damit jederzeit möglich, ohne Product-Master-Daten, LocalStorage-Werte oder produktive Einstellungen zu löschen.