# Elyon Browser OS - Chrome Extension

Stand: 29.05.2026

Dieses Dokument beschreibt die Chrome Extension **Elyon Browser OS** fuer das **Elyon Seller Tool**. Es dient als Uebergabe-, Entwicklungs- und Wartungsdokument fuer ChatGPT, Codex und spaetere Erweiterungen.

## Kurzbeschreibung

**Elyon Browser OS** ist der Browser-Capture-Layer fuer Produktrecherche. Die Extension erkennt Produktseiten, extrahiert Produktdaten, speichert Research lokal, sendet Produkte als Entwurf an das Elyon Seller Tool und bereitet sichere Analyse-Workflows fuer Soul Agents vor.

Die Extension fuehrt keine Live-Aktionen aus.

## Grundregeln

- Additiv gebaut, keine bestehenden Tool-Funktionen entfernen.
- Keine API-Keys oder Secrets in der Extension speichern.
- Keine Cookies, Login-Daten, Zahlungsdaten oder Kundendaten auslesen.
- Keine Bestellung, kein Warenkorb, kein Checkout.
- Kein automatisches eBay-Listing.
- Keine Kundennachricht.
- Sicherheitsmodus, Sandbox und Autonomie-Sperre werden respektiert.
- Produkte werden nur als Draft, Research oder Analysegrundlage verarbeitet.

## Speicherort

Extension-Ordner:

```text
C:\Users\mailv\Documents\New project\extension
```

Aktueller Git-Branch fuer Extension-Arbeiten:

```text
codex/elyon-browser-os
```

## Ordnerstruktur

```text
extension/
  manifest.json
  background.js
  ELYON_PRODUCT_EXTRACTION_CHECKLIST.md
  content/
    productDetector.js
    overlay.css
  popup/
    popup.html
    popup.css
    popup.js
    debug.js
  options/
    options.html
    options.css
    options.js
    research.html
    research.css
    research.js
    agents.html
    agents.css
    agents.js
  shared/
    storage.js
    security.js
    apiClient.js
    agents.js
    agentWorkflows.js
    uiSettings.js
  sidepanel/
    sidepanel.html
    sidepanel.css
    sidepanel.js
```

## Manifest

Die Extension nutzt **Chrome Extension Manifest V3**.

Wichtige Bestandteile:

- Background Service Worker: `background.js`
- Content Script: `content/productDetector.js`
- Popup UI: `popup/popup.html`
- Options UI: `options/options.html`
- Sidepanel UI: `sidepanel/sidepanel.html`
- Command Shortcut: `Ctrl + Shift + E`
- Context Menu: Rechtsklick-Menue `Elyon`

Wichtige Permissions:

- `storage`
- `activeTab`
- `scripting`
- `tabs`
- `notifications`
- `sidePanel`
- `contextMenus`

Host-Permissions sind bewusst eingeschraenkt. Fuer das Elyon Backend ist nur die konkrete Domain freigegeben:

```text
https://elyonsellertool.vercel.app/*
```

Unterstuetzte Host-Bereiche:

- eBay
- Amazon
- AliExpress
- CJ Dropshipping
- Temu
- weitere generische Produktseiten defensiv per Fallback

## Core Layer

Der Core Layer verbindet:

- Manifest V3
- Background Service Worker
- Popup
- Options/Settings
- Sidepanel
- Content Script
- lokale Storage-Keys
- API Connector
- Security Layer
- Modul- und Agentenstatus

Der Background Worker ist der zentrale Message-Hub fuer:

- Produkt speichern
- Research Memory
- Agent Workflows
- Multi Tab Scan
- Overlay Toggle
- Command Bar
- Context Menu Aktionen
- Backend Import
- Soul Scout Analyse

## Security Layer

Datei:

```text
extension/shared/security.js
```

Storage-Key:

```text
elyon_extension_security_settings
```

Default State:

```json
{
  "securityMode": true,
  "sandboxMode": true,
  "autonomyLocked": true,
  "pauseAllAgents": false,
  "aiEnabled": false
}
```

Regeln:

- `securityMode: true` blockiert Live-Aktionen.
- `sandboxMode: true` erlaubt nur Vorschau, Vorbereitung und Simulation.
- `autonomyLocked: true` blockiert autonome Aktionen.
- `pauseAllAgents: true` stoppt Agenten-Workflows.
- `aiEnabled: false` laesst KI-Buttons sichtbar, markiert sie aber als vorbereitet/gesperrt.

Blockierte Aktionen:

- Bestellung
- Checkout
- Warenkorb
- eBay-Listing
- Kundennachricht
- automatische API-Live-Aktion

Erlaubte Aktionen:

- Produktdaten erkennen
- lokal speichern
- an Elyon als Draft senden
- Analyse vorbereiten
- KI-Analyse starten, wenn `aiEnabled: true` und Backend verbunden ist

## UI-Haertung

Stand 29.05.2026 wurden die P1/P2-Audit-Findings zur Stabilisierung umgesetzt.

Gehaertet wurden:

- Sidepanel-Ausgaben
- Research-Seite
- Smart Overlay
- Popup-Listen
- Agenten-Optionsseite

Massnahmen:

- externe Produktdaten werden vor `innerHTML` escaped
- Bild-URLs im Overlay werden nur als `http:` oder `https:` akzeptiert
- Bildlinks nutzen `rel="noreferrer noopener"`
- Command-Bar-Befehle haben Background-Handler
- Vercel Host Permission wurde eingeschraenkt
- Soul Scout nutzt in Popup, Overlay und Agenten-Optionen denselben Analyse-Flow

## Product Scanner

Hauptdatei:

```text
extension/content/productDetector.js
```

Unterstuetzte Plattformen:

- Amazon
- AliExpress
- CJ Dropshipping
- eBay
- Temu
- BigBuy/VidaXL/Generic Fallback vorbereitet

Zentrale Erkennung:

- Domain
- URL-Struktur
- sichtbare Produktfelder
- Meta Tags
- Open Graph Daten
- JSON-LD Product Daten, falls vorhanden
- Plattform-spezifische DOM-Fallbacks

Basisfelder:

- `title`
- `price`
- `currency`
- `image`
- `images`
- `url`
- `supplier`
- `domain`
- `detectedAt`
- `description`
- `descriptionCandidates`
- `descriptionSource`
- `shipping`
- `availability`
- `category`
- `rating`
- `reviewsCount`
- `soldCount`
- `variants`
- `productDetails`
- `complianceRisks`

Fehlende Werte werden defensiv als leerer String, `null`, leeres Array oder leeres Objekt behandelt. Die Extension soll bei fremdem oder geaendertem DOM nicht crashen.

## Elyon Product Schema

Die Extension normalisiert Daten in eine Elyon-Struktur:

```json
{
  "meta": {
    "sourceUrl": "",
    "sourceDomain": "",
    "detectedPlatform": "",
    "extractedAt": "",
    "extractorVersion": "",
    "importSource": "chrome-extension",
    "browserMode": true,
    "confidenceScore": 0
  },
  "identity": {
    "title": "",
    "brand": "",
    "sku": "",
    "asin": "",
    "itemId": "",
    "productId": "",
    "model": "",
    "category": "",
    "breadcrumbs": []
  },
  "content": {
    "shortDescription": "",
    "longDescription": "",
    "bulletPoints": [],
    "productDetails": {},
    "specifications": {},
    "materials": [],
    "dimensions": "",
    "colors": [],
    "sizes": [],
    "careInstructions": "",
    "includedItems": []
  },
  "media": {
    "mainImage": "",
    "images": [],
    "videos": []
  },
  "pricing": {
    "currentPrice": "",
    "originalPrice": "",
    "currency": "",
    "discountPercent": "",
    "shippingCost": "",
    "totalEstimatedCost": "",
    "priceText": ""
  },
  "availability": {
    "inStock": null,
    "stockText": "",
    "quantityAvailable": "",
    "deliveryText": "",
    "processingTime": "",
    "estimatedDelivery": "",
    "shipsFrom": "",
    "shipsTo": ""
  },
  "supplier": {
    "supplierName": "",
    "storeName": "",
    "storeUrl": "",
    "supplierRating": "",
    "followers": "",
    "warehouse": "",
    "shippingMethods": [],
    "dropshippingAvailable": null
  },
  "reviews": {
    "ratingValue": "",
    "reviewsCount": "",
    "ratingsBreakdown": {},
    "reviewSnippets": []
  },
  "variants": {
    "hasVariants": false,
    "variantGroups": [],
    "variantItems": [],
    "selectedCombination": {}
  },
  "marketplace": {
    "sellerName": "",
    "fulfilledBy": "",
    "prime": false,
    "bestsellerRank": "",
    "marketplaceCategory": ""
  },
  "risk": {
    "brandRiskHint": "",
    "batteryHint": "",
    "electronicHint": "",
    "medicalHint": "",
    "trademarkHint": "",
    "eprHint": "",
    "warningTexts": []
  },
  "workflow": {
    "importTarget": "",
    "status": "draft",
    "reviewRequired": true,
    "liveAction": false,
    "automationAllowed": false,
    "analysisQueue": {
      "soulScout": "pending",
      "soulSeo": "pending",
      "soulPricing": "pending",
      "soulGuard": "pending",
      "supplierCheck": "pending"
    }
  },
  "notes": [],
  "raw": {
    "platformSpecificData": {},
    "debugSelectors": {},
    "extractionWarnings": []
  }
}
```

## Smart Overlay

Das Overlay erscheint auf unterstuetzten Produktseiten.

Eigenschaften:

- Dark UI
- rounded cards
- dezenter Glow
- verschiebbar
- minimierbar
- schliessbar
- eigene Scroll-Logik
- wird nicht mehrfach eingefuegt
- zerstoert die Produktseite nicht

Buttons:

- `Zu Elyon speichern`
- `Neu erfassen`
- `Markierten Text uebernehmen`
- `Side Panel oeffnen`
- `Beobachten`
- `Nach manuellem Aufklappen neu erfassen`
- `Research merken`
- `Soul Scout vorbereiten`
- `Overlay schliessen`

Wichtig:

- Das Overlay klickt keine Kaufbuttons.
- Es klickt keine Warenkorbbuttons.
- Detailbereiche werden nur mit Nutzeraktion/Consent neu erfasst.

## Popup Dashboard

Dateien:

```text
extension/popup/popup.html
extension/popup/popup.css
extension/popup/popup.js
```

Das Popup zeigt:

- Sicherheitsstatus
- Popup Status
- erkannte Seite
- Warnhinweise
- aktiver Tab
- Overlay Status
- Backend Status
- Research Memory
- Soul Agents
- Multi Tab Hunter
- API Connector
- Debug/Extraction Infos
- Inline Settings
- Action Log

Wichtige Buttons:

- Overlay toggeln
- Produkt speichern
- Produkt an Elyon senden
- Backend testen
- Tabs scannen
- AliExpress Varianten scannen
- Varianten scannen
- Markierten Text uebernehmen
- Soul Scout vorbereiten
- Side Panel oeffnen
- Settings oeffnen

## Options, Research und Agenten

Options:

```text
extension/options/options.html
```

Funktionen:

- Security Settings
- Backend URL
- Overlay Settings
- UI Settings
- Agentenbereich oeffnen
- Research Memory oeffnen

Research:

```text
extension/options/research.html
```

Funktionen:

- lokale Research-Produkte anzeigen
- Status aendern
- Notizen pflegen
- Produkt loeschen
- Export als JSON vorbereiten

Agenten:

```text
extension/options/agents.html
```

Funktionen:

- Agenten anzeigen
- Prompt anzeigen
- Guardrails anzeigen
- Analyse vorbereiten

## Sidepanel

Dateien:

```text
extension/sidepanel/sidepanel.html
extension/sidepanel/sidepanel.css
extension/sidepanel/sidepanel.js
```

Tabs:

- Produkt
- Analyse
- Supplier
- Varianten
- History
- Notizen
- Sicherheit

Das Sidepanel ist als kompakter Arbeitsbereich gedacht, ohne dass die Produktseite verlassen werden muss.

## Soul Agent System

Dateien:

```text
extension/shared/agents.js
extension/shared/agentWorkflows.js
```

Agenten:

- Soul Scout
- Soul SEO
- Soul Guard
- Soul Finance
- Soul Operations
- Soul Support

Statuswerte:

- `prepared`
- `sandbox`
- `locked`
- `active`

Aktueller Stand:

- Agenten sind sichtbar.
- Workflows werden lokal gespeichert.
- `Soul Scout vorbereiten` ist inzwischen mit der Elyon KI-Route verbunden.
- `Soul Scout vorbereiten` nutzt im Popup, Overlay und Agenten-Optionsbereich denselben sicheren Analyse-Flow.
- KI-Analyse laeuft nur, wenn `aiEnabled: true` ist und Backend URL erreichbar ist.
- Alle Agenten bleiben ohne Live-Aktion.

## Soul Scout Analyse

Route im Elyon Seller Tool:

```text
POST /api/elyon-soul
```

Extension-Funktion:

```text
prepareAiAnalysis(product, options)
```

Flow:

1. Produktdaten aus dem aktiven Tab oder aktuellem Storage holen.
2. Sicherheitsstatus pruefen.
3. Wenn `pauseAllAgents: true`, abbrechen.
4. Wenn `aiEnabled: false`, nur Workflow vorbereiten.
5. Wenn `aiEnabled: true`, Analyse an `/api/elyon-soul` senden.
6. Ergebnis lokal speichern.

Storage:

- `elyon_agent_workflows`
- `elyon_last_soul_scout_analysis`

Sicherheits-Payload:

```json
{
  "liveAction": false,
  "listingCreated": false,
  "orderCreated": false,
  "messageSent": false,
  "reviewRequired": true,
  "manualApprovalRequired": true
}
```

## Research Memory

Storage-Key:

```text
elyon_research_memory
```

Datenmodell:

```json
{
  "id": "",
  "title": "",
  "price": "",
  "currency": "",
  "image": "",
  "url": "",
  "supplier": "",
  "domain": "",
  "status": "new",
  "notes": "",
  "score": "",
  "detectedAt": "",
  "updatedAt": ""
}
```

Statuswerte:

- `new`
- `reviewed`
- `winner`
- `risky`
- `rejected`

Funktionen:

- Produkt speichern
- Duplikate per URL vermeiden
- Status aendern
- Notiz hinzufuegen
- Produkt loeschen
- letzte Produkte im Popup anzeigen
- JSON Export vorbereiten

## Rechtsklick-Menue

Die Extension nutzt `chrome.contextMenus`.

Hauptmenue:

```text
Elyon
```

Unterpunkte:

- Markierten Text uebernehmen
- Als Produktbeschreibung speichern
- Als Bulletpoints speichern
- Als technische Daten speichern
- Als Lieferinfo speichern
- Als Notiz speichern
- Bild uebernehmen
- Als Hauptbild setzen
- Produktdaten lokal erfassen
- Varianten lokal scannen

Wichtig:

- Rechtsklick-Aktionen speichern nur lokal.
- Keine Backend-Anfrage.
- Kein POST an Elyon.
- Keine Live-Aktion.

Storage:

- `elyon_current_product`
- `elyon_manual_captures`
- `elyon_extension_history`
- `elyon_extraction_debug`
- `elyon_extension_last_local_status`

## Manuelle Textuebernahme

Funktion:

```text
captureSelectedText()
```

Quelle:

```text
window.getSelection().toString()
```

Text kann uebernommen werden als:

- Produktbeschreibung
- Bulletpoints
- technische Daten
- Lieferinfo
- Notiz
- Risiko-Hinweis

Verarbeitung:

- trimmen
- HTML entfernen
- doppelte Leerzeichen reduzieren
- leere Zeilen reduzieren
- Bulletpoints splitten
- Duplikate vermeiden
- mit Zeitstempel speichern

## Varianten-Scanning

AliExpress:

```text
scanAliExpressVariants()
```

Generic/andere Plattformen:

```text
scanVisibleVariantsSnapshot()
```

Ziel:

- Variantenbereiche erkennen
- Optionen erfassen
- ausgewaehlte Kombination speichern
- Preis-/Bild-/Lieferinformationen soweit sichtbar erfassen

Sicherheit:

- kein Buy Now
- kein Add to Cart
- kein Checkout
- nur sichtbare Variantenelemente
- defensiv, keine riskanten Klicks

Storage:

- `elyon_aliexpress_variant_cache`
- `elyon_platform_variant_cache`

## Multi Tab Hunter

Funktion:

- offene Tabs pruefen
- nur URL und Titel aus `chrome.tabs.query` verwenden
- unterstuetzte Produktseiten erkennen
- keine inaktiven Tabs aggressiv scrapen

Popup zeigt:

- Anzahl gepruefter Tabs
- Anzahl unterstuetzter Produktseiten
- bereits gespeicherte Produkte
- neue Treffer

Aktionen pro Treffer:

- oeffnen
- speichern
- Analyse vorbereiten

## Command Bar

Shortcut:

```text
Ctrl + Shift + E
```

Befehle:

- Produkt analysieren vorbereiten
- Produkt speichern
- Zu Elyon senden
- Overlay ein/aus
- Soul Scout oeffnen
- Soul Guard pruefen
- Security Center oeffnen

Eigenschaften:

- erscheint nur einmal
- ESC schliesst
- Sucheingabe vorhanden
- keine Live-Aktion
- Command-Bar-Befehle sind im Background verdrahtet und laufen nicht mehr ins Leere

## API Connector

Datei:

```text
extension/shared/apiClient.js
```

Storage-Key:

```text
elyon_extension_api_settings
```

Funktionen:

- `getBackendUrl()`
- `setBackendUrl(url)`
- `pingBackend()`
- `sendProductToElyon(product)`
- `prepareAiAnalysis(product, options)`
- `getElyonStatus()`

Backend URL:

```text
https://elyonsellertool.vercel.app
```

Import-Routen:

```text
POST /api/extension/import
POST /api/extension/import-product
```

Analyse-Route:

```text
POST /api/elyon-soul
```

Fallback:

- Wenn Backend fehlt oder nicht erreichbar ist, wird lokal gespeichert.
- Kein Crash.
- Statusmeldung im Popup/Overlay.

## Elyon Import Pipeline

Ziel:

Die Extension ist der Capture Layer. Das Elyon Seller Tool ist die zentrale Verwaltungs- und Bewertungsplattform.

Beim Klick auf `Zu Elyon speichern`:

1. Produktdaten aus Scanner holen.
2. Lokal in Research Memory speichern.
3. Produkt an Elyon Backend senden.
4. Im Seller Tool als Browser Import / Research Draft speichern.
5. Keine Live-Aktion.

Server-Endpoint:

```text
POST /api/extension/import-product
```

Antwortmodell:

```json
{
  "ok": true,
  "status": "saved",
  "productId": "",
  "linkedSupplierId": "",
  "message": ""
}
```

Moegliche Statuswerte:

- `saved`
- `duplicate`
- `updated`

## Browser Imports im Seller Tool

Bereich:

```text
Browser Imports
```

Angezeigt werden:

- Titel
- Preis
- Bild
- Supplier
- Domain
- URL
- Importdatum
- Status
- Linked Supplier
- Varianten
- Produktdetails
- Artikelbeschreibung

Aktionen:

- Ins Produktboard uebernehmen
- Mit Supplier verknuepfen
- Risiko pruefen
- Marge kalkulieren
- Verwerfen
- Browser Imports aktualisieren

Wichtig:

- Die Anzeige wird serverseitig ueber `/api/extension/import-product` aktualisiert.
- Wenn der Server leer ist, zeigt das Tool inzwischen sichtbar `Keine Browser Imports auf dem Server`.
- Wenn der Server nicht erreichbar ist, wird eine sichtbare Fehlermeldung angezeigt.

## Wichtige Storage Keys

Chrome Extension:

- `elyon_current_product`
- `elyon_research_memory`
- `elyon_extension_history`
- `elyon_extraction_debug`
- `elyon_extension_settings`
- `elyon_extension_security_settings`
- `elyon_extension_api_settings`
- `elyon_manual_captures`
- `elyon_agent_workflows`
- `elyon_last_soul_scout_analysis`
- `elyon_aliexpress_variant_cache`
- `elyon_platform_variant_cache`
- `elyon_extension_last_local_status`

Seller Tool Browser:

- `elyonBrowserImports`

## Lokale Installation

1. Chrome oeffnen.
2. `chrome://extensions` aufrufen.
3. Entwicklermodus aktivieren.
4. `Entpackte Erweiterung laden` klicken.
5. Ordner auswaehlen:

```text
C:\Users\mailv\Documents\New project\extension
```

Nach Code-Aenderungen:

1. `chrome://extensions` oeffnen.
2. Bei Elyon Browser OS auf Aktualisieren klicken.
3. Produktseite neu laden.

## Test-Checkliste

### Basis

- Popup oeffnet sich.
- Sicherheitsstatus wird angezeigt.
- Settings lassen sich oeffnen.
- Backend URL ist gesetzt.
- Backend-Test zeigt erreichbar oder klare Fehlermeldung.

### Produktseiten

- Amazon Produktseite oeffnen.
- AliExpress Produktseite oeffnen.
- CJ Dropshipping Produktseite oeffnen.
- eBay Produktseite oeffnen.
- Overlay erscheint nur auf unterstuetzten Seiten.
- Titel, Preis, Bild und URL werden erkannt.

### Speichern

- `Research merken` speichert lokal.
- `Zu Elyon speichern` sendet an Backend oder speichert lokal bei Fehler.
- Seller Tool `Browser Imports aktualisieren` zeigt Import oder klare Meldung.

### Varianten

- AliExpress Produkt mit Varianten oeffnen.
- `AliExpress Varianten scannen` klicken.
- Anzahl Varianten/Warnungen pruefen.
- Keine Kaufbuttons werden geklickt.

### Rechtsklick

- Text markieren.
- Rechtsklick `Elyon > Als Produktbeschreibung speichern`.
- Bild rechtsklicken.
- `Elyon > Als Hauptbild setzen`.
- Popup/Sidepanel pruefen.

### Soul Scout

- `aiEnabled` in der Extension aktivieren.
- Backend URL setzen.
- Produktseite oeffnen.
- `Soul Scout vorbereiten` klicken.
- Bei aktiver KI sollte Analyse ueber `/api/elyon-soul` laufen.
- Bei gesperrter KI steht vorbereitet/gesperrt.

## Bewusst gesperrt

Immer gesperrt oder nur manuell vorbereitet:

- Bestellung
- Checkout
- Warenkorb
- eBay-Listing
- Kundennachricht
- automatische Live-API-Aktion
- autonome Entscheidungen ohne Freigabe

## Aktueller Stand

Funktioniert/gebaut:

- Chrome Extension MV3 Grundstruktur
- Product Scanner
- Smart Overlay
- Popup Dashboard
- Options/Settings
- Research Memory
- Multi Tab Hunter
- Command Bar
- Sidepanel
- Rechtsklick-Menue
- manuelle Textuebernahme
- Varianten-Scanning
- Elyon API Connector
- Browser Import Pipeline
- Soul Agent UI
- Soul Scout Analyse-Anbindung
- P1/P2 Audit-Haertung fuer Escaping, Command-Bar, Permission und Agenten-Flow

Vorbereitet:

- erweiterte Agentenanalysen fuer SEO, Guard, Finance, Operations, Support
- Preisverlauf
- Notification Center
- tieferer Supplier-Sync
- mehr Plattformparser
- KI-basierte Textbereinigung fuer Produktbeschreibungen

Bewusst nicht aktiv:

- Live-Listings
- Bestellungen
- automatische Kundennachrichten
- Checkout- oder Warenkorb-Aktionen

## Naechste sinnvolle Schritte

1. Browser Imports dauerhaft ueber Vercel KV/Upstash stabilisieren.
2. Import-Ergebnisse im Seller Tool mit Analyseergebnis verknuepfen.
3. Soul Scout Ergebnis direkt am Browser Import anzeigen.
4. Soul Guard Compliance-Pruefung als sichere Analyse aktivieren.
5. Beschreibungsextraktion pro Plattform weiter verfeinern.
6. Bildauswahl und Variantenbilder robuster machen.
7. Produktboard-Layout weiter verbessern.
8. P3-Haertung und manuelle Browser-Tests nachziehen.
