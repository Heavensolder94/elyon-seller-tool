import internalEbayHandler from "../../../internal/ebay/index.js";
import { requireBridgeAccess } from "../../../lib/bridge-access.js";

function text(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function knownNumber(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function normalizedItem(item = {}) {
  const shippingOptions = Array.isArray(item.shippingOptions) ? item.shippingOptions : [];
  const currency = text(item.price?.currency, 3).toUpperCase();
  const shippingCost = shippingOptions
    .map((entry) => numberValue(entry?.shippingCost?.value))
    .find((value) => value > 0) || 0;
  const shippingEvidence = shippingOptions.slice(0, 10).map(option => {
    const amount = knownNumber(option?.shippingCost?.value);
    return {
      shippingCost: amount === null || option?.shippingCost?.currency !== currency ? null : { value: amount, currency },
      minEstimatedDeliveryDate: text(option?.minEstimatedDeliveryDate, 45) || null,
      maxEstimatedDeliveryDate: text(option?.maxEstimatedDeliveryDate, 45) || null,
    };
  });
  return {
    itemId: text(item.itemId, 180),
    title: text(item.title, 300),
    itemWebUrl: text(item.itemWebUrl, 1000),
    price: {
      value: numberValue(item?.price?.value),
      currency,
    },
    shippingCost,
    shippingOptions: shippingEvidence,
    seller: { username: text(item.seller?.username, 100), feedbackScore: knownNumber(item.seller?.feedbackScore),
      feedbackPercentage: knownNumber(item.seller?.feedbackPercentage) },
    condition: text(item.condition, 120),
    conditionId: text(item.conditionId, 20),
    buyingOptions: (Array.isArray(item.buyingOptions) ? item.buyingOptions : []).map(value => text(value, 25)).slice(0, 5),
    itemLocation: { country: text(item.itemLocation?.country, 2) },
    bidCount: knownNumber(item.bidCount),
    watchCount: knownNumber(item.watchCount),
    promotedListing: typeof item.promotedListing === 'boolean' ? item.promotedListing : null,
    localizedAspects: (Array.isArray(item.localizedAspects) ? item.localizedAspects : []).slice(0, 24)
      .map(aspect => ({ name: text(aspect?.name, 80), value: text(aspect?.value, 120) })),
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
  const requestedLimit = Number(req.query?.limit || 30);
  const limit = Number.isFinite(requestedLimit) ? Math.max(4, Math.min(Math.trunc(requestedLimit), 40)) : 30;

  const capture = {
    statusCode: 200,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  const originalQuery = req.query;
  try {
    req.query = { ...originalQuery, action: "competition", keyword: query, limit, elyonDeliveryCountry: 'DE' };
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
    evidenceVersion: 2,
    query,
    fetchedAt: new Date().toISOString(),
    total: Number(data.total || 0),
    reportedSearchHits: knownNumber(data.total),
    count: items.length,
    items,
    evidenceLimits: {
      activeListingsOnly: true,
      soldItemsAvailable: false,
      automaticPriceDecision: false,
    },
  });
}
