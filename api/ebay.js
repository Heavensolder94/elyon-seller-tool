import { readToken, writeToken, getTokenStoreDescription } from "../lib/ebay-token-store.js";

const SANDBOX_AUTH_URL = "https://auth.sandbox.ebay.com/oauth2/authorize";
const PRODUCTION_AUTH_URL = "https://auth.ebay.com/oauth2/authorize";

function normalizeEnvironment(value) {
  return String(value || "production").toLowerCase() === "sandbox" ? "sandbox" : "production";
}

function getRedirectUri() {
  return process.env.EBAY_REDIRECT_URI || process.env.EBAY_RUNAME || "";
}

function getScopes() {
  const raw = process.env.EBAY_SCOPES || "https://api.ebay.com/oauth/api_scope";
  return String(raw).split(/[\s,]+/).map(scope => scope.trim()).filter(Boolean);
}

function makeState() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getEbayTokenEndpoint(environment) {
  return environment === "sandbox"
    ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
    : "https://api.ebay.com/identity/v1/oauth2/token";
}

function getRequestedAction(req) {
  const raw = String(req.query.action || req.query.endpoint || req.query.path || "");
  if (raw) return raw.replace(/^\/+/, "");

  const url = new URL(req.url || "/api/ebay", `https://${req.headers.host || "localhost"}`);
  const path = url.pathname.replace(/^\/api\/ebay\/?/, "");
  return path || "status";
}

function getCode(req) {
  if (req.method === "POST") {
    return String(req.body?.code || req.body?.authorization_code || req.body?.authCode || "").trim();
  }
  return String(req.query.code || req.query.authorization_code || req.query.authCode || "").trim();
}

async function getEbayAppToken() {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("EBAY_CLIENT_ID oder EBAY_CLIENT_SECRET fehlt in Vercel.");
  }

  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "eBay Token konnte nicht erstellt werden.");
  }
  return data.access_token;
}

async function handleStatus(req, res) {
  return res.status(200).json({ ok: true, service: "eBay" });
}

async function handleLoginUrl(req, res) {
  const environment = normalizeEnvironment(req.query.environment || req.query.env);
  const clientId = process.env.EBAY_CLIENT_ID || "";
  const redirectUri = getRedirectUri();
  const state = typeof req.query.state === "string" && req.query.state.trim() ? req.query.state.trim() : makeState();

  if (!clientId || !redirectUri) {
    return res.status(400).json({
      ok: false,
      error: "EBAY_CLIENT_ID oder EBAY_REDIRECT_URI / EBAY_RUNAME fehlt.",
      required: {
        EBAY_CLIENT_ID: Boolean(clientId),
        EBAY_REDIRECT_URI: Boolean(redirectUri),
      },
    });
  }

  const url = new URL(environment === "sandbox" ? SANDBOX_AUTH_URL : PRODUCTION_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", getScopes().join(" "));
  url.searchParams.set("locale", "de-DE");
  url.searchParams.set("prompt", "login");
  url.searchParams.set("state", state);

  return res.status(200).json({ ok: true, environment, state, authUrl: url.toString() });
}

async function handleSearch(req, res) {
  const query = req.query.q || req.query.keyword || "iphone";
  const limit = Math.min(Number(req.query.limit || 5), 20);
  const accessToken = await getEbayAppToken();

  const response = await fetch(
    `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE",
        "Accept-Language": "de-DE",
      },
    }
  );

  const data = await response.json();
  if (!response.ok) {
    return res.status(response.status).json({
      ok: false,
      error: data.errors?.[0]?.message || data.error_description || data.message || "eBay Search Fehler",
      details: data,
    });
  }

  return res.status(200).json({
    ok: true,
    query,
    limit,
    total: data.total || 0,
    count: data.itemSummaries?.length || 0,
    items: data.itemSummaries || [],
  });
}

async function handleCompetition(req, res) {
  const keyword = req.query.keyword || req.query.q || "iphone";
  const limit = Math.min(Number(req.query.limit || 20), 50);
  req.query.q = keyword;
  req.query.limit = limit;

  const capture = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };

  await handleSearch(req, capture);
  const data = capture.body || {};
  if (capture.statusCode >= 400 || data.ok === false) {
    return res.status(capture.statusCode || 500).json({
      ok: false,
      error: data.error || "eBay Search konnte fuer den Wettbewerb nicht geladen werden.",
      details: data,
    });
  }

  const items = data.items || [];
  const prices = items
    .map(item => Number(item.price?.value || item.price || item.currentPrice || 0))
    .filter(price => price > 0);

  const low = prices.length ? Math.min(...prices) : 0;
  const high = prices.length ? Math.max(...prices) : 0;
  const avg = prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : 0;

  return res.status(200).json({ ok: true, keyword, count: items.length, low, avg, high, items });
}

async function handleExchangeToken(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Nur GET oder POST erlaubt." });
  }

  const code = getCode(req);
  if (!code) return res.status(400).json({ ok: false, error: "code fehlt." });

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const redirectUri = getRedirectUri();
  if (!clientId || !clientSecret || !redirectUri) {
    return res.status(500).json({
      ok: false,
      error: "EBAY_CLIENT_ID, EBAY_CLIENT_SECRET oder EBAY_REDIRECT_URI / EBAY_RUNAME fehlt.",
    });
  }

  const environment = normalizeEnvironment(req.method === "POST" ? req.body?.environment || req.body?.env : req.query.environment || req.query.env);
  const response = await fetch(getEbayTokenEndpoint(environment), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });

  const data = await response.json();
  if (!response.ok) {
    return res.status(response.status || 500).json({
      ok: false,
      error: data.error_description || data.error || data.message || "eBay Token Exchange fehlgeschlagen.",
      details: data,
    });
  }

  const tokenRecord = {
    environment,
    refresh_token: data.refresh_token || null,
    access_token: data.access_token || null,
    token_type: data.token_type || null,
    expires_in: data.expires_in || null,
    scope: data.scope || null,
    saved_at: new Date().toISOString(),
    source: "oauth-code-grant",
  };

  const storeResult = await writeToken(environment, tokenRecord);
  const storedToken = await readToken(environment);
  const storeDescription = getTokenStoreDescription(environment);

  return res.status(200).json({
    ok: true,
    environment,
    token_type: data.token_type,
    expires_in: data.expires_in,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    scope: data.scope,
    stored: storeResult.ok,
    storage_path: storeResult.ok ? storeResult.path : null,
    storage_error: storeResult.ok ? null : storeResult.error,
    store_mode: storeDescription.mode,
    store_target: storeDescription.key || storeDescription.path || null,
    stored_token_preview: storedToken?.refresh_token ? `${String(storedToken.refresh_token).slice(0, 12)}...` : null,
  });
}

async function getAccessTokenFromRefreshToken(environment, refreshToken) {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("EBAY_CLIENT_ID oder EBAY_CLIENT_SECRET fehlt");
  if (!refreshToken) throw new Error("Kein gespeicherter EBAY refresh_token vorhanden");

  const response = await fetch(getEbayTokenEndpoint(environment), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "eBay Token konnte nicht erneuert werden.");
  return data;
}

async function handleToken(req, res) {
  const environment = normalizeEnvironment(req.query.environment || req.query.env);
  const stored = await readToken(environment);
  const storeDescription = getTokenStoreDescription(environment);
  const refreshToken = stored?.refresh_token || process.env.EBAY_REFRESH_TOKEN;

  if (!refreshToken) {
    return res.status(404).json({
      ok: false,
      error: "Kein gespeicherter refresh_token gefunden.",
      store_mode: storeDescription.mode,
      store_target: storeDescription.key || storeDescription.path || null,
      environment,
    });
  }

  const data = await getAccessTokenFromRefreshToken(environment, refreshToken);
  return res.status(200).json({
    ok: true,
    environment,
    token_type: data.token_type || null,
    expires_in: data.expires_in || null,
    access_token_preview: data.access_token ? `${String(data.access_token).slice(0, 12)}...` : null,
    stored_refresh_token_preview: String(refreshToken).slice(0, 12) + "...",
    store_mode: storeDescription.mode,
    store_target: storeDescription.key || storeDescription.path || null,
  });
}

export default async function handler(req, res) {
  try {
    const action = getRequestedAction(req);
    if (action === "status") return handleStatus(req, res);
    if (action === "login-url") return handleLoginUrl(req, res);
    if (action === "search") return handleSearch(req, res);
    if (action === "competition") return handleCompetition(req, res);
    if (action === "exchange-token") return handleExchangeToken(req, res);
    if (action === "token") return handleToken(req, res);

    return res.status(404).json({ ok: false, error: `Unbekannte eBay API Route: ${action}` });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
