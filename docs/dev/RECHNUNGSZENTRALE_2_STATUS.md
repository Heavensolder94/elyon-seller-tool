# Rechnungszentrale: Teilstand und Freigabegrenzen

Stand: 20.11.2026. Diese Änderung erweitert die vorhandene Finance-Oberfläche und das vorhandene Belegarchiv; sie stellt keine vollständige Rechnungszentrale 2.0 dar.

- Manuelle Dokumentklassifikation und Referenzen, Beleg- und Zahlungsdatum, Betrag und Währung sowie Positionen, Versand und Zusatzkosten; interne Eigenbelege sind ausdrücklich gekennzeichnet. Alle Angaben bleiben prüfbedürftig und erzeugen keine Buchung.
- Gleiche Dateien werden lokal anhand SHA-256 erkannt; gleiche Lieferanten-/Rechnungsnummern lösen beim Erfassen von Metadaten einen Hinweis aus. Beim Erfassen beleggebundener Kosten prüft der Server Beleg-ID, Hash und gefrorene Lieferanten-/Rechnungsreferenz. Nicht beleggebundene alte manuelle Kosten erfordern weiterhin manuellen Abgleich.
- Vorhandene lokale Originale werden beim Öffnen auf Integrität geprüft. Drive-Sicherung ist optional und benötigt Konfiguration sowie synchronisierte Finance-Metadaten.
- Historische Finance-Rechnungsmetadaten werden angezeigt, ohne aus veränderlichen Bestelldaten ein angebliches Original zu erzeugen.
- Eine bestätigte EUR-Kostenaufteilung auf mehrere Bestellungen erzeugt serverseitig revisionsgeschützt prüfbedürftige Finance-Transaktionen. Zahlungsdatum und archivierte Belegreferenz bleiben nachvollziehbar; keine automatische Verifikation der Bestell-/Artikelreferenzen.
- Neue Kundenrechnungen werden bei auch nur einem Cent Summenabweichung oder fehlender Währungsangabe einer Position blockiert; vorhandene Snapshots bleiben unverändert. Die Rechnungsausstellung überschreibt keine zwischenzeitlich eintreffenden historischen Metadaten. Beschädigte lokale Finance-Dateien blockieren statt als leer behandelt zu werden.

## Vor produktiver Gesamtfreigabe offen

Original-PDFs der ausgestellten Rechnungen, formale Storno- und Korrekturbelege samt Historie; strukturierte E-Rechnungsprüfung und Datenextraktion; automatische Zuordnung auf Positionen, Teilmengen und Verkäufe; belastbare Verarbeitung von Fremdwährung, Lieferanten-Teilerstattungen und nicht vollständig zuordenbaren Zahlungen; Nachkalkulation über Zahlungs- und Verkaufszeiträume; nachvollziehbare Belegänderungshistorie ohne Abschneiden; Dublettenabgleich gegen frühere nicht beleggebundene Kosten; eine vollständige geräteübergreifende Prüfung und ein steuerlich bewertetes Archiv-/Verfahrenskonzept. Keine automatische Kundensendung.

Eingehende elektronische Belege sind grundsätzlich im ursprünglichen Format aufzubewahren. Das Bundesfinanzministerium erklärt, dass auch Kleinunternehmer E-Rechnungen empfangen können müssen und von der Ausstellungspflicht ausgenommen sind: https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html. Eine PDF-Datei allein ist keine strukturierte E-Rechnung. Ob und wie der konkrete Geschäftsfall steuerlich zu behandeln ist, ist gesondert fachlich zu prüfen. Das vorliegende Archiv und seine Hashes sind keine Feststellung der GoBD-Konformität.
