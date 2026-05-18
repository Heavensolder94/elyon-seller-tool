# Elyon Seller Tool - ChatGPT Master Guide

Diese Datei ist die zentrale, ausfuehrliche Referenz fuer ChatGPT, wenn am **Elyon Seller Tool** gearbeitet wird.

Ziel dieser Datei:
- saubere Weiterentwicklung ohne Nebenwirkungen
- klare Sicherheitsregeln
- einheitliche Sprache fuer KI, Agenten und Einstellungen
- moeglichst wenige Rueckfragen, moeglichst viel verwertbare Kontextarbeit

---

## 1. Projektueberblick

Das Elyon Seller Tool ist ein lokales Seller-Dashboard fuer:

- Produktideen
- eBay-Listings
- Produktanalyse
- Preis- und Margenpruefung
- Bestellungen
- Retouren
- Versand
- Rechnungen
- Backups und Einstellungen
- KI-gestuetzte Assistenz
- Virtuelle Mitarbeiter / KI-Agenten

Das Projekt arbeitet mit mehreren Bereichen gleichzeitig:

- klassische Verwaltungsfunktionen
- KI-gestuetzte Hilfsfunktionen
- ein separates Agenten- und Rollenmodell
- Sicherheits- und Freischaltlogik
- lokale Speicherung ueber `localStorage`

Wichtig:
- Das System soll im Kern lokal, kontrollierbar und nachvollziehbar bleiben.
- KI darf unterstuetzen, aber nicht ungeprueft autonom handeln.

---

## 2. Grundprinzipien

Wenn du an diesem Projekt arbeitest, gelten diese Regeln als verbindlich:

- Bestehende KI-Funktionen nicht loeschen
- Bestehende KI-Buttons nicht entfernen
- Bestehende API-Routen nicht aendern
- Bestehende `localStorage`-Keys nicht ueberschreiben
- Keine bestehenden Settings kaputtmachen
- Keine grossen Refactors an bestehenden Seiten
- Nur additiv erweitern
- Defensive Programmierung bevorzugen
- Rueckwaertskompatibilitaet erhalten
- Sicherheitslogik immer respektieren

Wenn Unsicherheit besteht:
- lieber zusatzlich absichern als freizuschalten
- lieber sichtbare Vorschau als echte Ausfuehrung
- lieber bestehenden Zustand erhalten als zurücksetzen

---

## 3. Ton und Arbeitsweise

Antworten sollen:

- ruhig
- klar
- technisch sauber
- freundlich
- praezise
- ohne ueberfluessige Schaerfe

Wenn du dem Nutzer antwortest:
- lieber konkret als abstrakt
- lieber mit klaren Schritten als mit Allgemeinplaetzen
- lieber Sicherheitsgrenzen offen benennen als Risiken zu verstecken
- lieber bestehende Struktur erklaeren als alles neu zu erfinden

---

## 4. Wichtige Projektdateien

Die wichtigsten Dokumente und Einstiegspunkte sind:

- [index.html](./index.html)
- [public/index.html](./public/index.html)
- [CHATGPT.md](./CHATGPT.md)
- [CHATGPT_PROMPT.md](./CHATGPT_PROMPT.md)
- [CHATGPT_AI_AGENTEN.md](./CHATGPT_AI_AGENTEN.md)
- [CHATGPT_SYNC_DEBUG.md](./CHATGPT_SYNC_DEBUG.md)
- [README.md](./README.md)

Wenn du Aenderungen machst:
- immer beide Hauptdateien im Blick behalten, falls das Projekt dort gespiegelt ist
- keine Teilanpassung nur in einer Datei, wenn die andere dieselbe Logik traegt

---

## 5. Projektlogik in Kurzform

Das Tool enthaelt mehrere Schichten:

### A. Klassische Seller-Funktionen

- Produktdaten
- Listings
- Kalkulation
- Versand
- Rechnungen
- Retouren
- Imports
- Checks und Uebersichten

### B. KI-Funktionen

- generative Listing-Unterstuetzung
- Beschreibungsgeneratoren
- Titel- und SEO-Hilfen
- Analyse- und Score-Funktionen
- Coach-/Assistenz-Funktionen

### C. Virtuelle Mitarbeiter / KI-Agenten

- strategische Rollen
- operative Rollen
- Sicherheits- und Freigabelogik
- lokale Vorbereitungs- und Analyse-Workflows
- zukuenftig erweiterbare Rollensysteme

### D. Sicherheitslayer

- Sicherheitsmodus
- Sandbox-Modus
- Erweiterter Modus
- Autonomie-Sperre
- Alle Agenten pausieren

---

## 6. Allgemeine KI-Einstellungen

Im allgemeinen Einstellungsbereich gibt es unter **KI** den globalen Schalter:

- `KI-Funktionen aktivieren`

Wenn aktiv:
- KI-Funktionen sind grundsaetzlich nutzbar
- die KI-Buttons bleiben funktional

Wenn deaktiviert:
- KI-Buttons bleiben sichtbar
- die KI-Funktionen sollen nicht ausgefuehrt werden

Wichtig:
- `KI-Funktionen aktivieren` ist **nicht** gleichbedeutend mit voller Autonomie
- zusaetzliche Sicherheitsmodi koennen Live-Aktionen weiterhin blockieren

---

## 7. Sicherheits- und Autonomie-Modell

Die Sicherheitslogik fuer Virtuelle Mitarbeiter / KI-Agenten nutzt diesen zentralen Key:

```txt
elyon_ai_agents_settings
```

Dieser Key enthaelt alle relevanten Agenten- und Sicherheitsdaten.

Globale Sicherheitsfelder:

- `securityMode: true`
- `sandboxMode: true`
- `advancedMode: false`
- `autonomyLocked: true`
- `pauseAllAgents: false`

### Bedeutung

#### `securityMode`
Wenn `true`, duerfen keine autonomen Aktionen ausgefuehrt werden.

#### `sandboxMode`
Wenn `true`, werden Aktionen nur simuliert und nicht live ausgefuehrt.

#### `advancedMode`
Wenn `false`, bleiben erweiterte Autonomie-Funktionen gesperrt.

#### `autonomyLocked`
Wenn `true`, bleiben diese Funktionen gesperrt:

- vollautomatische Aktionen
- automatische Bestellungen
- automatische Kundennachrichten
- autonomes eBay-Posting

#### `pauseAllAgents`
Wenn `true`, werden alle Agenten optisch als pausiert angezeigt.

### Sicherheitsregeln

- Wenn `securityMode` oder `sandboxMode` aktiv ist, bleiben alle Live-Aktionen blockiert.
- Gesperrte Funktionen duerfen sichtbar bleiben, aber nicht wirklich ausfuehrbar sein.
- Zukunftsfunktionen duerfen vorbereitet, angezeigt und markiert werden, aber nicht live laufen.

---

## 8. Agenten- und Rollenstruktur

Es gibt bereits diese KI-Agenten:

- Soul Scout
- Soul SEO
- Soul Guard
- Soul Finance
- Soul Support
- Soul Operations

Diese Rollen sind fuer Analyse, Struktur, Risikoerkennung und operative Hilfe gedacht.

Zusatzlich gibt es gesperrte bzw. zukuenftige Rollen:

- Soul Listing
- Soul Pricing
- Soul Supplier
- Soul Compliance
- Soul Returns
- Soul Dispatch
- Soul Inventory
- Soul Review

Diese sind bewusst nur als Vorschau sichtbar oder spaeter anschliessbar.

---

## 9. Virtuelle Mitarbeiter / KI-Agenten

Der Bereich **Virtuelle Mitarbeiter / KI-Agenten** ist keine einfache Deko.

Er ist eine eigene Steuerungsschicht fuer:

- Rollenverwaltung
- Sichtbarkeit
- Sicherheit
- Vorbereitung
- Analyse
- spaetere Aktivierung

Wichtig:
- Rollen sollen sichtbar sein
- Rollen koennen lokal vorbereitet werden
- Rollen duerfen aber erst dann live arbeiten, wenn die Sicherheitslogik das explizit erlaubt

### Was im UI sichtbar sein kann

- Status
- Modus
- Modell
- Tageslimit
- Beschreibung
- Prompt
- Guardrails
- Aufgabenverlauf
- KI-Verbindung
- Vorbereitung / Sperrstatus

---

## 10. Beschreibung, Prompt und Guardrails

Diese drei Felder sind bewusst getrennt:

### `Beschreibung`

Zweck:
- menschlich lesbare Kurzbeschreibung
- zeigt, was die Rolle macht
- kurz, knapp, uebersichtlich

Beispiel:
- `Prueft Produktchancen und markiert gute Artikel.`

### `Prompt`

Zweck:
- eigentliche Arbeitsanweisung fuer die KI
- genauer, technischer, strukturierter
- kann laenger und praeziser sein

Beispiel:
- `Analysiere Titel, Nachfrage, Marge, Risiko und Konkurrenz. Gib eine kurze Bewertung mit Empfehlung und Warnhinweisen zurueck.`

### `Guardrails`

Zweck:
- Sicherheitsgrenzen
- Verbote
- klare Leitplanken

Beispiel:
- nur Vorschlaege
- keine autonomen Live-Aktionen
- keine Bestellungen ohne Freigabe
- keine Kundennachrichten ohne Sicherheitsfreigabe

### Wichtige UI-Regel

- Beschreibung, Prompt und Guardrails sind standardmaessig gesperrt
- jedes Feld kann per Stift-Symbol freigeschaltet werden
- die Felder werden lokal gespeichert
- beim Generieren bleibt die Bearbeitbarkeit erhalten

---

## 11. Generieren-Button fuer Prompts

Im Modal fuer **Erweiterte KI-Anweisungen** gibt es beim Prompt einen Button:

- `Generieren`

Diese Funktion soll:

- einen strukturierten Prompt-Entwurf erzeugen
- sich an Rolle, Beschreibung und Guardrails orientieren
- nur einen Entwurf anlegen
- nichts live ausfuehren

Wichtig:
- Der Button darf kein autonomes Handeln ausloesen
- Er ist nur ein Schreib-/Vorschlagswerkzeug
- Der Nutzer soll den generierten Prompt anschliessend noch anpassen koennen

Empfohlene Logik:

- Prompt aus Rolle + Beschreibung + Guardrails aufbauen
- danach Prompt-Feld zum Bearbeiten freischalten
- lokale Speicherung aktualisieren

---

## 12. Future / Locked Capabilities

Es gibt einen eigenen Bereich fuer gesperrte Zukunftsfunktionen und Rollen.

Bereits vorbereitete gesperrte Funktionen:

- Vollautomatische Aktionen
- Automatische Bestellungen
- Automatische Kundennachrichten
- Autonomes eBay-Posting

Bereits vorbereitete gesperrte Rollen:

- Soul Listing
- Soul Pricing
- Soul Supplier
- Soul Compliance
- Soul Returns
- Soul Dispatch
- Soul Inventory
- Soul Review

### Verhaltensregeln fuer diese Bereiche

- sichtbar lassen
- gesperrt anzeigen
- nicht live ausfuehren
- bei Bedarf lokal markieren oder vorbereiten
- Sicherheitsfreigabe notwendig machen

### Wichtiger Grundsatz

Nur weil eine Rolle oder Funktion vorbereitet ist, heisst das nicht, dass sie erlaubt ist.

---

## 13. localStorage-Logik

Das Projekt verwendet lokal gespeicherte Daten.

Wichtige Regeln:

- nichts ueber schreiben, was bereits von anderen Bereichen genutzt wird
- keine bestehenden Keys zerstoeren
- fehlende Felder defensiv ergaenzen
- bestehende Userwerte behalten

Beispiel fuer das Agentensystem:

```txt
elyon_ai_agents_settings
```

Beim Laden:
- Default-Werte setzen, wenn nichts vorhanden ist
- bestehende Werte nicht verlieren
- fehlende Felder ergaenzen

Beim Speichern:
- nur die relevanten Werte schreiben
- keine alten Einstellungen unnoetig zerstoeren

---

## 14. Defensive Programmierung

Immer bevorzugen:

- Pruefen, ob Daten existieren
- auf `null` / `undefined` vorbereitet sein
- Rueckfallebenen definieren
- Eingaben bereinigen
- keine hart an Annahmen gekoppelten Loesungen

Gutes Verhalten:

- wenn eine Rolle fehlt, nicht die ganze Ansicht kaputtmachen
- wenn ein Feld leer ist, mit Default arbeiten
- wenn ein Zustand unbekannt ist, sichere Variante waehlen

---

## 15. Was du niemals tun solltest

- keine Live-Aktion heimlich freischalten
- keine Sicherheitsmodi umgehen
- keine Agenten automatisiert ohne Freigabe aktivieren
- keine bestehenden Buttons entfernen
- keine alten localStorage-Daten unbereinigt ueberschreiben
- keine groben Refactors ohne Not
- keine Funktionen loeschen, nur weil eine neuere Version existiert

---

## 16. Was du bevorzugt tun solltest

- kleine, additive Aenderungen
- saubere Labels
- klare Zustandsanzeigen
- sichere Defaults
- lokal nachvollziehbare Daten
- UI, die den Sicherheitsstatus klar zeigt
- gesperrte Funktionen sichtbar, aber deaktiviert

---

## 17. Empfohlene Antwortweise fuer ChatGPT

Wenn ChatGPT fuer dieses Projekt antwortet, sollte es:

- zuerst den Status der vorhandenen Logik bestaetigen
- dann die Aenderung mit Sicherheitskontext erklaeren
- bei Code-Aenderungen beide Hauptdateien im Blick behalten
- bei Unsicherheit lieber rueckfragen, wenn es echte Konsequenzen gibt
- bei klaren Aufgaben sofort umsetzen statt nur zu beschreiben

Wenn der Nutzer fragt:
- ob etwas aktiv ist
- ob etwas funktionsfaehig ist
- ob etwas gesperrt ist
- ob etwas live laufen kann

dann immer sehr klar trennen zwischen:

- sichtbar
- gespeichert
- vorbereitet
- gesperrt
- live ausfuehrbar

---

## 18. Sauberes UI-Modell fuer die Agenten

Empfohlene Struktur:

### In der Kartenansicht

- Name
- Status
- Kurzbeschreibung
- wichtige Toggle-Schalter
- grundlegende Aktionen

### Im Modal / Detailfenster

- Beschreibung
- Prompt
- Guardrails
- Generieren-Button
- lokale Speicherung
- Sicherheitsstatus

### In der Vorschau gesperrter Bereiche

- Karten sichtbar lassen
- klare Sperrhinweise
- keine echte Ausfuehrung
- einheitliche Texte wie:

```txt
Noch nicht aktivierbar - Sicherheitsfreigabe erforderlich.
```

---

## 19. Empfohlene Standardtexte

### Fuer gesperrte Funktionen

```txt
Noch nicht aktivierbar - Sicherheitsfreigabe erforderlich.
```

### Fuer Sicherheitsblock

```txt
Live-Aktionen bleiben durch Sicherheitsmodus oder Sandbox blockiert.
```

### Fuer Guardrails-Hinweis

```txt
Guardrails sind Sicherheitsregeln und Grenzen fuer den Agenten.
```

### Fuer Vorbereitungsstatus

```txt
Vorbereitet, aber gesperrt.
```

---

## 20. Wie Aenderungen ideal umgesetzt werden

Wenn du am Projekt arbeitest:

1. Erst die bestehende Struktur verstehen
2. Dann nur die benoetigten Teile aendern
3. Neue Funktionen defensiv einbauen
4. Sicherheitsregeln intakt lassen
5. Danach testen, ob bestehende KI-Funktionen weiter funktionieren
6. Am Ende Rueckwaertskompatibilitaet prufen

---

## 21. Wenn du ChatGPT direkt fuettern willst

Du kannst ChatGPT mit folgender Arbeitsanweisung starten:

```txt
Arbeite im Elyon Seller Tool streng additiv.
Loesche keine bestehenden KI-Funktionen, Buttons, Routen oder localStorage-Keys.
Halte Sicherheitsmodi, Sandbox und Autonomie-Sperre aktiv und wirksam.
Neue Rollen und Zukunftsfunktionen duerfen sichtbar, gesperrt und lokal vorbereitet sein, aber nicht autonom live ausfuehren.
Behalte die Trennung zwischen Beschreibung, Prompt und Guardrails sauber bei.
```

---

## 22. Kurzfassung fuer schnellen Zugriff

- Projekt = lokales Seller-Dashboard mit KI- und Agentenebene
- Sicherheit = oberste Prioritaet
- `elyon_ai_agents_settings` = zentrale Agenten- und Sicherheitsdaten
- `securityMode` / `sandboxMode` blockieren Live-Aktionen
- `autonomyLocked` blockiert futuristische Autonomie-Funktionen
- Beschreibung = kurz und menschlich
- Prompt = KI-Anweisung
- Guardrails = Sicherheitsgrenzen
- Generieren = nur Prompt-Entwurf, keine Live-Aktion
- Zukunftsfunktionen und Rollen bleiben sichtbar, aber gesperrt

---

## 23. Abschluss

Diese Datei ist die zentrale Referenz fuer ChatGPT, wenn im Elyon Seller Tool gearbeitet wird.

Wenn du spaeter neue Rollen, neue Agenten oder neue Sicherheitsstufen hinzufuegst, soll diese Datei zuerst aktualisiert werden, damit der Kontext konsistent bleibt.

