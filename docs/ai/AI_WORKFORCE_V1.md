# Elyon AI Workforce V1

## Status

Die AI Workforce V1 ergänzt das Elyon Seller Tool um geschützte virtuelle Mitarbeiter. Alle externen KI-Anfragen laufen serverseitig über `lib/ai-provider-router.js` und den geschützten Endpoint `POST /api/ai-agent-run`.

## Virtuelle Mitarbeiter

| Mitarbeiter | Phase | Aufgabe |
|---|---:|---|
| Elyon Listing Pro | 1 | faktengebundene eBay-Titel, SEO- und Beschreibungsvorschläge |
| Elyon Compliance Guard | 1 | GPSR-, Hersteller-, Pflichtmerkmal- und Risikoprüfung |
| Elyon Profit Analyst | 1 | Gewinn, Marge, Break-even und Preisszenarien |
| Elyon Operations Manager | 2 | Tagesbriefing und Priorisierung offener Vorgänge |
| Elyon Order Coordinator | 3 | Order-, Versandfrist- und Trackingprüfung |
| Elyon Support Assistant | 3 | freigabepflichtige Support- und Retourenantworten |

`soul-scout` bleibt abwärtskompatibel als lokaler Produktdaten-Vollständigkeitscheck erhalten. Die übrigen bisherigen `soul-*` IDs werden auf die neuen Mitarbeiter-IDs migriert, ohne die alten Einstellungen zu löschen.

## Sicherheitsmodell

Die Workforce darf in V1 keine externen kritischen Aktionen ausführen. Gesperrt bleiben insbesondere:

- eBay-Listings automatisch veröffentlichen
- Live-Preise ungefragt ändern
- Lieferantenbestellungen auslösen
- Kundennachrichten versenden
- Rückerstattungen auslösen
- Produkte löschen
- rechtliche Angaben verändern
- Company-OS-Freigaben oder Compliance-Blocker umgehen

Autonomiestufe 4 ist nicht verfügbar. Stufe 2 und 3 dürfen nur interne Aufgaben beziehungsweise Entwürfe erzeugen.

## Strukturierte Ergebnisse

Jeder Mitarbeiter liefert ein validiertes Ergebnis mit:

- `summary`
- `status`
- `confidence`
- `findings`
- `recommendations`
- `missingFacts`
- `warnings`
- `blockers`
- `suggestedActions`
- `generatedContent`
- `assumptions`

Ungültiges JSON wird einmal kontrolliert repariert. Scheitert die Reparatur, wird die Aufgabe als `failed` gespeichert und nicht übernommen.

## Profit Analyst

Die Kalkulation wird zusätzlich deterministisch ausgeführt. Fehlende Kosten werden nicht geschätzt, sondern als Annahme beziehungsweise fehlender Wert ausgewiesen. Die verbindliche Elyon-Regel lautet:

> Mindestens 20 % realistische Marge oder mindestens 5,00 EUR realistischer Gewinn.

## API

### Status

`GET /api/ai-agent-run`

Liefert Agentendefinitionen, Provider-Bereitschaft und Sicherheitsstatus. Seller-Authentifizierung ist erforderlich.

### Agent ausführen

`POST /api/ai-agent-run`

Unterstützte Aktionen:

- `run_agent`
- `analyze_product`
- `analyze_listing`
- `analyze_order`
- `analyze_return`
- `create_daily_briefing`
- `retry_task`

Der Request ist auf 192 KiB begrenzt. Es werden nur kontrollierte Kontextpakete an den KI-Provider übermittelt.

## Vercel-Konfiguration

Mindestens erforderlich:

- `ELYON_SELLER_ACCESS_TOKEN`
- mindestens einer der KI-Provider-Keys:
  - `OPENAI_API_KEY`
  - `DEEPSEEK_API_KEY`
  - `QWEN_API_KEY` oder `DASHSCOPE_API_KEY`

Optional:

- `OPENAI_MODEL`
- `DEEPSEEK_MODEL`
- `QWEN_MODEL`
- `AI_DEFAULT_PROVIDER`
- `AI_FALLBACK_PROVIDER`
- `AI_ALLOW_PROVIDER_FALLBACK`

API-Keys werden weder in LocalStorage noch in Client-JavaScript oder Agenten-Logs gespeichert.

## Tests

`tests/ai-workforce.test.mjs` prüft insbesondere:

- Migration der bisherigen Agenten-IDs
- Sperre externer Aktionen
- einheitliches Task-Schema
- Elyon-Mindestmargenregel
- Entfernung unnötiger personenbezogener Orderdaten
- Entfernung unbelegter KI-Fakten
- Compliance-Blocker bei fehlender Company-OS-Freigabe
- strukturierte JSON-Ausgabe
- pausierte und limitierte Agenten
- lokalen deterministischen Fallback
