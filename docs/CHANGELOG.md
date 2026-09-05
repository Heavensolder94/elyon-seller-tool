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
- 14 neue HTTP-Fixture-Regressionen; 729 Root-Tests und Production-Build erfolgreich. Echte Kontoverbindung und Verkaufsabnahme stehen aus.
