# ELYON Dokumentenstudio 3.0 – A4-Direkteditor & Textbausteine

## Funktionsumfang

- Bestehende Vorlagenbibliothek (31 Dokumentvorlagen), vier Layoutdesigns und persönliche Vorlagen aus V2 bleiben erhalten.
- **A4-Direkteditor:** Der Text wird innerhalb der angezeigten A4-Seite bearbeitet (`contenteditable` am Inhalt, nicht an Firmendaten/Metadaten). Das versteckte V2-Quellfeld ist nur ein interner synchronisierter Fallback; es erscheint nicht mehr als zweiter Editor.
- **Live-Layout:** Kopf, Fuß, Logo, Akzentfarbe, Empfänger und Dokumententitel bleiben auf derselben A4-Fläche sichtbar. Das Layout entspricht dem HTML/CSS des PDF-Drucks; Browser-Druckeffekte und Seitenumbrüche können weiterhin abweichen.
- **22 integrierte Textbausteine**: Begrüßung, Abschluss, Verkauf, Kundenservice, Lieferanten, Organisation. Diese Texte sind Einstiegshilfen, keine rechtlich geprüften Klauseln.
- **Persönliche Textbausteine:** Text auf der A4-Seite markieren → „Auswahl als Baustein speichern“ → Titel vergeben. Neue oder namensgleiche eigene Bausteine (nach Bestätigung) werden im Dokumentenarchiv revisionssicher gespeichert; max. 60 Bausteine, je 5.000 HTML-Zeichen.
- **Einfügen an Cursorposition:** Klick in Dokument → Textbaustein anklicken; zuletzt gewählte Textposition wird bewahrt. HTML wird client- und serverseitig auf die vorhandene semantische Allowlist beschränkt. Bereits eingefügter Text ist frei bearbeitbar.
- Eigene Bausteine können gelöscht werden, ohne Dokumente zu ändern, in denen der Text vorher eingefügt wurde.
- Platzhalter wie `{{Firma}}`, `{{Empfänger}}`, `{{Datum}}`, `{{Referenz}}` werden im Editor als editierbare Tokens angezeigt und erst für PDF-/DOCX-Export mit vorhandenen Firmen-/Dokumentdaten ersetzt.
- Vorlagen-, Dokument-, Design- und Logo-Funktionen aus V2 bleiben erhalten.
- Weiterhin keine zusätzlichen KI-Aufrufe, Gebühren oder neue Pflicht-Secrets.

## Unterschied: Bestell- vs. Auftragsbestätigung

- **Bestellbestätigung (Bestelleingang):** Separate Vorlage in „Verkauf“ zur sachlichen Bestätigung des Bestellungseingangs; mit Bestellnummer, Artikeltabelle, Bearbeitungs- und Versandhinweis. Das Bestelldatum ist als zu prüfendes Feld ausgeführt, nicht aus dem Erstellungsdatum erfunden. Keine Aussage darüber, ob der Vertrag bereits geschlossen wurde.
- **Auftragsbestätigung:** Bestehende eigene Vorlage für die Bestätigung eines konkreten Auftrags und seiner Konditionen.
- **Textbaustein:** „Bestelleingang bestätigen“ separat von der bisherigen „Bestellung bestätigen“-Formulierung.
- Keine Änderung des eBay-Order-Status; ELYON erstellt nur manuell kontrollierte Dokumententwürfe.

## API & Datensicherheit

- Vorhandener, separater Speicherkey `elyon-seller-tool:document-studio:v1` bleibt erhalten; kein Datenverlust durch Schemaänderung, fehlende `customBlocks`-Werte werden zu einer leeren Liste normalisiert.
- GET `/api/document-studio?action=blocks` (authentifiziert, liefert persönliche Bausteine).
- POST `/api/document-studio?action=save-block`, Body `{expectedRevision,document:{id,title,category,contentHtml}}`.
- POST `/api/document-studio?action=delete-block`, Body `{expectedRevision,id}`.
- Kategorien werden serverseitig validiert. Skripte, HTML-Attribute und eingebettete Remote-Bilder werden beim Speichern entfernt. Dokument- und Vorlagenänderungen bleiben unabhängig von Textbaustein-CRUD.
- Die serverseitige Revisionsprüfung schützt vor konkurrierenden Schreibzugriffen. Bei Konflikten werden Änderungen nicht still überschrieben.
- Keine Änderungen an `invoiceMeta`, der eBay-Listingstrecke oder der bisherigen Rechnungs-API.
- **Neu in der Preview:** Manueller Einstieg aus der Bestellzentrale mit den eBay-Auftragsdaten. Kein eBay-Schreibzugriff, keine automatische Dokumentenerstellung. Details: `docs/DOKUMENTENSTUDIO_BESTELLANBINDUNG.md`.

## Grenzen

- V3 ist ein **bearbeitbarer HTML-basierter A4-Editor**, noch kein vollständiger Word-/Canva-Nachbau mit Pixel-Drag-and-drop.
- Mehrseitige Dokumente werden vom Browser im Druckdialog paginiert; es gibt noch keinen separaten Multi-Page-Canvas mit sichtbarer Seitensteuerung.
- PDF: Browser-Druckansicht → „Als PDF speichern“; kein serverseitig erzeugter PDF-Download.
- DOCX: Formatierter OOXML-Export; Word kann Zeilen- und Seitenumbrüche unterschiedlich berechnen.
- Bearbeiten importierter DOCX-Vorlagen wird noch nicht unterstützt.
- Vertragstexte und geschäftliche Rechtsbelehrungen fachlich bzw. rechtlich prüfen.

## Abnahmeprüfung

1. Neue und bestehende V2-Dokumente öffnen; direkt im A4-Dokument schreiben und speichern.
2. Dokument über Archiv öffnen und den gespeicherten Text prüfen.
3. Mit bestehendem Dokument Design, Titel, Empfänger ändern; Inhalt darf nicht verschwinden.
4. Cursoreinfügen, Tabellen, Listen, persönliche Bausteine, Umbenennen/Überschreiben und Löschen testen.
5. Originaltexte mit Platzhaltern auf A4 prüfen, nach PDF-/DOCX-Export müssen die richtigen Werte stehen.
6. PDF-Druckdialog, DOCX in Word und alte Rechnungs-/eBay-Pfade regressiv prüfen.
7. `npm test`, `npm run build`, `npm run check:performance`; Feature-Branch/Preview vor Produktionsmerge.

**Release-Strategie:** Nur Draft-PR #223 in der Preview testen; kein automatischer Merge oder Rollout.
