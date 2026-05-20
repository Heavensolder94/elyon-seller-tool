# Elyon Browser OS - Chrome Extension

Stand: 20.05.2026

Dieses Dokument beschreibt die komplette Chrome Extension **Elyon Browser OS** als Begleit- und Uebergabedatei fuer ChatGPT, Entwicklung und spaetere Wartung.

## Zweck

Die Extension erweitert das **Elyon Seller Tool** um Browser-gestuetzte Produktrecherche, lokale Research-Speicherung, ein Smart Overlay, ein Sicherheitskonzept und vorbereitende Workflows fuer die Soul Agents.

Wichtig:

- rein additiv gebaut
- keine API-Keys im Code
- keine autonomen Live-Aktionen ohne Freigabe
- Sicherheitslogik wird zentral respektiert
- alles defensiv, mit sicheren Defaults

## Speicherort

Die Extension liegt unter:

- `C:\Users\mailv\Documents\New project\extension`

## Ordnerstruktur

### Root der Extension

- `manifest.json`
- `background.js`

### `content/`

- `productDetector.js`
- `overlay.css`

### `popup/`

- `popup.html`
- `popup.css`
- `popup.js`
- `debug.js`

### `options/`

- `options.html`
- `options.css`
- `options.js`
- `research.html`
- `research.css`
- `research.js`
- `agents.html`
- `agents.css`
- `agents.js`

### `shared/`

- `storage.js`
- `security.js`
- `apiClient.js`
- `agents.js`
- `agentWorkflows.js`
- `uiSettings.js`

### `assets/`

- Platzhalterdateien und zusaetzliche Ressourcen

## Kernmodule

### 1. Core Layer

Enthaelt die Basisstruktur der Extension:

- Manifest V3
- Background Service Worker
- Popup UI
- Options / Settings
- lokaler Storage
- modulares Zusammenspiel der Funktionen

### 2. Security Layer

Die Extension arbeitet mit einem zentralen Sicherheitsmodell:

- `securityMode`
- `sandboxMode`
- `autonomyLocked`
- `pauseAllAgents`
- `aiEnabled`

Defaults sind bewusst sicher:

- `securityMode: true`
- `sandboxMode: true`
- `autonomyLocked: true`
- `pauseAllAgents: false`
- `aiEnabled: false`

Regeln:

- keine Live-Aktionen bei aktivem Sicherheitsmodus
- Sandbox erlaubt nur Vorbereitung und Simulation
- autonome Aktionen bleiben gesperrt
- KI-Buttons bleiben sichtbar, aber nur als vorbereitet markiert

### 3. Product Scanner

Erkennt Produktseiten auf:

- eBay
- Amazon
- AliExpress
- CJ Dropshipping
- Temu

Extrahierte Felder:

- `title`
- `price`
- `image`
- `url`
- `supplier`
- `domain`
- `currency`
- `detectedAt`

Der Scanner arbeitet defensiv:

- fehlende Felder fuehren nicht zu Fehlern
- unerwartete Seiten werden ignoriert
- AliExpress-Popups und modale Produktinfos werden ebenfalls beruecksichtigt

### 4. Smart Overlay

Auf unterstuetzten Produktseiten erscheint ein kleines Overlay:

- dunkles UI
- rounded cards
- dezentem Glow
- schliessbar
- minimierbar
- verschiebbar
- nicht mehrfach eingefuegt

Enthaelt u. a. Buttons fuer:

- Zu Elyon speichern
- Research merken
- Soul Scout vorbereiten
- Overlay schliessen

### 5. Popup Dashboard

Das Popup ist das zentrale Kontrollfenster der Extension.

Es zeigt:

- aktuellen Sicherheitsstatus
- erkannte Seite
- aktiven Tab
- Overlay-Status
- Backend-Status
- Research Memory
- Soul Agents
- Multi Tab Hunter

Zusatz:

- kleine Info-Icons mit Tooltip-Hinweisen
- inline Einstellungen
- Action Log
- Debug-Hilfen

### 6. Soul Agent System

Die Soul Agents sind als UI- und Workflow-Schicht eingebaut:

- Soul Scout
- Soul SEO
- Soul Guard
- Soul Finance
- Soul Operations
- Soul Support

Agentenmodell pro Eintrag:

```json
{
  "id": "",
  "name": "",
  "role": "",
  "description": "",
  "status": "",
  "mode": "",
  "prompt": "",
  "guardrails": "",
  "enabled": true
}
```

Status:

- `prepared`
- `sandbox`
- `locked`
- `active`

Aktuell ist das System vorbereitend:

- keine echte KI-Ausfuehrung ohne `aiEnabled: true`
- keine Live-Aktionen
- nur Vorschlaege, Workflows und UI-Status

### 7. Research Memory

Produkte werden lokal gespeichert unter:

- `elyon_research_memory`

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
  "status": "",
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
- Duplikate per URL erkennen
- Status aendern
- Notizen hinzufuegen
- Produkt loeschen
- Liste im Popup anzeigen
- JSON-Export vorbereiten

### 8. Multi Tab Hunter

Die Extension kann offene Tabs defensiv scannen:

- nutzt `chrome.tabs.query`
- liest nur URL und Titel
- keine aggressiven Scrapes
- erkennt unterstuetzte Produktseiten
- zeigt eine kurze Uebersicht im Popup

### 9. Notification Center

Die Notification-Struktur ist vorbereitet:

- lokale Hinweise
- spaetere Preiswarnungen
- spaetere Statusmeldungen

Aktuell ist das vor allem ein Daten- und UI-Fundament.

### 10. Command Bar

Shortcut:

- `Ctrl + Shift + E`

Funktionen:

- Produkt analysieren vorbereiten
- Produkt speichern
- Zu Elyon senden
- Overlay ein / aus
- Soul Scout oeffnen
- Soul Guard pruefen
- Security Center oeffnen

Die Command Bar ist defensiv:

- keine Live-Aktionen ohne Freigabe
- schliesst mit `ESC`
- wird nur auf unterstuetzten Seiten angezeigt

## API Connector

Die Extension ist fuer das Elyon Seller Tool Backend vorbereitet.

Datei:

- `shared/apiClient.js`

Funktionen:

- `getBackendUrl()`
- `setBackendUrl(url)`
- `pingBackend()`
- `sendProductToElyon(product)`
- `prepareAiAnalysis(product)`
- `getElyonStatus()`

Verhalten:

- Requests mit Timeout
- defensive Fehlerbehandlung
- kein Crash bei Backend-Ausfall
- lokaler Fallback, wenn das Backend nicht erreichbar ist

## Lokaler Sync zum Elyon Board

Die Extension versucht, Produkte an das Elyon-Tool weiterzureichen:

- lokal in `chrome.storage.local`
- zusaetzlich ueber den Backend-Connector
- mit Fallback, wenn das Backend nicht verfuegbar ist

## Test- und Bedienhinweise

### Extension laden

1. `chrome://extensions` oeffnen
2. Entwicklermodus aktivieren
3. `Entpackte Erweiterung laden` waehlen
4. Den Ordner `C:\Users\mailv\Documents\New project\extension` auswaehlen

### Tests

- Popup oeffnen
- eBay / Amazon / AliExpress / CJ Dropshipping / Temu testen
- Overlay pruefen
- Research speichern
- Command Bar mit `Ctrl + Shift + E` testen
- Backend-Test im Popup pruefen
- Security-Settings pruefen
- Multi Tab Scan pruefen

## Bewusst gesperrt

Folgende Dinge bleiben bewusst blockiert oder nur vorbereitet:

- Bestellungen
- Kundennachrichten
- autonomes eBay-Posting
- stille Live-Aktionen
- KI-Ausfuehrung ohne Freigabe

## Naechster sinnvoller Schritt

Wenn die Basis stabil ist, sind die naechsten sinnvollen Erweiterungen:

- besserer Board-Sync mit dem Elyon Seller Tool
- noch robusteres Popup-Feedback
- erweiterte Research-Filter
- Preisverlauf
- sauberer Import / Export
- agentenspezifische Workflow-Buttons

