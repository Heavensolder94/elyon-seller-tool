const TAXONOMY_ROOT = "https://api.ebay.com/commerce/taxonomy/v1";
const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const DEFAULT_MARKETPLACE_ID = "EBAY_DE";
const TOKEN_SAFETY_MS = 60_000;
const TREE_TTL_MS = 6 * 60 * 60 * 1000;
const SEARCH_TTL_MS = 10 * 60 * 1000;
const ASPECT_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const MAX_BODY_BYTES = 8 * 1024;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 60;

let appTokenCache = { token: "", expiresAt: 0 };
const treeCache = new Map();
const searchCache = new Map();
const aspectCache = new Map();
const rateCache = new Map();

function text(value, max = 5000) {
  const output = String(value ?? "").replace(/\s+/g, " ").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function marketplaceId() {
  return text(process.env.EBAY_MARKETPLACE_ID || DEFAULT_MARKETPLACE_ID, 50) || DEFAULT_MARKETPLACE_ID;
}

function setCors(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function requestBytes(req) {
  try {
    return Buffer.byteLength(JSON.stringify(req?.body ?? {}), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function clientKey(req) {
  return text(req?.headers?.["x-forwarded-for"] || req?.socket?.remoteAddress || "unknown", 160).split(",")[0].trim();
}

function rateAllowed(req) {
  const key = clientKey(req);
  const now = Date.now();
  const current = rateCache.get(key);
  if (!current || current.resetAt <= now) {
    rateCache.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  current.count += 1;
  if (rateCache.size > 500) {
    for (const [entryKey, entry] of rateCache) {
      if (entry.resetAt <= now) rateCache.delete(entryKey);
    }
  }
  return current.count <= RATE_LIMIT;
}

function cacheGet(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(cache, key, value, ttlMs) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

function serviceError(status, code, message, details = undefined) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
}

async function responseJson(response, label) {
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { data = raw ? { raw } : {}; }
  if (!response.ok) {
    const message = data?.errors?.map((entry) => entry.longMessage || entry.message).filter(Boolean).join(" | ")
      || data?.error_description || data?.message || data?.error || `HTTP ${response.status}`;
    throw serviceError(
      response.status >= 400 && response.status < 500 ? response.status : 502,
      "ebay_taxonomy_request_failed",
      `${label}: ${message}`,
      undefined,
    );
  }
  return data;
}

async function appAccessToken() {
  const staticToken = text(process.env.EBAY_TAXONOMY_ACCESS_TOKEN || process.env.EBAY_USER_ACCESS_TOKEN, 10000);
  const clientId = text(process.env.EBAY_CLIENT_ID, 1000);
  const clientSecret = text(process.env.EBAY_CLIENT_SECRET, 1000);

  if ((!clientId || !clientSecret) && staticToken) return staticToken;
  if (!clientId || !clientSecret) {
    throw serviceError(503, "ebay_app_credentials_missing", "eBay Client-ID/Client-Secret für die Kategoriesuche fehlt serverseitig.");
  }
  if (appTokenCache.token && appTokenCache.expiresAt > Date.now() + TOKEN_SAFETY_MS) return appTokenCache.token;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });
  const data = await responseJson(response, "eBay App-Token");
  if (!data.access_token) throw serviceError(502, "ebay_app_token_missing", "eBay hat keinen App-Token für die Kategoriesuche geliefert.");

  const expiresIn = Math.max(300, Number(data.expires_in || 7200));
  appTokenCache = { token: data.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  return appTokenCache.token;
}

async function ebayGet(path, label) {
  const token = await appAccessToken();
  const response = await fetch(`${TAXONOMY_ROOT}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Accept-Language": "de-DE",
      "Content-Language": "de-DE",
      "X-EBAY-C-MARKETPLACE-ID": marketplaceId(),
    },
    cache: "no-store",
  });
  return responseJson(response, label);
}

async function categoryTreeId() {
  const market = marketplaceId();
  const cached = cacheGet(treeCache, market);
  if (cached) return cached;
  const data = await ebayGet(
    `/get_default_category_tree_id?marketplace_id=${encodeURIComponent(market)}`,
    "eBay Kategoriebaum",
  );
  const id = text(data.categoryTreeId, 50);
  if (!id) throw serviceError(502, "ebay_category_tree_missing", "eBay hat keine deutsche Kategoriebaum-ID geliefert.");
  return cacheSet(treeCache, market, id, TREE_TTL_MS);
}

function normalizeSuggestions(data = {}, limit = 12) {
  const safeLimit = Math.max(1, Math.min(12, Number(limit) || 12));
  return (Array.isArray(data.categorySuggestions) ? data.categorySuggestions : [])
    .slice(0, safeLimit)
    .map((entry) => {
      const ancestors = Array.isArray(entry?.categoryTreeNodeAncestors)
        ? entry.categoryTreeNodeAncestors.slice().reverse().map((ancestor) => text(ancestor?.categoryName, 300)).filter(Boolean)
        : [];
      const categoryId = text(entry?.category?.categoryId, 50);
      const categoryName = text(entry?.category?.categoryName, 300);
      return {
        categoryId,
        categoryName,
        breadcrumb: [...ancestors, categoryName].filter(Boolean).join(" › "),
        categoryTreeNodeLevel: Number(entry?.categoryTreeNodeLevel || 0),
      };
    })
    .filter((entry) => /^\d+$/.test(entry.categoryId) && entry.categoryName);
}

async function searchCategories(query, limit = 12) {
  const q = text(query, 350);
  if (q.length < 2) throw serviceError(400, "category_query_too_short", "Bitte mindestens zwei Zeichen für die eBay-Kategoriesuche eingeben.");
  const safeLimit = Math.max(1, Math.min(12, Number(limit) || 12));
  const market = marketplaceId();
  const cacheKey = `${market}:${safeLimit}:${q.toLocaleLowerCase("de-DE")}`;
  const cached = cacheGet(searchCache, cacheKey);
  if (cached) return cached;

  const treeId = await categoryTreeId();
  const data = await ebayGet(
    `/category_tree/${encodeURIComponent(treeId)}/get_category_suggestions?q=${encodeURIComponent(q)}`,
    "eBay Kategoriesuche",
  );
  return cacheSet(searchCache, cacheKey, normalizeSuggestions(data, safeLimit), SEARCH_TTL_MS);
}

function normalizeAspects(data = {}) {
  const aspects = (Array.isArray(data.aspects) ? data.aspects : [])
    .map((aspect) => ({
      name: text(aspect.localizedAspectName, 80),
      required: Boolean(aspect.aspectConstraint?.aspectRequired),
      usage: text(aspect.aspectConstraint?.aspectUsage, 50),
      mode: text(aspect.aspectConstraint?.aspectMode, 50),
      cardinality: text(aspect.aspectConstraint?.itemToAspectCardinality, 50),
      values: (Array.isArray(aspect.aspectValues) ? aspect.aspectValues : [])
        .slice(0, 100)
        .map((entry) => text(entry.localizedValue, 100))
        .filter(Boolean),
    }))
    .filter((aspect) => aspect.name);
  return {
    aspects,
    required: aspects.filter((aspect) => aspect.required).map((aspect) => aspect.name),
  };
}

async function inspectCategory(categoryId) {
  const id = text(categoryId, 50);
  if (!/^\d+$/.test(id)) throw serviceError(400, "invalid_category_id", "Ungültige eBay-Kategorie-ID.");
  const cacheKey = `${marketplaceId()}:${id}`;
  const cached = cacheGet(aspectCache, cacheKey);
  if (cached) return cached;

  const treeId = await categoryTreeId();
  const data = await ebayGet(
    `/category_tree/${encodeURIComponent(treeId)}/get_item_aspects_for_category?category_id=${encodeURIComponent(id)}`,
    "eBay Artikelmerkmale",
  );
  return cacheSet(aspectCache, cacheKey, normalizeAspects(data), ASPECT_TTL_MS);
}

export default async function handler(req, res) {
  setCors(res);
  const method = String(req?.method || "GET").toUpperCase();
  if (method === "OPTIONS") return res.status(204).end();
  if (method !== "POST") {
    return res.status(405).json({ ok: false, readOnly: true, error: "method_not_allowed", message: "Diese Route unterstützt nur POST." });
  }
  if (requestBytes(req) > MAX_BODY_BYTES) {
    return res.status(413).json({ ok: false, readOnly: true, error: "request_too_large", message: "Die Kategoriesuche-Anfrage ist zu groß." });
  }
  if (!rateAllowed(req)) {
    return res.status(429).json({ ok: false, readOnly: true, error: "rate_limited", message: "Zu viele Kategoriesuchen. Bitte kurz warten und erneut versuchen." });
  }

  const body = req?.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  const action = text(body.action || "search", 30).toLowerCase();

  try {
    if (action === "search") {
      const query = text(body.query || body.title, 350);
      const categories = await searchCategories(query, body.limit);
      return res.status(200).json({
        ok: true,
        readOnly: true,
        standalone: true,
        marketplaceId: marketplaceId(),
        query,
        count: categories.length,
        categories,
      });
    }

    if (action === "inspect") {
      const categoryId = text(body.categoryId, 50);
      const categoryMetadata = await inspectCategory(categoryId);
      return res.status(200).json({
        ok: true,
        readOnly: true,
        standalone: true,
        marketplaceId: marketplaceId(),
        categoryId,
        categoryMetadata,
      });
    }

    return res.status(400).json({ ok: false, readOnly: true, error: "unknown_action", message: `Unbekannte Kategorie-Aktion: ${action}` });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({
      ok: false,
      readOnly: true,
      error: error?.code || "ebay_category_search_failed",
      message: error?.message || "eBay-Kategoriesuche fehlgeschlagen.",
    });
  }
}
