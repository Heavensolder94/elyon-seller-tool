# Elyon Seller Tool - ChatGPT Referenz fuer Virtuelle Mitarbeiter / KI-Agenten

Diese Datei beschreibt die aktuelle Struktur der virtuellen Mitarbeiter und KI-Agenten im **Elyon Seller Tool**.
Sie ist als kompakte Referenz fuer ChatGPT, Codex und spaetere Erweiterungen gedacht.

---

## Ziel

Der Bereich **Virtuelle Mitarbeiter / KI-Agenten** soll:

- bestehende KI-Funktionen sauber ergaenzen
- lokale Einstellungen im Browser behalten
- Sicherheits- und Autonomiegrenzen klar sichtbar machen
- spaetere Automatisierung nur vorbereiten, nicht freischalten

Wichtig:

- bestehende KI-Funktionen nicht loeschen
- bestehende KI-Buttons nicht entfernen
- bestehende API-Routen nicht aendern
- bestehende `localStorage`-Keys nicht ueberschreiben
- keine Refactors an anderen Seiten
- nur additiv erweitern

---

## Speicher-Key

Alle Agenten- und Sicherheitsdaten werden in diesem einen Key gespeichert:

```txt
elyon_ai_agents_settings
```

Dieser Key speichert:

- globale Sicherheitsflags
- offene Karten
- aktiven Unterbereich
- Status der Agenten
- Modi
- Modellwahl
- Tageslimits
- Beschreibungen
- lokale Aktivitaetsinfos

---

## Globale Standardwerte

Beim ersten Laden sollen diese Standardwerte gesetzt werden:

```json
{
  "securityMode": true,
  "sandboxMode": true,
  "advancedMode": false,
  "autonomyLocked": true,
  "pauseAllAgents": false
}
```

### Bedeutung

- `securityMode`: Wenn `true`, sind keine autonomen Aktionen erlaubt
- `sandboxMode`: Wenn `true`, laufen Aktionen nur simuliert
- `advancedMode`: Wenn `false`, bleiben erweiterte Autonomie-Funktionen gesperrt
- `autonomyLocked`: Wenn `true`, bleiben Zukunftsfunktionen gesperrt
- `pauseAllAgents`: Wenn `true`, werden alle Agenten optisch als pausiert angezeigt

---

## Defensiv-Funktionen

Diese Funktionen sollen existieren:

### `loadAiAgentSettings()`

- liest Einstellungen aus `localStorage`
- legt fehlende Felder automatisch an
- laedt nie nur Teilzustand, sondern einen gemergten Gesamtzustand

### `saveAiAgentSettings(settings)`

- speichert Einstellungen in `localStorage`
- schreibt nur in `elyon_ai_agents_settings`

### `getDefaultAiAgentSettings()`

- liefert sichere Standardwerte
- enthaelt alle globalen Flags und Agenten-Defaults

### `mergeAiAgentSettings(defaults, saved)`

- kombiniert Defaultwerte und gespeicherte Werte
- erhaelt existierende User-Daten
- ueberschreibt keine vorhandenen Agenten-Einstellungen unnoetig

---

## Agentenrollen

### KI-Agenten

Diese Rollen sind eher analytisch und strategisch:

- `Soul Scout`
- `Soul SEO`
- `Soul Guard`

Typische Aufgaben:

- Produktideen und Chancen erkennen
- SEO, Titel und Beschreibung optimieren
- Risiken, Marge, Lieferzeit und Compliance pruessen

### Virtuelle Mitarbeiter

Diese Rollen sind eher operativ und tagesgeschaeftsnah:

- `Soul Finance`
- `Soul Support`
- `Soul Operations`

Typische Aufgaben:

- Gewinn, Gebuehren und Cashflow bewerten
- Kundennachrichten und Retouren-Kommunikation vorbereiten
- Tagesfokus, offene Aufgaben und Warnungen strukturieren

---

## UI-Reihenfolge

Im Bereich **Virtuelle Mitarbeiter / KI-Agenten** soll die Reihenfolge so sein:

1. Sicherheits- & Autonomie-Steuerung
2. Systemueberblick
3. KI-Agenten
4. Virtuelle Mitarbeiter
5. Gesperrte Zukunftsfunktionen

Diese Reihenfolge ist bewusst so gewaehlt:

- zuerst Sicherheit
- dann Status
- dann aktive Funktionen
- ganz unten die gesperrten Zukunftsoptionen

---

## Sicherheitsblock

Der Sicherheitsblock soll oben im Bereich sichtbar sein.

Titel:

```txt
Sicherheits- & Autonomie-Steuerung
```

Anzeigen:

- Sicherheitsmodus: aktiv / inaktiv
- Sandbox-Modus: aktiv / inaktiv
- Erweiterter Modus: aktiv / inaktiv
- Autonomie-Sperre: aktiv / inaktiv
- Alle Agenten pausieren: an / aus

Wichtig:

- auch wenn ein Toggle sichtbar ist, duerfen gefaehrliche Funktionen nicht wirklich ausgefuehrt werden
- Live-Aktionen bleiben blockiert, solange Sicherheitsmodus oder Sandbox aktiv ist

---

## Gesperrte Zukunftsfunktionen

Wenn `autonomyLocked = true`, muessen diese Funktionen gesperrt bleiben:

- Vollautomatische Aktionen
- Automatische Bestellungen
- Automatische Kundennachrichten
- Autonomes eBay-Posting

Diese Funktionen sollen:

- sichtbar bleiben
- deaktiviert bleiben
- den Hinweis anzeigen:

```txt
Noch nicht aktivierbar – Sicherheitsfreigabe erforderlich.
```

---

## Sicherheitslogik

### Wenn `securityMode` oder `sandboxMode` aktiv ist

- keine Live-Aktionen
- nur Simulation oder Vorschau
- keine echte automatische Ausfuehrung

### Wenn `pauseAllAgents` aktiv ist

- alle Agenten optisch als pausiert darstellen
- Status entsprechend im UI anzeigen

### Wenn `advancedMode` false ist

- erweiterte Autonomie-Funktionen gesperrt lassen

### Wenn `autonomyLocked` true ist

- Zukunftsfunktionen gesperrt lassen
- keine Vollautomatik erlauben

---

## Empfohlene Texte fuer ChatGPT

Wenn spaeter ein Prompt fuer Aenderungen geschrieben wird, kann diese Formulierung verwendet werden:

```txt
Arbeite am bestehenden Elyon Seller Tool.
Bestehende KI-Funktionen, Buttons, API-Routen und localStorage-Keys duerfen nicht kaputt gemacht werden.
Bitte nur additiv erweitern.
Der Bereich Virtuelle Mitarbeiter / KI-Agenten nutzt ausschliesslich den Key elyon_ai_agents_settings.
```

---

## Wichtige Dateien

- [public/index.html](./public/index.html)
- [CHATGPT.md](./CHATGPT.md)
- [CHATGPT_GUIDE.md](./CHATGPT_GUIDE.md)
- [README.md](./README.md)

---

## Kurzfassung

Der Bereich **Virtuelle Mitarbeiter / KI-Agenten** ist eine lokale Steuer- und Sicherheitsoberflaeche.
Er verwaltet Rollen, Status und Sicherheitsgrenzen, fuehrt aber keine echten autonomen Aktionen aus.

