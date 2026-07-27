import { requireSellerAccess } from "../lib/seller-access.js";

function text(value, max = 500) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

async function getAppToken() {
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
  return data.access_token;
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
  const data = await ebayJson(
    "https://api.ebay.com/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_DE",
    token
  );
  return text(data.categoryTreeId, 50);
}

async function categorySuggestions(query, token) {
  const treeId = await categoryTreeId(token);
  const data = await ebayJson(
    `https://api.ebay.com/commerce/taxonomy/v1/category_tree/${encodeURIComponent(treeId)}/get_category_suggestions?q=${encodeURIComponent(query)}`,
    token
  );
  return (Array.isArray(data.categorySuggestions) ? data.categorySuggestions : [])
    .slice(0, 10)
    .map((entry) => ({
      categoryId: text(entry?.category?.categoryId, 50),
      categoryName: text(entry?.category?.categoryName, 300),
      level: Number(entry?.categoryTreeNodeLevel || 0),
      ancestors: (Array.isArray(entry?.categoryTreeNodeAncestors) ? entry.categoryTreeNodeAncestors : [])
        .slice(0, 10)
        .map((ancestor) => ({ categoryId: text(ancestor?.categoryId, 50), categoryName: text(ancestor?.categoryName, 300) }))
        .filter((ancestor) => ancestor.categoryId),
    }))
    .filter((entry) => entry.categoryId);
}

async function categoryAspects(categoryId, token) {
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
  return {
    aspects,
    required: aspects.filter((aspect) => aspect.required).map((aspect) => aspect.name),
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
      return res.status(200).json({ ok: true, configured: true, marketplaceId: "EBAY_DE", productionMetadataOnly: true });
    }
    if (action === "suggestions") {
      const query = text(req.query.q || req.query.query, 350);
      if (query.length < 2) return res.status(400).json({ ok: false, error: "Suchbegriff ist zu kurz." });
      const suggestions = await categorySuggestions(query, token);
      return res.status(200).json({ ok: true, query, suggestions, count: suggestions.length, marketplaceId: "EBAY_DE" });
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