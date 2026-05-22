# Elyon Browser OS Product Extraction Checklist

Diese Checkliste ist nur fuer manuelle Debug-Tests. Keine Live-Aktion ausfuehren.

## Amazon
- Plattform wird als `amazon` erkannt.
- Titel, Preis, Waehrung, Hauptbild und URL sind gesetzt.
- `Info zu diesem Artikel`, Produktbeschreibung und Produktdetails landen in `elyonProduct.content`.
- ASIN, Marke, Bewertung und Rezensionen werden soweit sichtbar uebernommen.
- `workflow.liveAction` bleibt `false`.

## AliExpress
- Plattform wird als `aliexpress` erkannt.
- Sichtbares Produkt-Popup wird beruecksichtigt, falls vorhanden.
- Titel, Preis, Bilder, Varianten, Store und Versanddaten werden defensiv erkannt.
- Fehlende Felder werden als `null`, `[]` oder `{}` gespeichert.
- Produkt-Tabs mit `/item/` werden beim Laden lokal als `elyon_current_product` gespeichert.
- Button `AliExpress Varianten scannen` scannt nur Variantenoptionen, keine Kauf-/Warenkorb-Aktionen.
- Varianten landen in `elyon_aliexpress_variant_cache` und in `elyonProduct.variants`.

## CJ Dropshipping
- Plattform wird als `cjdropshipping` erkannt.
- Titel, SKU/Product-ID, Preis, Bilder, Beschreibung, Spezifikationen und Warehouse-Daten werden soweit sichtbar erkannt.
- Keine automatische Navigation und kein automatischer Klick auf riskante Links.

## eBay
- Plattform wird als `ebay` erkannt.
- Titel, Preis, Versand, Seller, Item-ID, Bilder und Artikelangaben werden soweit sichtbar erkannt.
- Keine eBay-Live-Aktion, kein Listing, keine Nachricht.

## Generic / JSON-LD
- Unbekannte Produktseiten nutzen `extractGenericProduct()`.
- JSON-LD `Product` Daten werden ausgelesen, wenn vorhanden.
- `extractionDebug` zeigt Parser, Confidence Score, gefundene und fehlende Felder.

## Senden an Elyon
- Popup zeigt `Extraction Debug`.
- Button `JSON kopieren` kopiert die normalisierte `elyonProduct` Struktur.
- `Produkt an Elyon senden` sendet weiter an `/api/extension/import-product`.
- Wenn Backend nicht erreichbar ist, wird lokal in `elyon_research_memory` gespeichert.
