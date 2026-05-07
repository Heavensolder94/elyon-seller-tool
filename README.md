# Elyon Seller Tool

Dark SaaS dashboard for eBay and CJ Dropshipping product research, with Vercel serverless API routes for status checks, eBay OAuth/token handling, eBay search, CJ search, and orders.

## Vercel Deployment

This repository is prepared for Vercel Hobby by keeping the number of serverless functions low.

Important files:

- `index.html` is the dashboard source.
- `public/` is the static output directory used by Vercel.
- `scripts/prepare-vercel.mjs` mirrors `index.html` into `public/index.html` during the build.
- `api/ebay.js` consolidates the eBay API routes into one serverless function.
- `lib/ebay-token-store.js` stores and reads the eBay refresh token without counting as a serverless function.

Recommended Vercel settings:

- Framework Preset: `Other`
- Production Branch: `main`
- Build Command: `node scripts/prepare-vercel.mjs`
- Output Directory: `public`

Required environment variables:

- `CJ_API_KEY`
- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EBAY_REDIRECT_URI`

Optional Upstash token storage variables:

- `EBAY_TOKEN_STORE_MODE=upstash`
- `EBAY_TOKEN_STORE_URL`
- `EBAY_TOKEN_STORE_TOKEN`
- `EBAY_TOKEN_STORE_KEY=elyon-seller-tool:ebay-refresh-token:production`

Useful test URLs after deployment:

- `/`
- `/api/health`
- `/api/env-check`
- `/api/ebay/status`
- `/ebay-token-exchange`

Do not commit local token files from `data/`.
