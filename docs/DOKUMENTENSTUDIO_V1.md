# ELYON Dokumentenstudio – V1 (universell)

## Einbindung
- Aufruf innerhalb der SellerTool-Oberfläche über „📄 Dokumentenstudio“ im Menü und ggf. der Seitenleiste.
- Build: scripts/prepare-vercel.mjs spiegelt die neuen CSS/JS-Dateien nach public und bindet beide nur im Desktop-Build ein.
- Direkt über die Seiten-URL mit Fragment #dokumentenstudio erreichbar.
- Bestehende Rechnungsansicht, invoiceMeta, Rechnungsnummernvergabe, eBay-Listings und Bestellversand bleiben unverändert.

## Funktionen (V1)
- Freier Rich-Text-Editor mit Fett/Kursiv/Unterstreichen, Listen, Überschriften und einfachen Tabellen aus Vorlagen.
- Acht Dokumenttypen: frei, Geschäftsbrief, Angebot, Vertragsentwurf, Formular, Lieferschein, Einkaufsnotiz, Reklamationsantwort.
- Platzhalter: {{Firma}}, {{Empfänger}}, {{Datum}}, {{Referenz}}.
- Firmenprofil aus vorhandenen Finance-Einstellungen (sellerLegalName, sellerBrand, Adresse); keine redundante Stammdatenerfassung.
- Geschütztes Serverarchiv, Suche, Versionen, Archivieren und Wiederherstellen, Prüfung bei gleichzeitiger Bearbeitung.
- Browser-Druckansicht im A4-Layout; dort „Als PDF speichern“ auswählen. Kein direkter PDF-Datei-Download.
- Echter DOCX-Export mit Basistextexport (komplexe Formatierung und Tabellenlayout werden noch nicht vollständig übertragen).
- Keine neue API-Abrechnung, kein eigener KI-Aufruf, keine automatischen E-Mails oder eBay-Schreiboperationen.

## Sicherheit und Speicherung
- api/document-studio.js verwendet immer requireSellerAccess.
- Separater Redis-Key elyon-seller-tool:document-studio:v1, unabhängig von Finance/invoiceMeta.
- Nutzt vorhandene Upstash-/KV-REST-Umgebungsvariablen (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN, KV_REST_API_URL / KV_REST_API_TOKEN oder EBAY_TOKEN_STORE_URL / EBAY_TOKEN_STORE_TOKEN). Keine neuen Pflicht-Secrets.
- Ohne persistenten Store HTTP 503; Speichern wird nicht als erfolgreich dargestellt.
- CAS per Redis Lua-Skript verhindert gleichzeitige Änderungen; expectedRevision für Änderungen Pflicht.
- Keine destruktive Löschfunktion. Archivierte Dokumente sind wiederherstellbar.
- Kein LocalStorage für Dokumenteninhalte.
- Semantische HTML-Tags aus Allowlist, alle Attribute entfernt; zusätzliche DOM-Sanitisierung im Client. Keine eingebetteten Skripte, Bilder, Links.
- Maximal 80 Entwürfe und maximal 25.000 Zeichen HTML pro Dokument.

## Dokumenten-API
Alle Routen verlangen Seller-Sitzung und nutzen Cache-Control: no-store.

- GET /api/document-studio?action=list → Revision + Dokumentenmetadaten
- GET /api/document-studio?action=get&id=... → einzelnes Dokument mit HTML
- GET /api/document-studio?action=profile → bestehendes Geschäftsprofil aus Finance
- POST /api/document-studio?action=save → JSON: expectedRevision + document
- POST /api/document-studio?action=archive → JSON: expectedRevision + id
- POST /api/document-studio?action=restore → JSON: expectedRevision + id
- HTTP 409 bei Revisionskonflikten, HTTP 503 bei fehlendem Redis/Seller-Zugang.

## Grenzen und nächste Ausbaustufen
- V2: Geprüfte Produkt-, Bestell- und Lieferanten-Feldzuordnung aus Company OS/eBay, ohne automatische Rechnungserstellung oder Statusänderungen.
- V3: Optionaler, explizit ausgelöster KI-Textassistent mit datensparsamer Übergabe; nicht in V1 aktiv.
- Verträge, Angebote oder Einkaufsnotizen sind Entwürfe; steuerliche Nachweise separat prüfen.
- Ausgestellte eBay-Rechnungen müssen über das bestehende Rechnungsmodul erstellt werden.

## Regression
- npm test schließt tests/document-studio.test.mjs ein.
- Nach Build prüfen: Vorlage, Speichern/erneutes Laden, zwei Browser-Tabs (409), Archivieren/Wiederherstellen, Druck/PDF und DOCX-Öffnung.
- Bestehenden eBay-Entwurfsworkflow und Rechnungserstellung unverändert testen.
