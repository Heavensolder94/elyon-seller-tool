# Elyon Seller Tool

Elyon Seller Tool ist eine lokale Seller-Arbeitsoberflaeche fuer Produktrecherche, Listing-Vorbereitung, CJdropshipping, eBay-OAuth, Bestellverwaltung, Versand, Rechnungen, Retouren, Backups und KI-gestuetzte Analyse.

Die App besteht aus drei Ebenen:

1. Frontend im Browser mit Dashboard, Produktworkflow und ELYON Soul.
2. Serverless API-Routen fuer CJ, eBay, OpenAI und DeepSeek.
3. Ein kleiner Python-CLI-Teil fuer CJ-Tests und Legacy-Aufrufe.

## Schnellstart

### Voraussetzung

- Node.js fuer das Frontend und die Vercel-Routen
- Python 3 fuer `src/main.py`
- Ein CJdropshipping API-Key
- Optional: eBay Developer App und OpenAI- oder DeepSeek-Keys

### Lokaler CJ-Test

```powershell
$env:CJ_API_KEY="dein-api-key"
python src\main.py
```

Was dabei passiert:

- CJ-Token werden geholt oder aus `data/cj_tokens.json` wiederverwendet
- Kategorien werden geladen
- Optional laeuft eine Beispielsuche, eine Bestandsabfrage oder eine Testbestellung

### Frontend starten

Das Repo ist fuer Vercel vorbereitet. Lokal kannst du das Frontend einfach ueber einen HTTP-Server oder ueber Vercel testen.

Wichtig:

- OAuth-Flows funktionieren nicht sauber ueber `file://`
- eBay-Login und Token-Exchange brauchen eine gehostete URL oder `localhost`

## Was das Tool kann

### Produktworkflow

- Produkte sammeln, bewerten und pflegen
- Marge, Versand, Wettbewerb und Risiko pruefen
- Produkte als `GO`, `TEST` oder `NO` einordnen
- Produktlisten, Karten, Filter und Berichte anzeigen
- Backups exportieren und importieren

### Listing-Workflow

- eBay-Titel generieren
- Beschreibung und Bulletpoints generieren
- SEO-Keywords und Titelideen erstellen
- Listing-Entwuerfe lokal speichern
- Listing vor dem Publizieren pruefen

### Bestellungen und Operations

- eBay-Bestellungen abrufen
- Versandstatus und Tracking pflegen
- Rechnungen generieren
- Retouren und Rueckgaben verwalten
- Laufende Kosten und Sales-Daten dokumentieren

### KI- und Analyse-Funktionen

- OpenAI-basierte Listing-Optimierung
- OpenAI-basierte Produktsuche und Keyword-Ideen
- DeepSeek-basierter Elyon-Soul-Chat
- Regelmodus als Fallback, falls keine KI aktiv ist

### Integrationen

- CJdropshipping API
- eBay OAuth, Login-URL, Token-Exchange und Search
- Google Sheets Sync via Apps Script
- Vercel Deployment mit Serverless Functions

## Projektstruktur

```text
.
├── index.html
├── elyon-ui.js
├── elyon-soul.js
├── elyon-soul.css
├── elyon-clean.css
├── api/
├── apps-script/
├── lib/
├── public/
├── scripts/
├── src/
├── docs/
├── vercel.json
└── tool.py
```

### Wichtige Dateien

- `index.html`: Haupt-Frontend im Quellstand
- `public/index.html`: Vercel-Output fuer statische Auslieferung
- `scripts/prepare-vercel.mjs`: spiegelt die Frontend-Dateien in `public/`
- `api/*.js`: Serverless Endpoints
- `src/cj.py`: CJdropshipping-Hauptmodul
- `src/main.py`: CJ-CLI-Startpunkt
- `src/calculator.py`: Legacy-Kompatibilitaets-Shim
- `apps-script/google-sheets-sync.gs`: Google-Sheets-Sync
- `lib/ebay-token-store.js`: gemeinsamer Token-Speicher fuer eBay Refresh Tokens

## Setup

### 1. Abhaengigkeiten

Das Repository hat aktuell kein zentrales `npm install`-Setup im `package.json`. Die App laeuft primar ueber:

- statische Frontend-Dateien
- Node-basierte Serverless-Funktionen auf Vercel
- Python fuer den CJ-CLI-Teil

### 2. CJ konfigurieren

Setze mindestens:

```powershell
$env:CJ_API_KEY="dein-api-key"
```

Optional fuer Beispiele:

```powershell
$env:CJ_SAMPLE_QUERY="iphone case"
$env:CJ_SAMPLE_VARIANT="deine-variant-sku"
$env:CJ_SAMPLE_ORDER='{"order":[...]}'
```

### 3. eBay konfigurieren

Benoetigt fuer Login, Token-Exchange, Suche und Bestellabruf:

- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EBAY_REDIRECT_URI` oder `EBAY_RUNAME`

### 4. KI konfigurieren

Optional fuer OpenAI:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` optional, Standard: `gpt-4o-mini`

Optional fuer DeepSeek:

- `DEEPSEEK_API_KEY`

### 5. Google-Sheets-Sync konfigurieren

Fuer den Apps-Script-Sync:

- `SPREADSHEET_ID` oder ein gebundenes Spreadsheet
- `SYNC_TOKEN` oder eine der kompatiblen Varianten im Script Property Store

## Umgebungsvariablen

### CJ

- `CJ_API_KEY`: schaltet CJ-Login und Token-Refresh frei
- `CJ_SAMPLE_QUERY`: Beispielsuche beim Start von `src/main.py`
- `CJ_SAMPLE_VARIANT`: Beispiel fuer Bestandsabfrage
- `CJ_SAMPLE_ORDER`: JSON-Beispiel fuer Testbestellung

### eBay

- `EBAY_CLIENT_ID`: eBay OAuth Client ID
- `EBAY_CLIENT_SECRET`: eBay OAuth Client Secret
- `EBAY_REDIRECT_URI`: Redirect-URI fuer OAuth
- `EBAY_RUNAME`: alternative Redirect-URI-Variable
- `EBAY_SCOPES`: optionale Scopes, durch Leerzeichen oder Kommas getrennt
- `EBAY_ENV`: Standardumgebung fuer Bestellabrufe, `production` oder `sandbox`
- `EBAY_MARKETPLACE_ID`: Marketplace fuer Search, Standard `EBAY_DE`
- `EBAY_REFRESH_TOKEN`: Fallback, falls kein gespeicherter Token vorhanden ist

### eBay Token Store

Der Token-Speicher kann lokal oder ueber Upstash laufen.

- `EBAY_TOKEN_STORE_MODE=upstash`: erzwungener Upstash-Modus
- `EBAY_TOKEN_STORE_URL`: Upstash REST-URL
- `EBAY_TOKEN_STORE_TOKEN`: Upstash REST-Token
- `EBAY_TOKEN_STORE_KEY`: eigener Redis-Key
- `EBAY_TOKEN_STORE_PATH`: lokaler Fallback-Pfad, Standard `./data/ebay-refresh-token.json`

### OpenAI / KI

- `OPENAI_API_KEY`: freigeschaltet `api/ai/*`
- `OPENAI_MODEL`: optionaler Modellname fuer die OpenAI-Responses-API

### DeepSeek

- `DEEPSEEK_API_KEY`: aktiviert `api/elyon-soul`

## CJ-Modul

Das CJ-Modul liegt in `src/cj.py` und kuemmert sich um:

- Access-Token holen
- Refresh-Token erneuern
- Token lokal in `data/cj_tokens.json` speichern
- Kategorien laden
- Produkte listen und suchen
- Produktdetails laden
- Lagerbestand pro Variante abfragen
- Bestellungen ueber die V2-Shopping-Order-API anlegen

### Wichtige Funktionen

- `authenticate()`
- `refresh()`
- `ensure_token()`
- `get_categories()`
- `list_products()`
- `search_products()`
- `get_product_details()`
- `get_stock_by_variant()`
- `create_order_v2()`

### Legacy-Kompatibilitaet

`src/calculator.py` ist nur ein Shim und haelt alte Importpfade am Leben, waehrend die echte CJ-Logik in `src/cj.py` liegt.

## Python-CLI

`src/main.py` ist ein kleiner Smoke-Test fuer CJ.

Ablauf:

1. Token pruefen oder neu holen
2. Kategorien laden
3. Optional eine Beispielsuche ausfuehren
4. Optional eine Bestandsabfrage ausfuehren
5. Optional eine Testbestellung senden

Das Skript druckt die wichtigsten Statuswerte direkt in die Konsole.

## Frontend

Die Hauptoberflaeche ist die Seller-App im Browser.

### Grobmodule

- Dashboard und Kennzahlen
- Produktanalyse und Produktkarten
- Listing-Generatoren
- eBay-Konkurrenzanalyse
- Bestell- und Versandbereich
- Rechnungsbereich
- Retourenbereich
- Integrations- und Einstellungen
- Backup- und Importfunktionen
- ELYON Soul als Coach-Overlay

### ELYON Soul

`public/elyon-soul.js` bzw. `elyon-soul.js` baut ein schwebendes Coach-Panel.

Verhalten:

- liest anonymisierte Produktdaten aus `localStorage`
- fuehrt lokale Regelantworten aus, wenn keine KI aktiv ist
- sendet bei aktivem KI-Modus anonymisierte Produktdaten an `POST /api/elyon-soul`
- begrenzt die Anzahl KI-Anfragen pro Tag lokal im Browser

Wichtig:

- E-Mail-Adressen, Telefonnummern, Bestellnummern und aehnliche Daten werden vor dem KI-Request bereinigt
- Der Widget-Status zeigt, ob DeepSeek aktiv ist oder der Regelmodus laeuft

## API-Referenz

### Health und Checks

#### `GET /api/health`

Gibt einen simplen Health-Status zurueck.

Beispielantwort:

```json
{ "ok": true, "message": "Health funktioniert" }
```

#### `GET /api/env-check`

Prueft, ob wichtige Secrets gesetzt sind.

Antwortfelder:

- `ebayClientId`
- `ebayClientSecret`
- `cjApiKey`

### CJ

#### `GET /api/cj/status`

Ein einfacher CJ-Status-Check.

#### `GET /api/cj/search?q=...&page=1&size=10`

Sucht CJ-Produkte.

Parameter:

- `q` oder `keyword`: Suchbegriff
- `page`: Seitennummer
- `size` oder `limit`: Treffer pro Seite, maximal 50
- `raw=1`: gibt die rohe CJ-Antwort mit aus

Antwort:

- normalisierte Produktliste
- Trefferanzahl
- Keyword
- Seitenwerte

### eBay

Die eBay-Routen laufen ueber `api/ebay.js` und sind per `vercel.json` auf lesbare Pfade umgeschrieben.

#### `GET /api/ebay/status`

Gibt den Service-Status zurueck.

#### `GET /api/ebay/login-url`

Erzeugt die OAuth-Login-URL.

Wichtige Parameter:

- `environment=sandbox|production`
- optional `state`

#### `GET /api/ebay/search?q=...&limit=20`

Sucht eBay-Angebote ueber die Browse API.

Verwendet:

- Client-Credentials Token
- Marketplace `EBAY_DE`
- Accept-Language `de-DE`

#### `GET /api/ebay/competition?keyword=...`

Fuehrt eine Konkurrenzanalyse auf Basis der eBay-Suche aus.

Ergebnis:

- Low
- Average
- High
- Trefferliste

#### `GET` oder `POST /api/ebay/exchange-token`

Tauscht einen OAuth-Authorization-Code gegen Tokens aus.

Benoetigt:

- `code`
- `environment` optional

Speichert den Refresh Token im Token Store.

#### `GET /api/ebay/token`

Liest den gespeicherten Refresh Token und erstellt daraus ein neues Access Token.

### OpenAI

#### `POST /api/ai`

Generischer strukturierter KI-Endpoint.

Erwarteter Body:

```json
{
  "task": "title",
  "prompt": "Erzeuge einen eBay-Titel",
  "data": {}
}
```

Unterstuetzte `task`-Werte:

- `title`
- `description`
- `tags`
- `product_score`

#### `POST /api/ai/listing-optimizer`

Optimiert ein Listing aus Produktdaten.

Wichtige Modi:

- `regenerate`
- `improve`
- `check`

#### `POST /api/ai/product-search`

Hilft bei Suchbegriffen, Nischenwinkeln und Titelideen.

Wichtige Modi:

- `improve`
- `analyze`

### DeepSeek Elyon Soul

#### `POST /api/elyon-soul`

Der Coach-Endpoint fuer die Elyon-Soul-Ansicht.

Merkmale:

- `action=chat` fuer kurze Chatantworten
- `action=analyze` fuer kompakte Analyse
- `probe=true` fuer eine Faehigkeitspruefung
- nutzt anonymisierte Produktdaten
- faellt ohne `DEEPSEEK_API_KEY` in den Regelmodus zurueck

## eBay OAuth Flow

Die App bringt zwei Nutzerpfade mit:

1. Klassischer OAuth-Flow ueber `/ebay-login`
2. Token-Exchange-Seite ueber `/ebay-token-exchange`

### Wichtige Routen

- `/ebay-login` leitet in den Login-Flow
- `/ebay-callback` zeigt die Callback-Seite nach dem Consent
- `/ebay-token-exchange` ist die sichtbare Token-Austauschseite

### Was die Callback-Seite macht

- erkennt `code`, `state` und Umgebung
- tauscht den Code gegen Tokens aus
- speichert den Refresh Token im Token Store
- zeigt das Ergebnis an

### Hinweis

Der Flow funktioniert nur sauber ueber eine echte HTTP(S)-URL oder `localhost`, nicht ueber `file://`.

## Google Sheets Sync

Die Google-Sheets-Anbindung liegt in `apps-script/google-sheets-sync.gs`.

Unterstuetzte Sync-Typen:

- `inventory` -> Sheet `Inventar`
- `suppliers` -> Sheet `Supplier Liste`
- `sales` -> Sheet `Sales & Klarna`
- `costs` -> Sheet `Laufende Kosten`

### Verhalten

- `doPost` erwartet JSON
- ein Sync-Token ist Pflicht
- Datensaetze werden anhand der jeweiligen Key-Spalte upserted
- fehlende Sheets werden automatisch angelegt

### Wichtige Properties im Apps Script

- `SYNC_TOKEN`
- `SPREADSHEET_ID`
- alternativ kompatible Alias-Keys wie `ELYON_SYNC_TOKEN` oder `GOOGLE_SPREADSHEET_ID`

## Vercel Deployment

Die App ist fuer Vercel vorbereitet.

### Build

`vercel.json` setzt:

- `buildCommand`: `node scripts/prepare-vercel.mjs`
- `outputDirectory`: `public`

Das Build-Skript spiegelt die statischen Quell-Dateien nach `public/`.

### Rewrites

Die Datei `vercel.json` routet:

- `/ebay-callback` -> `ebay-accepted.html`
- `/ebay-login` -> eBay Login-Endpoint
- `/api/ebay/*` -> kompakte API-Routen
- `/api/ping` -> Health-Endpoint
- `/ebay-token-exchange` -> Token-Exchange-Seite

### Empfohlene Vercel-Variablen

- `CJ_API_KEY`
- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EBAY_REDIRECT_URI` oder `EBAY_RUNAME`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `DEEPSEEK_API_KEY`
- optional die Token-Store-Variablen fuer Upstash

### Deploy-Schritte

1. Repo nach GitHub pushen.
2. In Vercel das GitHub-Repo importieren.
3. Variablen in den Project Settings setzen.
4. Deploy starten.
5. Die eBay-Redirect-URI im eBay Developer Portal auf die Vercel-URL setzen.

## Sicherheits- und Datenschutz-Hinweise

- CJ-Token in `data/cj_tokens.json` nicht committen
- eBay Refresh Tokens nicht in Klartext ins Repo schreiben
- Die Elyon-Soul-UI sendet nur anonymisierte Produktdaten an die KI
- OAuth- und Token-Seiten sollten immer ueber eine echte URL laufen

## Troubleshooting

### CJ funktioniert nicht

- `CJ_API_KEY` pruefen
- Netzwerkzugriff auf die CJ API pruefen
- lokale Token-Datei loeschen, wenn ein kaputter Token gespeichert wurde

### eBay Login funktioniert nicht

- `EBAY_CLIENT_ID` und `EBAY_CLIENT_SECRET` pruefen
- `EBAY_REDIRECT_URI` oder `EBAY_RUNAME` pruefen
- nicht ueber `file://` testen
- Redirect-URI im eBay Developer Portal exakt abgleichen

### KI antwortet nicht

- `OPENAI_API_KEY` oder `DEEPSEEK_API_KEY` pruefen
- Vercel Environment Variables kontrollieren
- den richtigen Endpoint aufrufen

### Token wird nicht gespeichert

- Speicher-Modus pruefen: local file oder Upstash
- bei Upstash `EBAY_TOKEN_STORE_URL` und `EBAY_TOKEN_STORE_TOKEN` pruefen
- lokal den Pfad in `EBAY_TOKEN_STORE_PATH` kontrollieren

## Weiterfuehrende Doku

- Workflow-Doku: [docs/workflow.md](docs/workflow.md)
- ChatGPT-Kontext: [CHATGPT_GUIDE.md](CHATGPT_GUIDE.md)

## Legacy und Backups

Im Repo liegen bewusst auch Referenzen und Backups:

- `index.backup-before-clean.html`
- `backups/index.html.bak`
- `BACKUP_NOTIZ_2026-05-10.md`

Diese Dateien dienen als Rueckfallebene und historische Sicherung.

