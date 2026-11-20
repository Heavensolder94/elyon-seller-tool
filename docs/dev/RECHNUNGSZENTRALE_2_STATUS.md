# Rechnungszentrale: Teilstand und Freigabegrenzen

Stand: 20.11.2026. Diese Änderung erweitert die vorhandene Finance-Oberfläche und das vorhandene Belegarchiv; sie stellt keine vollständige Rechnungszentrale 2.0 dar.

- Manuelle Dokumentklassifikation und Referenzen, Beleg- und Zahlungsdatum, Betrag und Währung sowie Positionen, Versand und Zusatzkosten; interne Eigenbelege sind ausdrücklich gekennzeichnet. Alle Angaben bleiben prüfbedürftig und erzeugen keine Buchung.
- Gleiche Dateien werden lokal anhand SHA-256 erkannt; gleiche Lieferanten-/Rechnungsnummern lösen beim Erfassen von Metadaten einen Hinweis aus. Beim Erfassen beleggebundener Kosten prüft der Server Beleg-ID, Hash und gefrorene Lieferanten-/Rechnungsreferenz. Nicht beleggebundene alte manuelle Kosten erfordern weiterhin manuellen Abgleich.
- Vorhandene lokale Originale werden beim Öffnen auf Integrität geprüft. Drive-Sicherung ist optional und benötigt Konfiguration sowie synchronisierte Finance-Metadaten.
- Historische Finance-Rechnungsmetadaten werden angezeigt, ohne aus veränderlichen Bestelldaten ein angebliches Original zu erzeugen.
- Eine bestätigte EUR-Kostenaufteilung auf mehrere Bestellungen erzeugt nach Prüfung des Drive-Originals serverseitig revisionsgeschützt prüfbedürftige Finance-Transaktionen. Zahlungsdatum und archivierte Belegreferenz bleiben nachvollziehbar; keine automatische Verifikation der Bestell-/Artikelreferenzen.
- Bei einer ausdrücklich erfassten eBay-Bestellnummer, genau einem passenden gespeicherten Umsatz und ansonsten eindeutigen Angaben kann eine einzelne EUR-Kostenaufteilung als Formularvorschlag eingefügt werden. Vorhandene Eingaben werden nicht überschrieben. Die nutzende Person muss prüfen, ob der ganze Beleg zu diesem Verkauf gehört, anschließend die Vorschau prüfen und die Erfassung bestätigen; weitere Server- und Dublettenprüfungen bleiben bestehen.
- Neue Kundenrechnungen werden bei auch nur einem Cent Summenabweichung oder fehlender Währungsangabe einer Position blockiert; vorhandene Snapshots bleiben unverändert. Die Rechnungsausstellung überschreibt keine zwischenzeitlich eintreffenden historischen Metadaten. Beschädigte lokale Finance-Dateien blockieren statt als leer behandelt zu werden.
- Für die automatische Neuausstellung wird der eBay-Zahlungsstatus `PAID` vorausgesetzt; fehlende, offene, teilweise bezahlte oder unbekannte Statuswerte blockieren. Dies ist eine vorsichtige Produktgrenze und keine Aussage, dass Rechnungen vor Zahlung rechtlich unzulässig seien. Bereits ausgestellte Rechnungen bleiben unverändert und abrufbar.

## Vor produktiver Gesamtfreigabe offen

Produktive Prüfung der PDF-Originale, Vollstorno und Ersatzrechnung; Teilstorno und ergänzende Rechnungsberichtigungen; XML-/PDF-A-Schemavalidierung und Bild-OCR; automatische Zuordnung auf Positionen, Teilmengen und Verkäufe; belastbare Verarbeitung von Fremdwährung, Lieferanten-Teilerstattungen und nicht vollständig zuordenbaren Zahlungen; vollständige fachliche und produktive Prüfung der zeitraumübergreifenden Nachkalkulation; nachvollziehbare Belegänderungshistorie ohne Abschneiden; Dublettenabgleich gegen frühere nicht beleggebundene Kosten; eine vollständige geräteübergreifende Prüfung und ein steuerlich bewertetes Archiv-/Verfahrenskonzept. Keine automatische Kundensendung.

Eingehende elektronische Belege sind grundsätzlich im ursprünglichen Format aufzubewahren. Das Bundesfinanzministerium erklärt, dass auch Kleinunternehmer E-Rechnungen empfangen können müssen und von der Ausstellungspflicht ausgenommen sind: https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html. Eine PDF-Datei allein ist keine strukturierte E-Rechnung. Ob und wie der konkrete Geschäftsfall steuerlich zu behandeln ist, ist gesondert fachlich zu prüfen. Das vorliegende Archiv und seine Hashes sind keine Feststellung der GoBD-Konformität.

## PDF-Erweiterung (Entwurf)

Neue Rechnungen benötigen die bestehende Google-Drive-Verbindung; Original-PDF wird vor Ausstellung hochgeladen, erneut auf Integrität geprüft und im unveränderlichen Rechnungssnapshot referenziert. Alte Snapshots bleiben unverändert. Ein unterbrochener Upload oder parallele Anfragen können nicht referenzierte, vorläufig benannte Drive-Dateien hinterlassen, die nicht automatisch gelöscht werden. Die Produktionsfähigkeit und GoBD-Konformität sind nicht nachgewiesen; Live- und Wiederherstellungstests stehen aus. Teilstorno und ergänzende Rechnungsberichtigungen bleiben offen.

## Vollstorno (Entwurf)

Die Oberfläche kann eine vollständige Stornorechnung mit Grund, eigener Nummer und Verweis auf das unveränderte Original anfordern. Original und Storno-PDF müssen in Drive prüfbar sein. Die Aktion veranlasst keine Erstattung, Nachricht oder Finanzbuchung. Eine Ersatzrechnung aus den erneut abgefragten eBay-Daten ist nach Vollstorno möglich. Teilstornos, manuelle Rechnungsberichtigungen und eine steuerliche sowie produktive Ende-zu-Ende-Prüfung sind offen. Parallele Versuche können vorläufige unreferenzierte Drive-Dateien hinterlassen.

## UBL-Erkennung und Referenzvorschläge (Entwurf)

UBL-Rechnungen und UBL-Gutschriften können aus dem Original-XML deterministisch ausgelesen werden. Der Nutzer sieht Vorschläge und übernimmt sie in leere Felder erst nach Bestätigung; die Daten bleiben prüfbedürftig. Übereinstimmende Bestell-/Artikelreferenzen liefern Vorschläge für vorhandene Finanzvorgänge, die einzeln bestätigt werden. Keine automatische Buchung oder Zahlung. Ausgewählte CII-Felder sowie eine einzelne eingebettete UBL-/CII-XML-Datei in PDF werden unterstützt. XML-/PDF-A-Schema- oder Profilvalidierung, PDF-Text-/Bild-OCR und ein echter Mehrgeräte-Test sind offen. Dekomprimierungsgrenzen und Deploymentfähigkeit der PDF-Verarbeitung benötigen vor Produktivfreigabe zusätzliche Prüfung.

Bei einem PDF ohne eingebettete XML können ausdrücklich beschriftete Lieferantennamen, Rechnungs- und Bestellnummern, das Belegdatum und eindeutig beschriftete EUR-Zahlbeträge aus auswählbarem Text vorgeschlagen werden. Dies ist keine OCR: Scans und Fotos bleiben manuell zu erfassen. Mehrdeutige, nicht unterstützte oder widersprüchliche Angaben bleiben leer; vor dem Speichern ist der Originalbeleg zu prüfen.

## Nachkalkulation über Zeiträume

In der Bestell- und Produktprofitabilität bestimmt das Datum des EUR-Umsatzvorgangs den gewählten Zeitraum. Für die gefundenen Bestellreferenzen werden zugehörige gespeicherte EUR-Kosten, Gebühren und Erstattungen auch aus anderen Zeiträumen einbezogen. Die Zahlen sind vorläufig; vorhandene Einkaufskosten beweisen keine vollständige Zuordnung aller Artikel. Fremdwährungsvorgänge bleiben unberücksichtigt und werden markiert. Vorgänge ohne Artikelreferenz erscheinen nicht in der Produktprofitabilität und werden dort als Einschränkung ausgewiesen. Die Zahlungsflussansicht und EÜR bleiben weiterhin nach tatsächlichem Vorgangsdatum gefiltert; es werden keine alten Werte oder Buchungen geändert.

Transaktions-CSV und DATEV-Vorbereitung kennzeichnen formelähnliche Textfelder beim Export mit einem Apostroph, um deren Auswertung in Tabellenprogrammen zu erschweren. Rechnerisch erzeugte Betragsfelder bleiben Zahlenangaben. Die gespeicherten Originaldaten werden nicht verändert; bei der Weiterverarbeitung müssen gekennzeichnete Texte bei Bedarf geprüft werden.

## Teilweise Lieferantenerstattungen (Entwurf)

Nach tatsächlichem EUR-Geldzufluss kann ein gesicherter Erstattungsnachweis nach Vorschau und ausdrücklicher Bestätigung einer bestehenden beleggebundenen EUR-Einkaufszuordnung zugeordnet werden. Belegdatum und Geldflussdatum bleiben getrennt; beide Originale werden serverseitig anhand ihres Drive-Hashes überprüft. Bei konkurrierenden Anfragen schützt die Finance-Revision vor Übererfassung; zusammen dürfen Erstattungen die ursprüngliche Zuordnung nicht übersteigen. Die vorläufige Nachkalkulation vermindert die Einkaufskosten, ohne Verkäufe zu erhöhen. Ein Nachweis kann derzeit nur einer Zuordnung gelten. Doppelte Lieferantenreferenzen blockieren vorsorglich und können auch legitime Fälle zur manuellen Prüfung markieren; frühere, nicht beleggebundene manuelle Buchungen sind separat abzugleichen.

Der Vorgang ist keine steuerlich klassifizierte Buchung. EÜR-/DATEV-Export und Monatsabschluss bleiben bei nicht stornierten Lieferantenerstattungen blockiert, auch nach einer allgemeinen Freigabe des Vorgangs. Eine Oberfläche und ein geprüftes Verfahren zur steuerlichen Zuordnung fehlen noch. Das Stornieren der Erstattung und des verknüpften Einkaufs ist derzeit gesperrt; ein eigener Korrekturablauf fehlt. Die Funktion ist nicht produktiv oder geräteübergreifend live geprüft.

Für UBL und CII werden Positionen nur vorgeschlagen, wenn alle unterstützten Angaben eindeutig sind und ihre Summe exakt dem Zahlbetrag entspricht; andernfalls erscheint ein Prüfhinweis. Steuer, Versand, Rabatte oder Vorauszahlungen können dazu führen, dass keine Positionen vorgeschlagen werden. Die Originaldatei und alle Vorschläge sind manuell zu prüfen. Es erfolgt weder eine Signaturprüfung noch eine steuerliche Freigabe.


PDF-Erkennung läuft im Entwurf in einem separaten Linux-Prozess mit geprüftem Adressraum- und Datenlimit, Zeitlimit und maximal einem Prozess pro Instanz. Eine lokal getestete Datei mit stark komprimiertem 64-MB-Anhang wurde blockiert. Die Zielumgebung, die Dateibündelung, Speicher- und Lastverhalten sowie Mehrgeräteabläufe müssen vor der Produktivfreigabe geprüft werden; bei fehlendem Limit wird nicht verarbeitet. Das Prozesslimit ist keine globale Begrenzung über mehrere Serverinstanzen hinweg.

## Berichtigung einzelner Empfängerangaben (Entwurf)

Ein separater Berichtigungsbeleg kann Namen, Straße, Postleitzahl oder Ort berichtigen. Er verweist auf das ursprüngliche Original; die gespeicherte Rechnung wird nicht verändert. Eine zweite Änderung desselben Felds und Änderungen nach Vollstorno sind blockiert. Geldbeträge, Teilstornos und die steuerliche/fachliche Prüfung bleiben offen. Kein automatischer Versand und keine Buchung.

Ein identischer erneuter Berichtigungsauftrag verweist auf den bestehenden Beleg. Derselbe neue Wert mit einem anderen Grund erzeugt keine weitere Berichtigung; weitere Änderungen desselben Felds erfordern einen manuellen Abgleich. Parallele Aufträge nutzen die Revisionsprüfung. Ein Hinweis im neuen PDF verweist auf mögliche weitere Berichtigungsbelege, statt zu behaupten, dass alle anderen Angaben unverändert seien. Bestehende PDF-Dateien werden nicht geändert.

## Begrenzte Betragsberichtigung (Entwurf)

Eine manuelle Berichtigung ist nur bei einer Position mit Menge 1 ohne Versand und Rabatt möglich und betrifft sowohl Positions- als auch Gesamtbetrag. Keine eBay-Änderung und keine automatische Anpassung von Transaktionen, Erstattungen oder EÜR. Alle komplexeren Fälle bleiben blockiert; fachliche und produktive Prüfung ist erforderlich.

Nach einer Berichtigung sind Vollstorno und Ersatzrechnung bis zum fachlichen Abgleich gesperrt. Konkurrierende Berichtigungs- und Stornoanfragen sind revisionsgeschützt. Damit wird kein Stornobeleg mit ungeprüft veralteter Adresse oder Summe ausgegeben.
