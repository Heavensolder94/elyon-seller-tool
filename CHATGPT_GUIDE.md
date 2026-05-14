# ChatGPT / OpenAI KI-Funktionen

Diese Datei ist die zentrale Referenz fuer die ChatGPT-, OpenAI- und KI-Funktionen im **Elyon Seller Tool**.

Sie dient als technische Orientierung fuer Entwicklung, Codex-Aenderungen, Vercel-Konfiguration und spaetere KI-Erweiterungen.

---

## Ziel dieser Datei

Diese Datei erklaert:

- welche KI-Funktionen im Tool existieren
- welche API-Endpunkte dafuer genutzt werden
- welche Modelle und API-Keys gebraucht werden
- welche Einstellungen und Schalter relevant sind
- welche KI-Daten gesendet werden duerfen
- welche KI-Daten niemals gesendet werden duerfen
- welche Regeln Codex bei Aenderungen beachten muss
- welche neue KI-Funktion als naechstes geplant ist

---

## Was ChatGPT / OpenAI im Tool uebernimmt

OpenAI bzw. ChatGPT wird im Elyon Seller Tool fuer produkt- und listingbezogene Aufgaben genutzt.

Aktuelle Hauptfunktionen:

- eBay-Titel generieren
- Beschreibung generieren
- Bulletpoints vorbereiten
- SEO-Keywords und Tags erzeugen
- Listing verbessern
- Listing neu generieren
- Listing pruefen
- Produktanalyse mit Score und Risiko-Hinweisen
- Produktpruefung fuer einzelne Produkte
- Produktsuche mit KI verbessern
- Nischenwinkel und Keyword-Ideen erzeugen

OpenAI soll vor allem helfen bei:

- besseren Produktentscheidungen
- besseren Listings
- klareren Produkttexten
- Risikoerkennung
- Marge- und Verkaufseinschaetzung
- strukturierten Handlungsempfehlungen

---

## Was DeepSeek im Tool uebernimmt

DeepSeek wird fuer **ELYON Soul** genutzt.

ELYON Soul ist ein Coach-/Chat-Overlay im Tool und soll den Nutzer bei Analyse, Orientierung und Arbeitsschritten unterstuetzen.

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

Dieser Endpunkt ist fuer einfache strukturierte KI-Aufgaben zustaendig.

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

Der zentrale OpenAI-Endpunkt unterstuetzt aktuell bzw. soll mindestens diese Tasks unterstuetzen:

```txt
title
description
tags
product_score
product_decision
```

Bedeutung:

| Task | Zweck |
|---|---|
| `title` | eBay-Titel generieren |
| `description` | Produktbeschreibung generieren |
| `tags` | SEO-Tags / Keywords erzeugen |
| `product_score` | einfache Produktbewertung / Risikoanalyse |
| `product_decision` | einzelne Produktentscheidung mit GO / TEST / NO |

---

## Geplante / zentrale Funktion: KI Produktpruefung

Die Produktpruefung soll ein einzelnes Produkt bewerten und eine klare Entscheidungshilfe geben.

### Ziel

Auf jeder Produktkarte soll ein Button erscheinen:

```txt
KI pruefen
```

Nach Klick soll das aktuelle Produkt an `/api/ai` gesendet werden.

Der Task lautet:

```txt
product_decision
```

Die KI soll kein langes Fliesstext-Ergebnis zurueckgeben, sondern eine strukturierte JSON-Antwort.

---

## Erwartete JSON-Antwort fuer `product_decision`

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
| `publishReady` | ob das Produkt grundsaetzlich listingbereit ist |
| `shortSummary` | kurze deutsche Zusammenfassung |
| `warnings` | konkrete Warnhinweise |
| `nextSteps` | konkrete naechste Schritte |

---

## Was `product_decision` bewerten soll

Die KI soll folgende Produktdaten beruecksichtigen, sofern vorhanden:

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
- Qualitaetsrisiko
- moegliche Compliance-Themen

### Compliance-Themen

Die KI soll besonders auf diese Risiken achten:

- Elektronik
- Akku
- Batterie
- CE-Relevanz
- Markenrisiko
- geschuetzte Begriffe / Trademark
- LUCID
- WEEE
- BattG
- Kinderprodukte
- Kosmetik
- Lebensmittel
- Medizin-/Gesundheitsversprechen
- gefaehrliche oder regulierte Produkte

---

## Wichtig bei `product_decision`

Die Funktion darf:

- beraten
- warnen
- strukturieren
- Score und Entscheidung ausgeben
- naechste Schritte empfehlen

Die Funktion darf nicht:

- automatisch bei eBay veroeffentlichen
- automatisch Bestellungen ausloesen
- automatisch Kunden kontaktieren
- Kundendaten an OpenAI senden
- API-Keys ins Frontend schreiben
- rechtliche Beratung vortaeuschen

---

## Frontend-Anzeige fuer KI Produktpruefung

Nach erfolgreicher Analyse soll auf der Produktkarte angezeigt werden:

- Score
- `GO` / `TEST` / `NO`
- Compliance-Ampel
- Marge-Einschaetzung
- wichtigste Warnung
- naechster Schritt
- kurze Zusammenfassung

Beispiel:

```txt
KI-Entscheidung: TEST
Score: 74/100
Compliance: GELB
Marge: knapp
Warnung: Moegliche WEEE/BATT-Relevanz pruefen.
Naechster Schritt: Supplier-Daten und Preisgrenze kontrollieren.
```

---

## Speicherung der KI-Produktpruefung

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
    "shortSummary": "Interessantes Produkt, aber vor Veroeffentlichung muessen Marge und Compliance geprueft werden.",
    "warnings": [
      "Moegliche WEEE/BATT-Relevanz pruefen",
      "Marge ist nur knapp tragfaehig"
    ],
    "nextSteps": [
      "Supplier-Daten kontrollieren",
      "Verkaufspreis mindestens auf Zielmarge pruefen",
      "Compliance-Hinweis ergaenzen"
    ],
    "checkedAt": "2026-05-14"
  }
}
```

---

## Filter fuer KI Produktpruefung

Im Produktbereich soll ein einfacher Filter ergaenzt werden:

```txt
Alle
KI ungeprueft
GO
TEST
NO
Compliance gelb/rot
```

Wichtig:

- keine bestehenden Filter zerstoeren
- vorhandene Filterlogik erweitern
- keine parallele neue Produktliste bauen
- bestehende Produktkarten weiterverwenden

---

## Modelle

Die Modellwahl soll zentral im Backend oder ueber Umgebungsvariablen gesteuert werden.

Empfehlung:

- Standardmodell fuer einfache Aufgaben
- optional staerkeres Modell fuer komplexe Produktentscheidungen
- Modellwahl nicht hart im Frontend kodieren

---

## Benoetigte API-Keys

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

In Vercel sollten fuer KI mindestens gesetzt sein:

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
- werden keine OpenAI-Anfragen ausgefuehrt
- werden keine DeepSeek-Anfragen ausgefuehrt
- lokale Regelmodi duerfen weiter funktionieren

### Wichtige Unter-Schalter

```txt
OpenAI-Tools
DeepSeek-Chat
KI-Bestaetigung
Auto-Check beim Start
```

Weitere moegliche Funktionsschalter:

```txt
Listing verbessern
Listing neu generieren
Listing pruefen
Produktsuche verbessern
Produktidee pruefen
Titel mit KI
Beschreibung mit KI
SEO / Tags mit KI
Produktanalyse mit KI
KI pruefen
```

Hinweis:

Die konkrete Benennung der Schalter muss mit dem Frontend-Code abgeglichen werden. Falls ein Schalter im Frontend nicht existiert, darf Codex keinen neuen Pflichtschalter erzwingen, sondern soll vorhandene Einstellungen wiederverwenden.

---

## Verhalten der Schalter

### Hauptschalter aus

Wenn `KI-Funktionen aktivieren` aus ist:

- alle KI-Unterfunktionen sind deaktiviert
- KI-Buttons sollen nicht abstuerzen
- Nutzer erhaelt eine verstaendliche Meldung
- lokale Standardfunktionen bleiben nutzbar

### Hauptschalter wieder an

Wenn `KI-Funktionen aktivieren` wieder eingeschaltet wird:

- Unter-Schalter bleiben zunaechst aus, falls das bestehende Tool so arbeitet
- gewuenschte Unter-Schalter muessen einzeln aktiviert werden
- keine versteckten automatischen KI-Kosten ausloesen

### OpenAI-Tools aus

Wenn `OpenAI-Tools` aus ist:

- keine Anfrage an `/api/ai`
- keine Anfrage an `/api/ai/listing-optimizer`
- keine Anfrage an `/api/ai/product-search`

### DeepSeek-Chat aus

Wenn `DeepSeek-Chat` aus ist:

- keine Anfrage an `/api/elyon-soul`
- ELYON Soul darf lokal im Regelmodus antworten, falls implementiert

### KI-Bestaetigung

Wenn `KI-Bestaetigung` aktiv ist, soll vor kostenpflichtigen KI-Aktionen ein Hinweis erscheinen.

Beispiel:

```txt
Diese Aktion nutzt KI und kann API-Kosten verursachen. Fortfahren?
```

---

## Datenschutz bei KI-Anfragen

### Niemals an OpenAI oder DeepSeek senden

```txt
Kundennamen
E-Mail-Adressen
Telefonnummern
vollstaendige Lieferadressen
Bestellnummern
Zahlungsdaten
private Kundennotizen
eBay Refresh Tokens
CJ Tokens
API-Keys
interne Secrets
```

### Erlaubt fuer KI-Anfragen

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
oeffentliche Produktbeschreibung
Listing-Entwurf
SEO-Keywords
Risiko-Status
Wettbewerbsdaten
```

### Grundregel

KI soll Produkt- und Listingdaten analysieren, aber keine personenbezogenen Kundendaten erhalten.

---

## Sicherheitsregeln

KI-Funktionen duerfen nicht:

- automatisch eBay-Angebote veroeffentlichen
- automatisch Kunden anschreiben
- automatisch Supplier-Bestellungen ausloesen
- automatisch Geld bewegen
- rechtlich verbindliche Aussagen treffen
- API-Keys im Frontend sichtbar machen
- geheime Tokens in Logs ausgeben

KI-Funktionen duerfen:

- Vorschlaege machen
- Warnungen anzeigen
- Texte vorbereiten
- Listings bewerten
- Produktentscheidungen empfehlen
- To-dos erzeugen
- strukturierte JSON-Ergebnisse liefern

---

## Codex-Regeln fuer KI-Aenderungen

Codex darf:

- bestehende KI-Endpunkte erweitern
- neue Tasks ergaenzen
- UI-Buttons minimal-invasiv ergaenzen
- bestehende Produktkarten erweitern
- vorhandene Filterlogik ergaenzen
- Fehlerhinweise verbessern
- lokale Speicherung ergaenzen
- JSON-Antworten strukturieren

Codex darf nicht:

- bestehende Funktionen loeschen
- bestehende Buttons entfernen
- bestehende Datenstrukturen ohne Not umbauen
- API-Keys hardcoden
- Secrets ins Frontend schreiben
- Kundendaten ungefiltert an KI senden
- eBay-Veroeffentlichung automatisieren
- Bestellungen automatisiert ausloesen
- neue parallele Produktlisten bauen
- das gesamte Tool neu schreiben
- unnoetig grosse Layout-Aenderungen machen

---

## Erwartete Antwortformate

### Erfolgreicher OpenAI-Request

```json
{
  "ok": true,
  "source": "ai"
}
```

### Erfolgreiche Produktentscheidung

```json
{
  "ok": true,
  "source": "ai",
  "result": {
    "score": 74,
    "decision": "TEST",
    "riskLevel": "medium",
    "compliance": "yellow",
    "profitVerdict": "tight",
    "publishReady": false,
    "shortSummary": "Das Produkt ist interessant, aber vor Veroeffentlichung muessen Marge und Compliance geprueft werden.",
    "warnings": [
      "Moegliche WEEE/BATT-Relevanz",
      "Marge nur knapp tragfaehig"
    ],
    "nextSteps": [
      "Supplier-Daten pruefen",
      "Verkaufspreis erhoehen",
      "Compliance pruefen"
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
  -Body '{"task":"title","prompt":"Erzeuge einen eBay-Titel fuer ein USB-C Ladegeraet"}'
```

### Listing-Optimizer

```powershell
Invoke-RestMethod -Method Post -Uri "https://elyon-seller-tool.vercel.app/api/ai/listing-optimizer" `
  -ContentType "application/json" `
  -Body '{"mode":"regenerate","product":{"productName":"USB-C Ladegeraet","mainKeyword":"USB-C Ladegeraet","features":"schnellladen, kompakt"}}'
```

### Produktsuche

```powershell
Invoke-RestMethod -Method Post -Uri "https://elyon-seller-tool.vercel.app/api/ai/product-search" `
  -ContentType "application/json" `
  -Body '{"mode":"improve","query":"USB-C Ladegeraet","product":{"name":"USB-C Ladegeraet"}}'
```

### Neue Produktentscheidung testen

```powershell
Invoke-RestMethod -Method Post -Uri "https://elyon-seller-tool.vercel.app/api/ai" `
  -ContentType "application/json" `
  -Body '{
    "task":"product_decision",
    "prompt":"Pruefe dieses Produkt fuer eBay Dropshipping.",
    "data":{
      "productName":"USB-C Ladegeraet 20W",
      "buyPrice":6.50,
      "sellPrice":19.99,
      "shippingCost":0,
      "supplier":"CJdropshipping",
      "deliveryTime":"7-12 Tage",
      "category":"Elektronik Zubehoer",
      "description":"Kompaktes USB-C Ladegeraet mit Schnellladefunktion"
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

## Wenn etwas nicht laeuft

### OpenAI antwortet nicht

1. Pruefen, ob `OPENAI_API_KEY` in Vercel gesetzt ist.
2. Pruefen, ob `OPENAI_MODEL` korrekt ist oder leer bleiben darf.
3. Pruefen, ob die App nach Aenderungen neu deployed wurde.
4. Pruefen, ob `KI-Funktionen aktivieren` eingeschaltet ist.
5. Pruefen, ob `OpenAI-Tools` eingeschaltet ist.
6. Vercel Function Logs pruefen.

### DeepSeek / Elyon Soul antwortet nicht

1. Pruefen, ob `DEEPSEEK_API_KEY` in Vercel gesetzt ist.
2. Pruefen, ob `DeepSeek-Chat` aktiviert ist.
3. Pruefen, ob der Regelmodus greift.
4. Vercel Function Logs pruefen.

### 405 Fehler

Wenn der Endpoint antwortet:

```txt
405 Nur POST erlaubt
```

Dann wurde der Endpoint wahrscheinlich per GET statt POST aufgerufen.

Loesung:

- PowerShell-Test mit `-Method Post` nutzen
- Frontend-Fetch muss `method: "POST"` verwenden

### FUNCTION_INVOCATION_FAILED

Bei:

```txt
FUNCTION_INVOCATION_FAILED
```

Pruefen:

- Vercel Function Logs
- fehlende Environment Variables
- Syntaxfehler im Endpoint
- ungueltiges JSON
- OpenAI/DeepSeek API-Fehler
- Timeout

---

## Testplan nach Codex-Aenderungen

Nach Einbau von `product_decision`:

1. Vercel Deploy abwarten.
2. `/api/ai` mit PowerShell und Task `product_decision` testen.
3. Pruefen, ob JSON zurueckkommt.
4. Elyon Seller Tool oeffnen.
5. Ein Produkt oeffnen oder erstellen.
6. Button `KI pruefen` klicken.
7. Pruefen, ob Score angezeigt wird.
8. Pruefen, ob `GO`, `TEST` oder `NO` angezeigt wird.
9. Pruefen, ob Compliance-Ampel angezeigt wird.
10. Seite neu laden.
11. Pruefen, ob Ergebnis gespeichert bleibt.
12. Filter testen:
    - Alle
    - KI ungeprueft
    - GO
    - TEST
    - NO
    - Compliance gelb/rot
13. KI-Schalter deaktivieren und pruefen, ob verstaendliche Fehlermeldung erscheint.
14. Pruefen, dass keine eBay-Veroeffentlichung ausgeloest wird.
15. Pruefen, dass keine Kundendaten an OpenAI gesendet werden.

---

## Kurzfassung

- ChatGPT/OpenAI = Listing, Suche, Titel, Beschreibung, SEO, Produktanalyse und `product_decision`
- DeepSeek = ELYON Soul Chat / Coach
- Hauptschalter `KI-Funktionen aktivieren` steuert KI global
- `OpenAI-Tools` steuert OpenAI-Funktionen
- `DeepSeek-Chat` steuert Elyon Soul
- `product_decision` ist die zentrale Produktpruefung
- KI darf beraten, aber nichts automatisch veroeffentlichen oder bestellen
- Kundendaten und Secrets duerfen niemals an KI gesendet werden
