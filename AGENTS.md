# AGENTS.md

## Zweck

Diese Datei gibt Codex und anderen KI-Agenten klare Arbeitsregeln für das Elyon Seller Tool.

## Grundregeln

- Bestehende Funktionen nicht löschen.
- Bestehende Buttons nicht entfernen.
- Bestehende API-Routen nicht unkontrolliert ändern.
- Bestehende localStorage-Keys erhalten.
- Keine Secrets oder echten API-Keys committen.
- Änderungen möglichst klein, additiv und nachvollziehbar halten.
- Vor größeren Änderungen erst relevante Dateien suchen und lesen.

## Wichtige Projektdateien

- README.md
- CHATGPT.md
- CHATGPT_GUIDE.md
- CHATGPT_AI_AGENTEN.md
- CHATGPT_SYNC_DEBUG.md
- docs/ARCHITECTURE.md
- docs/SECURITY.md
- docs/DOCUMENTATION_MAP.md
- docs/ai/AI_AGENTS.md
- docs/dev/LOCALSTORAGE_KEYS.md
- docs/dev/API_REFERENCE.md

## Sicherheitsregeln

- Sicherheitsmodus respektieren.
- Sandbox-Modus respektieren.
- Autonomie-Sperre nicht umgehen.
- Keine autonomen Bestellungen ohne Freigabe.
- Keine Kundennachrichten automatisch senden.
- Keine eBay-Listings automatisch veröffentlichen, solange die Sicherheitslogik dies blockiert.

## Arbeitsweise

1. Erst vorhandene Struktur verstehen.
2. Relevante Dateien lesen.
3. Kleine, gezielte Änderung machen.
4. Bestehende Logik erhalten.
5. Falls neue Keys, Routen oder ENV-Variablen entstehen, passende docs-Dateien aktualisieren.
6. Nach Änderungen kurz dokumentieren, was geändert wurde.

## Besonderheiten

Das Projekt kann Logik sowohl in index.html als auch in public/index.html enthalten. Wenn dieselbe Funktion gespiegelt ist, müssen beide Stellen geprüft werden.

## Dokumentationspflicht

Bei Änderungen an APIs, localStorage, ENV-Variablen, Agenten, Sync oder Sicherheit müssen die entsprechenden Dateien unter docs/ aktualisiert werden.
