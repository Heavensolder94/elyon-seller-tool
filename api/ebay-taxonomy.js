import { requireSellerAccess } from "../lib/seller-access.js";

function text(value, max = 500) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

const CACHE = globalThis.__elyonEbayTaxonomyCache || (globalThis.__elyonEbayTaxonomyCache = new Map());
const TOKEN_STATE = globalThis.__elyonEbayTaxonomyToken || (globalThis.__elyonEbayTaxonomyToken = { token: "", expiresAt: 0 });
const TREE_STATE = globalThis.__elyonEbayTaxonomyTree || (globalThis.__elyonEbayTaxonomyTree = { id: "", expiresAt: 0 });

function cached(key) {
  const entry = CACHE.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    CACHE.delete(key);
    return null;
  }
  return entry.value;
}

function remember(key, value, ttlMs) {
  CACHE.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

async function getAppToken() {
  if (TOKEN_STATE.token && TOKEN_STATE.expiresAt > Date.now()) return TOKEN_STATE.token;
  const clientId = text(process.env.EBAY_CLIENT_ID, 1000);
  const clientSecret = text(process.env.EBAY_CLIENT_SECRET, 1000);
  if (!clientId || !clientSecret) {
    const error = new Error("EBAY_CLIENT_ID oder EBAY_CLIENT_SECRET fehlt im Seller Tool.");
    error.status = 503;
    error.code = "ebay_app_credentials_missing";
    throw error;
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
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = new Error(data.error_description || data.error || "eBay App-Token konnte nicht erstellt werden.");
    error.status = response.status || 502;
    error.code = "ebay_app_token_failed";
    throw error;
  }
  TOKEN_STATE.token = data.access_token;
  TOKEN_STATE.expiresAt = Date.now() + Math.max(60, Number(data.expires_in || 7200) - 90) * 1000;
  return TOKEN_STATE.token;
}

async function ebayJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept-Language": "de-DE",
      "Content-Language": "de-DE",
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE",
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      data?.errors?.map((entry) => entry.longMessage || entry.message).filter(Boolean).join(" | ") ||
      data?.message ||
      `eBay Taxonomy HTTP ${response.status}`
    );
    error.status = response.status;
    error.code = "ebay_taxonomy_failed";
    throw error;
  }
  return data;
}

async function categoryTreeId(token) {
  if (TREE_STATE.id && TREE_STATE.expiresAt > Date.now()) return TREE_STATE.id;
  const data = await ebayJson(
    "https://api.ebay.com/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_DE",
    token
  );
  TREE_STATE.id = text(data.categoryTreeId, 50);
  TREE_STATE.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  return TREE_STATE.id;
}

function normalizedSuggestion(entry) {
  const categoryId = text(entry?.category?.categoryId, 50);
  const categoryName = text(entry?.category?.categoryName, 300);
  const ancestors = (Array.isArray(entry?.categoryTreeNodeAncestors) ? entry.categoryTreeNodeAncestors : [])
    .slice(0, 10)
    .map((ancestor) => ({
      categoryId: text(ancestor?.categoryId, 50),
      categoryName: text(ancestor?.categoryName, 300),
    }))
    .filter((ancestor) => ancestor.categoryId || ancestor.categoryName);
  return {
    categoryId,
    categoryName,
    level: Number(entry?.categoryTreeNodeLevel || 0),
    ancestors,
    path: [...ancestors.map((ancestor) => ancestor.categoryName), categoryName].filter(Boolean),
  };
}

async function categorySuggestions(query, token) {
  const normalizedQuery = text(query, 350).replace(/\s+/g, " ");
  const cacheKey = `suggestions:${normalizedQuery.toLowerCase()}`;
  const hit = cached(cacheKey);
  if (hit) return hit;
  const treeId = await categoryTreeId(token);
  const data = await ebayJson(
    `https://api.ebay.com/commerce/taxonomy/v1/category_tree/${encodeURIComponent(treeId)}/get_category_suggestions?q=${encodeURIComponent(normalizedQuery)}`,
    token
  );
  const suggestions = (Array.isArray(data.categorySuggestions) ? data.categorySuggestions : [])
    .slice(0, 10)
    .map(normalizedSuggestion)
    .filter((entry) => entry.categoryId && entry.categoryName);
  return remember(cacheKey, suggestions, 12 * 60 * 60 * 1000);
}

async function categoryAspects(categoryId, token) {
  const cacheKey = `aspects:${categoryId}`;
  const hit = cached(cacheKey);
  if (hit) return hit;
  const treeId = await categoryTreeId(token);
  const data = await ebayJson(
    `https://api.ebay.com/commerce/taxonomy/v1/category_tree/${encodeURIComponent(treeId)}/get_item_aspects_for_category?category_id=${encodeURIComponent(categoryId)}`,
    token
  );
  const aspects = (Array.isArray(data.aspects) ? data.aspects : [])
    .map((aspect) => ({
      name: text(aspect.localizedAspectName, 100),
      required: Boolean(aspect.aspectConstraint?.aspectRequired),
      usage: text(aspect.aspectConstraint?.aspectUsage, 50),
      mode: text(aspect.aspectConstraint?.aspectMode, 50),
      cardinality: text(aspect.aspectConstraint?.itemToAspectCardinality, 50),
      values: (Array.isArray(aspect.aspectValues) ? aspect.aspectValues : [])
        .slice(0, 100)
        .map((entry) => text(entry.localizedValue, 120))
        .filter(Boolean),
    }))
    .filter((aspect) => aspect.name);
  return remember(cacheKey, {
    aspects,
    required: aspects.filter((aspect) => aspect.required).map((aspect) => aspect.name),
  }, 24 * 60 * 60 * 1000);
}

async function resolveCategory(query, token) {
  const suggestions = await categorySuggestions(query, token);
  const category = suggestions[0];
  if (!category) {
    const error = new Error("eBay hat für diese Produktbezeichnung keine passende Kategorie gefunden.");
    error.status = 404;
    error.code = "ebay_category_not_found";
    throw error;
  }
  const metadata = await categoryAspects(category.categoryId, token);
  return {
    category,
    metadata: {
      categoryId: category.categoryId,
      categoryName: category.categoryName,
      ancestors: category.ancestors,
      path: category.path,
      aspects: metadata.aspects,
      required: metadata.required,
      automatic: true,
      source: "ebay_taxonomy",
    },
    alternatives: suggestions.slice(1, 5),
  };
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 64 * 1024 })) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Nur GET erlaubt." });

  try {
    const action = text(req.query.action || "suggestions", 50).toLowerCase();
    const token = await getAppToken();
    if (action === "status") {
      return res.status(200).json({ ok: true, configured: true, marketplaceId: "EBAY_DE", productionMetadataOnly: true, automaticResolution: true });
    }
    if (action === "suggestions") {
      const query = text(req.query.q || req.query.query, 350);
      if (query.length < 2) return res.status(400).json({ ok: false, error: "Suchbegriff ist zu kurz." });
      const suggestions = await categorySuggestions(query, token);
      return res.status(200).json({ ok: true, query, suggestions, count: suggestions.length, marketplaceId: "EBAY_DE" });
    }
    if (action === "resolve") {
      const query = text(req.query.q || req.query.query, 350);
      if (query.length < 2) return res.status(400).json({ ok: false, error: "Für die automatische Kategorie fehlt eine Produktbezeichnung." });
      const resolution = await resolveCategory(query, token);
      return res.status(200).json({ ok: true, query, ...resolution, marketplaceId: "EBAY_DE" });
    }
    if (action === "aspects") {
      const categoryId = text(req.query.categoryId || req.query.id, 50);
      if (!/^\d+$/.test(categoryId)) return res.status(400).json({ ok: false, error: "Numerische categoryId fehlt." });
      const metadata = await categoryAspects(categoryId, token);
      return res.status(200).json({ ok: true, categoryId, ...metadata, marketplaceId: "EBAY_DE" });
    }
    return res.status(404).json({ ok: false, error: `Unbekannte Taxonomy-Aktion: ${action}` });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({
      ok: false,
      error: error?.code || "ebay_taxonomy_error",
      message: error?.message || "eBay Taxonomy konnte nicht geladen werden.",
    });
  }
}
