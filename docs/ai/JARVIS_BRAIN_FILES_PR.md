# Jarvis Brain Files – Review Notes

## Scope

Dieser Branch ergänzt den versionierten Jarvis Core Brain und bindet ihn kontrolliert an Brain V2-A.1 an.

## Enthalten

- sechs Core-Brain-Dateien unter `brain/`
- `brain/BRAIN_MANIFEST.json`
- `lib/jarvis-brain-files.js`
- Context-Builder-Integration
- separate Core-Brain-System-Message
- deterministisches Playbook-Routing
- Zeichenbudget und Cache
- Path-Allowlist
- Tests
- Runtime-Dokumentation

## Safety

Keine neuen externen Rechte. Live-eBay-Publishing, Supplier Ordering, Refunds, Auto-Send von Kundennachrichten und Compliance-Auto-Apply bleiben gesperrt beziehungsweise approval-pflichtig.

## Review-Ziele

- `npm test`
- `git diff --check`
- Seller Tool Safety CI
- Vercel Build / Preview
- Smoke Tests für Identity, Widerspruch, Capability-Grenzen und Playbook-Auswahl

## Merge

Nicht mergen, bevor CI und Preview-Smoke-Tests erfolgreich geprüft wurden.
