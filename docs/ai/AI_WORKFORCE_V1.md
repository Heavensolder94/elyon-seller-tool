# Elyon AI Workforce V1

## Unterstützte Provider

Das Elyon Seller Tool unterstützt ausschließlich:

- **OpenAI** für hochwertige Analysen, Support-Entwürfe und Gewinnlogik
- **DeepSeek** für Listing-, Compliance- und operative Analysen
- **Lokaler Fallback** für regelbasierte Prüfungen ohne externe KI

Andere oder veraltete Providerwerte werden nicht ausgeführt. Gespeicherte unbekannte Provider- oder Modellkombinationen werden automatisch auf eine gültige Konfiguration normalisiert.

## Server-Routing

Der zentrale Router liegt in `lib/ai-provider-router.js`.

Er übernimmt:

- Provider- und Modellvalidierung
- sichere API-Aufrufe
- kontrollierten Fallback zwischen OpenAI und DeepSeek
- lokalen Fallback, falls kein externer Provider verfügbar ist
- einheitliche Fehler- und Usage-Daten
- bestehende Elyon-Sicherheitsregeln

Es gibt keinen automatischen externen Aktionspfad. Die virtuelle Belegschaft darf keine Listings veröffentlichen, Preise live ändern, Lieferantenbestellungen auslösen, Kundennachrichten versenden oder Erstattungen durchführen.

## Umgebungsvariablen

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
```

Optional:

```env
AI_DEFAULT_PROVIDER=openai
AI_FALLBACK_PROVIDER=deepseek
AI_ALLOW_PROVIDER_FALLBACK=true
AI_LOGGING_ENABLED=false
```

Ungültige Werte für `AI_DEFAULT_PROVIDER` oder `AI_FALLBACK_PROVIDER` werden ignoriert.

## Provider- und Modellschutz im Frontend

`seller-ai-provider-model-guard.js` stellt sicher, dass:

- nur OpenAI, DeepSeek und Lokal auswählbar sind
- nur freigegebene Modelle zum jeweiligen Provider angezeigt werden
- alte gespeicherte Kombinationen automatisch repariert werden
- globale Einstellungen und virtuelle Mitarbeiter synchron bleiben
- entfernte oder unbekannte Optionen aus vorhandenen Select-Feldern gelöscht werden

## Agenten

| Agent | Standardprovider | Aufgabe |
|---|---|---|
| Listing Pro | DeepSeek | Titel, SEO und Beschreibung |
| Compliance Guard | DeepSeek | GPSR, Hersteller und Pflichtangaben |
| Profit Analyst | OpenAI | Gewinn, Marge und Break-even |
| Operations Manager | DeepSeek | Prioritäten und Tagesbriefing |
| Order Coordinator | DeepSeek | Orders, Fristen und Tracking |
| Support Assistant | OpenAI | freigabepflichtige Antwortentwürfe |
| Produktdaten-Check | Lokal | regelbasierte Vollständigkeitsprüfung |

## Sicherheitsmodell

Alle Agentenergebnisse bleiben Entwürfe oder Prüfberichte. Manuelle Freigabe bleibt Pflicht. Die bestehende maximale Autonomiestufe 3 wird nicht überschritten.