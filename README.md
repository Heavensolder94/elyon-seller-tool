# Elyon Seller Tool

## CJdropshipping connection

Set your CJ API key once:

```powershell
$env:CJ_API_KEY="your-api-key"
python src\main.py
```

What the app does:

- stores CJ tokens in `data/cj_tokens.json`
- refreshes access tokens automatically
- fetches CJ categories
- searches products by keyword or SKU
- reads product details and stock by variant
- prepares CJ order creation via the V2 shopping endpoint
- keeps the legacy `src/calculator.py` import path working as a shim

Useful environment variables:

- `CJ_API_KEY` for login
- `CJ_SAMPLE_QUERY` for a quick product search when starting `src/main.py`
- `CJ_SAMPLE_VARIANT` for a stock lookup demo
- `CJ_SAMPLE_ORDER` for a JSON order payload demo
- `EBAY_CLIENT_ID` for the eBay OAuth client ID
- `EBAY_CLIENT_SECRET` for the eBay OAuth client secret
- `EBAY_RUNAME` or `EBAY_REDIRECT_URI` for the eBay redirect value
- `EBAY_TOKEN_STORE_MODE=upstash` to persist the eBay refresh token across deploys
- `EBAY_TOKEN_STORE_URL` and `EBAY_TOKEN_STORE_TOKEN` for Upstash Redis storage
- `EBAY_TOKEN_STORE_KEY` if you want to override the default Redis key
- `EBAY_TOKEN_STORE_PATH` for local file fallback during local development
- `api/ebay/orders.js` automatically reads the stored refresh token from the shared token store

Do not commit `data/cj_tokens.json` to GitHub.

## Deploy auf Vercel

Diese App ist fuer Vercel vorbereitet:

- `index.html` ist das Frontend
- `api/*.js` sind Serverless Functions
- `vercel.json` routet die eBay-Callback- und Token-Seiten sauber auf die richtigen Ziele

Empfohlene Vercel-Umgebungsvariablen:

- `CJ_API_KEY`
- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EBAY_REDIRECT_URI` oder `EBAY_RUNAME`
- optional:
  - `EBAY_TOKEN_STORE_MODE=upstash`
  - `EBAY_TOKEN_STORE_URL`
  - `EBAY_TOKEN_STORE_TOKEN`
  - `EBAY_TOKEN_STORE_KEY`

Empfohlene Deploy-Schritte:

1. Repo auf GitHub pushen.
2. In Vercel `New Project` -> GitHub Repo importieren.
3. Die Variablen oben in `Project Settings` -> `Environment Variables` setzen.
4. Deploy starten.
5. Die eBay Redirect-URI im eBay Developer Portal auf die Vercel-URL setzen, z. B. `https://dein-projekt.vercel.app/ebay-callback`.

Wichtig:

- GitHub Pages reicht fuer das Frontend, aber nicht fuer die `api/`-Routen.
- Fuer vollstaendige Funktionalitaet brauchst du Vercel oder einen anderen Node/Serverless-Host.
