# API Reference

## Beispielrouten

- /api/ping
- /api/health
- /api/ebay/status

## Ziel

API-Endpunkte zentral dokumentieren. Produktbeschaffung erfolgt über Elyon Nova; die eigenständigen CJ-Endpunkte des Seller Tools sind entfernt.

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

`POST /api/ebay?action=publish` liest den Entwurf vor dem ersten eBay-Schreibzugriff zurück und prüft Offer-ID, SKU, Marktplatz, Angebotsformat und den Status `UNPUBLISHED`. Bei abweichender Zuordnung oder bereits vorhandenem Listing antwortet die Route mit `409 ebay_publish_offer_mismatch`. Der Angebotsstatus muss dann zuerst abgeglichen werden.

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

## Verkaufsdaten-Sicherung (2026-10-20)

`POST /api/sales/snapshot` sichert die Verkaufsliste dauerhaft in Upstash/KV.
`GET /api/sales/snapshot` liest sie zurück.

- Geschützt über `requireSellerAccess`, Payload-Grenze 2 MB
- Zusammenführung **ohne Duplikate**: Schlüssel ist `orderNo`, sonst `id`; der spätere
  Eintrag gewinnt. Obergrenze 2000 Einträge.
- Gespeichert werden nur fachliche Felder (`orderNo`, `product`, `price`, `qty`, `cost`,
  `fees`, `profit`, `platform`, `status`, `carrier`, `trackingNumber`, `shipDate`,
  `buyerRef`, Zeitstempel). Buyer-E-Mail und Telefon werden **nicht** dupliziert.
- Der Browser schreibt nach jedem `saveSales()` zusätzlich einen Snapshot (`keepalive`),
  Fehler dabei ändern den lokalen Ablauf nicht.
- Der Browser bleibt die Arbeitskopie; der Snapshot ist das Wiederherstellungsnetz.

## Amazon-Recherche an Company OS (2026-11-20)

`POST /api/products/review-intake` akzeptiert zusätzlich `mode: "amazon_research"` mit einem `product` (ASIN, Titel, Amazon-URL, optionale Referenzdaten). Die Route erfordert Seller-Zugang und dieselbe Origin. Sie prüft die Company-OS-Fähigkeit `createOnlyReview`, erkennt bekannte Identitäten und sendet einen create-only Workflow-Übergang. Sie erzeugt keinen eBay-Entwurf und publiziert nichts. Amazon-Preis und Bilder sind ungeprüfte Recherche; Kosten und Rechte bleiben offen. Ein Timeout ist kein Erfolgsnachweis; vor Wiederholung Company OS prüfen. Das Company-OS-Update muss zuerst produktiv sein.

Für neue Rechercheimporte bleiben bis zu zwölf Quellbilder, Originaltitel und -beschreibung, ausgewählte Varianten, Bulletpoints, Breadcrumbs und eingelesene Recherchemerkmale als Quelldaten erhalten. Die ausgewählten Varianten sind keine vollständige, bestätigte Variantenmatrix und alle Inhalte bleiben ohne Rechte- oder Lieferantenbestätigung.

Bei FX-Draft-Feeds bestätigt `draftVisible` aus Kompatibilitätsgründen nur einen laut eBay erfolgreich verarbeiteten Feed-Eintrag. Der aktuelle Bestand im Seller Hub wird dadurch nicht bestätigt und muss dort geprüft werden.

### Finance: Rechnungssnapshot und Belegmetadaten

`POST /api/finance?action=issue-kleinunternehmer-invoice` erwartet eine eBay-`orderId`. Der Server lädt die Bestellung selbst, prüft Verkäuferkonfiguration und Bestelldaten und benötigt persistenten Redis/Upstash-Speicher. Bei unvollständigen Angaben, fehlender Persistenz oder vorhandenen historischen Rechnungsdaten wird nicht ausgestellt. Die serverseitige Nummernreservierung ist bestellgebunden. Ein ausgestellter Snapshot ist beim gewöhnlichen Finance-Sync unveränderlich; ältere Metadaten werden nicht automatisch migriert. Erscheint ein historischer Eintrag während einer parallelen Ausstellung, bleibt er erhalten und der Ausstellungsversuch endet mit Konflikt. Eine reservierte Nummer kann dabei ungenutzt bleiben.

Das vorhandene `documents`-Array in Finance enthält die Dateiidentität (`id`, `name`, `type`, `size`, `sha256` und nach Upload `cloudFileId`). Nach erstem Speichern schützt der Server diese Identität gegen Überschreiben durch spätere Sync-Daten. Ergänzende manuelle Belegangaben umfassen `documentType`, `supplier`, `invoiceReference`, `orderReference`, `ebayOrderId`, `productReference`, `documentDate`, `paymentDate`, `amount`, `currency` sowie optionale `receiptLineItemsV1`, `receiptShippingAmountV1` und `receiptAdditionalAmountV1`. Positionsbeträge sind Gesamtbeträge pro Position; der manuell eingetragene Betrag enthält Versand und Zusatzkosten. Bei widersprüchlicher Summe blockiert die Kostenübernahme. Sie sind Beschreibungen und bleiben `needs_review`; sie erzeugen keine Transaktion oder steuerliche Buchung. Eine Referenz-Dublettenwarnung im Browser ist ein Hinweis, keine serverweit atomare Dublettensperre. Hash-Prüfung erfolgt beim lokalen Import, vor Drive-Upload und beim Öffnen/Download. Dateien werden zunächst lokal in IndexedDB gespeichert; ein Drive-Upload und synchronisierte Metadaten sind für den Abruf auf anderen Geräten erforderlich. Google Drive allein belegt keine GoBD-Konformität.

`POST /api/finance?action=record-receipt-costs` akzeptiert `documentId`, `expectedRevision` und `allocations` mit `orderId`, `itemId` und EUR-`amount`. Vorher muss der Beleg in Finance synchronisiert und in Drive gesichert sein. Vor dem Schreiben lädt der Server das gebundene Original über die vorhandene Drive-Integration, prüft Archivordner, Datei-ID, Beleg-ID und SHA-256 und blockiert bei fehlender Verbindung oder abweichendem Original. Lieferant, Referenz, bezahlter Gesamtbetrag und tatsächliches Zahlungsdatum sind manuell einzugeben. Der Server validiert erneut, erfasst nur bei centgenauer Summe die Teilbeträge als `needs_review` und schützt die zugrunde liegenden Beträge/Referenzen gegen spätere normale Sync-Änderungen. Verglichen werden Beleg-ID, SHA-256 und gefrorene Lieferanten-/Rechnungsreferenz gegen bereits beleggebundene bzw. zugeordnete Lieferantenkosten. CAS-Revisionskonflikte verhindern zeitgleiche doppelte Anlage. Nicht beleggebundene alte manuelle Kosten lassen sich nicht zuverlässig automatisch als Dubletten erkennen und müssen manuell geprüft werden. Die Beleg- und Artikelreferenzen werden nicht gegen eBay oder Company OS verifiziert. Keine Währungsumrechnung; nur EUR und kein geschlossener Zahlungsmonat.

Noch nicht implementiert: Erkennung von PDF-/Bildinhalten, PDF-Text-/Bild-OCR, Schema-Validierung, sichere automatische Kostenzuordnung und Teilstorno. PDF-Archiv, vollständiger Storno und eine Ersatzrechnung aus verifizierten eBay-Daten sind Entwurfsfunktionen und benötigen Live- und fachliche Prüfung. Eine Druckvorschau aus dem Snapshot ist kein archiviertes PDF.

`GET /api/finance?action=read-issued-invoice&orderId=…` lädt nur einen ausgestellten Server-Snapshot nach Prüfung seiner SHA-256-Prüfsumme. Fehlende oder fehlerhafte Prüfsummen blockieren den Wiederaufruf; historische Einträge werden nicht zu neuen Rechnungen migriert. Dies ist eine Snapshot-Vorschau und noch kein archiviertes Original-PDF.


Neue Kleinunternehmerrechnungen erzeugen ein PDF und laden es vor dem Speichern des ausgestellten Snapshots in Google Drive hoch. Der Server prüft die Datei anschließend über die bestehende Drive-Integritätsprüfung. Der ausgestellte Snapshot speichert Datei-ID, Dokument-ID und SHA-256; ein Abruf lädt die Originalbytes aus Drive und prüft sie erneut. Ohne Drive-Verbindung wird keine neue Rechnung ausgestellt. Bestehende Snapshots ohne PDF bleiben unverändert und werden als rekonstruierte Vorschau gekennzeichnet. Bei parallelen Anfragen oder einem unterbrochenen Abschluss können nicht referenzierte, als vorläufig benannte Drive-Dateien entstehen; keine davon darf ungeprüft als ausgestellte Rechnung behandelt oder automatisch gelöscht werden. GoBD-Konformität ist nicht nachgewiesen.

`POST /api/finance?action=cancel-issued-invoice` erwartet `orderId` und `reason`. Es wird nur ein vollständiger Stornobeleg für einen unveränderlichen, prüfsummenverifizierten Snapshot mit abrufbarem Original-PDF erzeugt. Der Storno erhält eine eigene serverseitige Nummer, negative Positions- und Gesamtbeträge, einen Verweis auf die Ursprungsrechnung und ein Drive-Original. Der Ursprungsbeleg bleibt unverändert. Wiederholungen sind bestellgebunden idempotent. Bei gleichzeitigem Aufruf oder einem gescheiterten Abschluss können unreferenzierte vorläufige Drive-Dateien zurückbleiben. Keine Zahlung, Erstattung, Kundennachricht, Buchung oder automatische Ersetzung wird ausgelöst. Historische Rechnungen ohne geprüftes Original-PDF werden blockiert. Teilstorno und manuelle Rechnungsberichtigung sind noch nicht implementiert; steuerliche und Live-Prüfung stehen aus.

`POST /api/finance?action=issue-replacement-invoice` erwartet eine eBay-`orderId`. Nur nach einer geprüften vollständigen Stornorechnung und erneuter serverseitiger eBay-Abfrage wird eine Ersatzrechnung aus den aktuellen eBay-Daten mit eigener Nummer und Bezug auf Original- und Stornorechnung erstellt und in Drive archiviert. Die Funktion bearbeitet keine eBay-Daten und erlaubt keine manuellen Preis-/Adresskorrekturen. Pro ursprünglicher Rechnung ist höchstens eine Ersatzrechnung möglich; sie kann derzeit nicht automatisch storniert werden. Wiederholung und gleichzeitige Anfragen sind bestellgebunden idempotent; vorläufige unreferenzierte Drive-Dateien können entstehen. Keine Nachricht, Zahlung oder Buchung.


`POST /api/finance?action=recognize-ubl-receipt` akzeptiert höchstens 1 MB UBL-XML. Es erkennt nur UBL Invoice/CreditNote in den UBL-Namensräumen und extrahiert eindeutige Lieferantennamen, Rechnungs- und Bestellreferenz, Belegdatum, Zahlbetrag und Währung. DTD/Entities und unklare Werte werden abgewiesen bzw. zur Prüfung markiert. Das Ergebnis ist ein Vorschlag, keine steuerliche Validierung, Zahlung oder Buchung. Der Browser prüft vor dem Senden die Prüfsumme des Originalbelegs; bestehende Eingaben werden nicht überschrieben, und die Übernahme erfordert eine ausdrückliche Bestätigung. Eine exakte Referenzsuche schlägt vorhandene Finanzvorgänge vor; auch die Verknüpfung erfolgt nur nach Bestätigung. CII ist für ausgewählte eindeutige Rechnungs- und Gutschriftsfelder unterstützt. Bei PDF mit genau einer eingebetteten XML-Datei werden UBL-/CII-Daten nach demselben Verfahren vorgeschlagen. Es wird kein PDF/A-, ZUGFeRD-Profil- oder XML-Schemanachweis erbracht. Bild-OCR und PDF-Texterkennung werden nicht unterstützt.


`POST /api/finance?action=recognize-pdf-receipt` verarbeitet PDF bis 2,5 MB und prüft ausschließlich eine einzelne eingebettete XML-Datei bis 1 MB. Das Original wird im Browser vor dem Senden gehasht und nicht verändert. Ohne XML oder mit mehreren XML-Dateien wird die Verarbeitung blockiert. Die Ausgabe ist kein Nachweis der PDF/A- oder ZUGFeRD-Konformität. Die Ressourcengrenzen beim Dekomprimieren eingebetteter PDF-Inhalte und der Betrieb in der Deployment-Umgebung müssen vor produktiver Freigabe weiter geprüft werden.


Sicherheitsstatus: Die PDF-Erkennung ist im API-Endpunkt bewusst gesperrt (HTTP 503), da die PDF-Bibliothek Anhänge vor der Größenprüfung dekomprimiert und präparierte Dateien dadurch zu hohen Speicherverbrauch verursachen können. Der Parser ist nur ein nicht freigegebener Testbaustein. XML-Erkennung bleibt verfügbar.

`POST /api/finance?action=correct-issued-invoice` erstellt nach ausdrücklicher Bestätigung einen separaten Berichtigungsbeleg für eine von vier Empfängerangaben oder fünf Verkäuferangaben (Name, Straße, PLZ, Ort und steuerliche Identifikation). Eingaben sind manuell; ursprünglicher Snapshot und Beträge bleiben unverändert. Original-PDF und neuer Beleg werden in Drive überprüft; ein Revisionskonflikt blockiert die Ausstellung. Stornierte Rechnungen, historische Rechnungen ohne Original-PDF und weitere abweichende Korrekturen desselben Felds werden blockiert. Eine Berichtigung ändert keine Zahlung, Buchung oder Kundennachricht. Geldbeträge und Teilstornos sind nicht unterstützt; fachliche Prüfung und ein Live-Test stehen aus.
