# ELYON Bestellzentrale – vereinfachte Abschlussübersicht

## Zweck
Die sieben bisherigen Prüfpunkte werden nicht mehr als sieben gleichwertige Aufgaben nebeneinander angezeigt. Stattdessen sieht der Nutzer eine **dreistufige, kompakte Übersicht** direkt in den Bestelldetails:

1. **Einkauf** – Lieferant + dokumentierter Lieferantenauftrag
2. **Versand** – Carrier/Tracking + von eBay bestätigter Versandstatus
3. **Rechnung** – wirklich ausgestellte Rechnung aus dem bestehenden, abgesicherten Rechnungsmodul; in der isolierten Demo nur eine Musterprüfung

Die **eBay-Zahlung** erscheint oben als automatisch geprüfter Read-only-Status. Sie ist weiterhin eine **Pflichtbedingung**, aber keine manuelle Eingabe. **Ist-Kosten** werden als freiwillige Zusatzangabe gekennzeichnet und nicht mehr in die Fortschrittszahl der drei Arbeitsbereiche einbezogen.

## Verhalten
- Jeder der drei Bereiche ist als große, eindeutig beschriftete Zeile anklickbar; sie führt direkt zum bereits vorhandenen Tab Lieferant, Versand oder Finanzen.
- Jede Zeile zeigt den tatsächlich aus dem vorhandenen Completion-Checklist-Modell berechneten Status `0/2`, `1/2`, `2/2` oder `0/1`, `1/1`; darunter erscheint die nächste ausstehende Einzelprüfung.
- Der Header zeigt **0–3 erledigte Arbeitsbereiche**, nicht mehr eine irreführende Gesamtzahl mit optionaler Kostenprüfung.
- „Alle Prüfpunkte anzeigen“ klappt bei Bedarf sämtliche sieben Originalprüfungen einschließlich der Empfehlung für Ist-Kosten aus.
- Die redundante große „Nächster Schritt“-Fläche wurde aus den Bestelldetails entfernt. Der fehlende Pflichtpunkt steht komprimiert unter dem unveränderten Abschluss-Button.

## Sicherheit & Kompatibilität
- Das zugrunde liegende `orderCompletionChecklist()` in `seller-orders-v2-core.js` ist **unverändert**. Es erfordert weiterhin `payment`, `supplier`, `supplierOrder`, `carrier`, `ebayShipping` und `invoice`.
- `costs` bleibt optional; nur die Sichtbarkeit/Präsentation wurde vereinfacht.
- Der Abschlussbutton bleibt exakt an `assessment.ready && !state.actionBusy` gebunden. Server-seitige Abschlussprüfung, Rechnungserstellung, eBay-Statusmeldungen, Lieferanten-Auftragsdaten und Sicherungsabläufe werden nicht verändert.
- Demo verwendet weiterhin einen getrennten virtuellen Musterrechnungs-Status und startet keinerlei eBay-Aktionen.

## Test und Freigabe
- Automatische Tests bestätigen unveränderte erforderliche Checklist-Keys sowie die Fähigkeit, auch ohne Ist-Kosten (optional) bereit zum Abschluss zu werden, wenn **alle** Pflichtpunkte erfüllt sind.
- Zusätzlich prüfen Quellcode-Regressionen, dass drei Stufen, die ausklappbaren Details, dieselbe Completion-Prüfung und dieselbe Button-Sperre bestehen.
- Manuell zu testen: Neue Bestellung, bezahlte Bestellung ohne Lieferant, halb bearbeitete Lieferung, versendete Bestellung und Demo – alle Stufen müssen auf den richtigen Bereich verlinken.
- **Nur Preview/Draft-PR #223.** Kein Merge in Produktion ohne Browser-Abnahme.
