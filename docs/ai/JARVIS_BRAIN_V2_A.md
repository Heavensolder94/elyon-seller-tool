# Elyon Jarvis Brain V2-A

V2-A erweitert Brain V1 um einen begrenzten, kanalneutralen Arbeitskontext. Long-Term Memory in `jarvis_memory` bleibt für dauerhafte Regeln und Entscheidungen zuständig. Working Memory beschreibt dagegen den aktuellen Zustand einer Conversation.

## Architektur

`/api/jarvis` bleibt geschützt und behält das deterministische Specialist Routing sowie alle Safety Gates. Für General-Brain-Anfragen wird eine Conversation-Session erstellt oder fortgesetzt. Der Context Builder kombiniert relevante V1-Memories, Tasks und Agent Runs mit Session Summary, den letzten maximal zwölf Nachrichten und dem Working-Memory-State.

Working Memory unterstützt `currentGoal`, `activeProject`, `currentFocus`, `openTasks`, `blockers`, `pendingApprovals`, `lastAction` und `nextExpectedAction`. Explizite deutsche Formulierungen werden deterministisch erkannt. Modellvorschläge werden serverseitig begrenzt, dedupliziert und durch die bestehende Secret-Safety geprüft.

## Datenmodell und Migration

Die Migration `supabase/migrations/20260814220000_jarvis_brain_v2_a.sql` legt `jarvis_conversation_sessions`, `jarvis_conversation_messages` und `jarvis_working_memory` an. Sie ist additiv und idempotent; bestehende Tabellen werden nicht verändert. Die Migration muss nach Freigabe über die bestehende Supabase-Deployment-Pipeline angewendet werden. In diesem PR wurde keine Production-Datenbank verändert.

Sessions führen `channel` (aktuell `seller_tool`) und `scope`, damit spätere Kanäle wie Telegram möglich bleiben. Der Client merkt sich die Session-ID nur in `sessionStorage`; die persistente Wahrheit liegt in Supabase.

## Summary und Grenzen

Conversation-History wird auf zwölf Nachrichten und ungefähr 1.200 Zeichen pro Nachricht begrenzt. Die Summary ist auf 4.000 Zeichen begrenzt. Working Memory erlaubt maximal 20 offene Aufgaben, 10 Blocker und 10 Freigaben; einzelne Einträge sind maximal 1.000 Zeichen lang. Wiederholte Einträge werden dedupliziert.

Wenn Session- oder Working-Memory-Storage ausfällt, antwortet Brain nach Möglichkeit weiter und liefert `contextWarnings`. Es wird nicht behauptet, dass ein nicht geladener Zustand bekannt ist.

## Safety

Die bestehende V1-Memory-Policy wird wiederverwendet. Secret-artige Werte, Tokens, Passwörter, Cookies und Authorization-Inhalte werden nicht in Conversation oder Working Memory gespeichert. V2-A verleiht Jarvis keine neuen Rechte: Live-eBay-Veröffentlichungen, Bestellungen, Refunds, Compliance-Freigaben und andere produktive Mutationen bleiben gesperrt bzw. approval-pflichtig.

## Tests und spätere Stufen

`npm test` und `git diff --check` prüfen die Integration. Es werden keine Embeddings, Vector Search, Reranking, Experience Learning, Skills, Playbooks, Telegram, Sprache oder autonomen Rechte eingeführt. Die nächste geplante Stufe ist V2-B Semantic Memory.
