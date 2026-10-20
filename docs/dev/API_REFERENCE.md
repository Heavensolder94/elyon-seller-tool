# API Reference

## Beispielrouten

- /api/ping
- /api/health
- /api/cj/status
- /api/ebay/status

## Ziel

API-Endpunkte zentral dokumentieren.

## QA 2026-09-05: eBay-Entwürfe und Company-Lifecycle

`POST /api/ebay/create-draft` verwendet jetzt denselben authentifizierten Lifecycle-Handler und dasselbe Entwurfsregister wie `POST /api/ebay?action=create-draft`. API und Register beachten `EBAY_ENV` konsistent. Ohne Offer-ID wird zunächst nach der SKU gesucht; ein eindeutiges UNPUBLISHED-Angebot wird wiederverwendet. Aktive, unklare und unvollständig gelesene Angebote stoppen Entwurfsschreibzugriffe. Ein erfolgreicher eBay-Aufruf bleibt bei Registerfehler erfolgreich, enthält aber `draftRegistry.persisted:false` und eine Warnung.

Die vorhandene Bridge `POST /api/integrations/company-os/ebay-lifecycle` unterstützt zusätzlich:

```json
{
  "action": "register_inventory",
  "environment": "production",
  "sourceProductId": "company-product-id",
  "offers": [{ "offerId": "ebay-offer-id", "sku": "product-sku" }]
}
```

Die vorhandene Bridge-Authentifizierung bleibt erforderlich. Maximal 100 Offer-/SKU-Paare; der Server liest jedes Offer bei eBay zurück und prüft SKU, EBAY_DE und UNPUBLISHED. Erst nach erfolgreicher Prüfung aller Paare wird ein Batch im bestehenden `elyon_ebay_draft_registry_v1` gespeichert. Antwort: `ok`, `persisted`, `count`, `storage`. Wiederholung derselben Identitäten erzeugt keine zusätzlichen Datensätze. Registrierung löst keine eBay-Mutation aus. Das gesamte bestehende Register ist weiterhin nicht gegen alle parallelen Read/Modify/Write-Konflikte abgesichert.

Ungültige oder unvollständige Inventory-/Trading-Snapshots werden nicht mehr zur Ableitung von Entfernt-/Beendet-Zuständen verwendet. Ein Inventory-Artikel ohne Offer verhindert bei spezifischem eBay-Fehler 404/25713 nicht den übrigen Abgleich. Andere 404/Autorisierungs-/Providerfehler bleiben Fehler.

Übernahme: Seller Tool zuerst, dann Company OS mit der ergänzten Bridge-Aktion. Keine Migration und keine neuen ENV-Namen. Rollback per Commit-Revert ohne Löschen von Registereinträgen oder eBay-Angeboten. Die produktive Abnahme mit einem angemeldeten Konto bleibt erforderlich.

## Sendungsmeldung an eBay (2026-10-20)

`POST /api/ebay?action=fulfill-order` meldet eine Sendungsnummer an eBay und markiert die
Bestellung dort als versendet. Es ist die einzige Route, die eBay-Fulfillment schreibt.

```json
{
  "orderId": "1234567890",
  "trackingNumber": "00340434161094000000",
  "carrier": "DHL",
  "lineItems": ["line-item-id"]
}
```

- `orderId`: 6–30 Ziffern, sonst `ebay_order_id_invalid`
- `trackingNumber`: Pflicht, sonst `ebay_tracking_number_required`
- `carrier`: optional, Standard `DHL`, Muster `^[A-Z0-9_]{2,40}$`, sonst `ebay_carrier_invalid`
- `lineItems`: optional; ohne Angabe meldet eBay die gesamte Bestellung
- Nur `POST`; `requireSellerAccess` ist vorgeschaltet
- **Keine Doppelmeldung:** Ist `orderFulfillmentStatus` bei eBay bereits `FULFILLED`, wird nichts
  geschrieben und `alreadyFulfilled: true` zurückgegeben
- Antwort: `fulfilled`, `alreadyFulfilled`, `fulfillmentId`, `environment`
