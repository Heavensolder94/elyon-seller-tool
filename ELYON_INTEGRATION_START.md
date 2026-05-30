# Elyon Integration Start

## Bereits verbunden oder vorbereitet

### eBay
- OAuth vorhanden
- Login URL vorhanden
- Token Exchange vorhanden
- Orders API vorhanden
- Search API vorhanden
- Scope Prüfung vorbereitet

### CJ Dropshipping
- Produktsuche vorhanden
- API Integration vorhanden
- Lieferantenquelle vorbereitet

### AliExpress
- Browser Extension Import vorbereitet
- Manueller Import vorbereitet
- Markierter Text kann übernommen werden

### Amazon
- Nur als optionale Vergleichs- oder Notfallquelle vorgesehen
- Keine automatische Bestellung

## Neue Integrationsprüfung

API:

/api/integrations/status

Liefert:

- eBay Status
- CJ Status
- AliExpress Status
- Amazon Status
- Verkaufsbereit-Score
- Checkliste
- Nächste Schritte

## Sicherheitsregeln

Bewusst gesperrt:

- autonome eBay Veröffentlichungen
- automatische Lieferantenbestellungen
- automatische Amazon Bestellungen

Alle kritischen Aktionen bleiben manuell bestätigt.

## eBay Neuverbindung

Wenn Orders einen invalid_scope Fehler liefern:

1. EBAY_SCOPES prüfen
2. Fulfillment Scope ergänzen
3. Neu verbinden
4. Neuen Refresh Token erzeugen

Danach Orders erneut testen.

## CJ Test

API:

/api/cj/search?q=test

Wenn Produkte zurückkommen, funktioniert die Verbindung.

## AliExpress Import

API:

/api/import/extension-product

POST Daten:

- sourceUrl
- title
- description
- price
- images
- variants

Produkte werden nur zur Prüfung übernommen.

Keine automatische Veröffentlichung.

## Verkaufsstart Checkliste

1. eBay verbunden
2. Orders Scope aktiv
3. CJ Suche funktioniert
4. Erstes Produkt importiert
5. Marge geprüft
6. Lieferzeit geprüft
7. eBay Listing manuell bestätigt

Danach ist Elyon bereit für erste manuelle Verkäufe.
