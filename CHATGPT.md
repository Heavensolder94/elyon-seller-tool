# Elyon Seller Tool - ChatGPT Kontext

Diese Datei ist eine kurze, direkt nutzbare Referenz fuer ChatGPT-Antworten zum **Elyon Seller Tool**.

Sie fasst die wichtigsten Regeln, Bereiche und KI-Funktionen zusammen, damit spaetere Aenderungen sauber und sicher bleiben.

---

## Projektziel

Das Elyon Seller Tool ist ein lokales Seller-Dashboard fuer:

- Produktideen
- eBay-Listings
- Produktanalyse
- Kalkulation
- Bestellungen
- Retouren
- Versand
- Rechnungen
- Backup und Einstellungen

Das Tool arbeitet bewusst mit bestehenden KI-Funktionen und darf diese nicht zerstören.

---

## Wichtige Grundregeln

- Bestehende KI-Funktionen nicht loeschen, ersetzen oder umbenennen
- Bestehende Buttons nicht entfernen
- Bestehende API-Routen nicht entfernen
- Bestehende localStorage-Keys nicht ueberschreiben
- Keine grossen Refactors an bestehenden Seiten
- Nur additiv erweitern
- Defensive Programmierung verwenden
- Falls etwas fehlt, lieber Platzhalter statt Loeschung

---

## Vorhandene KI-Bereiche

### OpenAI / Listing KI

Verwendet fuer:

- Titel
- Beschreibung
- SEO
- Tags
- Listing verbessern
- Listing neu generieren
- Produktpruefung
- Produktsuche verbessern

### ELYON Soul / Coach

Verwendet fuer:

- Chat / Coach Overlay
- Analyse
- kurze Orientierung
- lokale Fallback-Antworten

### Virtuelle Mitarbeiter / KI-Agenten

Die neue Ebene dient nur als Verwaltungs- und Steuerungsschicht ueber bestehende KI-Funktionen.

Wichtig:

- noch keine autonomen Aktionen
- nur UI, Einstellungen und Speicherung
- spaeter kann daraus Steuerlogik werden

---

## Neue Agentenstruktur

Der Bereich ist in zwei Unterreiter geteilt:

- Virtuelle MA
- KI-Agenten

Die Rollen sind:

- Soul Scout
- Soul SEO
- Soul Guard
- Soul Finance
- Soul Support
- Soul Operations

Jede Rolle hat:

- Aktiv / Inaktiv
- Status-Badge
- Modus
- Benachrichtigungen
- Modellwahl
- Tageslimit
- Beschreibung
- Icon

---

## Speicherregeln

### Existierende Settings

- bleiben unveraendert
- keine Keys ueberschreiben

### Neue Agenten-Einstellungen

Neuer Speicher-Key:

```txt
elyon_ai_agents_settings
```

Speichert lokal:

- aktives Untermenue
- globale Sicherheitsmodus-Einstellung
- offene Karten
- Agentenstatus
- Modus
- Modell
- Tageslimit
- Beschreibungen

---

## Standardwerte fuer Agenten

- alle aktiv
- Modus: nur Vorschlaege
- Benachrichtigungen: an
- Modell: deepseek
- Tageslimit: 0.25 EUR

---

## UI-Wunsch fuer Agenten

Das UI soll:

- dunkel und modern sein
- sauber und kompakt wirken
- echte Toggle-Switches nutzen
- jede Karte einzeln aufklappbar machen
- pro Bereich klar trennen
- professionell und SaaS-artig aussehen

---

## Sicherheitsprinzip

Die Agenten duerfen aktuell nur:

- vorbereiten
- anzeigen
- speichern
- strukturieren
- Vorschlaege liefern

Sie duerfen noch nicht:

- autonom handeln
- automatisch veroeffentlichen
- automatisch bestellen
- automatisch Kunden kontaktieren

---

## Gute Anfrage an ChatGPT

Wenn du spaeter mit ChatGPT weiterarbeitest, hilft diese Art von Prompt:

```txt
Arbeite am bestehenden Elyon Seller Tool.
Bestehende KI-Funktionen, Buttons, API-Routen und localStorage-Keys duerfen nicht kaputtgemacht werden.
Bitte nur additiv erweitern.
Neue Aenderung: [dein Wunsch hier]
```

---

## Wichtige Dateien

- [index.html](./index.html)
- [public/index.html](./public/index.html)
- [CHATGPT_GUIDE.md](./CHATGPT_GUIDE.md)
- [README.md](./README.md)

---

## Kurzfassung

Dieses Projekt hat bereits echte KI-Funktionen.  
Neue Aenderungen sollen diese Funktionen nur ergaenzen, nicht ersetzen.  
Die neue Agenten-Ebene ist eine Verwaltungs-Schicht fuer spaetere Automatisierung.
