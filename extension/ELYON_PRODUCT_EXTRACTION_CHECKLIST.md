# Elyon Browser OS Product Extraction Checklist

Diese Checkliste ist nur fuer manuelle Debug-Tests. Keine Live-Aktion ausfuehren.

## Amazon
- Plattform wird als `amazon` erkannt.
- Titel, Preis, Waehrung, Hauptbild und URL sind gesetzt.
- `Info zu diesem Artikel`, Produktbeschreibung und Produktdetails landen in `elyonProduct.content`.
- ASIN, Marke, Bewertung und Rezensionen werden soweit sichtbar uebernommen.
- Button `Varianten erkennen` liest sichtbare Amazon Varianten sicher ohne Durchklicken.
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
- Button `Varianten erkennen` liest sichtbare Varianten/SKUs als Snapshot.

## eBay
- Plattform wird als `ebay` erkannt.
- Titel, Preis, Versand, Seller, Item-ID, Bilder und Artikelangaben werden soweit sichtbar erkannt.
- Keine eBay-Live-Aktion, kein Listing, keine Nachricht.
- Button `Varianten erkennen` liest sichtbare eBay Varianten sicher ohne Durchklicken.

## Generic / JSON-LD
- Unbekannte Produktseiten nutzen `extractGenericProduct()`.
- JSON-LD `Product` Daten werden ausgelesen, wenn vorhanden.
- `extractionDebug` zeigt Parser, Confidence Score, gefundene und fehlende Felder.

## Senden an Elyon
- Popup zeigt `Extraction Debug`.
- Button `JSON kopieren` kopiert die normalisierte `elyonProduct` Struktur.
- `Produkt an Elyon senden` sendet weiter an `/api/extension/import-product`.
- Wenn Backend nicht erreichbar ist, wird lokal in `elyon_research_memory` gespeichert.

## Manuelle Textuebernahme
- Text auf Produktseite markieren.
- Popup oder Overlay: `Markierten Text uebernehmen`.
- Automatische lokale Klassifizierung pruefen: Beschreibung, Bulletpoints, technische Infos, Lieferinfo, Risiko, Supplier, SEO oder Notiz.
- Captures werden unter `elyon_manual_captures` gespeichert.

## Sidepanel
- Popup oder Overlay: `Side Panel oeffnen`.
- Tabs pruefen: Produkt, Analyse, Supplier, Varianten, History, Notizen, Sicherheit.
- Workflow Buttons setzen nur lokale Vorbereitung, keine KI-Ausfuehrung erzwingen.
