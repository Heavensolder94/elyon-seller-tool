# Systemweite eBay-Kategorien – Seller Tool

## Ziel

Product Master, Company-OS-Eingang, Listing Designer und Auto Lister verwenden denselben additiven Kategorie-Datensatz.

## Vertrag

- Lieferanten-/Quellkategorie bleibt separat.
- Offizielle eBay-DE-Kategorie enthält ID, Name, Pfad und Pflichtmerkmale.
- Kategorieänderungen setzen frühere Pflichtmerkmal-Bestätigungen zurück.
- Fehlende offizielle eBay-Kategorie ist ein Freigabeblocker.

## Sicherheit und Rückweg

- Keine automatische Veröffentlichung.
- Keine Secrets oder Tokens im Frontend.
- Bestehende Listing-, Product-Master- und LocalStorage-Felder bleiben erhalten.
- `main` bleibt bis zur manuellen Prüfung unverändert; der Feature-Branch kann vollständig verworfen werden.
