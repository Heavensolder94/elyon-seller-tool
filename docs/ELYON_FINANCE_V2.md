# Elyon Finance V2

Stand: 15.08.2026

## Ziel

Finance V2 entwickelt den bestehenden Bereich `#finance` zur operativen Finanzzentrale des Elyon Seller Tools weiter. Die vorhandene Finance-API, der Finance-State, eBay-Finances-Import, Belegspeicher, EÜR-/DATEV-Vorbereitung und Rechnungsintegration bleiben erhalten.

Finance V2 führt keine Steuererklärung aus, übermittelt nichts an ELSTER oder DATEV und löst keine eBay-Live-Aktion aus.

## Neue Hauptfunktionen

- zentraler Zeitraumfilter: aktueller Monat, vorheriger Monat, Quartal, Jahr, Gesamtbestand, benutzerdefinierter Zeitraum
- Kennzahlen ausschließlich aus dem gewählten Zeitraum
- 6-Monats-Entwicklung für Umsatz und Gewinn
- Datenqualitätscheck für ungeprüfte Vorgänge, fehlende Lieferantenkosten, fehlende Belege, Fremdwährungen und fehlende Order-IDs
- Gewinn- und Margenrechnung je eBay-Bestellung
- Profitabilität je eBay-Artikel-ID / SKU
- eBay-Auszahlungsabgleich über das interne Verrechnungskonto
- selektive Freigabe statt globalem „alle freigeben“
- direkte Belegzuordnung an Transaktionen
- sicherer DATEV-/EÜR-Export nur aus freigegebenen EUR-Vorgängen
- Fremdwährungsblocker statt stiller EUR-Summierung
- Monatsabschluss mit Sperre für Freigabe, Storno, Belegänderungen und Lieferantenkosten
- erneutes Öffnen eines Monats nur mit Begründung und Audit-Eintrag
- lokale SHA-256-Audit-Verknüpfung; serverseitige Hashkette bleibt erhalten
- vollständige Kontoeinstellungen für Erlöse, Gebühren, Werbung, Wareneinkauf, Versand, Erlösminderungen und sonstige Konten

## Zeitraumlogik

Alle V2-Kennzahlen und operativen Tabellen verwenden den aktiven Zeitraum. Der Zeitraum ist nur eine Ansicht und verändert keine Originaltransaktionen.

Für Monatsabschlüsse muss der aktive Zeitraum genau innerhalb eines Kalendermonats liegen.

## Profitabilitätslogik

### Bestellung

```text
Umsatz
+ Gebührengutschriften / relevante Erträge
- Erstattungen
- eBay-Gebühren
- Werbekosten
- Lieferantenkosten
- Versandkosten
- sonstige Kosten
= realer Bestellgewinn
```

Eine Bestellung wird erst als vollständig markiert, wenn Umsatz und Lieferantenkosten zugeordnet sind.

### Produkt / SKU

Transaktionen mit `itemId` werden über diese eBay-Artikel-ID zusammengeführt. Dadurch kann Finance V2 Umsatz, Kosten, Gewinn, Marge und Anzahl zugeordneter Bestellungen je Artikel darstellen.

Wenn eine Transaktion keine `itemId` besitzt, wird keine künstliche Produktzuordnung erzeugt.

## eBay-Auszahlungsabgleich

Der erwartete eBay-Auszahlungsbetrag wird aus eBay-internen Finanzbewegungen gebildet:

```text
eBay-Umsatz
- Erstattungen
- eBay-Gebühren
- eBay-Werbung
- eBay-Versandkosten
+ Gebührengutschriften
= erwartete Auszahlung
```

Lieferantenkosten werden bewusst nicht in den Auszahlungsabgleich aufgenommen, weil sie außerhalb des eBay-Verrechnungskontos bezahlt werden.

`PAYOUT` / `TRANSFER` bleibt ein Geldtransfer und wird nicht als zweiter Umsatz behandelt.

## Währungen

Die zentrale Finance-V2-Auswertung rechnet standardmäßig in EUR.

Fremdwährungen werden nicht still als EUR interpretiert. Enthält ein Zeitraum andere Währungen, erscheint ein Datenqualitätsblocker. DATEV- und EÜR-Exporte werden in diesem Zustand blockiert.

Eine spätere FX-Konvertierung benötigt eine eigene dokumentierte Wechselkursquelle und ist nicht Bestandteil von V2.

## Freigaben

Die alte globale Freigabe wird in V2 nicht als Standard verwendet.

Stattdessen:

1. Zeitraum wählen.
2. Ungeprüfte Vorgänge auswählen oder einzelne Vorgänge markieren.
3. Nur die markierten Vorgänge freigeben.
4. Audit-Eintrag wird geschrieben.

Abgeschlossene Monate können nicht freigegeben oder storniert werden.

## Belege

Originalbelege bleiben in IndexedDB gespeichert. Jeder Beleg erhält eine SHA-256-Prüfsumme.

Finance V2 ergänzt eine direkte Zuordnung:

```text
Transaktion -> Beleg-ID -> Originaldatei
```

Bestehende `documentIds` werden erweitert und nicht überschrieben.

## Monatsabschluss

Finance V2 speichert Abschlüsse unter:

```text
state.monthClosures[YYYY-MM]
```

Ein Monat kann erst abgeschlossen werden, wenn:

- keine ungeprüften Vorgänge vorhanden sind
- für Umsatz-Bestellungen Lieferantenkosten vorhanden sind
- keine ungeklärten Fremdwährungen vorhanden sind
- relevante Ausgaben / Erstattungen die geforderte Belegzuordnung besitzen

Beim Abschluss wird ein Snapshot gespeichert:

- Umsatz
- Ausgaben
- Gewinn
- Marge
- Transaktionsanzahl
- Abschlusszeitpunkt

Ein erneutes Öffnen benötigt eine Begründung und erzeugt einen Audit-Eintrag.

## Persistenz

Der vorhandene Finance-Key bleibt unverändert:

```text
elyon-seller-tool:finance:v1
```

Es wird kein zweites Finance-System angelegt.

`lib/finance-store.js` behandelt `monthClosures` explizit als eigenen Record-Map-Bereich, damit Abschlüsse mehrerer Monate beim Server-Merge erhalten bleiben.

## Sichere Exporte

### Transaktions-CSV

Kann den aktuell gewählten Zeitraum enthalten und dient als Arbeits-/Kontrollausgabe.

### DATEV-Vorbereitung

Nur:

- nicht stornierte Vorgänge
- Status `approved`
- Währung EUR
- aktiver Zeitraum

Bei ungeprüften Vorgängen oder Fremdwährungen wird der Export blockiert.

### EÜR-Arbeitsauswertung

Verwendet ebenfalls ausschließlich freigegebene EUR-Vorgänge des aktiven Zeitraums.

## Audit

Der serverseitige Finance-Store besitzt bereits eine SHA-256-Hashkette mit `previousHash`.

Finance V2 ergänzt für neue Browser-Audit-Ereignisse ebenfalls SHA-256 und `previousHash`, sofern Web Crypto verfügbar ist. Nicht gehashte Altbestände werden im UI nicht fälschlich als verifiziert dargestellt.

## Sicherheitsgrenzen

- keine Steuerberatung
- keine Steuererklärung
- keine automatische ELSTER-/DATEV-Übermittlung
- keine eBay-Live-Schreibaktion
- keine erfundenen Einkaufspreise oder Wechselkurse
- abgeschlossene Monate müssen vor Korrekturen bewusst wieder geöffnet werden
- Originalbelege werden nicht überschrieben
- bestehende Finance-Backups und der vorhandene localStorage-Key bleiben erhalten

## Tests

Finance V2 besitzt automatisierte Tests für:

- Monats-, Vormonats- und Quartalsfilter
- Zeitraumauswahl
- fehlende Lieferantenkosten
- Fremdwährungsblocker
- ungeprüfte Vorgänge
- Order-Profitabilität
- Produkt-/SKU-Profitabilität
- eBay-Auszahlungsabgleich ohne Lieferantenkosten
- Monatsabschluss-Readiness
- Persistenz und Merge mehrerer Monatsabschlüsse

Die bestehenden Finance-Core- und Finance-Integrationstests bleiben zusätzlich bestehen.
