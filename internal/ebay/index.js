import { readToken, writeToken, getTokenStoreDescription } from "../../lib/ebay-token-store.js";
import {
  EBAY_REQUIRED_SCOPES,
  configuredEbayScopes,
  normalizeEbayEnvironment,
  ebayApiRoot,
  ebayAuthRoot,
  ebayUserSession,
  refreshEbayAccessToken,
  loadEbaySellerSetup,
  createOrUpdateEbayDraft,
  publishEbayOffer,
  withdrawEbayOffer,
  publicEbayError,
} from "../../lib/ebay-production.js";

function text(value) {
  return String(value ?? "").trim();
}

function getRedirectUri() {
  return text(process.env.EBAY_REDIRECT_URI || process.env.EBAY_RUNAME);
}

function getRequestedAction(req) {
  const raw = text(req?.query?.action || req?.query?.endpoint || req?.query?.path);
  if (raw) return raw.replace(/^\/+/, "");
  try {
    const url = new URL(req?.url || "/api/ebay", `https://${req?.headers?.host || "localhost"}`);
    return url.pathname.replace(/^\/api\/ebay\/?/, "") || "status";
  } catch {
    return "status";
  }
}

function environmentFrom(req) {
  const raw = req?.method === "POST"
    ? req?.body?.environment || req?.body?.env
    : req?.query?.environment || req?.query?.env;
  return normalizeEbayEnvironment(raw || process.env.EBAY_ENV);
}

function codeFrom(req) {
  const source = req?.method === "POST" ? req?.body : req?.query;
  return text(source?.code || source?.authorization_code || source?.authCode);
}

function tokenEndpoint(environment) {
  return `${ebayApiRoot(environment)}/identity/v1/oauth2/token`;
}

async function appToken() {
  const clientId = text(process.env.EBAY_CLIENT_ID);
  const clientSecret = text(process.env.EBAY_CLIENT_SECRET);
  if (!clientId || !clientSecret) throw new Error("EBAY_CLIENT_ID oder EBAY_CLIENT_SECRET fehlt in Vercel.");

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
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || "eBay App-Token konnte nicht erstellt werden.");
  return data.access_token;
}

async function handleStatus(req, res) {
  const environment = environmentFrom(req);
  const tokenRecord = await readToken(environment);
  const tokenStore = getTokenStoreDescription(environment);
  const configured = {
    clientId: Boolean(text(process.env.EBAY_CLIENT_ID)),
    clientSecret: Boolean(text(process.env.EBAY_CLIENT_SECRET)),
    redirectUri: Boolean(getRedirectUri()),
    persistentTokenStore: tokenStore.persistent === true,
  };
  return res.status(200).json({
    ok: true,
    service: "eBay",
    environment,
    connected: Boolean(tokenRecord?.refresh_token || process.env.EBAY_REFRESH_TOKEN),
    configured,
    readyForConnection: Object.values(configured).every(Boolean),
    tokenStore,
    requiredScopes: EBAY_REQUIRED_SCOPES,
    configuredScopes: configuredEbayScopes(),
  });
}

async function handleLoginUrl(req, res) {
  const environment = environmentFrom(req);
  const clientId = text(process.env.EBAY_CLIENT_ID);
  const redirectUri = getRedirectUri();
  const state = text(req?.query?.state);
  const tokenStore = getTokenStoreDescription(environment);

  if (!clientId || !redirectUri || !state) {
    return res.status(400).json({
      ok: false,
      error: "ebay_oauth_not_configured",
      message: "EBAY_CLIENT_ID, Redirect-URI oder der signierte OAuth-State fehlt.",
      required: { clientId: Boolean(clientId), redirectUri: Boolean(redirectUri), state: Boolean(state) },
    });
  }
  if (tokenStore.persistent !== true) {
    return res.status(503).json({
      ok: false,
      error: "ebay_token_store_not_persistent",
      message: "eBay darf erst verbunden werden, wenn Upstash/KV als persistenter Token-Speicher konfiguriert ist.",
      tokenStore,
    });
  }

  const url = new URL(`${ebayAuthRoot(environment)}/oauth2/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", configuredEbayScopes().join(" "));
  url.searchParams.set("locale", "de-DE");
  url.searchParams.set("prompt", "login");
  url.searchParams.set("state", state);
  return res.status(200).json({ ok: true, environment, state, authUrl: url.toString(), scopes: configuredEbayScopes() });
}

async function handleExchangeToken(req, res) {
  if (!["GET", "POST"].includes(String(req?.method || "").toUpperCase())) {
    return res.status(405).json({ ok: false, error: "Nur GET oder POST erlaubt." });
  }
  const code = codeFrom(req);
  if (!code) return res.status(400).json({ ok: false, error: "code fehlt." });

  const clientId = text(process.env.EBAY_CLIENT_ID);
  const clientSecret = text(process.env.EBAY_CLIENT_SECRET);
  const redirectUri = getRedirectUri();
  const environment = environmentFrom(req);
  const tokenStore = getTokenStoreDescription(environment);
  if (!clientId || !clientSecret || !redirectUri) {
    return res.status(503).json({ ok: false, error: "EBAY_CLIENT_ID, EBAY_CLIENT_SECRET oder Redirect-URI fehlt." });
  }
  if (tokenStore.persistent !== true) {
    return res.status(503).json({
      ok: false,
      error: "ebay_token_store_not_persistent",
      message: "Persistenter Upstash-/KV-Speicher fehlt.",
      tokenStore,
    });
  }

  const response = await fetch(tokenEndpoint(environment), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return res.status(response.status || 500).json({
      ok: false,
      error: data.error_description || data.error || "eBay Token-Austausch fehlgeschlagen.",
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
  const storage = await writeToken(environment, tokenRecord);
  if (!storage.ok) {
    return res.status(503).json({
      ok: false,
      connected: false,
      error: "ebay_token_store_write_failed",
      message: storage.error || "eBay Refresh-Token konnte nicht persistent gespeichert werden.",
      storage,
    });
  }

  return res.status(200).json({
    ok: true,
    connected: true,
    environment,
    refresh_token: Boolean(data.refresh_token),
    access_token: Boolean(data.access_token),
    expires_in: data.expires_in || null,
    scope: data.scope || null,
    storage,
  });
}

async function handleToken(req, res) {
  const environment = environmentFrom(req);
  const stored = await readToken(environment);
  const refreshToken = stored?.refresh_token || process.env.EBAY_REFRESH_TOKEN;
  const data = await refreshEbayAccessToken(environment, refreshToken);
  return res.status(200).json({
    ok: true,
    environment,
    expires_in: data.expires_in || null,
    scope: data.scope || null,
    tokenStore: getTokenStoreDescription(environment),
  });
}

async function handleSearch(req, res) {
  const query = text(req?.query?.q || req?.query?.keyword || "iphone");
  const limit = Math.max(1, Math.min(Number(req?.query?.limit || 5), 20));
  const accessToken = await appToken();
  const response = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE",
      "Accept-Language": "de-DE",
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return res.status(response.status).json({
      ok: false,
      error: data.errors?.[0]?.message || data.error_description || data.message || "eBay-Suche fehlgeschlagen.",
      details: data,
    });
  }
  return res.status(200).json({ ok: true, query, limit, total: data.total || 0, count: data.itemSummaries?.length || 0, items: data.itemSummaries || [] });
}

async function handleCompetition(req, res) {
  const query = text(req?.query?.keyword || req?.query?.q || "iphone");
  const limit = Math.max(1, Math.min(Number(req?.query?.limit || 20), 50));
  req.query = { ...(req.query || {}), q: query, limit };
  const capture = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  await handleSearch(req, capture);
  if (capture.statusCode >= 400 || capture.body?.ok === false) return res.status(capture.statusCode).json(capture.body);
  const items = capture.body?.items || [];
  const prices = items.map((item) => Number(item.price?.value || 0)).filter((price) => price > 0);
  return res.status(200).json({
    ok: true,
    keyword: query,
    count: items.length,
    low: prices.length ? Math.min(...prices) : 0,
    avg: prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : 0,
    high: prices.length ? Math.max(...prices) : 0,
    items,
  });
}

function daysAgoIso(days) {
  const date = new Date();
  date.setDate(date.getDate() - Math.max(1, Math.min(Number(days || 7), 90)));
  return date.toISOString();
}

async function handleOrders(req, res) {
  const environment = environmentFrom(req);
  const stored = await readToken(environment);
  const refreshed = await refreshEbayAccessToken(environment, stored?.refresh_token || process.env.EBAY_REFRESH_TOKEN);
  const days = Math.max(1, Math.min(Number(req?.query?.days || 7), 90));
  const status = text(req?.query?.status || "all");
  const filters = [`creationdate:[${daysAgoIso(days)}..${new Date().toISOString()}]`];
  if (status !== "all") filters.push(`orderfulfillmentstatus:{${status}}`);
  const endpoint = `${ebayApiRoot(environment)}/sell/fulfillment/v1/order?limit=50&filter=${encodeURIComponent(filters.join(","))}`;
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${refreshed.access_token}`,
      "Content-Type": "application/json",
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE",
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return res.status(response.status).json({ ok: false, error: data.errors?.[0]?.message || data.message || "eBay Orders Fehler", details: data });
  return res.status(200).json({ ok: true, environment, days, status, count: data.orders?.length || 0, orders: data.orders || [] });
}

async function handleListings(req, res) {
  const environment = environmentFrom(req);
  const session = await ebayUserSession(environment);
  const limit = 200;
  const offers = [];
  let offset = 0;
  let total = null;

  for (let page = 0; page < 10; page += 1) {
    const endpoint = `${ebayApiRoot(environment)}/sell/inventory/v1/offer?limit=${limit}&offset=${offset}`;
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE",
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ ok: false, error: data.errors?.[0]?.message || data.message || "eBay-Angebote konnten nicht abgerufen werden." });
    const pageOffers = Array.isArray(data.offers) ? data.offers : [];
    total = Number.isFinite(Number(data.total)) ? Number(data.total) : total;
    offers.push(...pageOffers);
    if (!pageOffers.length || pageOffers.length < limit || (total !== null && offers.length >= total)) break;
    offset += pageOffers.length;
  }

  const items = offers.map((offer) => ({
    offerId: text(offer.offerId, 120),
    sku: text(offer.sku, 120),
    status: text(offer.status, 40).toUpperCase(),
    listingId: text(offer.listingId, 120),
    listingUrl: text(offer.listing?.listingUrl || offer.listingUrl, 1000),
    title: text(offer.product?.title || offer.title, 200),
    price: Number(offer.pricingSummary?.price?.value || offer.price?.value || 0),
    quantity: Number(offer.availableQuantity ?? offer.quantity ?? 0),
    marketplaceId: text(offer.marketplaceId, 40),
    lastModifiedDate: text(offer.lastModifiedDate, 80),
  }));
  const counts = items.reduce((result, item) => {
    if (item.status === "PUBLISHED") result.active += 1;
    else if (item.status === "UNPUBLISHED") result.drafts += 1;
    else result.other += 1;
    return result;
  }, { active: 0, drafts: 0, other: 0 });
  return res.status(200).json({ ok: true, environment, total: items.length, counts, items, syncedAt: new Date().toISOString() });
}

async function handleProductionAction(req, res, action) {
  const body = req?.body && typeof req.body === "object" ? req.body : {};
  const environment = environmentFrom(req);
  if (action === "setup") return res.status(200).json(await loadEbaySellerSetup(environment, body));
  if (action === "create-draft" || action === "draft") return res.status(200).json(await createOrUpdateEbayDraft(body, environment));
  if (action === "publish") return res.status(200).json(await publishEbayOffer(body, environment));
  if (action === "withdraw") return res.status(200).json(await withdrawEbayOffer(body, environment));
  return null;
}

export default async function handler(req, res) {
  try {
    const action = getRequestedAction(req);
    if (action === "status") return handleStatus(req, res);
    if (action === "login-url") return handleLoginUrl(req, res);
    if (action === "exchange-token") return handleExchangeToken(req, res);
    if (action === "token") return handleToken(req, res);
    if (action === "search") return handleSearch(req, res);
    if (action === "competition") return handleCompetition(req, res);
    if (action === "orders") return handleOrders(req, res);
    if (action === "listings") return handleListings(req, res);
    if (["setup", "create-draft", "draft", "publish", "withdraw"].includes(action)) return handleProductionAction(req, res, action);
    return res.status(404).json({ ok: false, error: `Unbekannte eBay API Route: ${action}` });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json(publicEbayError(error));
  }
}
