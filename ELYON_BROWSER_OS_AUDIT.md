# Elyon Browser OS - Extension Audit

Stand: 29.05.2026

Dieses Dokument enthaelt das Audit der Chrome Extension **Elyon Browser OS**. Geprueft wurden Manifest, Background Service Worker, Content Script, Popup, Options-Seiten, Sidepanel, Storage, Security Layer, API Connector, Soul-Agent-Flow und typische Crash-/Button-Stellen.

## Audit-Zusammenfassung

Ergebnis:

- JavaScript-Syntax ist in den geprueften Extension-Dateien gueltig.
- Manifest V3 ist grundsaetzlich korrekt aufgebaut.
- Keine hartcodierten API-Keys oder Secrets im Extension-Code gefunden.
- Keine Bestell-, Checkout-, Warenkorb-, Kundennachricht- oder eBay-Listing-Automation gefunden.
- Security Defaults sind sicher.
- Es gibt aber mehrere wichtige Robustheits- und UI-Sicherheits-Findings.

## Gepruefte Bereiche

- `extension/manifest.json`
- `extension/background.js`
- `extension/content/productDetector.js`
- `extension/content/overlay.css`
- `extension/popup/popup.html`
- `extension/popup/popup.css`
- `extension/popup/popup.js`
- `extension/popup/debug.js`
- `extension/options/options.html`
- `extension/options/options.css`
- `extension/options/options.js`
- `extension/options/research.html`
- `extension/options/research.css`
- `extension/options/research.js`
- `extension/options/agents.html`
- `extension/options/agents.css`
- `extension/options/agents.js`
- `extension/shared/storage.js`
- `extension/shared/security.js`
- `extension/shared/apiClient.js`
- `extension/shared/agents.js`
- `extension/shared/agentWorkflows.js`
- `extension/shared/uiSettings.js`
- `extension/sidepanel/sidepanel.html`
- `extension/sidepanel/sidepanel.css`
- `extension/sidepanel/sidepanel.js`

## Syntax-Checks

Folgende Dateien wurden mit `node --check` geprueft:

- `extension/background.js`
- `extension/content/productDetector.js`
- `extension/popup/popup.js`
- `extension/options/options.js`
- `extension/options/agents.js`
- `extension/options/research.js`
- `extension/sidepanel/sidepanel.js`
- `extension/shared/apiClient.js`
- `extension/shared/security.js`
- `extension/shared/storage.js`
- `extension/shared/agentWorkflows.js`
- `extension/shared/agents.js`

Ergebnis:

```text
Alle Syntax-Checks bestanden.
```

## Review Findings

### Finding 1 - P1

Datei:

```text
extension/sidepanel/sidepanel.js
```

Stelle:

```text
Zeile 8
```

Titel:

```text
Produktdaten werden ungeescaped per innerHTML ins Sidepanel gerendert
```

Beschreibung:

`card()` schreibt Werte direkt in HTML. Produktdaten kommen von externen Seiten und koennen HTML enthalten. Dadurch kann die Sidepanel-UI manipuliert werden. Werte sollten vor `innerHTML` escaped werden oder die UI sollte mit DOM-Nodes und `textContent` gebaut werden.

Empfehlung:

- Zentrale `escapeHtml()`-Funktion einfuehren.
- `label` und `value` in `card()` escapen.
- Alternativ `document.createElement()` und `textContent` verwenden.

### Finding 2 - P1

Datei:

```text
extension/options/research.js
```

Stelle:

```text
Zeile 16
```

Titel:

```text
Research-Seite rendert externe Produktdaten ohne Escaping
```

Beschreibung:

Titel, URL, Domain und Notizen werden direkt in Template-HTML geschrieben. Ein importierter Produktname kann dadurch die Options-Seite kaputtmachen oder UI manipulieren.

Empfehlung:

- `escapeHtml()` fuer `item.title`, `item.domain`, `item.url`, `item.notes`, `item.price`, `item.currency`, `item.score`, `item.detectedAt`, `item.updatedAt` verwenden.
- IDs in `data-*` Attributen ebenfalls attributsicher escapen oder als DOM-Property setzen.

### Finding 3 - P1

Datei:

```text
extension/content/productDetector.js
```

Stelle:

```text
Zeile 2430
```

Titel:

```text
Overlay injiziert Produktfelder direkt in die besuchte Seite
```

Beschreibung:

Das Overlay setzt `product.title`, `product.url`, `product.description`, `product.image`, `product.supplier`, `product.domain` und weitere Felder direkt via `innerHTML`. Da diese Daten von fremden Produktseiten stammen, kann fehlerhaftes oder boeses Markup das Overlay oder die Seite stoeren. Besonders `src` und `href` sollten normalisiert werden.

Empfehlung:

- Textfelder escapen.
- Bild-URLs mit einer sicheren URL-Funktion validieren.
- `href` und `src` nur setzen, wenn `http:` oder `https:` erlaubt ist.
- Fuer Bild-Link `rel="noreferrer noopener"` nutzen.

### Finding 4 - P2

Datei:

```text
extension/content/productDetector.js
```

Stelle:

```text
Zeile 2353
```

Titel:

```text
Command-Bar-Befehle senden Messages ohne Handler
```

Beschreibung:

`ELYON_OPEN_SOUL_SCOUT`, `ELYON_CHECK_SOUL_GUARD` und `ELYON_OPEN_SECURITY_CENTER` werden aus der Command Bar gesendet, aber im Background gibt es dafuer keinen Handler. Fuer Nutzer wirkt der Button dadurch tot.

Empfehlung:

- Background-Handler fuer diese Message-Types ergaenzen.
- `ELYON_OPEN_SOUL_SCOUT` sollte Sidepanel oder Agenten-Seite oeffnen.
- `ELYON_CHECK_SOUL_GUARD` sollte einen sicheren lokalen Guard-Workflow vorbereiten.
- `ELYON_OPEN_SECURITY_CENTER` sollte Options/Settings oeffnen.

### Finding 5 - P2

Datei:

```text
extension/manifest.json
```

Stelle:

```text
Zeile 33
```

Titel:

```text
Vercel Host Permission ist zu breit
```

Beschreibung:

`*://*.vercel.app/*` erlaubt Zugriff auf alle Vercel-Apps, obwohl vermutlich nur `elyonsellertool.vercel.app` benoetigt wird. Fuer Least-Privilege sollte die Permission enger gesetzt werden.

Empfehlung:

Aktuell:

```json
"*://*.vercel.app/*"
```

Besser:

```json
"https://elyonsellertool.vercel.app/*"
```

Falls Preview-Deployments bewusst gebraucht werden, sollte das separat dokumentiert werden.

### Finding 6 - P2

Datei:

```text
extension/options/agents.js
```

Stelle:

```text
Zeile 87
```

Titel:

```text
Options-Agenten starten weiterhin nur lokalen Workflow
```

Beschreibung:

Im Popup und Overlay ist Soul Scout an die KI-Route angebunden, aber die Agenten-Optionsseite nutzt weiter `ELYON_PREPARE_AGENT_WORKFLOW`. Der Button `Analyse vorbereiten` startet dort also keine echte KI-Analyse, auch wenn `aiEnabled` aktiv ist.

Empfehlung:

- Fuer Soul Scout in `options/agents.js` denselben Flow wie Popup/Overlay verwenden:

```text
ELYON_RUN_AGENT_ANALYSIS
```

- Fuer andere Agenten weiter nur vorbereiten, bis deren Backend-Analyse sauber angebunden ist.

### Finding 7 - P3

Datei:

```text
extension/popup/popup.js
```

Stelle:

```text
Zeile 409
```

Titel:

```text
Popup rendert Tab- und Research-Daten per innerHTML
```

Beschreibung:

Mehrere Popup-Listen schreiben Titel, URLs und Domains direkt in HTML. Das ist weniger kritisch als Content/Sidepanel, aber sollte fuer Robustheit und saubere Anzeige ebenfalls escaped werden.

Empfehlung:

- `escapeHtml()` fuer Research-Liste, Agenten-Liste und Tab-Hunter-Liste nutzen.
- Tab-Titel und URLs nie direkt in `innerHTML` schreiben.

## Stabil wirkende Bereiche

- Manifest V3 Grundstruktur ist vorhanden.
- Background Service Worker ist modular.
- Content Script wird auf unterstuetzten Produktseiten geladen.
- Security Defaults sind sicher.
- Backend-Requests nutzen Timeouts.
- Bei Backend-Ausfall gibt es lokalen Fallback.
- Research Memory speichert lokal in `chrome.storage.local`.
- Rechtsklick-Aktionen senden nicht ans Backend.
- Varianten-Scanner ist defensiv angelegt.
- Soul Scout ist im Popup/Overlay an `/api/elyon-soul` angebunden.
- Keine Live-Aktionen im Audit gefunden.

## Sicherheitsstatus

Gefunden:

- Keine API-Keys hardcodiert.
- Keine Checkout-Automation.
- Keine Bestellung.
- Kein Warenkorb.
- Kein automatisches eBay-Posting.
- Keine Kundennachrichten.
- Keine Cookies oder Login-Daten werden aktiv ausgelesen.

Risiko:

- UI-Injection durch ungeescapte Produktdaten in Extension-Seiten und Overlay.
- Zu breite Host Permission fuer Vercel.
- Tote Buttons/Commands koennen Nutzer verwirren.

## Empfohlene Fix-Reihenfolge

1. Escaping/DOM-Sicherheit fixen:
   - `sidepanel.js`
   - `options/research.js`
   - `content/productDetector.js`
   - `popup/popup.js`
2. Tote Command-Bar-Handler im Background ergaenzen.
3. Vercel Host Permission einschraenken.
4. Options-Agenten an denselben Analyse-Flow wie Popup/Overlay anbinden.
5. Danach manuell testen:
   - Popup
   - Overlay
   - Rechtsklick-Menue
   - Research Memory
   - Browser Import
   - Soul Scout
   - Sidepanel

## Fix-Status vom 29.05.2026

Die P1- und P2-Findings wurden stabilisierend bearbeitet.

Umgesetzt:

- HTML-Escaping in `extension/sidepanel/sidepanel.js`
- HTML-Escaping in `extension/options/research.js`
- HTML-Escaping und sichere Bild-URL-Pruefung in `extension/content/productDetector.js`
- HTML-Escaping in relevanten Popup-Listen in `extension/popup/popup.js`
- HTML-Escaping in `extension/options/agents.js`
- Background-Handler fuer `ELYON_OPEN_SOUL_SCOUT`
- Background-Handler fuer `ELYON_CHECK_SOUL_GUARD`
- Background-Handler fuer `ELYON_OPEN_SECURITY_CENTER`
- Vercel Host Permission eingeschraenkt auf `https://elyonsellertool.vercel.app/*`
- Soul Scout in `options/agents.js` nutzt jetzt `ELYON_RUN_AGENT_ANALYSIS`

Geprueft:

```text
node --check extension/background.js
node --check extension/content/productDetector.js
node --check extension/popup/popup.js
node --check extension/options/agents.js
node --check extension/options/research.js
node --check extension/sidepanel/sidepanel.js
manifest json parse ok
```

Ergebnis:

```text
P1/P2 Audit-Findings umgesetzt. Manuelle Chrome-Tests stehen noch aus.
```

Rest-Risiko:

- P3-Finding im Popup ist teilweise gehaertet, sollte bei spaeteren UI-Erweiterungen weiter beachtet werden.
- Nach dem Neuladen der Extension sollten Popup, Overlay, Sidepanel, Command Bar und Agenten-Optionsseite manuell durchgeklickt werden.

## Manuelle Test-Checkliste nach Fixes

### Chrome Extension

1. `chrome://extensions` oeffnen.
2. Elyon Browser OS aktualisieren.
3. Produktseite neu laden.
4. Popup oeffnen.
5. Console pruefen.

### Overlay

1. Amazon-Produktseite oeffnen.
2. Overlay anzeigen lassen.
3. Titel, Preis, Bild, Beschreibung pruefen.
4. Overlay minimieren, verschieben, schliessen.
5. Keine Seitenspruenge pruefen.

### Research

1. Produkt lokal speichern.
2. Research-Seite oeffnen.
3. Produkt anzeigen.
4. Notiz speichern.
5. Status aendern.
6. Produkt loeschen.

### Command Bar

1. `Ctrl + Shift + E` druecken.
2. `Soul Scout oeffnen` testen.
3. `Soul Guard pruefen` testen.
4. `Security Center oeffnen` testen.
5. Keine toten Buttons.

### Soul Scout

1. Backend URL setzen.
2. `aiEnabled` aktivieren.
3. Produktseite oeffnen.
4. `Soul Scout vorbereiten` klicken.
5. Pruefen, ob Analyse oder klare Fehlermeldung erscheint.

## Abschluss

Das Audit zeigt: Die Extension ist funktional breit aufgebaut und sicherheitsbewusst konzipiert. Der wichtigste naechste Schritt ist nicht neue Funktionalitaet, sondern Härtung der UI-Ausgabe gegen ungeescapte externe Produktdaten und das Reparieren toter Command-Bar-Befehle.
