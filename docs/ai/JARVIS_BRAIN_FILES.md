# Jarvis Brain Files Runtime

## Zweck

Die Jarvis Brain Files bilden den versionierten, stabilen Core-Kontext für Jarvis. Sie ergänzen Working Memory, Conversation, Long-Term Memory, Agent Runs und aktuelle Runtime-Evidence, ersetzen diese dynamischen Quellen aber nicht.

Die Runtime-Integration verleiht Jarvis keine neuen Rechte. Deterministische Safety-Gates, Authentifizierung, Autonomy Policy und API-Berechtigungen bleiben autoritativ.

## Core Files

```text
brain/
├── BRAIN_MANIFEST.json
├── IDENTITY.md
├── ELYON_CONTEXT.md
├── OPERATING_RULES.md
├── CAPABILITIES.md
├── GOALS.md
└── PLAYBOOKS.md
```

Die Markdown-Dateien bleiben die lesbare Source of Truth. `BRAIN_MANIFEST.json` enthält ausschließlich technische Lade- und Budget-Metadaten.

## Runtime-Auswahl

Immer geladen werden kompakte Abschnitte aus:

- `IDENTITY.md`
- `OPERATING_RULES.md`
- `GOALS.md`

Request-relevant werden ergänzt:

- `ELYON_CONTEXT.md` bei Elyon-, Architektur-, Produkt- oder Infrastrukturbezug,
- `CAPABILITIES.md` bei Fähigkeits-, Automations-, Approval- oder Ausführungsfragen,
- genau ein passendes Playbook aus `PLAYBOOKS.md`.

Die Runtime extrahiert definierte Markdown-Abschnitte anhand ihrer versionierten Überschriften. Dadurch bleibt die ausführliche Doku unverändert lesbar, während der Prompt nur den tatsächlich benötigten Core erhält. Es existiert kein zweiter Wissensspeicher mit duplizierten Brain-Regeln.

## Playbook Routing

Die Auswahl erfolgt deterministisch ohne zusätzlichen LLM-Aufruf:

```text
Produktsuche / Market Scout
→ product_discovery

Product Check / Enrichment / Compliance-Prüfung
→ product_check_enrichment

Listing / Draft / Auto Lister
→ listing_draft
```

Ein Playbook ist Brain-Wissen und keine Capability. Es kann keine gesperrte Aktion freischalten.

## Loader

`lib/jarvis-brain-files.js` übernimmt:

1. Manifest laden und validieren,
2. Pfade gegen eine feste Allowlist prüfen,
3. Markdown-Dateien lokal laden und pro Node-Prozess cachen,
4. benötigte Abschnitte extrahieren,
5. relevantes Playbook bestimmen,
6. Zeichenbudget anwenden,
7. strukturierten `coreBrain` zurückgeben.

### Path Safety

Der Loader akzeptiert ausschließlich:

```text
brain/IDENTITY.md
brain/ELYON_CONTEXT.md
brain/OPERATING_RULES.md
brain/CAPABILITIES.md
brain/GOALS.md
brain/PLAYBOOKS.md
```

Nutzertext kann keine Dateipfade setzen. `.env`, Secrets, beliebige Repository-Dateien oder Path Traversal sind nicht als Brain-Datei zugelassen.

## Token-/Zeichenbudget

Das Manifest begrenzt sowohl einzelne Quellen als auch den gesamten Core Brain.

Aktuell:

```text
Gesamtbudget: max. 12.000 Zeichen
```

Das Budget reserviert bewusst Platz für:

- Always-on Identity/Rules/Goals,
- request-relevanten Elyon-/Capability-Kontext,
- ein relevantes Playbook.

Conversation, Working Memory und dynamische Evidence bleiben davon getrennt.

## Context Builder

`lib/jarvis-context-builder.js` lädt den Core Brain zusätzlich zu den bestehenden V2-A-Quellen.

Kontextpriorität:

```text
1. aktuelle Nutzeranfrage
2. Core Brain
3. verifizierte Current-Turn-Evidence
4. Working Memory
5. Conversation
6. Long-Term Memory
7. gefilterte historische Tasks / Agent Runs
```

Deterministische Safety-/Runtime-Gates stehen außerhalb und oberhalb dieser semantischen Kontextpriorität.

## Brain Prompt

`lib/jarvis-brain.js` sendet drei getrennte Systemschichten:

```text
System 1
→ harte Brain-/Safety-Baseline

System 2
→ JARVIS_CORE_BRAIN

System 3
→ dynamischer ELYON_CONTEXT_JSON
```

Der dynamische JSON-Kontext enthält nur Core-Brain-Metadaten, nicht noch einmal den kompletten Core-Inhalt. So wird der Core nicht doppelt in den Prompt geschrieben.

## Defense in Depth

Die Brain Files ergänzen, aber ersetzen nicht:

- Seller Authentication,
- Safety Mode,
- Sandbox Mode,
- Autonomy Lock,
- Jarvis Autonomy Policy,
- API-/Handler-Gates,
- Draft-only-Regeln.

Insbesondere bleiben unabhängig vom Markdown gesperrt beziehungsweise approval-pflichtig:

- eBay Live Publishing,
- Supplier Ordering,
- Refunds,
- automatisches Senden von Kundennachrichten,
- unbelegte Compliance-Mutationen,
- destruktive Datenänderungen.

## Failure Mode

Fehlt ein optionaler Brain-Abschnitt, wird eine Context Warning erzeugt und Jarvis arbeitet mit dem verbleibenden Core weiter.

Wenn das Manifest nicht verfügbar oder ungültig ist, liefert der Loader einen leeren Core mit Warnung. Die hart codierte Safety-Baseline im Brain-Prompt bleibt trotzdem aktiv.

## Tests

`tests/jarvis-brain-files.test.mjs` prüft unter anderem:

- Manifest-Validierung,
- Path-Traversal-/`.env`-Blockade,
- Markdown-Section Extraction,
- Always-on Core,
- Elyon- und Capability-Relevanz,
- alle drei Playbook-Intents,
- Zeichenbudget,
- Safety-Hinweis im gerenderten Core,
- separate Core-System-Message,
- Erhalt der bestehenden V2-A-Kontextquellen.

## Deployment

Die Brain Files werden als Repository-Dateien mit dem Vercel-Deployment versioniert. Änderungen werden erst mit einem neuen Deployment wirksam.

Die Runtime darf die Brain Files nicht selbst verändern. Core-Änderungen erfolgen kontrolliert über Git und Review.
