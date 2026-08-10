# Elyon Manager / KI-Orchestrator V1

Stand: 10.08.2026

## Ziel

Der bestehende Elyon Operations Manager wird als zentraler **Elyon Manager** verwendet. V1 führt keine zweite Agentenarchitektur und keinen neuen KI-Provider ein. Die Ausführung spezialisierter Mitarbeiter läuft weiterhin über die vorhandene Route `/api/ai-agent-run` und die Agentendefinitionen aus `lib/ai-workforce.js`.

## Source of Truth

### Backend-Agenten

Die kanonischen Backend-IDs bleiben:

- `elyon-listing-pro`
- `elyon-compliance-guard`
- `elyon-profit-analyst`
- `elyon-operations-manager` — Backend-Identität des Elyon Managers
- `elyon-order-coordinator`
- `elyon-support-assistant`
- `elyon-product-data-checker`

Alte `Soul-*`-IDs bleiben ausschließlich Kompatibilitäts-Aliase. Neue Manager-Workflows erzeugen keine Soul-Agenten.

### Agentenausführung

`/api/ai-agent-run` bleibt die Ausführungsgrenze für OpenAI, DeepSeek und lokalen Fallback. Der Manager ruft die vorhandenen Fachagenten darüber kontrolliert nacheinander auf.

### Tasks

`elyon_ai_workforce_tasks` bleibt die gemeinsame Task-Mappe. Delegierte Tasks werden nur um Orchestrierungsmetadaten ergänzt.

`elyon_ai_manager_workflows_v1` enthält ausschließlich Workflow-/Audit-Metadaten und ist keine zweite Agenten-Task-Datenbank.

## V1-Komponenten

- `seller-ai-manager-orchestrator-v1.js`
  - Manager-Ausführung
  - Delegation
  - Deduplizierung
  - Workflow-Grenzen
  - Event-Trigger
  - Freigabe-Inbox
  - Operations-Briefing
  - Audit-Log
  - Autonomie-Normalisierung auf Stufe 0–3
- `seller-ai-company-view-v1.js`
  - verbindet den bestehenden Firmenbaum mit Agentenstatus, Provider, letztem Lauf, aktueller Aufgabe, letztem Ergebnis, Nutzung, Tageslimit und Autonomie
- `seller-ai-workforce-team-v6.js`
  - bleibt die visuelle Firmen-/Teamansicht
- `ai-workforce-client.js`
  - bleibt Basisklient und gemeinsame Task-/Settings-Schicht

## Delegationslogik

### Produktworkflow

```text
Elyon Manager
→ Produktdaten-Check
→ Compliance Guard
→ Profit Analyst
→ Listing Pro
→ Elyon Manager bündelt Ergebnis
→ nur risikobehaftete Ergebnisse in Freigabe erforderlich
```

Ein Compliance- oder anderer Hard-Blocker stoppt den Produktworkflow vor weiteren unnötigen KI-Aufrufen.

### Operations

```text
Neue Bestellung
→ Elyon Manager
→ Order Coordinator
→ Manager bewertet
→ abgeschlossen oder Aufmerksamkeit/Freigabe
```

```text
Retoure / Supportfall
→ Elyon Manager
→ Support Assistant
→ Antwort-/Handlungsvorschlag
→ Freigabe erforderlich
```

### Event-Modi

- Stufe 0: aus
- Stufe 1: nur manueller Start
- Stufe 2: Event darf den zuständigen kontrollierten Fachlauf für einen Vorschlag starten
- Stufe 3: interne Multi-Agent-Delegation bis zum sicheren Freigabepunkt

Alte UI-Modi `auto_internal` und `auto_external` werden defensiv auf Stufe 3 normalisiert. Eine Stufe 4 oder 5 existiert im Elyon Manager V1 nicht.

## Workflow-Schutz

V1 setzt folgende Grenzen:

- maximale Workflow-Tiefe: `3`
- maximale Agentenläufe je Workflow: `7`
- maximal ein Retry je Agentenschritt
- Timeout pro Agentenlauf: `35 s`
- Cooldown nach wiederholtem Fehler: `30 s`
- Deduplizierungs-Key aus Agent, Aktion, Source-ID und stabilem Kontext-Fingerprint
- sequenzielle Ausführung; keine Agenten-Ping-Pong-Schleifen
- kein Polling
- kein globaler MutationObserver durch das neue Manager-Modul

Der Produktions-Build optimiert zusätzlich den alten Workforce-Client und entfernt dessen früheren globalen Mount-Observer.

## Freigabe erforderlich

In die zentrale Freigabeansicht gelangen insbesondere:

- Listing-Ergebnisse
- Support-/Kundenantwortentwürfe
- Compliance-Blocker oder fehlende Pflichtfakten
- Profit-/Preisfälle, wenn die Elyon-Mindestregel nicht nachweislich erfüllt ist
- andere blockierte Produktdatenfälle

Normale erfolgreiche interne Prüfungen werden intern als abgeschlossen behandelt und belasten die Nutzer-Inbox nicht.

## Wirtschaftlichkeitsregel

Der bestehende deterministische Profit-Check bleibt maßgeblich:

```text
mindestens 20 % Marge
ODER
mindestens 5,00 EUR Gewinn
```

Die Regel ist ein Entscheidungssignal. Sie veröffentlicht kein Listing und ändert keinen Live-Preis.

## Gesperrte externe Aktionen

Folgende Aktionen bleiben technisch bzw. policy-seitig gesperrt:

- eBay-Angebot LIVE veröffentlichen
- Live-Preis ändern
- Lieferantenbestellung auslösen
- Kundennachricht senden
- Rückerstattung ausführen
- Produkt endgültig löschen
- rechtlich relevante Daten ändern

Ein interner Freigabe-Button bestätigt nur ein Agentenergebnis. Er führt keine dieser externen Aktionen aus.

## Kostenkontrolle

- bestehende Tageslimits pro Agent werden geprüft
- optionales globales Tageslimit wird respektiert
- identische Analysen werden über Deduplizierung wiederverwendet
- lokaler Product-Data-Check bleibt lokal geeignet
- bestehendes Provider-Routing und Fallback bleiben erhalten
- Provider/Model werden nicht beim normalen Seller-Tool-Start abgefragt
- Agentenruntime wird erst beim virtuellen Mitarbeiterbereich geladen
- Usage/Tokens und vorhandene Kosten-Schätzung werden in Settings/Teamansicht sichtbar gemacht

Die bestehende Client-Schätzung von `0,01 €` pro externem Agentenlauf ist nur ein operativer Zähler und keine buchhalterisch exakte Providerabrechnung.

## Performance

Der Manager führt keine globale Dauerüberwachung ein.

- kein `setInterval`
- kein aggressives Polling
- kein neuer globaler MutationObserver
- sequenzielle Fachagenten statt Parallelsturm
- kein API-Aufruf beim normalen Seitenstart
- Lazy Load über `virtualAgentsTab`
- Render-Updates über vorhandene Workforce-/Runtime-Events
- mobile Styles sind responsive

## Fehlerbehandlung

Die vorhandene `/api/ai-agent-run`-Route bleibt für Provider-Fallback und lokalen Fallback verantwortlich.

Der Orchestrator ergänzt:

- Timeout
- einen kontrollierten Retry
- Cooldown
- `failed`/`blocked`-Task bei nicht ausführbarem Schritt
- Stoppen bei Hard-Blockern
- deterministische Briefing-Zusammenfassung, falls das finale Manager-Briefing selbst keinen Provider erreicht

Es werden keine fehlenden Fachanalysen erfunden.

## Logging

Pro Workflow werden u. a. protokolliert:

- Grund/Quelle des Workflows
- gestarteter Agent
- Retry
- Wiederverwendung durch Dedupe
- Ergebnisstatus
- Freigabebedarf
- Managerentscheidung
- Child-Task-IDs
- Blocker

Secrets oder Provider-Keys werden nicht in Workflow-Logs geschrieben.

## Company OS

Die Abgrenzung bleibt unverändert:

```text
Company OS:
Nova → Produktprüfung → Marktentscheidung → Listing Designer → Auto Lister → eBay-Entwurf

Seller Tool:
Product Master → Listings → Orders → Versand → Retouren → Support → Finanzen → AI Workforce
```

Der Manager verwendet Seller-Tool-Daten und kopiert den vorgelagerten Company-OS-Workflow nicht nach.
