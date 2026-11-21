# ELYON Dokumentenstudio 2.0 – Vorlagenbibliothek & A4-Designer

## Status
Preview-Funktion auf dem Feature-Branch `feat/dokumentenstudio-v1-20261121`; Draft-PR #223. Keine Freigabe von Produktiv-Änderungen. Die bisherige Rechnungsstrecke und die eBay-Verkaufsabläufe werden weder erweitert noch verändert.

## Vorlagen
- 30 handverfasste, deutschsprachige Vorlagen in sechs Gruppen: Korrespondenz, Verkauf, Kundenservice, Einkauf, Verträge und Organisation.
- Auswählen einer inhaltlichen Vorlage erstellt **einen neuen Entwurf** und fragt bei ungespeicherten Änderungen nach. Die ursprüngliche Vorlage wird nicht überschrieben.
- Vier unabhängige visuelle Designs: ELYON Business, Classic Professional, Modern Creative, Minimal.
- Designwechsel, Akzentfarbe und Änderungen an Kopf-/Fußzeilen **behalten den vorhandenen Dokumententext**.
- Vorlagenbibliothek mit Kategorie- und Textsuche sowie Favoriten (Vorlagen-IDs im Browser; **keine Dokumententexte** im lokalen Speicher).
- Eigene Vorlagen aus einem Dokument erstellen, im geschützten Dokumentenspeicher wiederverwenden und bei Bedarf löschen. Das Löschen einer Vorlage löscht keine bereits erstellten Dokumente.

## Dokumentenerstellung
- Live-A4-Vorschau rechts neben dem Editor (bei schmalen Bildschirmen unter dem Editor). Derselbe HTML/CSS-Renderer wird in der Browser-PDF-Druckansicht verwendet.
- Editor: Fett, Kursiv, Unterstrichen, H2, Aufzählungen, nummerierte Listen, Tabellen, Trennlinien und Hoch-/Runterverschieben des aktuell ausgewählten Textblocks.
- Per Dokument: Titel, Art, Empfänger, Referenz, Design, Akzentfarbe, optionale Kopf-/Fußzeilen, Firmenlogo (PNG/JPEG/WebP, per Canvas auf maximal 400 px und unter 48 KB komprimiert).
- Der regelbasierte Dokumentenassistent baut aus Betreff und Angaben einen korrigierbaren Entwurf. **Keine externe KI-API, keine Zusatzkosten, kein stilles Versenden**.
- Firmenname/Adresse: bereits vorhandenes Finance-Unternehmensprofil, kein zweiter Stammdatenspeicher.

## Export
- **PDF:** A4-Druckansicht über Browser. Dort »Als PDF speichern« auswählen und Browser-Kopf-/Fußzeilen deaktivieren. Es wird derzeit keine serverseitig generierte PDF-Datei zum Herunterladen angeboten.
- **DOCX:** OOXML-Datei mit Markenname, Formatierung, Absätzen, Überschriften, Tabellen und – soweit im Browser dekodierbar – eingebettetem Firmenlogo. Das Word-Rendering kann in Einzelfällen leicht von der PDF-Druckansicht abweichen.
- Steuerlich relevante Rechnungen werden weiterhin ausschließlich über das bestehende Rechnungsmodul erstellt; Einkaufsnotizen sind **keine Ersatz-Rechnungen**. Vertragsentwürfe sind vor Verwendung rechtlich zu prüfen.

## Speicherung und API
- Bestehender Redis-Key `elyon-seller-tool:document-studio:v1`; schema-erweiterte, rückwärtskompatible Dokumentdaten (`templateId`, `designId`, `accentColor`, `headerText`, `footerText`, `logoData`).
- Bestehende Entwürfe werden nicht migriert oder umgeschrieben; für fehlende Eigenschaften gelten sichere Standardwerte.
- `customTemplates` als separate Collection im gleichen revisionsgeschützten Speicher (max. 40); maximal 80 Dokumente.
- GET `/api/document-studio?action=templates` für die persönliche Vorlagenbibliothek.
- POST `/api/document-studio?action=save-template` mit `{expectedRevision,document}`.
- POST `/api/document-studio?action=delete-template` mit `{expectedRevision,id}`.
- Alle Endpunkte weiterhin mit `requireSellerAccess`, atomarem Revision-CAS und ohne neue Secrets.
- Logo-Daten werden strikt als PNG/JPEG/WebP-Data-URL mit Base64 und Größenlimit akzeptiert; keine Remote-Bilder, kein SVG und kein Skript-HTML.

## Grenzen / nächste Schritte
- Designer arbeitet mit strukturierten Text-/Tabellenblöcken, **kein** freies Pixel-Positionieren wie in Canva.
- Keine garantierte identische Paginierung zwischen Browser-PDF und Word.
- Kein Import bestehender Word-Vorlagen; kann als separates Feature folgen.
- Kein automatischer Zugriff auf eBay-, Lieferanten- oder Company-OS-Aufträge in V2.
- Kein kostenpflichtiger KI-Textgenerator; die Assistenz bleibt bewusst regelbasiert.

## Regression & Abnahme
- `npm test`, `npm run build`, `npm run check:performance` im SellerTool-Workflow.
- Manuell in Preview prüfen: Vorlagen aller Kategorien öffnen; Design ohne Textverlust wechseln; Logo; persönliche Vorlage speichern/neu öffnen/löschen; Favoriten; PDF-Druckdialog; DOCX in Word öffnen; Archivieren/Wiederherstellen; bestehende Dokumente; Rechnungen und eBay-Workflow unverändert.
- Erst nach manueller Abnahme Merge erwägen.
