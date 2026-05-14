[CHATGPT_GUIDE.md](https://github.com/user-attachments/files/27757056/CHATGPT_GUIDE.md)
# ChatGPT / OpenAI Guide

Diese Datei beschreibt, wie die OpenAI- und ChatGPT-Funktionen im Elyon Seller Tool genutzt werden.

## Was im Tool ChatGPT nutzt

- `api/ai.js`
- `api/ai/listing-optimizer.js`
- `api/ai/product-search.js`

Diese Endpunkte verwenden OpenAI-Modelle und brauchen `OPENAI_API_KEY` in der Vercel-Umgebung.

## Welche Funktionen dazugehören

- Titel mit KI
- SEO / Tags mit KI
- Beschreibung mit KI
- Produktanalyse mit KI
- Listing verbessern / neu generieren / prüfen
- Produktsuche mit KI

## Welche Modelle verwendet werden

- Standard: `gpt-4o-mini`
- Falls gesetzt: `OPENAI_MODEL`
- Einzelne Aufgaben in `api/ai.js` laufen über denselben Standardpfad

## Welche Keys gebraucht werden

- `OPENAI_API_KEY` für ChatGPT / OpenAI
- `DEEPSEEK_API_KEY` für den Elyon-Soul-Chat

## Wichtige KI-Schalter in den Einstellungen

- `KI-Funktionen aktivieren`
- `OpenAI-Tools`
- `DeepSeek-Chat`
- `KI-Bestätigung`
- `Auto-Check beim Start`

## Verhalten der Schalter

- Wenn der Hauptschalter `KI-Funktionen aktivieren` aus ist, sind alle Unter-Schalter ebenfalls aus und gesperrt.
- Wenn der Hauptschalter wieder an ist, bleiben die Unter-Schalter zunächst aus.
- Die Unter-Schalter musst du dann einzeln wieder aktivieren.

## Lokaler Test

Beispiel für den zentralen OpenAI-Endpoint:

```powershell
Invoke-RestMethod -Method Post -Uri "https://elyon-seller-tool.vercel.app/api/ai" `
  -ContentType "application/json" `
  -Body '{"task":"title","prompt":"Erzeuge einen eBay-Titel für ein USB-C Ladegerät"}'
```

Beispiel für den Listing-Optimizer:

```powershell
Invoke-RestMethod -Method Post -Uri "https://elyon-seller-tool.vercel.app/api/ai/listing-optimizer" `
  -ContentType "application/json" `
  -Body '{"mode":"regenerate","product":{"productName":"USB-C Ladegerät","mainKeyword":"USB-C Ladegerät","features":"schnellladen, kompakt"}}'
```

## Erwartete Antwort

- `ok: true`
- `model: gpt-4o-mini` oder dein gesetzter `OPENAI_MODEL`
- `source: ai` oder `source: ai-listing-optimizer`

## Wenn etwas nicht läuft

1. In Vercel prüfen, ob `OPENAI_API_KEY` gesetzt ist.
2. In Vercel prüfen, ob die App neu deployt wurde.
3. Prüfen, ob der richtige Schalter in den Einstellungen aktiviert ist.
4. Falls die Route `405 Nur POST erlaubt` zurückgibt, wurde der Endpoint per GET statt POST aufgerufen.

