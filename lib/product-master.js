function toText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {
      return value.split(/\n|,/).map((entry) => entry.trim()).filter(Boolean);
    }
  }
  return [];
}

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function parseMoney(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = toText(value).replace(/\s/g, "").replace(",", ".");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function parseShippingCost(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  const raw = toText(value);
  if (!raw) return 0;
  if (/kostenlos|free\s*shipping|gratis/i.test(raw)) return 0;
  const hasCurrency = /€|\bEUR\b|\bEuro\b|\$|\bUSD\b|£|\bGBP\b/i.test(raw);
  if (!hasCurrency) return 0;
  return Math.max(0, parseMoney(raw));
}

function roundPrice(value) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return 0;
  const rounded = Math.ceil(Number(value)) - 0.01;
  return Number(Math.max(rounded, 0.99).toFixed(2));
}

function buildPriceSuggestions(buyPrice, shippingCost = 0) {
  const baseCost = Math.max(0, Number(buyPrice || 0)) + Math.max(0, Number(shippingCost || 0));
  if (!baseCost) return [];
  const candidates = [
    { label: "Budget", multiplier: 4.5, minimum: 7.99 },
    { label: "Standard", multiplier: 6.5, minimum: 9.99 },
    { label: "Premium", multiplier: 9, minimum: 12.99 },
  ];
  return candidates.map((candidate) => {
    const price = roundPrice(Math.max(baseCost * candidate.multiplier, candidate.minimum));
    const estimatedFees = price * 0.13;
    const profit = price - baseCost - estimatedFees;
    const marginPercent = price > 0 ? (profit / price) * 100 : 0;
    return {
      label: candidate.label,
      price,
      estimatedFees: Number(estimatedFees.toFixed(2)),
      profit: Number(profit.toFixed(2)),
      marginPercent: Number(marginPercent.toFixed(2)),
      note: "Vorschlag, keine automatische Freigabe.",
    };
  });
}

function detectCurrency(...values) {
  const text = values.map(toText).join(" ");
  if (/€|\bEUR\b|\bEuro\b/i.test(text)) return "EUR";
  if (/\$|\bUSD\b/i.test(text)) return "USD";
  if (/£|\bGBP\b/i.test(text)) return "GBP";
  return "EUR";
}

function inferSource(product = {}) {
  const source = toText(product.source || product.sourceType || product.sourceProvider || "").toLowerCase();
  const url = toText(product.url || product.sourceUrl || product.supplierLink || "").toLowerCase();
  const domain = toText(product.domain || product.sourceDomain || "").toLowerCase();
  const haystack = `${source} ${url} ${domain}`;
  if (haystack.includes("cjdropshipping") || haystack.includes("cj")) return "cj";
  if (haystack.includes("aliexpress")) return "aliexpress";
  if (haystack.includes("amazon")) return "amazon";
  if (haystack.includes("temu")) return "temu";
  if (source.includes("chrome_extension")) return "browser_extension";
  return source || "manual";
}

function productIdFrom(product = {}) {
  const candidates = [
    product.productId,
    product.masterProductId,
    product.id,
    product.pid,
    product.sku,
    product.productSku,
    product.url,
    product.sourceUrl,
    product.supplierLink,
  ].map(toText).filter(Boolean);
  const base = candidates[0] || `product-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return base.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 120) || `product-${Date.now()}`;
}

export function normalizeProduct(input = {}) {
  const product = toObject(input);
  const source = inferSource(product);
  const images = toArray(product.images || product.sourceOnlineImages || product.imageUrls || product.gallery);
  const image = toText(product.image || product.sourceOnlineImage || images[0] || "");
  const title = toText(product.title || product.productName || product.productNameEn || product.sourceOnlineTitle || product.name || "Unbenanntes Produkt");
  const description = toText(product.description || product.sourceOnlineDescription || product.cleanDescription || product.notes || "");
  const supplierUrl = toText(product.supplierLink || product.url || product.sourceUrl || product.productUrl || "");
  const buyPrice = parseMoney(product.buyPrice || product.costPrice || product.purchasePrice || product.sourceOnlinePrice || product.price || product.sellPrice);
  const salePrice = parseMoney(product.salePrice || product.targetPrice || product.ebayPrice || product.retailPrice || 0);
  const shippingCost = parseShippingCost(product.shippingCost || product.shipping?.cost || product.deliveryCost || product.shippingInfo || product.shipping?.text || product.availability || 0);
  const priceSuggestions = buildPriceSuggestions(buyPrice, shippingCost);
  const suggestedSalePrice = priceSuggestions.find((item) => item.label === "Standard")?.price || priceSuggestions[0]?.price || 0;
  const effectiveSalePrice = salePrice || 0;
  const marketplaceFeePercent = Number.isFinite(Number(product.marketplaceFeePercent)) ? Number(product.marketplaceFeePercent) : 13;
  const paymentFeePercent = Number.isFinite(Number(product.paymentFeePercent)) ? Number(product.paymentFeePercent) : 0;
  const estimatedFees = effectiveSalePrice > 0 ? effectiveSalePrice * ((marketplaceFeePercent + paymentFeePercent) / 100) : 0;
  const profit = effectiveSalePrice > 0 ? effectiveSalePrice - buyPrice - shippingCost - estimatedFees : 0;
  const marginPercent = effectiveSalePrice > 0 ? (profit / effectiveSalePrice) * 100 : 0;
  const warnings = [];

  if (!title || title === "Unbenanntes Produkt") warnings.push("Titel fehlt oder ist unklar.");
  if (!description) warnings.push("Beschreibung fehlt.");
  if (!image && images.length === 0) warnings.push("Bilder fehlen.");
  if (!supplierUrl) warnings.push("Lieferanten-Link fehlt.");
  if (!buyPrice) warnings.push("Einkaufspreis fehlt.");
  if (!salePrice && suggestedSalePrice) warnings.push(`Verkaufspreis fehlt noch. Vorschlag: ${suggestedSalePrice.toFixed(2)} EUR.`);
  if (!salePrice && !suggestedSalePrice) warnings.push("Verkaufspreis fehlt noch.");
  if (salePrice > 0 && marginPercent < 15) warnings.push("Marge unter 15 Prozent prüfen.");

  const readinessScore = Math.round([
    Boolean(title && title !== "Unbenanntes Produkt"),
    Boolean(description),
    Boolean(image || images.length),
    Boolean(supplierUrl),
    Boolean(buyPrice),
    Boolean(salePrice || suggestedSalePrice),
    Boolean((salePrice > 0 && marginPercent >= 15) || (!salePrice && suggestedSalePrice)),
  ].filter(Boolean).length / 7 * 100);

  return {
    id: productIdFrom(product),
    title,
    description,
    images: image ? Array.from(new Set([image, ...images])) : Array.from(new Set(images)),
    source,
    supplier: {
      id: toText(product.linkedSupplierId || product.supplierId || ""),
      name: toText(product.linkedSupplierName || product.supplierName || product.supplier || ""),
      url: supplierUrl,
      domain: toText(product.domain || product.sourceDomain || ""),
    },
    pricing: {
      currency: toText(product.currency || product.sourceOnlineCurrency || detectCurrency(product.price, product.sourceOnlinePrice)),
      buyPrice,
      salePrice,
      suggestedSalePrice,
      priceSuggestions,
      shippingCost,
      marketplaceFeePercent,
      paymentFeePercent,
      estimatedFees: Number(estimatedFees.toFixed(2)),
      profit: Number(profit.toFixed(2)),
      marginPercent: Number(marginPercent.toFixed(2)),
    },
    logistics: {
      shippingInfo: toText(product.shippingInfo || product.shipping?.text || product.sourceOnlineAvailability || product.availability || ""),
      variants: toArray(product.variants).slice(0, 80),
      stock: toText(product.stock || product.inventory || product.warehouseInventoryNum || ""),
    },
    compliance: {
      risks: toArray(product.complianceRisks || product.complianceHints || product.aiPrepared?.complianceHints).map(toText).filter(Boolean).slice(0, 20),
      status: toText(product.complianceStatus || "needs_review"),
    },
    listing: {
      ebayItemId: toText(product.ebayItemId || product.listingId || ""),
      status: toText(product.listingStatus || "draft"),
      manualApprovalRequired: true,
      autonomousPostingAllowed: false,
    },
    status: toText(product.status || "new"),
    readiness: {
      score: readinessScore,
      state: warnings.length ? (readinessScore >= 70 ? "needs_review" : "not_ready") : "ready_for_manual_listing",
      warnings,
    },
    raw: product,
    createdAt: toText(product.createdAt || product.importedAt || product.detectedAt || new Date().toISOString()),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeProductList(items = []) {
  return Array.isArray(items) ? items.map(normalizeProduct) : [];
}

export function mergeProductLists(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const product of normalizeProductList(list)) {
      const key = product.supplier.url || product.id;
      const current = map.get(key);
      map.set(key, current ? { ...current, ...product, raw: { ...current.raw, ...product.raw } } : product);
    }
  }
  return Array.from(map.values()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
