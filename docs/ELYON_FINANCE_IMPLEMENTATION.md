# Elyon Finance – Umsetzung, Betrieb und Grenzen

Stand: 03.08.2026

## Zweck

Elyon Finance ist der neue Bereich **Finanzen & Buchhaltung** im Elyon Seller Tool. Er verbindet eBay-Finanzdaten mit Elyon-Kosten und bereitet nachvollziehbare Buchungsvorschläge, Auswertungen und Exporte vor.

Das Modul ist eine **Buchhaltungs- und Steuerdatenvorbereitung**. Es übermittelt keine Steuererklärung und behauptet keine vollständige GoBD- oder DATEV-Konformität ohne fachliche Prüfung.

## Systemzuordnung

```text
eBay Finances API / eBay CSV
        +
Elyon Lieferanten- und Produktkosten
        +
Belege
        ↓
Elyon Seller Tool → Finanzen & Buchhaltung
        ↓
Prüfung durch Raoul
        ↓
CSV / DATEV-Vorbereitung / EÜR-Arbeitsauswertung
```

Nova und Company OS bleiben Produkt- und Listing-Vorbereitung. Finanzverwaltung, Bestellungen, Rechnungen, Retouren und Integrationen gehören ins Seller Tool.

## Stufe 1 – CSV und lokale Buchhaltungsvorbereitung

Umgesetzt:

- eBay-CSV-Import mit Vorschau
- automatische Erkennung von Komma, Semikolon oder Tab
- tolerante Zuordnung deutscher und englischer Spaltennamen
- Erkennung von Umsatz, eBay-Gebühren, Anzeigengebühren, Erstattungen, Gutschriften und Auszahlungen
- Dubletten-Schutz über Transaktions-ID und Transaktionstyp
- lokale Sicherung vor Importen und Änderungen
- Lieferantenkosten manuell pro eBay-Bestellnummer erfassen
- Gewinn- und Margen-Nachkalkulation
- Buchungsvorschläge statt automatischer Buchung

## Stufe 2 – eBay Finances API

Umgesetzt:

- geschützte Route `/api/finance`
- lesender Abruf von eBay-Finanztransaktionen
- Abruf von Auszahlungen
- Pagination für Transaktionsdaten
- Normalisierung in dasselbe Datenmodell wie CSV-Importe
- Anzeigengebühren über `AD_FEE` und weitere Werbegebührentypen
- eBay-Gebühren aus Order-Line-Items
- Vorschau ohne Speicherung
- bestätigter Import mit Dubletten-Schutz
- keine eBay-Schreibaktion

Benötigter OAuth-Scope:

```text
https://api.ebay.com/oauth/api_scope/sell.finances
```

Nach erstmaliger Einführung des Scopes muss eBay einmal neu verbunden werden, damit der Refresh Token den zusätzlichen Umfang erhält.

## Stufe 3 – Buchhaltungsreife und Nachvollziehbarkeit

Umgesetzt:

- persistenter Finance-State über vorhandenes Upstash/KV
- Offline-First-Fallback im Browser
- append-orientiertes Audit-Log
- Audit-Hash-Kette im serverseitigen Speicher
- keine endgültige Löschung von Finanztransaktionen
- Korrekturen als Storno mit Grund und Zeitpunkt
- Originalbelege lokal in IndexedDB
- SHA-256-Prüfsumme für jeden Beleg
- Belegmetadaten im Finance-State
- Rechnungsnummern-Reservierung mit Audit-Eintrag
- EÜR-Arbeitsauswertung
- Transaktions-CSV
- DATEV-Vorbereitung
- vollständiges JSON-Backup
- Audit-Export

## Speicherorte

### Browser

```text
localStorage: elyon_finance_v1
localStorage: elyon_finance_backup_<timestamp>
IndexedDB: elyon-finance-documents / files
```

### Server

Standard-Key:

```text
elyon-seller-tool:finance:v1
```

Optionale Environment Variables:

```env
ELYON_FINANCE_STORE_MODE=upstash
ELYON_FINANCE_STORE_KEY=elyon-seller-tool:finance:v1
ELYON_FINANCE_STORE_PATH=./data/elyon-finance.json
```

Der Store verwendet bevorzugt die bereits vorhandenen Variablen:

```env
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Alternativ werden vorhandene Vercel-KV- oder eBay-Token-Store-Credentials genutzt. Keine echten Werte in Dateien oder Logs eintragen.

## Buchungslogik

| Elyon-Kategorie | Vorschlag Soll | Vorschlag Haben |
|---|---|---|
| Umsatz | eBay-Verrechnung | Erlöse |
| eBay-Gebühr | eBay-Gebühren | eBay-Verrechnung |
| eBay-Werbung | Werbekosten | eBay-Verrechnung |
| Erstattung | Erlösminderungen | eBay-Verrechnung |
| Gebührengutschrift | eBay-Verrechnung | eBay-Gebühren |
| Wareneinkauf | Wareneinkauf | Lieferanten-Verrechnung |
| Versand | Versandkosten | eBay-Verrechnung |
| Auszahlung | Bank | eBay-Verrechnung |

Eine eBay-Auszahlung ist kein zweiter Umsatz. Sie ist ein Geldtransfer vom eBay-Verrechnungskonto zur Bank.

## Sicherheitsregeln

- Keine automatische Steuerzuordnung bei ungeklärtem Steuerstatus.
- Keine automatische Übermittlung an ELSTER oder DATEV.
- Keine eBay-Live-Aktion.
- Keine endgültige Löschung von Finanzdaten.
- Kein Überschreiben von Originalbelegen.
- Keine Secrets im Frontend, in Markdown oder Logs.
- Server-Sync nur über geschützte Seller-Sitzung.
- Vor Importen und Server-Ladevorgängen wird lokal gesichert.

## DATEV-Status

Der Export heißt bewusst **DATEV-Vorbereitung**. Vor produktiver Verwendung müssen mindestens geprüft werden:

- Kontenrahmen
- Kontonummern statt Kontobezeichnungen
- Steuerschlüssel
- Berater- und Mandantennummer
- Wirtschaftsjahr
- Belegfeldkonzept
- Behandlung von Umsatzsteuer, eBay-Gebühren und Leistungen aus dem Ausland

## GoBD-Status

Technisch vorbereitet sind Nachvollziehbarkeit, Audit-Log, Originalbelege, Prüfsummen, Storno statt Löschung, Backups und reproduzierbare Exporte. Eine vollständige GoBD-Eignung setzt zusätzlich eine fachlich geprüfte Verfahrensdokumentation, Berechtigungskonzept, Aufbewahrungsregeln, Betriebsprozesse und regelmäßige Kontrollen voraus.

## Testfälle

Automatisierte Tests prüfen:

- deutsche eBay-CSV
- Anzeigengebühren
- Auszahlung nicht als zweiter Umsatz
- Dubletten-Schutz
- eBay-Line-Item-Gebühren
- tatsächlichen Gewinn nach Gebühren und Lieferantenkosten
- DATEV- und EÜR-Arbeitsausgabe

## Rollback

Der Finance-Bereich ist additiv und lazy geladen. Für einen Rückweg:

1. Feature-Branch oder PR nicht mergen beziehungsweise zurücksetzen.
2. `seller-finance.js` und `seller-finance-core.js` aus dem Build-Mirror entfernen.
3. `financeTab` aus dem Runtime Loader entfernen.
4. API-Routen und Finance-Store-Dateien entfernen.
5. Bestehende Seller-Tool-Daten bleiben unberührt.

Bestehende eBay-, Produkt-, Listing-, Bestell-, Rechnungs- und Retourenfunktionen werden nicht ersetzt.

## Automatischer eBay-Abgleich (Finance V3)

Der geschützte Vercel-Cron `GET /api/finance-auto-sync` läuft täglich um **06:00 UTC** (07:00 MEZ / 08:00 MESZ) in Production. Er benötigt den Vercel-Cron-Header `Authorization: Bearer <CRON_SECRET>` und verwendet ausschließlich den bereits verbundenen eBay-Production-Refresh-Token sowie die serverseitigen eBay-Signaturvariablen.

- Liest die zurückliegenden 90 Tage über die bestehende, digital signierte eBay Finances API. Keine eBay-Schreibaktionen.
- Importiert ausschließlich **neue** Transaktions-IDs/Dedupe-Keys, keine Änderungen an freigegebenen, stornierten oder manuell korrigierten Datensätzen.
- Respektiert Monatsabschlüsse nach **Europe/Berlin**-Kalendermonat. Gesperrte Monate bleiben unangetastet, auch bei zeitgleichen Änderungen.
- Nutzt den persistenten Upstash-/KV-Finance-State und **expectedRevision** mit erneuter Prüfung bei Konflikten. Keine Datenverschiebung bei fehlendem Cloudspeicher.
- Jeder erfolgreiche Lauf erhält einen Eintrag unter **Importe & eBay** einschließlich Anzahl neuer, bekannter und wegen Abschluss blockierter Vorgänge. Der letzte Lauf wird in der Oberfläche angezeigt.
- Neue Vorgänge haben den Status `needs_review`; keine automatische steuerliche Freigabe, Buchung, Rechnungserstellung oder Übermittlung.
- Der manuelle CSV-Import und die API-Vorschau bleiben unverändert nutzbar.

### Betrieb und Freigabe

1. Geplante Änderungen zuerst als **Preview-Branch** testen und die CI-Ergebnisse prüfen. Vor einem Merge auf `main` prüfen, dass `CRON_SECRET`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_REFRESH_TOKEN` bzw. eBay-Token-Store, `EBAY_SIGNATURE_JWE`, `EBAY_SIGNATURE_PRIVATE_KEY` sowie Upstash/KV in der **Production**-Umgebung vorhanden sind.
2. Der eBay-Refresh-Token muss den Scope `sell.finances` tatsächlich erhalten haben. Falls nicht, eBay einmal mit diesem Scope neu verbinden.
3. Erst nach Freigabe auf `main` startet der Vercel-Cron. Vercel führt geplante Cronjobs ausschließlich in Production aus. Ein Preview-Deployment führt den Job nicht selbstständig aus.
4. Zum Pausieren optional `ELYON_FINANCE_AUTO_SYNC_ENABLED=false` setzen. Kein Löschen oder Überschreiben bestehender Finanzdaten.
5. Fehler und Laufzeiten in Vercel Functions / Cron Logs prüfen. Die Oberfläche zeigt den letzten **erfolgreichen** Lauf an; sie ersetzt kein Fehlermonitoring.

Hinweis: Die API-Synchronisierung ersetzt keine Belegablage, Kostenverknüpfung oder steuerliche Prüfung. 
