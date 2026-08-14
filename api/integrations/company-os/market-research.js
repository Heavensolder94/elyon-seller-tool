import internalEbayHandler from "../../../internal/ebay/index.js";
import { requireBridgeAccess } from "../../../lib/bridge-access.js";

function text(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizedItem(item = {}) {
  const shippingOptions = Array.isArray(item.shippingOptions) ? item.shippingOptions : [];
  const shippingCost = shippingOptions
    .map((entry) => numberValue(entry?.shippingCost?.value))
    .find((value) => value > 0) || 0;
  return {
    itemId: text(item.itemId, 180),
    title: text(item.title, 300),
    itemWebUrl: text(item.itemWebUrl, 1000),
    price: {
      value: numberValue(item?.price?.value),
      currency: text(item?.price?.currency, 10).toUpperCase(),
    },
    shippingCost,
    condition: text(item.condition, 120),
    categoryId: text(item?.categories?.[0]?.categoryId, 80),
    categoryName: text(item?.categories?.[0]?.categoryName, 200),
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method_not_allowed" });
  if (!requireBridgeAccess(req, res)) return;

  const query = text(req.query?.q || req.query?.query, 350);
  if (query.length < 3) {
    return res.status(400).json({ ok: false, error: "market_research_query_missing", message: "Für den eBay-Marktcheck fehlt ein verwertbarer Suchbegriff." });
  }
  const limit = Math.max(4, Math.min(Number(req.query?.limit || 30), 40));

  const capture = {
    statusCode: 200,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  const originalQuery = req.query;
  try {
    req.query = { ...originalQuery, action: "competition", keyword: query, limit };
    await internalEbayHandler(req, capture);
  } finally {
    req.query = originalQuery;
  }

  const data = capture.body && typeof capture.body === "object" ? capture.body : {};
  if (capture.statusCode >= 400 || data.ok === false) {
    return res.status(capture.statusCode || 502).json({
      ok: false,
      error: "ebay_market_research_failed",
      message: text(data.error || data.message || "eBay-Marktcheck konnte nicht geladen werden.", 500),
    });
  }

  const items = (Array.isArray(data.items) ? data.items : []).slice(0, limit).map(normalizedItem)
    .filter((item) => item.title && item.price.value > 0 && item.price.currency === "EUR");

  return res.status(200).json({
    ok: true,
    source: "ebay_browse_active_listings",
    marketplaceId: "EBAY_DE",
    marketType: "active_listings",
    query,
    fetchedAt: new Date().toISOString(),
    total: Number(data.total || 0),
    count: items.length,
    items,
    evidenceLimits: {
      activeListingsOnly: true,
      soldItemsAvailable: false,
      automaticPriceDecision: false,
    },
  });
}
