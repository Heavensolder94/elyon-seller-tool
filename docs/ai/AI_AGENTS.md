# AI Agents

Diese Datei dokumentiert die bekannten KI-Agenten und virtuellen Mitarbeiter des Elyon Seller Tools.

## Grundprinzip

Die Agenten unterstützen Analyse, Strukturierung und operative Vorbereitung. Sie sollen nicht ungeprüft autonom handeln.

## Zentrale Speicherung

Alle Agenten- und Sicherheitsdaten werden zentral in folgendem localStorage-Key gespeichert:

```txt
elyon_ai_agents_settings
```

## Globale Sicherheitsfelder

```json
{
  "securityMode": true,
  "sandboxMode": true,
  "advancedMode": false,
  "autonomyLocked": true,
  "pauseAllAgents": false
}
```

## Aktive KI-Agenten

### Soul Scout

Aufgabe:

- Produktideen und Chancen erkennen
- Nachfrage, Marge und Risiko grob bewerten
- gute Artikel markieren oder vorschlagen

### Soul SEO

Aufgabe:

- eBay-Titel verbessern
- Keywords strukturieren
- Produktbeschreibungen optimieren
- Listing-Qualität erhöhen

### Soul Guard

Aufgabe:

- Risiken erkennen
- Compliance-Hinweise geben
- gefährliche oder unsichere Aktionen blockieren
- Sicherheitsstatus prüfen

## Virtuelle Mitarbeiter

### Soul Finance

Aufgabe:

- Gewinn, Gebühren und Cashflow bewerten
- Margen prüfen
- Kosten sichtbar machen

### Soul Support

Aufgabe:

- Kundennachrichten vorbereiten
- Retourenkommunikation strukturieren
- Support-Texte vorschlagen

### Soul Operations

Aufgabe:

- Tagesfokus strukturieren
- offene Aufgaben bündeln
- operative Warnungen anzeigen

## Gesperrte oder zukünftige Rollen

Diese Rollen sind vorbereitet, aber nicht automatisch live aktiv:

- Soul Listing
- Soul Pricing
- Soul Supplier
- Soul Compliance
- Soul Returns
- Soul Dispatch
- Soul Inventory
- Soul Review

## Regeln

- Rollen dürfen sichtbar sein.
- Rollen dürfen lokal vorbereitet werden.
- Live-Aktionen brauchen Sicherheitsfreigabe.
- Bei aktivem Sicherheitsmodus oder Sandbox-Modus bleiben Live-Aktionen blockiert.
- Beschreibung, Prompt und Guardrails sollen getrennt bleiben.
