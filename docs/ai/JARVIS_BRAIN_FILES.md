# Jarvis Brain Files Runtime — Phase 3

## Zweck

Die Brain Files bilden den versionierten, stabilen Core-Kontext von Jarvis. Sie sind gleichzeitig **lesbare Dokumentation** und **echte Runtime-Quelle**.

Sie ergänzen dynamische Quellen wie Working Memory, Conversation, Long-Term Memory, Current-Turn-Evidence und Systemtelemetrie. Sie ersetzen diese Quellen nicht und dürfen niemals Live-Zustände erfinden.

Deterministische Safety-Gates, Authentifizierung, Autonomy Policy und API-Berechtigungen bleiben autoritativ.

## Dateien

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

Die Markdown-Dateien bleiben der deployte Repository-Fallback und die kontrollierte Git-Referenz. Das Manifest enthält ausschließlich technische Lade-, Routing- und Budget-Metadaten und bleibt in Phase 3 lokal versioniert.

## Pflicht-Core

Für eine freie Jarvis-Brain-Antwort müssen immer erfolgreich geladen werden:

- `IDENTITY.md`
- `OPERATING_RULES.md`
- `GOALS.md`

Fehlt einer dieser Pflichtbestandteile oder ist das Manifest ungültig, läuft Jarvis in `brain_degraded` mit `core_brain_unavailable`. Der Modellaufruf wird dann nicht ausgeführt. Dadurch beantwortet Jarvis freie Brain-Anfragen nicht mit einer unvollständigen Identität oder ohne seine verbindlichen Betriebsregeln.

Optionale relevante Dateien dürfen mit Warnung ausfallen, ohne die deterministischen Safety-Gates zu verändern.

## Request-relevanter Kontext

Zusätzlich können geladen werden:

- `ELYON_CONTEXT.md` bei Elyon-, Architektur-, Produkt- oder Infrastrukturbezug,
- `CAPABILITIES.md` bei Fähigkeits-, Status-, Automations-, Approval- oder Ausführungsfragen,
- höchstens ein passendes Core-Playbook aus `PLAYBOOKS.md`.

`CAPABILITIES.md` ist eine statische Fähigkeitslandkarte und **kein Live-Health-Dashboard**. Bei Fragen wie „Funktioniert OpenRouter gerade?“ oder „Ist Supabase online?“ ist der aktuelle Runtime-/Integration-Center-Status maßgeblich.

## V1-Playbooks

Phase 3 enthält genau drei Core-Playbooks:

```text
Product Check
→ product_check

Product Enrichment
→ product_enrichment

Listing-Vorbereitung bis eBay Draft
→ listing_draft
```

Market Scout/Produktsuche kann weiterhin als Elyon-Capability oder Spezialisten-Workflow existieren, ist aber kein Phase-3-Core-Playbook.

Das Routing ist deterministisch und benötigt keinen zusätzlichen LLM-Aufruf. Explizites Enrichment wird vor einem allgemeinen Product-Check-Match priorisiert; Listing-/Draft-Aufträge werden dem Draft-Playbook zugeordnet.

## Runtime Loader

`lib/jarvis-brain-files.js` übernimmt:

1. Manifest laden und strukturell validieren,
2. Dateipfade gegen eine feste Allowlist prüfen,
3. Pflicht-Core-Definitionen validieren,
4. Brain-Dokumente über den kontrollierten Resolver laden,
5. definierte Abschnitte extrahieren,
6. höchstens ein Playbook auswählen,
7. das Zeichenbudget anwenden,
8. `ready`, `requiredMissing`, `loaded`, `playbook`, `budget` und echte Warnungen zurückgeben.

Nutzertext kann keine Dateipfade setzen. `.env`, Secrets, beliebige Repository-Dateien und Path Traversal sind nicht zugelassen.

### Optionaler Managed File Store

Der Jarvis File Manager V1 ergänzt einen opt-in Resolver. Standardmäßig ist er deaktiviert:

```text
JARVIS_FILE_STORE_ENABLED=false
```

Dann lädt Jarvis wie bisher direkt aus `brain/*.md`.

Wird der Store nach Migration und Smoke Test bewusst aktiviert, versucht der Resolver für registrierte Brain-Dokumente eine aktive Supabase-Version zu laden. Fehlt diese Version oder schlägt der Supabase-Read fehl, wird automatisch die deployte Repository-Datei verwendet.

Das Manifest selbst wird nicht aus Supabase geladen. Pfad-Allowlist, Abschnittsregeln, Pflicht-Core und Budgets bleiben dadurch weiterhin im versionierten Code kontrolliert.

Details: `docs/ai/JARVIS_FILE_MANAGER_V1.md`.

## Prompt-Aufbau

Phase 3 greift bewusst direkt in `lib/jarvis-brain.js` ein und lässt den bestehenden Phase-2-Context-Builder unverändert.

Die bestehende dynamische Kontext-Message bleibt aus Kompatibilitätsgründen an ihrer bisherigen Position. Der Core Brain wird als zusätzliche, getrennte System-Message direkt danach injiziert:

```text
System 1
→ harte Brain-/Safety-Baseline

System 2
→ ELYON_CONTEXT_JSON mit dynamischem Kontext + Core-Metadaten

System 3
→ JARVIS_CORE_BRAIN mit tatsächlichem Core-Inhalt

User
→ aktuelle Anfrage
```

Der Core-Inhalt wird nicht noch einmal in den JSON-Kontext dupliziert. Die physische Reihenfolge der System-Messages ist kein Permission-Modell; die semantische Priorität wird explizit in der Safety-Baseline festgelegt.

Semantische Priorität:

```text
aktuelle Nutzeranfrage
→ Core Brain
→ verifizierte Current-Turn-Evidence
→ Working Memory
→ Conversation
→ Long-Term Memory
→ historische Tasks / Agent Runs
```

Deterministische Runtime-/Safety-Gates stehen außerhalb und oberhalb dieser semantischen Reihenfolge.

## Phase 1 und Phase 2 bleiben erhalten

Die Phase-3-Integration baut auf dem aktuellen `main` auf und ersetzt keine Provider- oder Telemetrielogik.

Insbesondere bleiben erhalten:

- OpenRouter-Modellkette,
- DeepSeek-Fallback,
- OpenAI-Fallback,
- Brain-Systemtelemetrie,
- Jarvis Integration Center V2,
- Working/Long-Term Memory,
- bestehende Specialist-/Task-Pfade.

## Safety-Grenzen

Brain Files können keine Rechte freischalten. Unabhängig vom Markdown bleiben insbesondere gesperrt oder approval-pflichtig:

- automatische eBay-Live-Veröffentlichung,
- Supplier-Bestellungen,
- Refunds,
- automatisches Senden von Kundennachrichten,
- Legal-/Compliance-Mutationen ohne vorgesehene Freigabe,
- destruktive Datenänderungen.

Draft bleibt Standard. Unkritische, ausreichend verifizierte Produktdaten dürfen nur über den tatsächlich erlaubten Runtime-Pfad automatisiert ergänzt werden. Compliance-Daten bleiben bis zur vorgesehenen Freigabe Vorschlag/Review.

## Wahrheit und Telemetrie

Brain Files enthalten keine erfundenen Live-Zustände. Ein statischer Eintrag wie „Capability integriert“ ist kein Nachweis für aktuelle Erreichbarkeit.

Ausführung und Erfolg werden getrennt behandelt. Jarvis darf Erfolg nur melden, wenn aktuelle Runtime-Evidence beziehungsweise ein bestätigter Write/Readback dies belegt.

## Tests

`tests/jarvis-brain-files.test.mjs` deckt unter anderem ab:

- Manifest- und Path-Safety,
- Pflicht-Core und Fail-Closed-Verhalten,
- Always-on Core,
- Elyon-/Capability-Relevanz,
- keine statischen Live-Status-Behauptungen,
- exakt drei Phase-3-Playbooks,
- getrenntes Product Check / Product Enrichment,
- Market Scout nicht als Core-Playbook,
- Draft-/Live-Publish-Grenze,
- separate Core-System-Message,
- Erhalt der Phase-1-Providerkette,
- Erhalt der Phase-2-Telemetrie.

`tests/jarvis-file-manager-v1.test.mjs` ergänzt Tests für Registry, File-Store-Opt-in, Supabase-/Repository-Fallback, Versionierung und Protected Writes.

## Deployment

Die Repository-Dateien werden weiterhin über Git versioniert und mit dem Vercel-Deployment ausgeliefert. Sie bleiben der sichere Fallback und können durch `JARVIS_FILE_STORE_ENABLED=false` jederzeit wieder alleinige Runtime-Quelle werden.

Die File-Manager-Foundation aktiviert keine Jarvis-Selbständerung. Neue Managed-Versionen werden zunächst als Draft gespeichert und müssen separat aktiviert werden. Protected-Dateien bleiben für normale Writes blockiert.

Core-Änderungen an der Repository-Referenz erfolgen weiterhin kontrolliert über Branch, PR, Tests und Preview-Verifikation.
