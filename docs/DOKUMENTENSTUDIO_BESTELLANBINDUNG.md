# ELYON Dokumentenstudio – Ein-Klick-Anbindung an eBay-Bestellungen

## Umfang

Auf der SellerTool-Bestellzentrale wird unter den Details einer gewählten eBay-Bestellung ein eigener Bereich „Dokumente zu dieser Bestellung“ angezeigt. Aus einer Auswahlliste lässt sich die Vorlage festlegen: **Bestellbestätigung (Bestelleingang)**, **Auftragsbestätigung**, **Lieferschein**, **Versandbestätigung**. Mit **„Dokument erstellen“** öffnet der Benutzer das bestehende Dokumentenstudio auf demselben Browser-Tab und legt einen noch ungespeicherten Entwurf an.

**Wichtig:** Der Klick löst keine eBay-Schreiboperation, keine Mail, keine Rechnung und keine automatische Dokumenten-Persistierung aus. Es werden ausschließlich bereits in der Bestellzentrale geladene eBay-Daten in den Arbeitsspeicher des Dokumentenstudios übertragen. Der Anwender prüft die Angaben und speichert ausdrücklich über die bestehende Studio-Funktion.

## Technik

1. `seller-orders-v2.js`: Auswahlfeld und Button nur in geöffneten Bestelldetails, Aufruf der `ElyonSellerDocumentBridge.openFromOrder(context, templateId)`.
2. `seller-orders-v2-core.js`: Reine, testbare `buildOrderDocumentContext`-Projektion. Eindeutige eBay-Bestellnummer, Erstellungsdatum (falls vorhanden), eBay-Zahlungs-/Versandstatus, Versandempfänger und mehrzeilige Lieferanschrift, bestellte Positionen (Titel, Menge, eBay-Positionspreis), Bestellsumme und Währung. Optional die bereits gespeicherten Carrier-/Trackingdaten. Keine Einkaufs-/Gewinndaten, Kunden-E-Mail oder Lieferanten-Credentials.
3. `seller-runtime-loader.js`: Lazy-Loading des bereits vorhandenen `elyonDocumentStudioTab`, dann direkte In-Memory-Übergabe ohne `sessionStorage`, `localStorage` oder URL-Parameter mit personenbezogenen Daten.
4. `seller-document-studio.js`: Prüft Bestellnummer, Dokumenttyp, Stornierung und eBay-Versandstatus; erzeugt einen neuen bearbeitbaren Entwurf mit `reference` und `sourceOrderId`, dem mehrzeiligen Empfänger sowie Positionstabelle und korrekter Bestellsumme. Nur Vorlagen/Entwürfe, keine ausgestellten Belege.
5. `lib/document-studio-core.js`: Optionales `sourceOrderId` als neue, rückwärtskompatible Metadaten-Eigenschaft im **isolierten Dokumentenspeicher**, nur nach explizitem Speichern.

## Sicherheit

- **Keine neue API-Abrechnung, keine neuen Secrets.** Benutzt den bestehenden eBay-Bestellabruf und den vorhandenen Dokumentenspeicher.
- **Kein automatischer Versand:** Ein neuer Entwurf wird nicht per Mail oder eBay-Nachricht verschickt, der eBay-Bestell-/Zahlungs-/Versandstatus bleibt unverändert.
- **Demo:** Demo-Bestellungen erzeugen nur einen lokalen Musterentwurf; Speichern, Word-/PDF-Export sowie persönliches Vorlagen-/Textbaustein-Speichern sind für diese Demo blockiert.
- **Storniert:** Keine Bestätigung aus stornierten Aufträgen.
- **Versandbestätigung:** Nur bei echtem eBay-Status `FULFILLED`. Eine intern als versendet markierte Bestellung genügt nicht.
- **Unbezahlte Bestellung:** Warnhinweis im Dokument; kein unberechtigtes „bezahlt“.
- **Unvollständige Lieferadresse oder fehlende Preise:** Auf dem Entwurf sichtbar als zu prüfen, nicht automatisch ergänzt oder geraten. Ein eBay-Benutzername wird nicht als echte Postanschrift ausgegeben.
- **Kein Rechnungs-Duplikat:** `invoiceMeta`, die Rechnungsnummernvergabe und `/api/finance/invoice-pdf` bleiben unverändert. Rechnungen werden weiterhin ausschließlich im bestehenden Finance-/Rechnungsmodul ausgestellt.

## Prüfung

1. Bestellzentrale → „Mit eBay abgleichen“ → eine Bestellung öffnen.
2. Unter „Überblick“ die Vorlage auswählen und „Dokument erstellen“ klicken.
3. Empfänger, Straße/PLZ/Ort, Bestellnummer, Artikel, Menge und Betrag in der A4-Ansicht prüfen.
4. Vorlagenwechsel über die Bestellzentrale erneut prüfen; bereits im Studio ungespeicherte Änderungen müssen vor einem erneuten Import ausdrücklich verworfen werden.
5. Den Entwurf manuell speichern, archivieren und wieder öffnen; Quelle via `sourceOrderId` nachvollziehbar.
6. Bestätigte Versandbestätigung (`FULFILLED`) und blockierten Frühversand testen.
7. Demo öffnen und Speichern/Export-Blockaden prüfen.
8. Regression: bestehende echte Rechnungs- und eBay-Workflows bleiben unverändert.

**Release:** Änderungen nur auf Feature-Branch und Draft-PR #223; kein automatischer Produktiv-Merge.
