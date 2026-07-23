import { readToken } from "../../lib/ebay-token-store.js";

function normalizeEnvironment(value) {
  return String(value || process.env.EBAY_ENV || "production").toLowerCase() === "sandbox" ? "sandbox" : "production";
}

function getEbayTokenEndpoint(environment) {
  return environment === "sandbox"
    ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
    : "https://api.ebay.com/identity/v1/oauth2/token";
}

function getInventoryBaseUrl(environment) {
  return environment === "sandbox"
    ? "https://api.sandbox.ebay.com/sell/inventory/v1"
    : "https://api.ebay.com/sell/inventory/v1";
}

function getScopes() {
  const required = [
    "https://api.ebay.com/oauth/api_scope",
    "https://api.ebay.com/oauth/api_scope/sell.inventory",
  ];
  const configured = String(process.env.EBAY_SCOPES || "")
    .split(/[\s,]+/)
    .map(scope => scope.trim())
    .filter(Boolean);
  return [...new Set([...required, ...configured])];
}

function cleanText(value, max = 5000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value || "").replace(/[^0-9,.]/g, "").replace(/\./g, "").replace(",", ".");
  return Number(normalized) || 0;
}

function normalizeCondition(value) {
  const raw = String(value || "NEW").toLowerCase();
  if (raw.includes("gebraucht") || raw.includes("used")) return "USED_EXCELLENT";
  if (raw.includes("defekt") || raw.includes("parts")) return "FOR_PARTS_OR_NOT_WORKING";
  return "NEW";
}

function normalizeImages(images) {
  const list = Array.isArray(images) ? images : images ? [images] : [];
  return list
    .map(item => typeof item === "string" ? item : item?.url)
    .filter(Boolean)
    .map(url => String(url).trim())
    .filter(url => /^https?:\/\//i.test(url))
    .slice(0, 12);
}

function normalizeCategoryId(body) {
  const explicit = cleanText(body?.categoryId || body?.ebayCategoryId || "", 32);
  if (/^\d{2,12}$/.test(explicit)) return explicit;

  const category = cleanText(body?.category || "", 80);
  if (/^\d{2,12}$/.test(category)) return category;

  const fallback = cleanText(process.env.EBAY_DEFAULT_CATEGORY_ID, 32);
  if (/^\d{2,12}$/.test(fallback)) return fallback;

  return "";
}

function makeSku(payload) {
  const rawTitle = cleanText(payload.title || "amazon", 32).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toUpperCase();
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `ELYON-AMZ-${stamp}-${rawTitle || "ITEM"}-${rand}`.slice(0, 80);
}

function validatePayload(body) {
  const title = cleanText(body?.title, 80);
  const description = cleanText(body?.description, 4000);
  const price = parseMoney(body?.price ?? body?.sellPrice);
  const shipping = parseMoney(body?.shipping);
  const quantity = Math.max(1, Math.min(Number(body?.quantity || 1) || 1, 999));
  const sourceUrl = cleanText(body?.sourceUrl || body?.url, 1000);
  const categoryId = normalizeCategoryId(body || {});
  const categorySuggestion = cleanText(body?.category, 120);
  const condition = normalizeCondition(body?.condition);
  const images = normalizeImages(body?.images);
  const notes = cleanText(body?.notes, 1000);

  if (!title) return { ok: false, status: 400, error: "Titel fehlt." };
  if (!price || price <= 0) return { ok: false, status: 400, error: "Preis fehlt." };
  if (!categoryId) {
    return {
      ok: false,
      status: 400,
      error: "eBay Kategorie-ID fehlt. Bitte eine numerische categoryId mitsenden oder EBAY_DEFAULT_CATEGORY_ID in Vercel setzen.",
      missing: ["EBAY_DEFAULT_CATEGORY_ID oder categoryId"]
    };
  }

  return {
    ok: true,
    value: { title, description, price, shipping, quantity, sourceUrl, categoryId, categorySuggestion, condition, images, notes },
  };
}

async function getAccessTokenFromRefreshToken(environment, refreshToken) {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("EBAY_CLIENT_ID oder EBAY_CLIENT_SECRET fehlt.");
  if (!refreshToken) throw new Error("Bitte zuerst eBay verbinden.");

  const response = await fetch(getEbayTokenEndpoint(environment), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: getScopes().join(" "),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "eBay Access Token konnte nicht erneuert werden.");
  }
  return data.access_token;
}

async function callEbayJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!response.ok) {
    const detail = data?.errors?.[0]?.message || data?.error_description || data?.message || data?.error || `eBay API Fehler HTTP ${response.status}`;
    const error = new Error(detail);
    error.status = response.status;
    error.ebayResponse = data;
    throw error;
  }

  return data || {};
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, draftCreated: false, published: false, error: "Nur POST erlaubt." });
  }

  try {
    const environment = normalizeEnvironment(req.query.environment || req.query.env);
    const validated = validatePayload(req.body || {});
    if (!validated.ok) {
      return res.status(validated.status || 400).json({
        ok: false,
        draftCreated: false,
        published: false,
        error: validated.error,
        missing: validated.missing || [],
        targetRoute: "/api/ebay/create-draft"
      });
    }

    const stored = await readToken(environment);
    const refreshToken = stored?.refresh_token || process.env.EBAY_REFRESH_TOKEN;
    if (!refreshToken) {
      return res.status(401).json({ ok: false, draftCreated: false, published: false, error: "Bitte zuerst eBay verbinden." });
    }

    const marketplaceId = process.env.EBAY_MARKETPLACE_ID || "EBAY_DE";
    const currency = process.env.EBAY_CURRENCY || "EUR";
    const merchantLocationKey = process.env.EBAY_MERCHANT_LOCATION_KEY || process.env.EBAY_LOCATION_KEY || "";
    const fulfillmentPolicyId = process.env.EBAY_FULFILLMENT_POLICY_ID || "";
    const paymentPolicyId = process.env.EBAY_PAYMENT_POLICY_ID || "";
    const returnPolicyId = process.env.EBAY_RETURN_POLICY_ID || "";

    const missingConfig = [];
    if (!merchantLocationKey) missingConfig.push("EBAY_MERCHANT_LOCATION_KEY");
    if (!fulfillmentPolicyId) missingConfig.push("EBAY_FULFILLMENT_POLICY_ID");
    if (!paymentPolicyId) missingConfig.push("EBAY_PAYMENT_POLICY_ID");
    if (!returnPolicyId) missingConfig.push("EBAY_RETURN_POLICY_ID");
    if (missingConfig.length) {
      return res.status(400).json({
        ok: false,
        draftCreated: false,
        published: false,
        error: `eBay Entwurf-Konfiguration fehlt: ${missingConfig.join(", ")}.`,
        missing: missingConfig,
        targetRoute: "/api/ebay/create-draft"
      });
    }

    const product = validated.value;
    const accessToken = await getAccessTokenFromRefreshToken(environment, refreshToken);
    const baseUrl = getInventoryBaseUrl(environment);
    const sku = makeSku(product);

    const inventoryPayload = {
      availability: {
        shipToLocationAvailability: {
          quantity: product.quantity,
        },
      },
      condition: product.condition,
      product: {
        title: product.title,
        description: product.description || product.title,
        aspects: {
          Marke: ["Markenlos"],
        },
        imageUrls: product.images,
      },
    };

    const hintParts = [];
    if (product.sourceUrl) hintParts.push(`Quelle: ${product.sourceUrl}`);
    if (product.categorySuggestion && product.categorySuggestion !== product.categoryId) hintParts.push(`Kategorie-Vorschlag: ${product.categorySuggestion}`);
    if (product.notes) hintParts.push(product.notes);
    if (hintParts.length) {
      inventoryPayload.product.aspects.ElyonHinweis = [cleanText(hintParts.join(" | "), 500)];
    }

    await callEbayJson(`${baseUrl}/inventory_item/${encodeURIComponent(sku)}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Content-Language": "de-DE",
        "Accept-Language": "de-DE",
      },
      body: JSON.stringify(inventoryPayload),
    });

    const offerPayload = {
      sku,
      marketplaceId,
      format: "FIXED_PRICE",
      availableQuantity: product.quantity,
      categoryId: product.categoryId,
      listingDescription: product.description || product.title,
      pricingSummary: {
        price: {
          value: product.price.toFixed(2),
          currency,
        },
      },
      merchantLocationKey,
      listingPolicies: {
        fulfillmentPolicyId,
        paymentPolicyId,
        returnPolicyId,
      },
    };

    const offer = await callEbayJson(`${baseUrl}/offer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Content-Language": "de-DE",
        "Accept-Language": "de-DE",
      },
      body: JSON.stringify(offerPayload),
    });

    const offerId = offer.offerId || offer.offer?.offerId || null;

    return res.status(200).json({
      ok: true,
      draftCreated: true,
      published: false,
      offerId,
      sku,
      categoryId: product.categoryId,
      targetRoute: "/api/ebay/create-draft",
      note: "Dies ist ein unveroeffentlichter Inventory-Offer-Entwurf. Es wurde nicht live veroeffentlicht.",
      message: "eBay-Entwurf erstellt. Es wurde nichts veröffentlicht.",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      draftCreated: false,
      published: false,
      targetRoute: "/api/ebay/create-draft",
      error: error.message || "eBay-Entwurf konnte nicht erstellt werden.",
      ebayResponse: error.ebayResponse || undefined,
    });
  }
}
