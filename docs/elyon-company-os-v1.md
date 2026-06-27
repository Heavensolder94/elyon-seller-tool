# Elyon Company OS 1.0

## Ziel

Elyon Company OS 1.0 ist die virtuelle Firmenzentrale fuer den Start deines eBay-/Dropshipping-Business. Es ist bewusst schlank: keine vollautomatischen Entscheidungen, keine 30 Agenten, sondern ein klares Arbeits-System fuer Produktrecherche, Listings, Finanzen, Projekte und Entwicklung.

## Prinzip

Du bist CEO. Die KI und das Tool liefern Struktur, Vorschlaege, Prioritaeten und Entscheidungsvorlagen. Freigaben, Produktentscheidungen, Preise und echte Aktionen bleiben bei dir.

## Kernbereiche

### 1. CEO Assistant

Aufgaben:

- Tagesuebersicht erstellen
- offene Aufgaben priorisieren
- Warnungen anzeigen
- Empfehlungen sammeln
- Fokus fuer heute festlegen

### 2. Einkauf

Aufgaben:

- Produktideen sammeln
- Lieferanten speichern
- Einkaufspreis und Versandkosten dokumentieren
- Marge berechnen
- Risiko bewerten

### 3. Vertrieb / eBay

Aufgaben:

- eBay-Listings verwalten
- Status pflegen: Idee, Entwurf, aktiv, verkauft, pausiert
- Titel, Beschreibung, Preis und Bestand vorbereiten
- Listing-Qualitaet pruefen

### 4. Marketing

Aufgaben:

- SEO-Titel verbessern
- Produktbeschreibung optimieren
- Bulletpoints erstellen
- Social-Media-Ideen sammeln
- Bundle- und Rabattideen entwickeln

### 5. Finanzen

Aufgaben:

- Einnahmen und Ausgaben erfassen
- eBay-Gebuehren, Versand, Einkauf und Gewinn berechnen
- Cashflow im Blick behalten
- monatliche Zusammenfassung vorbereiten

### 6. Projekte

Aufgaben:

- Business-Projekte verwalten
- Aufgaben nach Prioritaet sortieren
- Status anzeigen: Backlog, Heute, In Arbeit, Fertig
- Roadmap fuer Elyon Seller Tool und Chrome Extension pflegen

### 7. Entwicklung

Aufgaben:

- Bugs sammeln
- Feature-Ideen dokumentieren
- API-Status pflegen
- technische Roadmap vorbereiten

## Dashboard 1.0

Startansicht:

- Tagesfokus
- Neue Chancen
- Offene Aufgaben
- Warnungen
- Abteilungen
- Quick Actions

## Datenmodell 1.0

### Department

```json
{
  "id": "procurement",
  "name": "Einkauf",
  "description": "Produktideen, Lieferanten und Margen pruefen",
  "status": "active",
  "kpis": []
}
```

### Task

```json
{
  "id": "task_001",
  "departmentId": "sales",
  "title": "Erstes eBay-Listing vorbereiten",
  "priority": "high",
  "status": "today",
  "dueDate": null
}
```

### Opportunity

```json
{
  "id": "opp_001",
  "title": "Produktidee pruefen",
  "source": "manual",
  "departmentId": "procurement",
  "score": 72,
  "risk": "medium"
}
```

## Versionen

### 1.0

- Virtuelle Firmenzentrale
- Abteilungen
- Aufgaben
- Chancen
- Warnungen
- Tagesfokus
- lokale Speicherung

### 2.0

- Erste KI-Rollen: Product Hunter, Listing Manager, Finance Manager
- automatische Daily Briefs
- bessere Verknuepfung mit Produktdaten

### 3.0

- Multi-Agent-Workflow
- Agenten geben sich gegenseitig Informationen weiter
- CEO bekommt Entscheidungsvorlagen

## Sicherheitsregel

Keine automatische Bestellung, kein automatisches Listing und keine Kundennachricht ohne ausdrueckliche Freigabe durch den CEO.
