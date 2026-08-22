# Elyon Seller Tool – aktive und inaktive Module

**Stand: 22.08.2026**

## Verbindliche Rolle

```text
Elyon Nova sammelt Produkt- und Lieferantendaten.
Company OS prüft Produkt, Markt, Compliance und Wirtschaftlichkeit.
Company OS besitzt den Product Master v2, erstellt das Listing im Listing Designer / Auto Lister und steuert den eBay-Channel-State.
Das Seller Tool konsumiert diese Produktwahrheit ab eBay und verwaltet den laufenden Seller-Betrieb.
```

## Verbindlicher Gesamtworkflow

```text
Nova
→ Company OS
   → Nova Eingang
   → Produktprüfung
   → Marktanalyse / Marktentscheidung
   → Listing Designer
   → Auto Lister
   → eBay-Übergabe
→ eBay
→ Seller Tool
   → eBay-Entwürfe (UNPUBLISHED)
   → Aktive Listings (PUBLISHED)
   → Bestellungen
   → Lieferantenbestellung / Bearbeitungsstatus
   → Versand & Tracking
   → Finanzen / Rechnungen / Auszahlungen
   → Retouren
   → tatsächlicher Gewinn und Auswertung
```

## Aktive SellerTool-Module

| Modul | Verbindliche Aufgabe |
|---|---|
| Übersicht | Post-eBay Seller-Betrieb, Umsatz, Orders und nächste operative Aufgaben |
| eBay-Entwürfe | Echte `UNPUBLISHED`-Angebote direkt aus der eBay Inventory API anzeigen |
| Aktive Listings | Echte `PUBLISHED`-Angebote direkt aus der eBay Inventory API anzeigen |
| Bestellungen | eBay-Orders kontrolliert bearbeiten |
| Versand | Fulfillment, Tracking und Versandstatus verwalten |
| Finanzen | Umsatz, Kosten, Rechnungen, Auszahlungen und tatsächlichen Gewinn auswerten |
| Retouren | Rückgaben, Erstattungen und Verluste dokumentieren |
| Einstellungen | eBay, Product Master, Sicherheit, Backup und technische Diagnose |
| Virtuelle Mitarbeiter | Operative KI-Agenten, Aufgaben und Freigaben |
| JARVIS / Brain Control | Überwachung, Koordination, Brain-Dateien und Freigaben |
| Jarvis Integration Center | KI-Modelle, APIs, Routing, Kosten und Logs |

## Datenquellen

- **eBay Inventory API** ist die verbindliche Quelle für eBay-Entwürfe und aktive Listings.
- **eBay Orders API** ist die verbindliche Quelle für eBay-Bestellungen.
- **Company OS Product Master v2** ist die kanonische Quelle für Identität, Produktdaten, Supplier, Pricing, Compliance, Listing Intent und eBay Channel State.
- **Seller Tool `/api/products`** ist ausschließlich eine read-only Consumer-Projection; `elyonProducts` bleibt lokale Working Copy/Cache und erzeugt keine neue Elyon-Identität.
- **Supplier-SKU und Elyon-SKU** bleiben getrennte Referenzen; Orders verknüpfen sich über ELY-SKU, Offer-ID, Listing-ID oder Product-ID.
- **Lokale Browserdaten** sind nur Arbeitskopie/Fallback und keine führende Datenquelle.
- **Google Sheets** ist optionaler Export-/Backup-/Migrationskanal und kein Datenmaster.

## Nicht mehr Teil des normalen SellerTool-Workflows

| Modul / Funktion | Zuständigkeit |
|---|---|
| Produktbeschaffung | Nova / Company OS |
| Produktanalyse | Company OS |
| Marktcheck / Marktentscheidung | Company OS |
| Vorab-Kalkulation | Company OS |
| Compliance-/Rechtsprüfung vor Listing | Company OS |
| Company-OS-Produkte manuell als Seller-Arbeitskopie übernehmen | nicht mehr normaler SellerTool-Schritt |
| Listing Designer | Company OS |
| Auto Lister | Company OS |
| Kategorie- und Pflichtmerkmalsvorbereitung | Company OS |
| Listing-Paket finalisieren | Company OS |
| direkte SellerTool-Schaltfläche „Verkaufen“ | retired / nur Legacy-Code |
| mobiler SellerTool-Schritt „Verkaufen“ | retired |
| Shopify Lab | inaktiv |
| Google-Sheets-Vollsync als Hauptspeicher | inaktiv |

Die zugrunde liegenden Legacy-Listing-Komponenten werden zunächst nicht hart gelöscht. Sie bleiben vorübergehend als Rückfall-/Migrationscode im Repository, sind aber aus Navigation, Quickstart und normalem SellerTool-Betrieb entfernt. Eine spätere Code-Löschung erfolgt erst, wenn `Company OS → eBay` praktisch stabil bestätigt ist.

## Sicherheitsregeln

- Keine automatische Lieferantenbestellung ohne separat freigegebene Automation.
- Keine automatische Kundennachricht ohne separat freigegebene Automation.
- Keine erfundenen Produkt-, Compliance-, Hersteller- oder Sicherheitsdaten.
- eBay-Entwürfe und aktive Listings werden nicht aus Product-Master-Statuswerten erfunden; eBay ist dafür die Quelle der Wahrheit.
- Product-Master-v2-Daten dürfen eBay-Bestand fachlich anreichern; die bestehende eBay-Engine führt nur die operative, manuell bestätigte API-Aktion aus.
- Product-Master-Writes im Seller Tool sind deprecated und blockiert. Rohimporte ohne ELY-Identität bleiben außerhalb der Seller-Projection.
- Finance verwendet echte operative Daten; Schätzwerte müssen als solche gekennzeichnet bleiben.
- Legacy-Pre-eBay-Module dürfen nicht erneut prominent in Navigation oder Quickstart aktiviert werden, ohne die Systemrolle bewusst zu ändern.

## Zielbild

```text
Company OS = vor eBay
Seller Tool = ab eBay
Jarvis = überwacht und koordiniert beide Systeme
```
