# Produktbeschaffung - Aenderungen

## Ziel
Der Bereich `2. Produktbeschaffung` wurde so umgebaut, dass er als eigener, klarer Arbeitsbereich funktioniert und nicht mehr wie eine gemischte Such- und Importseite wirkt.

## Was geaendert wurde

### 1. Hauptnavigation
- Der Menuepunkt `2. Produktsuche` wurde in `2. Produktbeschaffung` umbenannt.
- Die Bezeichnung ist absichtlich breiter gehalten, damit eBay, manuelle Suche, weitere Anbieter und KI zusammen in einem logischen Bereich stehen.

### 2. Aufbau der Seite
Der Bereich `Produktbeschaffung & Quellen` wurde in eine klare Reihenfolge gebracht:

1. `eBay`
   - `eBay Marktdaten pruafen`
   - `eBay Search direkt`
2. `Weitere Anbieter`
   - Anbieter-Auswahl
   - Produktlink / Quelle
   - Button `Quelle uebernehmen`
3. `Manuelle Produktsuche`
   - manuelle Produktidee
   - Produktlink / Notiz
   - Button `Manuelle Suche uebernehmen`
4. `KI Produktsuche optional`
   - KI-Suche verbessern
   - Produktidee pruafen
   - KI-Kostenwarnung

### 3. Bedienlogik
- `Manuelle Suche uebernehmen` uebernimmt die manuelle Eingabe in die Produktmaske.
- `Quelle uebernehmen` uebernimmt Anbieter und Link aus dem Quellenblock in die Produktmaske.
- Beide Buttons springen direkt zum Produktformular.
- Die Beschaffungsfelder sind damit nicht nur optisch vorhanden, sondern auch funktional angebunden.

### 4. Anbieter-Liste
Im Bereich `Weitere Anbieter` wurden mehrere Quellen ergaenzt:

- `CJdropshipping`
- `AliExpress`
- `dropxl.com`
- `Bigbuy.com`
- `Amazon.de`
- `Temu`
- `Alibaba`
- `Sonstige`

### 5. Dashboard-Ordnung
- Die Reihenfolge im Dashboard wurde ebenfalls angepasst.
- Zuerst steht jetzt der `Tagesfokus`.
- Danach kommen `Warnungen`.
- Danach der `Schnellstart`.
- Tiefere Bereiche wie Zahlen, Top-Produkt und Berichte kommen weiter unten.

## Dateien
Geaendert wurden:

- `index.html`
- `public/index.html`

## Kurzfassung fuer ChatGPT
`Produktbeschaffung` ist jetzt der Hauptbereich fuer eBay, manuelle Suche, weitere Anbieter und optionale KI-Suche. Die Seite ist in eine klare Reihenfolge gebracht worden, die Buttons sind funktional mit der Produktmaske verbunden, und die Anbieter-Liste wurde erweitert um `dropxl.com` und `Bigbuy.com`.
