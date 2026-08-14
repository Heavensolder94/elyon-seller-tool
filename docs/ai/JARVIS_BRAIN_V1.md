# Elyon Jarvis Brain V1

## Zweck

Brain V1 erweitert das bestehende deterministische Jarvis-Routing um allgemeine Gesprache, kompakten Elyon-Systemkontext und dauerhafte Memories. Spezialisten und Safety-Gates bleiben der bevorzugte Pfad fuer fachliche oder geschuetzte Aktionen.

## Routing

- Blockierte Aktionen werden weiterhin zuerst durch `lib/elyon-jarvis-core.js` gestoppt.
- Fachauftraege mit passendem Agenten laufen ueber `createJarvisPlan()` und den bestehenden Registry Runner.
- Allgemeine Fragen, Systemfragen und Memory-Recall laufen ueber `lib/jarvis-brain.js`.
- `api/jarvis.js` bleibt der einzige Einstiegspunkt.

## Kontext und Memory

`lib/jarvis-context-builder.js` laedt begrenzt:

- bis zu 10 relevante Eintraege aus `jarvis_memory`
- 6 aktuelle Tasks
- 8 aktuelle Agent Runs
- aktive Agent-Metadaten und Request-Kontext

Memory-Relevanz wird deterministisch aus Textueberschneidung, Importance, Confidence und Aktualitaet berechnet. Es wird keine zweite Memory-Datenbank und keine Vector-Datenbank eingefuehrt.

Explizite Befehle wie `Merke dir: ...` werden deterministisch als `user_instruction` gespeichert. Zugangsdaten, Tokens, Passworttexte, Cookies und bekannte Credential-Formate werden blockiert. Normale Chatnachrichten werden nicht automatisch gespeichert; LLM-Memory-Kandidaten muessen hohe Importance und Confidence liefern.

## Modelle und Kosten

Die Reihenfolge ist:

1. `nvidia/nemotron-3-ultra-550b-a55b:free`
2. `nvidia/nemotron-3-super-120b-a12b:free`
3. `openrouter/free`

`JARVIS_BRAIN_MODEL` und `JARVIS_BRAIN_FALLBACK_MODEL` koennen serverseitig ueberschreiben. Brain V1 verwendet keine LLM-Aufrufe fuer deterministische Safety-, Routing- oder explizite Memory-Schreibentscheidungen.

Wenn alle Modelle ausfallen, antwortet die API mit HTTP `503`, `ok: false`, `mode: "brain_degraded"` und `error: "brain_provider_unavailable"`. Es wird keine erfundene KI-Antwort erzeugt.

## Safety

Brain V1 erhaelt keine neuen Berechtigungen. eBay-Live-Publishing, Supplier-Bestellungen, Refunds, Kundennachrichten, Loeschungen und rechtliche Datenmutationen bleiben durch die bestehenden Gates blockiert oder approval-pflichtig. Brain-Antworten duerfen externe Aktionen nicht als ausgefuehrt behaupten.

## Environment

Erforderlich fuer den echten Brain-/Memory-Betrieb:

- `OPENROUTER_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `JARVIS_BRAIN_MODEL`
- `JARVIS_BRAIN_FALLBACK_MODEL`

Secrets bleiben serverseitig und werden nicht in Responses, Logs oder Tests ausgegeben.

## Tests

```bash
node --test tests/jarvis-brain-v1.test.mjs
npm test
cd cloudflare/jarvis-worker && node --test test/*.test.mjs
```

## Preview-Test

Auf der Branch-Preview zunaechst `GET /api/jarvis` pruefen. Danach mit authentifizierter Seller-Session `POST /api/jarvis` testen:

```json
{"command":"Hallo Jarvis"}
```

Erwartet wird `mode: "brain"` und eine echte Modellantwort. Bei fehlendem Provider erscheint transparent `brain_degraded`. Fuer Memory-Tests ist eine nicht-sensitive Regel wie `Merke dir: Compliance immer erst nach meiner Freigabe.` geeignet. Fachauftraege wie `Pruefe Produkt ELY-000123` muessen weiterhin im Spezialistenpfad bleiben.
