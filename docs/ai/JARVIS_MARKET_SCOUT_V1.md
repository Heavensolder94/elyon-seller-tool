# Jarvis Market Scout V1

Market Scout V1 verarbeitet Produktideen-Aufträge im Draft-/Read-only-Modus. Er ist ein eigener Pfad neben dem deterministischen Spezialisten-Routing und wird bei Produkt-Discovery- und Marktanalyse-Aufträgen vor einem Profit-Analysten ausgewählt.

## Verhalten

- unterstützt bis zu 20 Kandidaten
- nutzt den vorhandenen OpenRouter-Router mit Web-Suche
- verlangt strukturierte Kandidaten, Quellen und Unsicherheiten
- speichert oder verändert keine Produkte, Listings, Lieferanten oder eBay-Daten
- keine erfundenen Kandidaten bei Provider- oder Formatfehlern: kontrollierter `market_scout_degraded`

Die Ergebnisse sind Recherchehinweise, keine automatische Einkaufs-, Compliance- oder Veröffentlichungsfreigabe. Preise, Margen und Nachfrage müssen vor jeder späteren Fachaktion separat verifiziert werden.

## Ablauf

1. `POST /api/jarvis` im Plan-Modus erstellt einen read-only Market-Scout-Plan.
2. Erst `execute: true` startet die Web-Recherche.
3. Das Ergebnis enthält `marketScout.candidates` mit `research_only`-Status.
4. Die bestehenden Safety Gates bleiben aktiv.

## Grenzen

V1 führt keine echte Lieferantenprüfung, keine Produktanlage und keine eBay-Aktion aus. Die Recherchequalität hängt vom verfügbaren OpenRouter/Web-Search-Provider ab.
