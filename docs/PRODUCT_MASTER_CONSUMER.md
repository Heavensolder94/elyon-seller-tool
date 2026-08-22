# Seller Tool als Product-Master-v2-Consumer

**Stand: 22.08.2026**

## Verantwortungsgrenze

Company OS / Product Master v2 ist die kanonische fachliche Quelle für Produktidentität und Produktlebenszyklus. Das Seller Tool liest diese Daten und ergänzt ausschließlich operative Seller-Daten.

```text
Nova / Bulk
  → Company OS Product Review
  → ELY-xxxxxx
  → Company OS Product Master v2
  → Market / Pricing / Listing Designer
  → eBay Draft / Live
  → Seller Tool Consumer
  → Orders / Fulfillment / Invoices / Returns / Refunds
```

| Bereich | Owner | Rolle im Seller Tool |
|---|---|---|
| Identity, ELY-Artikelnummer, Produktdaten, Varianten | Company OS | unverändert lesen |
| Supplier-Zuordnung und Supplier-SKU | Company OS | getrennt anzeigen und referenzieren |
| Market, Economics, Pricing, Compliance | Company OS | nicht neu berechnen oder überschreiben |
| Listing Intent, Listing Design, eBay Channel State | Company OS | als Channel-State darstellen |
| Orders, Buyer, Versand, Tracking, Rechnungen, Retouren, Refunds | Seller Tool | operative Daten führen |
| eBay API-Ausführung | Seller Tool | bestehende Engine mit manueller Freigabe verwenden |

## Consumer-Vertrag

`lib/product-master-consumer.js` adaptiert den Company-OS-Vertrag `elyon-product-master-v2` zu einer abwärtskompatiblen `SellerProductView`.

- `/api/products` ist eine read-only Consumer-API.
- `POST`, `PUT`, `PATCH` und `DELETE` auf dieser Route werden mit `product_master_read_only` abgelehnt.
- `/api/integrations/company-os/products` bleibt nur als geschützte Kompatibilitätsroute erhalten und schreibt nicht mehr.
- Rohimporte ohne stabile `ELY-xxxxxx`-Identität werden verworfen.
- Das Seller Tool erzeugt keine Elyon-Identität und verwendet keine Titel-Matches.
- `elyonProducts` ist eine lokale Arbeitskopie/Projection für UI und operative Abläufe, keine Product-Master-Datenbank.

Der Adapter übernimmt kanonische Identitätsfelder unverändert: `articleNumber`, `productId`, `productKey`, `companyOsProductId`, `sourceImportId`, `supplierSku` und Varianten-SKUs. Company-OS-Economics erhalten die Kennzeichnung `calculationSource: "company_os"`; Seller-seitige Neuberechnung ist kein Fallback.

## Sync und Fehlerzustände

Der Consumer liest `GET /api/product-master-v2` mit `X-Elyon-Sync-Code`. Ein erfolgreicher Read aktualisiert ausschließlich den markierten v2-Cache. Bei einem temporären Fehler bleibt der letzte v2-Stand als `freshness: "stale"` sichtbar. Es erfolgt keine Löschung und kein stiller Wechsel zu einem Rohimport.

Ein alter Seller-Datensatz darf nur als explizit markierter `compatibility`-Fallback gelesen werden, wenn Company OS nicht erreichbar ist und eine stabile ELY-Artikelnummer vorhanden ist. Er ist niemals die bevorzugte Quelle.

## eBay und Orders

Die bestehende eBay-Engine bleibt für Draft, Publish und Withdraw erhalten. Der fachliche Input kommt aus der Product-Master-v2-Projection; Safety Gates und manuelle Bestätigungen bleiben aktiv.

Order-Zeilen führen eine `productReference` mit `articleNumber`, `sku`, `supplierSku`, `offerId`, `listingId` und technischen Produkt-IDs. Die Referenz erzeugt keine Produktkopie und priorisiert stabile eBay-/Elyon-Identitäten vor Textfeldern.

## Klassifizierung der Seller-Komponenten

| Komponente | Einstufung |
|---|---|
| `lib/product-master-consumer.js` | Consumer-Adapter |
| `/api/products` | Read-only Consumer-API |
| `elyonProducts` / Product Board | lokale Projection und Working Copy |
| `lib/product-master-active.js` | Legacy-Kompatibilität, kein v2-Write |
| `lib/product-master-store.js` | Legacy-Kompatibilität und operative Draft-Registry |
| Listing Designer / Auto Lister UI | lokale Arbeitskopie plus operative Vorbereitung; kein kanonischer Product Write |
| `lib/ebay-production.js` | operative Seller-/eBay-Engine mit Safety Gates |
| Product-Master-Pricing-/Approval-Writes im Seller Tool | deprecated und blockiert |

## Migration und Rollback

Die Änderung ist leseseitig und abwärtskompatibel: bestehende Browser-Arbeitskopien bleiben lesbar, verlieren aber ihre Rolle als fachliche Wahrheit. Ein Rollback des Seller-Deployments entfernt keine Company-OS-Daten; vorübergehend würde lediglich der alte Consumer-Code wieder aktiv.

Vor einem späteren Entfernen der Legacy-Kompatibilität müssen alle produktiven Seller-Instanzen mindestens einmal erfolgreich gegen den v2-Endpunkt synchronisiert haben.
