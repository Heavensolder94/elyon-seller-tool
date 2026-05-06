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

Do not commit `data/cj_tokens.json` to GitHub.
