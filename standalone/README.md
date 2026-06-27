# Elyon Company OS 1.0 – Standalone

Diese Standalone-Version ist eine kleine, eigenstaendige Test-App fuer deine virtuelle Firmenzentrale.

Sie ist bewusst vom Haupt-Tool getrennt, damit du sie ohne Codex, ohne Haupt-PC und ohne Installation testen kannst.

## Datei

```text
standalone/company-os-v1.html
```

Nach Merge und erfolgreichem Vercel-Deployment wird die Datei beim Build automatisch nach `public/standalone/company-os-v1.html` gespiegelt.

Dann sollte sie hier erreichbar sein:

```text
https://elyon-seller-tool.vercel.app/standalone/company-os-v1.html
```

## Ziel

Company OS 1.0 soll dir helfen, dein Dropshipping- und eBay-Business wie eine kleine virtuelle Firma zu strukturieren.

Du bist der CEO. Das System sortiert:

- Aufgaben
- Projekte
- Produktchancen
- eBay-Listing-Entwuerfe
- Finanzeintraege
- Brain-Feed-Meldungen
- Daily Briefs

Wichtig: Die App fuehrt nichts automatisch aus. Sie veroeffentlicht keine eBay-Angebote, sendet keine Kundennachrichten und gibt kein Geld aus.

---

## Starten

### Variante 1: Online ueber Vercel

Voraussetzung:

1. Der Pull Request wurde in `main` gemerged.
2. Vercel hat danach neu deployed.

Dann oeffnen:

```text
https://elyon-seller-tool.vercel.app/standalone/company-os-v1.html
```

### Variante 2: Direkt lokal oeffnen

1. Datei `standalone/company-os-v1.html` herunterladen.
2. Datei doppelklicken.
3. Browser oeffnet die App.

Es ist kein Server noetig.

### Variante 3: Im Repo oeffnen

Wenn das Repo auf deinem Laptop liegt:

```powershell
cd C:\Users\mailv\elyon-seller-tool
start .\standalone\company-os-v1.html
```

Alternativ im Datei-Explorer zur Datei gehen und doppelklicken.

---

## Speicherung

Die Standalone-Version speichert Daten lokal im Browser per:

```text
localStorage
```

Das bedeutet:

- Daten bleiben im gleichen Browser erhalten.
- Daten werden nicht automatisch mit GitHub, Vercel oder deinem Haupt-PC synchronisiert.
- Wenn Browserdaten geloescht werden, koennen auch diese Daten verschwinden.

Deshalb regelmaessig exportieren.

---

## Backup exportieren

In der App oben rechts:

```text
Export
```

Dadurch wird eine JSON-Datei heruntergeladen, zum Beispiel:

```text
elyon-company-os-v1-2026-06-27.json
```

Diese Datei kannst du sichern, z. B. in Google Drive, Dropbox oder auf deinem Laptop.

---

## Backup importieren

In der App oben rechts:

```text
Import
```

Dann deine vorher exportierte JSON-Datei auswaehlen.

Die App laedt deine Aufgaben, Projekte, Produkte, Listings, Finanzen und Brain-Feed-Meldungen wieder ein.

---

## Bereiche der App

### Mission Control

Die Startseite mit:

- offenen Aufgaben
- Produkten in Pruefung
- Listings bereit zur Freigabe
- erwartetem Gewinn
- Tagesfokus
- CEO Daily Brief
- Brain Feed

### Aufgaben

Hier planst du konkrete Arbeitsschritte.

Beispiele:

- Erstes eBay Listing fertigstellen
- 3 Produktchancen pruefen
- Lieferzeit bei CJ kontrollieren
- Chrome-Extension-Importfehler dokumentieren

### Projekte

Hier verwaltest du groessere Vorhaben.

Beispiele:

- eBay Startphase
- CJ Import verbessern
- Chrome Extension stabilisieren
- Shopify Vorbereitung

### Produkte

Hier sammelst du Produktchancen.

Wichtige Felder:

- Produktname
- Supplier
- Produkt-URL
- Einkauf + Versand
- Verkaufspreis
- Status
- Risiko
- Notiz

Die App berechnet einen groben erwarteten Gewinn.

### eBay Listings

Hier sammelst du Listing-Entwuerfe.

Statusmodell:

- Entwurf
- In Bearbeitung
- Bereit zur Freigabe
- Aktiv
- Pausiert
- Verkauft

Wichtig: Aktiv bedeutet nur, dass du es im System so markierst. Die App veroeffentlicht nichts automatisch auf eBay.

### Finanzen

Hier kannst du einfache Einnahmen und Ausgaben dokumentieren.

Beispiele:

- Testbestellung
- eBay Verkauf
- Verpackungskosten
- Toolkosten

### CEO Regeln

Hier stehen die Sicherheitsregeln:

- eBay Listing veroeffentlichen: immer CEO-Freigabe
- Produkt final freigeben: immer CEO-Freigabe
- Lieferant waehlen: immer CEO-Freigabe
- Kundennachricht senden: immer CEO-Freigabe
- Geld ausgeben / Bestellung ausloesen: immer CEO-Freigabe

---

## Empfohlener Workflow fuer den Start

1. `Mission Control` oeffnen.
2. `Tagesfokus erzeugen` klicken.
3. Unter `Produkte` 3 Produktchancen erfassen.
4. Die beste Produktchance pruefen.
5. Unter `eBay Listings` einen Listing-Entwurf anlegen.
6. Unter `Aufgaben` den naechsten konkreten Schritt speichern.
7. Am Ende `Export` klicken und Backup sichern.

---

## Warum Standalone zuerst?

Aktuell hast du keinen vollen Zugriff auf deinen Haupt-PC und Codex liegt dort.

Diese Standalone-Version gibt dir trotzdem ein nutzbares Company OS:

- ohne Build-Prozess
- ohne npm install
- ohne Codex
- ohne Vercel-Setup
- ohne Veraenderung am Haupt-Tool

Wenn die Struktur passt, wird sie spaeter in das Elyon Seller Tool integriert.

---

## Spaetere Integration ins Haupt-Tool

Die spaetere Integration kann so aussehen:

```text
Elyon Seller Tool

├── Dashboard
├── Produktworkflow
├── Listing-Workflow
├── KI / Elyon Soul
└── Company OS
    ├── Mission Control
    ├── Aufgaben
    ├── Projekte
    ├── Produkte
    ├── Listings
    ├── Finanzen
    └── CEO Regeln
```

Dabei koennen die Daten spaeter an bestehende Produkt- und Listingdaten angebunden werden.

Moegliche naechste technische Schritte:

1. Standalone testen.
2. Datenmodell stabilisieren.
3. UI in Elyon-Hauptfrontend uebernehmen.
4. LocalStorage-Daten mit Elyon-Daten zusammenfuehren.
5. Spaeter Sync ueber Supabase, Upstash oder Google Drive.

---

## Aktueller Status

Version: `1.0 Standalone Prototype`

Status:

- lauffaehige Einzeldatei
- lokale Speicherung
- Export / Import
- Vercel-Publishing vorbereitet ueber `scripts/prepare-vercel.mjs`
- noch keine API-Anbindung
- noch keine eBay-Automation
- noch keine echte KI-Anbindung

Ziel dieser Version: Struktur schaffen und sofort mit Business-Organisation starten.
