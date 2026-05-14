# ChatGPT / OpenAI KI-Funktionen

Diese Datei ist die zentrale Referenz für die ChatGPT-, OpenAI- und KI-Funktionen im **Elyon Seller Tool**.

Sie dient als technische Orientierung für Entwicklung, Codex-Änderungen, Vercel-Konfiguration und spätere KI-Erweiterungen.

---

## Ziel dieser Datei

Diese Datei erklärt:

- welche KI-Funktionen im Tool existieren
- welche API-Endpunkte dafür genutzt werden
- welche Modelle und API-Keys gebraucht werden
- welche Einstellungen und Schalter relevant sind
- welche KI-Daten gesendet werden dürfen
- welche KI-Daten niemals gesendet werden dürfen
- welche Regeln Codex bei Änderungen beachten muss
- welche neue KI-Funktion als Nächstes geplant ist

---

## Was ChatGPT / OpenAI im Tool übernimmt

OpenAI bzw. ChatGPT wird im Elyon Seller Tool für produkt- und listingbezogene Aufgaben genutzt.

Aktuelle Hauptfunktionen:

- eBay-Titel generieren
- Beschreibung generieren
- Bulletpoints vorbereiten
- SEO-Keywords und Tags erzeugen
- Listing verbessern
- Listing neu generieren
- Listing prüfen
- Produktanalyse mit Score und Risiko-Hinweisen
- Produktsuche mit KI verbessern
- Nischenwinkel und Keyword-Ideen erzeugen

OpenAI soll vor allem helfen bei:

- besseren Produktentscheidungen
- besseren Listings
- klareren Produkttexten
- Risikoerkennung
- Marge- und Verkaufseinschätzung
- strukturierten Handlungsempfehlungen

---

## Was DeepSeek im Tool übernimmt

DeepSeek wird für **ELYON Soul** genutzt.

ELYON Soul ist ein Coach-/Chat-Overlay im Tool und soll den Nutzer bei Analyse, Orientierung und Arbeitsschritten unterstützen.

DeepSeek-Funktion:

- kurzer Business-Coach-Chat
- kompakte Produkt- oder Dashboard-Analyse
- lokale Regelantworten als Fallback, falls DeepSeek deaktiviert ist
- anonymisierte Produktdatenanalyse

---

## Relevante KI-Endpunkte

### OpenAI / ChatGPT

```txt
api/ai.js
api/ai/listing-optimizer.js
api/ai/product-search.js
```

### DeepSeek / ELYON Soul

```txt
api/elyon-soul.js
```

---

## Zentrale API-Routen

### Allgemeiner OpenAI-Endpunkt

```txt
POST /api/ai
```

Dieser Endpunkt ist für einfache strukturierte KI-Aufgaben zuständig.

Beispiel-Body:

```json
{
  "task": "title",
  "prompt": "Erzeuge einen eBay-Titel",
  "data": {}
}
```

### Listing-Optimizer

```txt
POST /api/ai/listing-optimizer
```

Wichtige Modi:

```txt
regenerate
improve
check
```

### Product-Search

```txt
POST /api/ai/product-search
```

Wichtige Modi:

```txt
improve
analyze
```

### Elyon Soul

```txt
POST /api/elyon-soul
```

Wichtige Aktionen:

```txt
action=chat
action=analyze
probe=true
```

---

## Aktuelle Tasks in `/api/ai`

Der zentrale OpenAI-Endpunkt unterstützt aktuell bzw. soll mindestens diese Tasks unterstützen:

```txt
title
description
tags
product_score
```

Bedeutung:

| Task | Zweck |
|---|---|
| `title` | eBay-Titel generieren |
| `description` | Produktbeschreibung generieren |
| `tags` | SEO-Tags / Keywords erzeugen |
| `product_score` | einfache Produktbewertung / Risikoanalyse |

---

## Geplante neue Hauptfunktion: KI Produktprüfung

Die nächste zentrale Erweiterung ist:

```txt
product_decision
```

Diese Funktion soll ein einzelnes Produkt bewerten und eine klare Entscheidungshilfe geben.

### Ziel

Auf jeder Produktkarte soll ein Button erscheinen:

```txt
KI prüfen
```

Nach Klick soll das aktuelle Produkt an `/api/ai` gesendet werden.

Der Task lautet:

```txt
product_decision
```

Die KI soll kein langes Fließtext-Ergebnis zurückgeben, sondern eine strukturierte JSON-Antwort.

---

## Erwartete JSON-Antwort für `product_decision`

```json
{
  "score": 0,
  "decision": "GO | TEST | NO",
  "riskLevel": "low | medium | high",
  "compliance": "green | yellow | red",
  "profitVerdict": "good | tight | bad",
  "publishReady": false,
  "shortSummary": "",
  "warnings": [],
  "nextSteps": []
}
```

### Feldbedeutung

| Feld | Bedeutung |
|---|---|
| `score` | Bewertung von 0 bis 100 |
| `decision` | klare Entscheidung: `GO`, `TEST` oder `NO` |
| `riskLevel` | Gesamtrisiko: `low`, `medium`, `high` |
| `compliance` | Compliance-Ampel: `green`, `yellow`, `red` |
| `profitVerdict` | Margenbewertung: `good`, `tight`, `bad` |
| `publishReady` | ob das Produkt grundsätzlich listingbereit ist |
| `shortSummary` | kurze deutsche Zusammenfassung |
| `warnings` | konkrete Warnhinweise |
| `nextSteps` | konkrete nächste Schritte |

---

## Was `product_decision` bewerten soll

Die KI soll folgende Produktdaten berücksichtigen, sofern vorhanden:

- Produktname
- Einkaufspreis
- Verkaufspreis
- Versandkosten
- berechnete Marge
- Lieferzeit
- Supplier
- Kategorie
- Beschreibung
- Produktbilder-Hinweise, falls vorhanden
- Wettbewerb / eBay-Konkurrenzdaten
- Risiko-Status
- Retourenrisiko
- Lieferzeitrisiko
- Qualitätsrisiko
- mögliche Compliance-Themen

### Compliance-Themen

Die KI soll besonders auf diese Risiken achten:

- Elektronik
- Akku
- Batterie
- CE-Relevanz
- Markenrisiko
- geschützte Begriffe / Trademark
- LUCID
- WEEE
- BattG
- Kinderprodukte
- Kosmetik
- Lebensmittel
- Medizin-/Gesundheitsversprechen
- gefährliche oder regulierte Produkte

---

## Wichtig bei `product_decision`

Die Funktion darf:

- beraten
- warnen
- strukturieren
- Score und Entscheidung ausgeben
- nächste Schritte empfehlen

Die Funktion darf nicht:

- automatisch bei eBay veröffentlichen
- automatisch Bestellungen auslösen
- automatisch Kunden kontaktieren
- Kundendaten an OpenAI senden
- API-Keys ins Frontend schreiben
- rechtliche Beratung vortäuschen

---

## Frontend-Anzeige für KI Produktprüfung

Nach erfolgreicher Analyse soll auf der Produktkarte angezeigt werden:

- Score
- `GO` / `TEST` / `NO`
- Compliance-Ampel
- Marge-Einschätzung
- wichtigste Warnung
- nächster Schritt
- kurze Zusammenfassung

Beispiel:

```txt
KI-Entscheidung: TEST
Score: 74/100
Compliance: GELB
Marge: knapp
Warnung: Mögliche WEEE/BATT-Relevanz prüfen.
Nächster Schritt: Supplier-Daten und Preisgrenze kontrollieren.
```

---

## Speicherung der KI-Produktprüfung

Das Ergebnis soll am Produkt gespeichert werden.

Bevorzugt:

```js
product.aiDecision
```

Alternativ, wenn es besser zur vorhandenen Struktur passt:

```js
product.ai
```

Beispiel:

```json
{
  "aiDecision": {
    "score": 74,
    "decision": "TEST",
    "riskLevel": "medium",
    "compliance": "yellow",
    "profitVerdict": "tight",
    "publishReady": false,
    "shortSummary": "Interessantes Produkt, aber vor Veröffentlichung müssen Marge und Compliance geprüft werden.",
    "warnings": [
      "Mögliche WEEE/BATT-Relevanz prüfen",
      "Marge ist nur knapp tragfähig"
    ],
    "nextSteps": [
      "Supplier-Daten kontrollieren",
      "Verkaufspreis mindestens auf Zielmarge prüfen",
      "Compliance-Hinweis ergänzen"
    ],
    "checkedAt": "2026-05-14"
  }
}
```

---

## Filter für KI Produktprüfung

Im Produktbereich soll ein einfacher Filter ergänzt werden:

```txt
Alle
KI ungeprüft
GO
TEST
NO
Compliance gelb/rot
```

Wichtig:

- keine bestehenden Filter zerstören
- vorhandene Filterlogik erweitern
- keine parallele neue Produktliste bauen
- bestehende Produktkarten weiterverwenden

---

## Modelle

### OpenAI

Standardmodell:

```txt
gpt-4o-mini
```

Optional überschreibbar über:

```txt
OPENAI_MODEL
```

Empfehlung:

- `gpt-4o-mini` für günstige Standardaufgaben
- optional später stärkeres Modell für komplexere Produktentscheidungen
- Modellwahl zentral über `OPENAI_MODEL`, nicht hart im Frontend

### DeepSeek

Für ELYON Soul:

```txt
deepseek-v4-flash
```

Falls später geändert, soll das Modell ebenfalls zentral im Backend oder über Umgebungsvariable gesteuert werden.

---

## Benötigte API-Keys

### OpenAI

```txt
OPENAI_API_KEY
```

Aktiviert:

- `/api/ai`
- `/api/ai/listing-optimizer`
- `/api/ai/product-search`

Optional:

```txt
OPENAI_MODEL
```

### DeepSeek

```txt
DEEPSEEK_API_KEY
```

Aktiviert:

- `/api/elyon-soul`

---

## Vercel Environment Variables

In Vercel sollten für KI mindestens gesetzt sein:

```txt
OPENAI_API_KEY
OPENAI_MODEL
DEEPSEEK_API_KEY
```

`OPENAI_MODEL` ist optional.

Wichtig:

- API-Keys niemals in `index.html`
- API-Keys niemals in `elyon-ui.js`
- API-Keys niemals in `elyon-soul.js`
- API-Keys niemals in GitHub committen
- API-Keys nur in Vercel Environment Variables speichern

---

## KI-Schalter in den Einstellungen

### Hauptschalter

```txt
KI-Funktionen aktivieren
```

Wenn dieser Hauptschalter aus ist:

- werden KI-Unterfunktionen deaktiviert
- werden KI-Buttons gesperrt oder zeigen einen Hinweis
- werden keine OpenAI-Anfragen ausgeführt
- werden keine DeepSeek-Anfragen ausgeführt
- lokale Regelmodi dürfen weiter funktionieren

### Wichtige Unter-Schalter

```txt
OpenAI-Tools
DeepSeek-Chat
KI-Bestätigung
Auto-Check beim Start
```

Weitere mögliche Funktionsschalter:

```txt
Listing verbessern
Listing neu generieren
Listing prüfen
Produktsuche verbessern
Produktidee prüfen
Titel mit KI
Beschreibung mit KI
SEO / Tags mit KI
Produktanalyse mit KI
```

Hinweis:

Die konkrete Benennung der Schalter muss mit dem Frontend-Code abgeglichen werden. Falls ein Schalter im Frontend nicht existiert, darf Codex keinen neuen Pflichtschalter erzwingen, sondern soll vorhandene Einstellungen wiederverwenden.

---

## Verhalten der Schalter

### Hauptschalter aus

Wenn `KI-Funktionen aktivieren` aus ist:

- alle KI-Unterfunktionen sind deaktiviert
- KI-Buttons sollen nicht abstürzen
- Nutzer erhält eine verständliche Meldung
- lokale Standardfunktionen bleiben nutzbar

### Hauptschalter wieder an

Wenn `KI-Funktionen aktivieren` wieder eingeschaltet wird:

- Unter-Schalter bleiben zunächst aus, falls das bestehende Tool so arbeitet
- gewünschte Unter-Schalter müssen einzeln aktiviert werden
- keine versteckten automatischen KI-Kosten auslösen

### OpenAI-Tools aus

Wenn `OpenAI-Tools` aus ist:

- keine Anfrage an `/api/ai`
- keine Anfrage an `/api/ai/listing-optimizer`
- keine Anfrage an `/api/ai/product-search`

### DeepSeek-Chat aus

Wenn `DeepSeek-Chat` aus ist:

- keine Anfrage an `/api/elyon-soul`
- ELYON Soul darf lokal im Regelmodus antworten, falls implementiert

---

## KI-Bestätigung / Kostenwarnung

Wenn `KI-Bestätigung` aktiv ist, soll vor kostenpflichtigen KI-Aktionen ein Hinweis erscheinen.

Beispiel:

```txt
Diese Aktion nutzt KI und kann API-Kosten verursachen. Fortfahren?
```

Wichtig:

- keine Panikmeldung
- klarer Hinweis
- Nutzer entscheidet bewusst
- Batch-Aktionen besonders absichern

---

## Antwortstil und Limit

Das Tool kann Antwortstile anbieten:

```txt
Ausgewogen
Knapp
Gründlich
```

Mögliche Nutzung:

| Stil | Verhalten |
|---|---|
| `Knapp` | kurze kompakte Antworten |
| `Ausgewogen` | Standard |
| `Gründlich` | ausführlichere Analyse |

Tägliches KI-Limit:

- das Tool kann KI-Anfragen pro Tag begrenzen
- bei Limit-Erreichung soll eine klare Meldung erscheinen
- keine Endlosschleifen oder wiederholten API-Versuche

---

## Wichtige Buttons im Tool

Bestehende oder geplante KI-Buttons:

```txt
Mit KI verbessern
KI neu generieren
Listing prüfen
Suche mit KI verbessern
Produktidee prüfen
Titel mit KI
Beschreibung mit KI
SEO / Tags mit KI
Produktanalyse mit KI
KI prüfen
KI-Kostenwarnung
```

Der neue Button für die Produktentscheidung lautet:

```txt
KI prüfen
```

---

## Datenschutz bei KI-Anfragen

### Niemals an OpenAI oder DeepSeek senden

```txt
Kundennamen
E-Mail-Adressen
Telefonnummern
vollständige Lieferadressen
Bestellnummern
Zahlungsdaten
private Kundennotizen
eBay Refresh Tokens
CJ Tokens
API-Keys
interne Secrets
```

### Erlaubt für KI-Anfragen

```txt
anonymisierte Produktdaten
Produktname
Kategorie
Einkaufspreis
Verkaufspreis
Versandkosten
Marge
Lieferzeit
Supplier-Name
öffentliche Produktbeschreibung
Listing-Entwurf
SEO-Keywords
Risiko-Status
Wettbewerbsdaten
```

### Grundregel

KI soll Produkt- und Listingdaten analysieren, aber keine personenbezogenen Kundendaten erhalten.

---

## Sicherheitsregeln

KI-Funktionen dürfen nicht:

- automatisch eBay-Angebote veröffentlichen
- automatisch Kunden anschreiben
- automatisch Supplier-Bestellungen auslösen
- automatisch Geld bewegen
- rechtlich verbindliche Aussagen treffen
- API-Keys im Frontend sichtbar machen
- geheime Tokens in Logs ausgeben

KI-Funktionen dürfen:

- Vorschläge machen
- Warnungen anzeigen
- Texte vorbereiten
- Listings bewerten
- Produktentscheidungen empfehlen
- To-dos erzeugen
- strukturierte JSON-Ergebnisse liefern

---

## Codex-Regeln für KI-Änderungen

Codex darf:

- bestehende KI-Endpunkte erweitern
- neue Tasks ergänzen
- UI-Buttons minimal-invasiv ergänzen
- bestehende Produktkarten erweitern
- vorhandene Filterlogik ergänzen
- Fehlerhinweise verbessern
- lokale Speicherung ergänzen
- JSON-Antworten strukturieren

Codex darf nicht:

- bestehende Funktionen löschen
- bestehende Buttons entfernen
- bestehende Datenstrukturen ohne Not umbauen
- API-Keys hardcoden
- Secrets ins Frontend schreiben
- Kundendaten ungefiltert an KI senden
- eBay-Veröffentlichung automatisieren
- Bestellungen automatisiert auslösen
- neue parallele Produktlisten bauen
- das gesamte Tool neu schreiben
- unnötig große Layout-Änderungen machen

---

## Erwartete Antwortformate

### Erfolgreicher OpenAI-Request

```json
{
  "ok": true,
  "model": "gpt-4o-mini",
  "source": "ai"
}
```

### Erfolgreiche Produktentscheidung

```json
{
  "ok": true,
  "source": "ai",
  "model": "gpt-4o-mini",
  "result": {
    "score": 74,
    "decision": "TEST",
    "riskLevel": "medium",
    "compliance": "yellow",
    "profitVerdict": "tight",
    "publishReady": false,
    "shortSummary": "Das Produkt ist interessant, aber vor Veröffentlichung müssen Marge und Compliance geprüft werden.",
    "warnings": [
      "Mögliche WEEE/BATT-Relevanz",
      "Marge nur knapp tragfähig"
    ],
    "nextSteps": [
      "Supplier-Daten prüfen",
      "Verkaufspreis erhöhen",
      "Compliance prüfen"
    ]
  }
}
```

### Wenn KI deaktiviert ist

```txt
KI ist in den Einstellungen deaktiviert.
```

oder:

```txt
OpenAI ist in den Einstellungen deaktiviert.
```

### Wenn API-Key fehlt

```txt
OPENAI_API_KEY ist nicht gesetzt.
```

oder:

```txt
DEEPSEEK_API_KEY ist nicht gesetzt.
```

---

## Praktische Testbefehle

### Zentraler OpenAI-Endpunkt: Titel

```powershell
Invoke-RestMethod -Method Post -Uri "https://elyon-seller-tool.vercel.app/api/ai" `
  -ContentType "application/json" `
  -Body '{"task":"title","prompt":"Erzeuge einen eBay-Titel für ein USB-C Ladegerät"}'
```

### Listing-Optimizer

```powershell
Invoke-RestMethod -Method Post -Uri "https://elyon-seller-tool.vercel.app/api/ai/listing-optimizer" `
  -ContentType "application/json" `
  -Body '{"mode":"regenerate","product":{"productName":"USB-C Ladegerät","mainKeyword":"USB-C Ladegerät","features":"schnellladen, kompakt"}}'
```

### Produktsuche

```powershell
Invoke-RestMethod -Method Post -Uri "https://elyon-seller-tool.vercel.app/api/ai/product-search" `
  -ContentType "application/json" `
  -Body '{"mode":"improve","query":"USB-C Ladegerät","product":{"name":"USB-C Ladegerät"}}'
```

### Neue Produktentscheidung testen

```powershell
Invoke-RestMethod -Method Post -Uri "https://elyon-seller-tool.vercel.app/api/ai" `
  -ContentType "application/json" `
  -Body '{
    "task":"product_decision",
    "prompt":"Prüfe dieses Produkt für eBay Dropshipping.",
    "data":{
      "productName":"USB-C Ladegerät 20W",
      "buyPrice":6.50,
      "sellPrice":19.99,
      "shippingCost":0,
      "supplier":"CJdropshipping",
      "deliveryTime":"7-12 Tage",
      "category":"Elektronik Zubehör",
      "description":"Kompaktes USB-C Ladegerät mit Schnellladefunktion"
    }
  }'
```

Erwartung:

```json
{
  "ok": true,
  "result": {
    "score": 0,
    "decision": "GO | TEST | NO",
    "riskLevel": "low | medium | high",
    "compliance": "green | yellow | red",
    "profitVerdict": "good | tight | bad",
    "publishReady": false,
    "shortSummary": "",
    "warnings": [],
    "nextSteps": []
  }
}
```

### DeepSeek / Elyon Soul Probe

```powershell
Invoke-RestMethod -Method Post -Uri "https://elyon-seller-tool.vercel.app/api/elyon-soul" `
  -ContentType "application/json" `
  -Body '{"probe":true}'
```

---

## Wenn etwas nicht läuft

### OpenAI antwortet nicht

1. Prüfen, ob `OPENAI_API_KEY` in Vercel gesetzt ist.
2. Prüfen, ob `OPENAI_MODEL` korrekt ist oder leer bleiben darf.
3. Prüfen, ob die App nach Änderungen neu deployed wurde.
4. Prüfen, ob `KI-Funktionen aktivieren` eingeschaltet ist.
5. Prüfen, ob `OpenAI-Tools` eingeschaltet ist.
6. Vercel Function Logs prüfen.

### DeepSeek / Elyon Soul antwortet nicht

1. Prüfen, ob `DEEPSEEK_API_KEY` in Vercel gesetzt ist.
2. Prüfen, ob `DeepSeek-Chat` aktiviert ist.
3. Prüfen, ob der Regelmodus greift.
4. Vercel Function Logs prüfen.

### 405 Fehler

Wenn der Endpoint antwortet:

```txt
405 Nur POST erlaubt
```

Dann wurde der Endpoint wahrscheinlich per GET statt POST aufgerufen.

Lösung:

- PowerShell-Test mit `-Method Post` nutzen
- Frontend-Fetch muss `method: "POST"` verwenden

### FUNCTION_INVOCATION_FAILED

Bei:

```txt
FUNCTION_INVOCATION_FAILED
```

Prüfen:

- Vercel Function Logs
- fehlende Environment Variables
- Syntaxfehler im Endpoint
- ungültiges JSON
- OpenAI/DeepSeek API-Fehler
- Timeout

---

## Testplan nach Codex-Änderungen

Nach Einbau von `product_decision`:

1. Vercel Deploy abwarten.
2. `/api/ai` mit PowerShell und Task `product_decision` testen.
3. Prüfen, ob JSON zurückkommt.
4. Elyon Seller Tool öffnen.
5. Ein Produkt öffnen oder erstellen.
6. Button `KI prüfen` klicken.
7. Prüfen, ob Score angezeigt wird.
8. Prüfen, ob `GO`, `TEST` oder `NO` angezeigt wird.
9. Prüfen, ob Compliance-Ampel angezeigt wird.
10. Seite neu laden.
11. Prüfen, ob Ergebnis gespeichert bleibt.
12. Filter testen:
    - Alle
    - KI ungeprüft
    - GO
    - TEST
    - NO
    - Compliance gelb/rot
13. KI-Schalter deaktivieren und prüfen, ob verständliche Fehlermeldung erscheint.
14. Prüfen, dass keine eBay-Veröffentlichung ausgelöst wird.
15. Prüfen, dass keine Kundendaten an OpenAI gesendet werden.

---

## Kurzfassung

- ChatGPT/OpenAI = Listing, Suche, Titel, Beschreibung, SEO, Produktanalyse und künftig `product_decision`
- DeepSeek = ELYON Soul Chat / Coach
- Hauptschalter `KI-Funktionen aktivieren` steuert KI global
- `OpenAI-Tools` steuert OpenAI-Funktionen
- `DeepSeek-Chat` steuert Elyon Soul
- `product_decision` ist die nächste zentrale KI-Funktion
- KI darf beraten, aber nichts automatisch veröffentlichen oder bestellen
- Kundendaten und Secrets dürfen niemals an KI gesendet werden
