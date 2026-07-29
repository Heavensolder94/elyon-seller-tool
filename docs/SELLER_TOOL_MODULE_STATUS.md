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
      → bestehender Titel-, SEO- und KI-Generator
      → Elyon Visual Designer
   → eBay Auto Lister
      → Kategorie und Pflichtmerkmale
      → GPSR, Hersteller und Varianten
      → interner Seller-Entwurf
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
| Titel- und KI-Generator | Bestehende Seller-Funktionen für Titel, SEO, Beschreibung, KI und Drafts bleiben erhalten |
| Elyon Visual Designer | Neun Themes, Live-Vorschau, Desktop/Mobil, Bilder, Produktvorteile, Merkmale, HTML und JSON |
| DeepSeek Listing Assistant | Geschützte, faktengebundene Textoptimierung mit Stärke-Regler; keine erfundenen Produkt- oder Sicherheitsdaten |
| eBay Auto Lister | Erstellt einen vollständigen internen, unveröffentlichten Seller-Entwurf |
| eBay Taxonomy | Kategoriesuche, Pflichtmerkmale und zulässige Vorschlagswerte für EBAY_DE |
| GPSR- und Herstellerprüfung | Hersteller, EU-verantwortliche Person, Sicherheitsangaben und dokumentierte Ausnahmen |
| Variantenprüfung | Variantenübersicht, eindeutige Zuordnung und bewusste Bestätigung |
| eBay-Wettbewerb | Aktuelle Preis- und Angebotsübersicht ohne automatische Preisentscheidung |
| Bereit zum Einstellen | Paket kontrollieren, kopieren und das bewusst manuelle eBay-Listing dokumentieren |
| eBay OAuth und Orders | eBay verbinden und Bestellungen abrufen |
| Versand und Tracking | Erfüllung nach einem Verkauf verwalten |
| Rechnungen | Rechnungen und Belege verwalten |
| Retouren | Rückgaben, Erstattungen und Verluste dokumentieren |
| Google Drive / Backup | Daten sichern und wiederherstellen |
| Integrationsstatus | Tatsächliche Verbindungen prüfen |

## Listing-Designer-Status

Der aktive Seller-Bereich enthält zwei Designer-Modi:

### Titel- und KI-Generator

- bestehende Seller-Funktionen bleiben unverändert erhalten
- Titel, SEO, Beschreibung, Wettbewerb, KI und gespeicherte Drafts weiter nutzbar
- Product-Master-Daten nur nach bewusstem Klick übernehmen

### Elyon Visual Designer

- neun Designs: Signature, Nordic Light, Carbon Pro, Mobile Compact, Clean, Tech Blue, Home Natural, Fashion und Outdoor
- Desktop- und Mobil-Vorschau
- Kategorie, Titel, Untertitel, Kurz- und Langbeschreibung
- Produktvorteile und technische Merkmale
- Lieferumfang, wichtige Hinweise, Versand, Rückgabe und Service
- HTTPS-Bildverwaltung mit Reihenfolge und Hauptbild
- HTML anzeigen, kopieren und herunterladen
- JSON exportieren und importieren
- Qualitätsprüfung mit sichtbaren offenen Punkten
- additive Speicherung unter `listing.descriptionDesign` und `listing.descriptionDesignDraft`
- keine Skripte oder Tracking-Funktionen im erzeugten Listing-HTML

## Auto-Lister-Status

Der aktive Auto Lister erstellt ausschließlich einen internen Seller-Entwurf:

- Titel, Beschreibung, Kategorie, Condition ID, Artikelmerkmale, Bilder, Preis und Menge prüfen
- Company-OS-Freigabe und Product-Master-Blocker berücksichtigen
- Elyon-Mindestregel berücksichtigen
- eBay-Kategorie über Taxonomy suchen
- Pflichtmerkmale laden und fehlende Werte sichtbar leer lassen
- GPSR-Status dokumentieren
- Hersteller und gegebenenfalls EU-verantwortliche Person dokumentieren
- Sicherheits- und Warnhinweise prüfen
- GPSR-Ausnahme nur mit Begründung und bewusster Bestätigung zulassen
- Varianten nur nach eindeutiger Zuordnung freigeben
- eBay-Wettbewerb als Entscheidungshilfe anzeigen
- DeepSeek nur faktengebunden für Titel und Beschreibung einsetzen
- Entwurf additiv unter `listing.autoListerDraft` speichern
- unbekannte Produkt- und Listing-Felder erhalten
- keine automatische Veröffentlichung auslösen

Die direkte eBay-Inventory-API-Übergabe bleibt sichtbar gesperrt, bis Scopes, Richtlinienprofile und der konkrete Entwurfsendpunkt praktisch geprüft und separat freigegeben sind.

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
| Automatische eBay-Veröffentlichung | Erst nach separater technischer, rechtlicher und praktischer Freigabe |

## Sicherheitsregeln

- Keine automatische eBay-Veröffentlichung.
- Keine automatische Lieferantenbestellung.
- Keine automatische Kundennachricht.
- Keine ungeprüften Nova-Rohimporte im Seller Product Master.
- Keine finale Seller-Freigabe ohne Company-OS-Status `ready_for_seller_tool` beziehungsweise `bereit_manuell_einstellen`.
- Mindestens 20 % Marge nach realistischen Kosten oder mindestens 5 € realistischer Gewinn.
- Einkaufspreis und Verkaufspreis werden getrennt behandelt.
- LocalStorage ist nur eine bewusst erzeugte Arbeitskopie, nicht die Hauptdatenquelle.
- Neue Listing-Daten werden additiv gespeichert; unbekannte vorhandene Felder bleiben erhalten.
- Keine Marke, EAN, MPN, Hersteller-, GPSR-, CE-, Sicherheits-, Material-, Maß- oder Leistungsangabe durch KI erfinden.
- Pflichtmerkmale ohne Beleg bleiben leer und blockieren die Freigabe.
- Die Auto-Lister-API-Schaltfläche bleibt deaktiviert, solange kein geprüfter eBay-Inventory-Entwurfsendpunkt vorhanden ist.

## Rückweg

Ausgangsstand des grundlegenden Seller-Verkaufsflows:

```text
7b3f9accb7ce293311c1f707fabced51785e0683
```

Ausgangsstand der vollständigen Designer- und Auto-Lister-Erweiterung:

```text
71d9276e79f3d4baca29dd348a4153d7bfe2d11a
```

Die vollständige Erweiterung wird auf dem separaten Branch `feat/seller-tool-designer-auto-lister-parity` entwickelt. Ein Rückweg ist möglich, ohne Product-Master-Daten, LocalStorage-Werte, Secrets oder produktive Einstellungen zu löschen.

## Einheitlicher Kategorienstandard

Der Product Master, Company-OS-Eingang, Listing Designer und Auto Lister verwenden additiv dasselbe `categoryData`-Schema (`elyon-category-v1`). Lieferanten-/Quellkategorie und offizielle eBay-DE-Kategorie bleiben getrennt. Eine Kategorieänderung lädt Pflichtmerkmale neu und setzt eine frühere Pflichtmerkmal-Bestätigung zurück.
