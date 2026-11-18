# ELYON Finance – V3 Datensicherheit (Draft)

Stand: 18.11.2026 · nur Feature-Branch, keine Produktivfreigabe.

## Was sich ändert

- Der Finance-Server speichert eine monoton steigende `revision` im bestehenden Finance-Key. Atomare Redis-`EVAL`-Vergleiche verhindern, dass zwei gleichzeitige Schreibvorgänge sich still gegenseitig überschreiben.
- Finance-V3-Browser speichern nach einem erfolgreich geladenen Serverstand automatisch, mit `expectedRevision`. HTTP 409 stoppt den automatischen Abgleich und lässt lokale Daten unverändert.
- Vor dem Zusammenführen wird eine lokale Sicherung erstellt. Für Altbestände ohne bekannte Revision ist eine bewusste Bestätigung erforderlich. Konflikte mit zeitgleich bearbeiteten Einträgen sind weiterhin manuell zu überprüfen.
- Partielle Bestellcenter-Updates überschreiben die Finance-Steuereinstellungen nicht mehr mit Defaults.
- Lokale Audit-Ereignisse werden serverseitig neu verkettet und per `clientEventId` dedupliziert.
- Rechnungsnummern werden pro Bestellung über eine atomare Redis-Zähler-/Reservierungsoperation erzeugt. Ohne Redis ist die Neuanlage einer Rechnung gesperrt.
- Browser und Server nutzen dieselbe freigegebene-EUR-Auswahl für EÜR-Arbeitsdaten. Fremdwährungen und ungeprüfte Vorgänge blockieren den Export.

## Originalbelege und Google Drive

Belege verbleiben beim Upload zunächst in der **lokalen IndexedDB**.

Über **„In Drive sichern“** kann der Benutzer bei verbundener bestehender ELYON-Google-Drive-Integration jeden Originalbeleg separat hochladen. Der Server kontrolliert die SHA-256-Prüfsumme und legt die Datei mit privaten `appProperties` im konfigurierten Backup-Ordner ab. Die zugehörige Drive-Datei-ID wird im Finance-State gespeichert und auf andere Geräte synchronisiert.

Ein anderer Rechner kann den Originalbeleg bei Bedarf über die geschützte API wiederherstellen. Die API prüft die Datei-ID, Beleg-ID, SHA-256-Prüfsumme, Archivordner und Dateiinhalt vor der Rückgabe. Es werden keine OAuth-Access-Tokens im Browser offengelegt.

**Grenzen:**
- Einzeldokument-Limit 2,5 MB; größere Belege benötigen eine noch zu ergänzende Lösung mit resumable Upload oder einen anderen Objektspeicher.
- Cloud-Speicherung ist **nicht automatisch** und benötigt die vorherige Google-Drive-Verbindung. Vor erfolgreichem Finance-Server-Sync sind Cloud-Belegverknüpfungen nur lokal bekannt.
- Google Drive ist kein zugesichert GoBD-konformes, unveränderliches Belegarchiv. Aufbewahrungsregeln und Verfahrensdokumentation sind separat zu prüfen.
- Die Drive-App nutzt den bestehenden `drive.file`-OAuth-Scope und den mit `GOOGLE_DRIVE_BACKUP_FOLDER_ID` konfigurierten Ordner.
- Der Browser zeigt explizit, wenn der Finance-Server nicht persistent eingerichtet oder die Synchronisierung blockiert ist.

## Prüfungen vor einem Merge

1. Produktivdaten vorab außerhalb des Browsers sichern. Keine Live-Buchung zum Testen verändern.
2. Upstash/`EVAL` und Zugriffsberechtigung im **isolierten Testdatensatz** prüfen.
3. Gleichzeitiges Arbeiten auf zwei Rechnern simulieren: die zweite veraltete Version muss mit 409 blockiert werden und ihre lokalen Änderungen behalten.
4. Alte lokale Finance-Daten mit einem bestehenden Serverstand zusammenführen, Backups und manuelle Konfliktbehandlung testen.
5. Rechnungsnummern unter parallelen Anfragen prüfen (gleiche Bestellung = gleiche Nummer, verschiedene Bestellungen = eindeutige Nummern).
6. Google Drive mit einem speziell für Tests erzeugten, nicht steuerrelevanten kleinen Dokument verifizieren; danach Abruf auf zweitem Gerät samt Hashkontrolle.
7. Finance-Monatsabschluss, EÜR-API und DATEV-Export anhand eines fiktiven Datensatzes testen.
8. GoBD-/Steuerfachprüfung separat dokumentieren.

## Noch nicht Bestandteil dieser Änderung

- Tatsächliche ELSTER-Abgabe oder Steuererklärung.
- Jobcenter-Anlage EKS.
- Vollständig automatisches Cloud-Archiv aller Belege.
- Vollständig automatisches, fachlich korrektes Konflikt-Merging.
- Vollständige GoBD-/DATEV-Konformitätsaussage.

**Release-Policy:** Draft-PR; manuelle Prüfung der obigen Punkte vor Merge und produktiver Veröffentlichung erforderlich.


## eBay-Finances-API (EU/UK): Digital Signatures

Der Finance-V3-Preview-Fehler vom 18.11.2026 (HTTP 403, "Missing x-ebay-signature-key header") wurde im Vercel-Runtime-Log bestätigt. eBay verlangt für EU-/UK-Verkäufer signierte Aufrufe an alle Finances-API-Endpunkte.

- Der Server signiert GET-Anfragen für Finances-Transaktionen und Auszahlungen mit x-ebay-signature-key, Signature-Input und Signature.
- Die Signatur wird ausschließlich serverseitig in lib/ebay-finance-signature.js erstellt. Browser und öffentliche API-Statusdaten geben keine Schlüsselwerte zurück.
- Ed25519 (empfohlen) und RSA-SHA256/PKCS#1 v1.5 werden unterstützt. Für GET-Anfragen ist kein Content-Digest notwendig.
- Die Vercel-Konfiguration des Seller-Tool-Projekts benötigt pro Umgebung die gültigen Variablen EBAY_SIGNATURE_JWE und EBAY_SIGNATURE_PRIVATE_KEY. Alternativ werden EBAY_SIGNING_KEY_JWE und EBAY_SIGNING_PRIVATE_KEY akzeptiert.
- Das ist ein eBay-Key-Management-Schlüsselpaar, nicht die App ID/Cert ID oder der OAuth-Refresh-Token. Die Private Key PEM darf ausschließlich als geschützte Server-Umgebungsvariable abgelegt werden, niemals in Git, Chat, Screenshots oder HTML.
- PEM-Werte mit echten Zeilenumbrüchen oder als \n gespeicherten Zeilenumbrüchen werden unterstützt.
- Fehlende Signaturschlüssel führen zu einer klaren Fehlermeldung, ohne dass unsigniert auf eBay zugegriffen wird. Bestehende Finanzdaten bleiben unberührt.
- Nach dem Eintragen ist ein neues Preview-Deployment erforderlich. Danach erst read-only Finances-Preview sowie OAuth-Scope sell.finances prüfen.
- Ohne ein gültiges, vom eBay Developer Program erzeugtes Schlüsselpaar ist die Verbindung weiterhin nicht funktionsfähig.

Offizielle Quellen:
- https://developer.ebay.com/develop/guides/sell/digital-signatures-for-apis
- https://developer.ebay.com/api-docs/developer/key-management/static/overview.html


### eBay-Schlüsselwerte aus dem API Explorer

Nach HTTP 201 Created liefert createSigningKey die Felder `jwe`, `privateKey`, `publicKey` und `signingKeyId`.

- In Vercel `EBAY_SIGNATURE_JWE` = `jwe` (öffentliches Signaturschlüssel-JWE).
- `EBAY_SIGNATURE_PRIVATE_KEY` = `privateKey`. eBay liefert Ed25519 als Base64-kodierte PKCS#8-DER-Zeichenkette. **Nicht in PEM umwandeln**: Die Serverfunktion unterstützt das eBay-Originalformat und alternativ PEM.
- `publicKey` und `signingKeyId` sind für diese zwei Vercel-Variablen nicht erforderlich.
- Ein privater Schlüssel, der in Chat oder Screenshot zu sehen war, sollte nicht in Betrieb genommen werden. Stattdessen ein neues Schlüsselpaar erzeugen und den neuen privaten Schlüssel ausschließlich in der geschützten Vercel-Konfiguration speichern.
- Neue/aktualisierte Preview-Umgebungsvariablen werden erst durch ein neu erstelltes Preview-Deployment wirksam.
