# Elyon Seller Tool – Performance-Fix Phase 2

Datum: 28.07.2026

## Ausgangslage

Die Live-Seite wurde serverseitig korrekt ausgeliefert, blieb im Browser aber beim Start deutlich träge. Phase 1 hatte bereits funktionsspezifische Zusatzmodule auf bedarfsgesteuertes Laden umgestellt. Die Hauptlast blieb jedoch im monolithischen `index.html` bestehen.

## Gefundene Hauptursachen

1. `index.html` enthielt zwei große Inline-JavaScript-Blöcke mit zusammen rund 13.900 Codezeilen.
2. Der komplette Desktop-App-Kern wurde bei jedem Seitenaufruf erneut als Bestandteil des HTML geladen und geparst.
3. Die komplette Legacy-Oberfläche der virtuellen Mitarbeiter wurde auch dann geparst und ausgeführt, wenn der Agenten-Reiter nicht geöffnet wurde.
4. Die externe XLSX-Bibliothek wurde blockierend vor dem App-Kern geladen, obwohl Excel-Import nur selten benötigt wird.

## Umsetzung

- Der Build extrahiert den allgemeinen Desktop-Kern nach `public/seller-app-core.js`.
- Die Legacy-Agentenoberfläche wird nach `public/seller-virtual-agents-legacy.js` extrahiert.
- Die Agentenoberfläche wird über `seller-runtime-loader.js` erst beim Öffnen von `virtualAgentsTab` geladen.
- Die XLSX-Bibliothek wird erst nach Auswahl einer `.xlsx`- oder `.xls`-Datei dynamisch geladen.
- Das ursprüngliche `index.html` bleibt als editierbare Quelle erhalten; die Optimierung erfolgt reproduzierbar beim Vercel-Build.
- Der Build validiert die Syntax beider extrahierten Browserdateien.

## Gemessener Build-Effekt

| Datei / Bereich | Größe |
|---|---:|
| ursprüngliches Desktop-HTML | 930.513 Bytes |
| optimiertes Desktop-HTML | 190.945 Bytes |
| ausgelagerter App-Kern | 476.168 Bytes |
| verzögert geladene Agentenlogik | 264.652 Bytes |

Das beim Start zu übertragende und als HTML zu verarbeitende Dokument wurde damit um rund 79,5 % reduziert.

## Nicht verändert

- keine Produktdaten
- keine LocalStorage-Schlüssel
- keine API-Routen
- keine Environment Variables
- keine Authentifizierungs- oder Sicherheitslogik
- keine eBay-Listings, Bestellungen oder externe Aktionen
- keine vorhandenen Funktionen oder Buttons entfernt

## Verifikation

- Vercel Layout Check erfolgreich
- Extraktion erkennt exakt zwei erwartete Inline-App-Blöcke
- Syntaxprüfung von `seller-app-core.js` erfolgreich
- Syntaxprüfung von `seller-virtual-agents-legacy.js` erfolgreich
- alle benötigten Produktionsvariablen im Preview-Build vorhanden
- Preview-Build erfolgreich

## Rollback

Der Fix ist vollständig über den Build und `seller-runtime-loader.js` abgegrenzt. Ein Rollback stellt `scripts/prepare-vercel.mjs`, `scripts/desktop-core-extraction.mjs` und `seller-runtime-loader.js` auf den vorherigen Stand zurück. Das Quell-`index.html` wurde nicht strukturell umgebaut.
