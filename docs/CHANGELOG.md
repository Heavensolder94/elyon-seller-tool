# Changelog

## Start

- Basis für Dokumentation erstellt
- Architekturdatei ergänzt
- Sicherheitsdatei ergänzt

## 2026-09-05 – Verkaufsflow-QA

- Direkte eBay-Entwürfe im vorhandenen Lifecycle-Register erfassen; EBAY_ENV konsistent verwenden.
- Bestehende unveröffentlichte Offers nach SKU wiederverwenden und vor Inventaränderungen prüfen.
- Company-OS-Inventory-Entwürfe inklusive Varianten über die bestehende Bridge registrieren; Identitäten vorher bei eBay zurücklesen.
- Ungültige/unvollständige eBay-Snapshots nicht als zuverlässige Lifecycle-Abgleiche verwenden.
- Asynchrone Fehler der eBay-Produktionsaktionen strukturiert zurückgeben.
- 14 neue HTTP-Fixture-Regressionen und 3 ausführbare Render-Tests; 732 Root-Tests und Production-Build erfolgreich.
- Bei fehlgeschlagenem Entwurfsabgleich keine falsche Leerbestandsmeldung anzeigen.
- Authentifizierter Browser: eBay verbunden, aktive Listings und Orders lesbar. Product Master benötigt den serverseitigen Company-Sync-Code; Inventory-Drafts melden einen eBay-Fehler. Vollständige Verkaufsabnahme steht aus.
