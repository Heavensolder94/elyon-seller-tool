# Elyon Seller Tool – Produktions- und Performance-Ausgangsstand

**Stand:** 28. Juli 2026  
**Status:** Dokumentation vor der Fehlerbehebung  
**Wichtig:** Mit diesem Dokument werden noch keine Performance-Fixes umgesetzt. Es hält den überprüften Ausgangszustand fest, gegen den spätere Änderungen getestet werden.

---

## 1. Verbindliche Projektzuordnung

### GitHub

- Repository: `Heavensolder94/elyon-seller-tool`
- Hauptbranch: `main`
- Zuletzt geprüfter Produktions-Commit: `db25e8ad0076ad1e8ff38eebfaaf32618f2250ad`
- Commit-Titel: `feat: add advanced settings for virtual employees`

### Vercel – offizielles Produktionsprojekt

- Projektname: `elyon-seller-tool`
- Projekt-ID: `prj_hNbx0S5NGmJFLyOGg8iNVyvsnGDE`
- Live-Domain: `elyonsellertool.vercel.app`
- Region des zuletzt geprüften Deployments: `fra1`
- Node.js-Version: `24.x`
- Zuletzt geprüftes Produktions-Deployment: `dpl_FaTrHBggwUPMqJmS4foxJzLRn8bX`
- Deployment-Status: `READY`

Der Vercel-Projektname und die Live-Domain sind absichtlich unterschiedlich geschrieben. Die Domain `elyonsellertool.vercel.app` ist aktuell dem Vercel-Projekt `elyon-seller-tool` zugeordnet.

### Doppeltes Vercel-Projekt

Zusätzlich existiert:

- Projektname: `elyonsellertool`
- Projekt-ID: `prj_cfdNZfRe1xWJ3rF59v1PMUMgCH9K`

Auch dieses Projekt ist mit demselben GitHub-Repository verbunden. Dadurch erzeugt ein GitHub-Push derzeit Deployments in beiden Vercel-Projekten.

Der zuletzt geprüfte Commit `db25e8ad0076ad1e8ff38eebfaaf32618f2250ad` wurde in beiden Projekten erfolgreich gebaut. Die Live-Domain und der beobachtete Live-Traffic liegen jedoch beim Projekt `elyon-seller-tool`.

### Aktuelle Entscheidung

- Die Domain wird vorerst nicht verschoben.
- `elyon-seller-tool` ist das verbindliche Produktionsprojekt.
- Das Projekt `elyonsellertool` wird vorerst nicht gelöscht.
- Vor einer späteren Stilllegung müssen Environment Variables, Build-Einstellungen und sonstige Projektkonfigurationen verglichen werden.

---

## 2. Beobachtetes Problem

Das Elyon Seller Tool wirkt beim Starten, Umschalten zwischen Bereichen und beim Arbeiten im Produktboard deutlich langsamer als zuvor.

Beobachtete bzw. plausible Symptome:

- verzögerter Seitenstart,
- ruckelnde Oberfläche,
- verzögerte Reaktion auf Klicks,
- erhöhte Browser-CPU-Last,
- wiederholte DOM-Nachbearbeitung,
- viele parallele Status- und API-Prüfungen,
- zunehmende Verlangsamung nach neuen Modulen und Kompatibilitäts-Fixes.

---

## 3. Bisherige technische Befunde

### 3.1 Viele beim Start geladene Frontend-Module

Der Produktions-Build bindet im Desktop-Bereich ungefähr 28 separate JavaScript-Dateien ein. Dazu gehören unter anderem:

- Authentifizierung,
- Dashboard-Kompatibilität,
- Selling Flow,
- Listing Designer,
- Auto Lister,
- Kategorie-Engine,
- Dashboard V2,
- Systemstatus,
- KI-Provider- und Modellschutz,
- virtuelle Mitarbeiter,
- erweiterte Mitarbeiter-Einstellungen,
- eBay-Status,
- Company-OS-Eingang,
- Produktzustand,
- Produktboard-Accordion,
- Produktboard-Kompatibilität,
- Lösch- und Button-Sicherheitsmodule.

Ein großer Teil dieser Module wird beim Öffnen der Hauptseite geladen, auch wenn der dazugehörige Tab nicht geöffnet wird.

### 3.2 Mehrere globale `MutationObserver`

Eine Codesuche hat mindestens 24 Dateien mit `MutationObserver`-Logik ergeben. Mehrere Module beobachten den gesamten `documentElement`- oder `body`-Unterbaum.

Dadurch kann eine einzelne DOM-Änderung mehrere unabhängige Prüf- und Nachrüstfunktionen starten. Manche dieser Funktionen verändern wiederum den DOM und können weitere Observer-Durchläufe auslösen.

Betroffene Bereiche sind unter anderem:

- Button-Stabilisierung,
- eBay-Statusanzeige,
- virtuelle Mitarbeiter,
- erweiterte Mitarbeiter-Einstellungen,
- Mount-Fixes,
- Produktboard,
- Selling-Flow-Kompatibilität,
- Einstellungs- und Sichtbarkeitskorrekturen.

### 3.3 Zwei Produktboard-Accordion-Systeme gleichzeitig

Der Build lädt aktuell gleichzeitig:

- `seller-product-board-accordion.js`
- `seller-product-board-accordion-compat.js`

Beide Systeme überwachen und bearbeiten dieselbe Produktliste.

Das Hauptmodul startet beim Laden zusätzliche Wiederholungsprüfungen bis zu 30-mal im Abstand von 300 ms. Das Kompatibilitätsmodul startet parallel Wiederholungsprüfungen bis zu 40-mal im Abstand von 250 ms.

Damit können beim Seitenstart ungefähr 70 vollständige Produktboard-Dekorationsdurchläufe entstehen, zusätzlich zu den dauerhaften Observer-Reaktionen.

Dieser Doppelbetrieb gilt derzeit als wichtigster konkreter Performance-Verdacht.

### 3.4 Virtuelle Mitarbeiter werden mehrfach überwacht und nachgerüstet

Die neue AI-Workforce wird derzeit durch mehrere getrennte Module aufgebaut und kontrolliert:

- `ai-workforce-client.js`
- `ai-workforce-mount-fix.js`
- `seller-ai-workforce-advanced-settings.js`
- `seller-virtual-agents-policy.js`

Dabei existieren getrennte Observer und zeitversetzte Wiederholungsaufrufe für:

- das Erstellen des Workforce-Bereichs,
- das Verschieben in den richtigen Tab,
- das Nachrüsten erweiterter Einstellungen,
- das Wiederherstellen der Sichtbarkeit nach Policy-Änderungen.

Die Funktionalität ist wichtig, die aktuelle technische Einbindung erzeugt jedoch unnötige Dauerarbeit im Browser.

### 3.5 Häufige automatische API-Statusprüfungen

In einem geprüften 24-Stunden-Zeitraum entfielen unter anderem:

- ungefähr 560 Requests auf `/api/ebay/status`,
- ungefähr 98 Requests auf `/api/ebay-taxonomy`,
- ungefähr 54 Requests auf `/api/products`,
- ungefähr 31 Requests auf `/api/ebay/orders`.

Der eBay-Status wird unter anderem ausgelöst:

- beim erstmaligen Einhängen des Statusmoduls,
- beim Fokuswechsel zurück zum Browserfenster,
- beim Sichtbarwerden des Browser-Tabs,
- bei manueller Prüfung.

Die Requests verwenden teilweise `cache: "no-store"`. Das verstärkt Netzwerk- und Serverlast, ist aber wahrscheinlich nicht die Hauptursache der ruckelnden Oberfläche.

### 3.6 Runtime-Befunde

Das Produktionsprojekt liefert überwiegend erfolgreiche Antworten. Beobachtet wurden auch einzelne `403`- und `503`-Antworten.

Zusätzlich tritt häufig folgende Node.js-Warnung auf:

```text
[DEP0169] DeprecationWarning: url.parse() behavior is not standardized
```

Die Warnung wurde auf mehreren API-Routen beobachtet. Sie sollte später separat behoben werden, erklärt aber nicht allein die gesamte Frontend-Verlangsamung.

---

## 4. Vermutete Ursachen nach Priorität

### Priorität 1 – sehr wahrscheinlich

1. Doppeltes Produktboard-Accordion mit zwei Observern und zwei Wiederholungsschleifen.
2. Zu viele globale `MutationObserver`, die denselben DOM-Baum überwachen.
3. Nachrüst- und Kompatibilitätsskripte, die sich gegenseitig auslösen.

### Priorität 2 – wahrscheinlich verstärkend

4. Laden fast aller Funktionen beim Seitenstart statt erst beim Öffnen des jeweiligen Tabs.
5. Mehrfaches Rendern und erneutes Anbinden von Event-Handlern.
6. Wiederholte Verarbeitung und Serialisierung größerer `localStorage`-Datenmengen.

### Priorität 3 – zusätzliche Last

7. Häufige eBay- und Systemstatusabfragen.
8. Doppelte Vercel-Deployments desselben GitHub-Commits.
9. Nicht bereinigte ältere Kompatibilitätsmodule und Backups.

Das doppelte Vercel-Projekt ist organisatorisch problematisch, gilt aber nicht als direkte Ursache der Browser-Verlangsamung.

---

## 5. Sicherheitsregeln für die Fehlerbehebung

Bei den Performance-Fixes müssen folgende Regeln eingehalten werden:

1. Keine bestehende Funktion ohne dokumentierten Ersatz entfernen.
2. Keine Environment Variable verändern oder löschen.
3. Keine Domain-Zuordnung verändern.
4. Das Projekt `elyonsellertool` vorerst nicht löschen.
5. Jede Performance-Änderung in einem eigenen nachvollziehbaren Commit durchführen.
6. Vor und nach jeder Änderung die betroffenen Funktionen testen.
7. Produktboard, virtuelle Mitarbeiter, eBay-Status, Company-OS-Eingang und Nova-Import besonders schützen.
8. Observer nur gezielt reduzieren; notwendige dynamische Nachrüstungen müssen weiterhin funktionieren.
9. Kompatibilitätsskripte erst entfernen, wenn ihre Aufgabe im Hauptmodul vollständig übernommen wurde.
10. Bei einem Fehler muss ein einfacher Rollback auf den dokumentierten Ausgangs-Commit möglich sein.

---

## 6. Vorgesehene Fix-Reihenfolge

### Phase 1 – Messbarer Sofort-Fix

- Produktboard-Accordion und Accordion-Kompatibilität zusammenführen.
- Nur einen Observer und eine kontrollierte Initialisierung behalten.
- Wiederholungsintervalle entfernen oder stark begrenzen.
- Verhalten für gruppierte Karten, Liste, Kanban und mobile Ansicht testen.

### Phase 2 – Observer-Konsolidierung

- globale Observer inventarisieren,
- Observer auf konkrete Container begrenzen,
- gemeinsame Aktualisierungsereignisse verwenden,
- DOM-Schreibvorgänge bündeln,
- Observer während eigener DOM-Änderungen pausieren.

### Phase 3 – Lazy Loading

- virtuelle Mitarbeiter erst beim Öffnen ihres Tabs laden,
- Listing Designer erst bei Bedarf laden,
- Auto Lister erst bei Bedarf laden,
- Kategorie-Engine und weitere schwere Module bedarfsgesteuert laden.

### Phase 4 – Netzwerkoptimierung

- eBay-Status länger zwischenspeichern,
- Statusprüfungen nur in relevanten Ansichten ausführen,
- parallele identische Requests zusammenführen,
- unnötiges `no-store` prüfen.

### Phase 5 – Vercel-Bereinigung

Erst nach Abschluss der Performance-Arbeiten:

- Environment Variables beider Projekte vergleichen,
- Build- und Security-Einstellungen vergleichen,
- Git-Verbindung des doppelten Projekts trennen,
- mehrere erfolgreiche Produktiv-Deployments beobachten,
- doppeltes Projekt gegebenenfalls archivieren oder löschen.

---

## 7. Mindesttests nach jedem Fix

- Startseite lädt ohne sichtbare Fehler.
- Login und Sessionprüfung funktionieren.
- Navigation zwischen allen Hauptbereichen funktioniert.
- Produktboard zeigt alle Produkte.
- Produktkarten lassen sich ein- und ausklappen.
- Liste und Kanban funktionieren.
- Produktbearbeitung, Duplizieren, Stoppen und Löschen funktionieren.
- Company-OS-Produkteingang funktioniert.
- Nova-/Extension-Import funktioniert.
- eBay-Status und Taxonomieprüfung funktionieren.
- Listing Designer und Auto Lister funktionieren.
- virtuelle Mitarbeiter werden nur einmal angezeigt.
- erweiterte Mitarbeiter-Einstellungen funktionieren.
- mobile Oberfläche bleibt nutzbar.
- Browser-Konsole zeigt keine neuen Dauerschleifen oder massenhaften Fehler.

---

## 8. Abnahmekriterien für die Performance-Arbeiten

Die Fehlerbehebung gilt erst als erfolgreich, wenn:

- nur noch ein Produktboard-Accordion-System aktiv ist,
- keine doppelte Dekoration derselben Produktkarten stattfindet,
- unnötige globale Observer entfernt oder eingegrenzt sind,
- geschlossene Tabs keine dauerhafte schwere Arbeit verursachen,
- automatische API-Statusprüfungen kontrolliert und gebündelt laufen,
- alle bisherigen Kernfunktionen weiterhin funktionieren,
- das Live-Deployment über `elyonsellertool.vercel.app` stabil bleibt,
- die Änderungen durch Tests und nachvollziehbare Commits dokumentiert sind.

---

## 9. Ausgangspunkt für Rollback und Vergleich

Für den Start der Performance-Arbeiten gilt als dokumentierter Code-Ausgangspunkt:

```text
Repository: Heavensolder94/elyon-seller-tool
Branch: main
Commit: db25e8ad0076ad1e8ff38eebfaaf32618f2250ad
Vercel-Projekt: elyon-seller-tool
Produktions-Deployment: dpl_FaTrHBggwUPMqJmS4foxJzLRn8bX
Live-Domain: elyonsellertool.vercel.app
```

Spätere Fix-Dokumentationen sollen auf dieses Dokument verweisen und jeweils enthalten:

- geänderte Dateien,
- behobene Ursache,
- entfernte oder ersetzte Altlogik,
- ausgeführte Tests,
- bekannte Restrisiken,
- Commit-SHA,
- Produktions-Deployment-ID.
