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
- fetches CJ categories and a small sample product list

Do not commit `data/cj_tokens.json` to GitHub.
