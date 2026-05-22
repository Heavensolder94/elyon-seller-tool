import { routeAIRequest } from "../../lib/ai-provider-router.js";

function json(res, status, body) {
  return res.status(status).json(body);
}

function normalizeBody(body) {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body && typeof body === "object" ? body : {};
}

function toText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function decodeHtmlEntities(value) {
  return toText(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isHumanVerificationText(value) {
  return /\b(human verification|verify you are human|captcha|bot detection|access denied|forbidden)\b/i.test(toText(value));
}

function sanitizeProductTitle(value) {
  const text = toText(value);
  if (isHumanVerificationText(text)) return "";
  return text
    .replace(/\s*:\s*Amazon\.[^:]+(?::.*)?$/i, "")
    .replace(/\s*-\s*AliExpress.*$/i, "")
    .replace(/\s*\|\s*eBay.*$/i, "")
    .trim()
    .slice(0, 260);
}

function sanitizeProductDescription(value) {
  const text = toText(value);
  return isHumanVerificationText(text) ? "" : text;
}

function firstUsefulText(values) {
  const list = Array.isArray(values) ? values : [values];
  for (const value of list) {
    const text = sanitizeProductDescription(value);
    if (text && text.length >= 30) return text;
  }
  return "";
}

function cleanAvailability(value) {
  let text = toText(value);
  if (!text) return "";
  text = text.replace(/\{[\s\S]*$/, "").trim();
  text = text.replace(/\[[\s\S]*$/, "").trim();
  text = text.replace(/"\s*,?\s*".*$/g, "").trim();
  text = text.replace(/\b(isInternal|showInsightsHub|isRobot|showFaceout|merchantId|availableBadges|loggedIn|asin|showBadge|ingressFaceout|availableFaceouts)\b[\s\S]*$/i, "").trim();
  text = text.replace(/\s{2,}/g, " ");
  return text.slice(0, 160);
}

function normalizeImageUrl(value) {
  const text = decodeHtmlEntities(value);
  if (!text || /^data:/i.test(text) || /^blob:/i.test(text)) return "";
  try {
    const url = new URL(text);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function detectCurrency(value, fallback = "") {
  const text = toText(value);
  if (/€|\bEUR\b|\bEuro\b/i.test(text)) return "EUR";
  if (/\$|\bUSD\b/i.test(text)) return "USD";
  if (/£|\bGBP\b/i.test(text)) return "GBP";
  if (/¥|\bJPY\b/i.test(text)) return "JPY";
  return toText(fallback);
}

function normalizePrice(value, fallbackCurrency = "") {
  const text = toText(value);
  const currency = detectCurrency(text, fallbackCurrency);
  if (!text) return { price: "", currency };
  const withoutCurrency = text
    .replace(/\b(EUR|Euro|USD|GBP|JPY)\b/gi, "")
    .replace(/[€$£¥]/g, "")
    .trim();
  const match = withoutCurrency.match(/[\d]{1,3}(?:[.\s]\d{3})*(?:[.,]\d{1,2})?|[\d]+/);
  return {
    price: match ? match[0].replace(/\s+/g, "") : withoutCurrency,
    currency
  };
}

function normalizeImages(primary, images) {
  const list = [primary, ...toArray(images)]
    .map(normalizeImageUrl)
    .filter(Boolean);
  return Array.from(new Set(list)).slice(0, 20);
}

function normalizeDomain(value) {
  const text = toText(value).toLowerCase();
  try {
    const url = text.includes("://") ? new URL(text) : new URL(`https://${text}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return text.replace(/^www\./, "");
  }
}

const SUPPLIER_MAP = [
  { id: "supplier-cjdropshipping", name: "CJdropshipping", domains: ["cjdropshipping.com"] },
  { id: "supplier-aliexpress", name: "AliExpress", domains: ["aliexpress.com"] },
  { id: "supplier-amazon-de", name: "Amazon.de", domains: ["amazon.de"] },
  { id: "supplier-amazon", name: "Amazon", domains: ["amazon.com"] },
  { id: "supplier-temu", name: "Temu", domains: ["temu.com"] },
  { id: "supplier-alibaba", name: "Alibaba", domains: ["alibaba.com"] },
  { id: "supplier-bigbuy", name: "BigBuy", domains: ["bigbuy.eu", "bigbuy.com"] },
  { id: "supplier-dropxl", name: "dropXL", domains: ["dropxl.com"] },
  { id: "supplier-vidaxl", name: "vidaXL", domains: ["vidaxl.de", "vidaxl.com", "dropshippingxl.com"] }
];

function resolveSupplier(domain, supplier) {
  const domainValue = normalizeDomain(domain);
  const supplierValue = toText(supplier).toLowerCase();
  const found = SUPPLIER_MAP.find((entry) =>
    entry.domains.some((candidate) => domainValue === candidate || domainValue.endsWith(`.${candidate}`) || supplierValue.includes(entry.name.toLowerCase()))
  );

  if (!found) {
    return { linkedSupplierId: "", linkedSupplierName: "" };
  }

  return { linkedSupplierId: found.id, linkedSupplierName: found.name };
}

function normalizeImport(product = {}) {
  const now = new Date().toISOString();
  const elyonProduct = toObject(product.elyonProduct || product.normalizedProduct || {});
  const elyonIdentity = toObject(elyonProduct.identity);
  const elyonContent = toObject(elyonProduct.content);
  const elyonMedia = toObject(elyonProduct.media);
  const elyonPricing = toObject(elyonProduct.pricing);
  const elyonAvailability = toObject(elyonProduct.availability);
  const elyonSupplier = toObject(elyonProduct.supplier);
  const elyonReviews = toObject(elyonProduct.reviews);
  const elyonRisk = toObject(elyonProduct.risk);
  const url = toText(product.url || "");
  const domain = normalizeDomain(product.domain || (url ? (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })() : ""));
  const supplier = toText(product.supplier || "");
  const supplierMatch = resolveSupplier(domain, supplier);
  const linkedSupplierId = toText(product.linkedSupplierId || supplierMatch.linkedSupplierId);
  const rawTitle = sanitizeProductTitle(product.title || product.name || elyonIdentity.title || "");
  const rawDescription = firstUsefulText([
    product.description,
    product.productDescription,
    product.sourceOnlineDescription,
    product.longDescription,
    product.shortDescription,
    product.summary,
    elyonContent.longDescription,
    ...(Array.isArray(elyonContent.bulletPoints) ? elyonContent.bulletPoints : []),
    ...(Array.isArray(product.descriptionCandidates) ? product.descriptionCandidates : [])
  ]);
  const blocked = isHumanVerificationText(product.title || product.name || "") || isHumanVerificationText(rawDescription);
  const priceParts = normalizePrice(product.price || elyonPricing.priceText || elyonPricing.currentPrice || "", product.currency || elyonPricing.currency || "");
  const images = normalizeImages(product.image || elyonMedia.mainImage, Array.isArray(product.images) && product.images.length ? product.images : elyonMedia.images);
  return {
    id: toText(product.id || url || `${now}-${Math.random().toString(36).slice(2, 10)}`),
    title: rawTitle || "Unbekanntes Produkt",
    price: priceParts.price,
    currency: priceParts.currency,
    image: images[0] || "",
    images,
    description: rawDescription,
    descriptionCandidates: toArray(product.descriptionCandidates).map(toText).filter(Boolean).slice(0, 8),
    descriptionSource: toText(product.descriptionSource || ""),
    elyonProduct,
    normalizedProduct: elyonProduct,
    extractionDebug: toObject(product.extractionDebug),
    aiPrepared: product.aiPrepared && typeof product.aiPrepared === "object" ? product.aiPrepared : null,
    aiPreparedAt: toText(product.aiPreparedAt || ""),
    aiProvider: toText(product.aiProvider || ""),
    aiModel: toText(product.aiModel || ""),
    aiStatus: toText(product.aiStatus || ""),
    aiError: toText(product.aiError || ""),
    variants: toArray(product.variants).length ? toArray(product.variants).slice(0, 50) : toArray(toObject(elyonProduct.variants).variantItems).slice(0, 50),
    shipping: toObject(product.shipping),
    rating: toText(product.rating || elyonReviews.ratingValue || ""),
    reviewsCount: toText(product.reviewsCount || elyonReviews.reviewsCount || ""),
    soldCount: toText(product.soldCount || ""),
    productDetails: Object.keys(toObject(product.productDetails)).length ? toObject(product.productDetails) : toObject(elyonContent.productDetails),
    availability: cleanAvailability(product.availability || elyonAvailability.stockText || ""),
    category: toText(product.category || elyonIdentity.category || ""),
    supplierInfo: Object.keys(toObject(product.supplierInfo)).length ? toObject(product.supplierInfo) : elyonSupplier,
    complianceRisks: toArray(product.complianceRisks).length ? toArray(product.complianceRisks).map(toText).filter(Boolean).slice(0, 20) : toArray(elyonRisk.warningTexts).map(toText).filter(Boolean).slice(0, 20),
    url,
    supplier: supplier || supplierMatch.linkedSupplierName || "",
    domain,
    detectedAt: toText(product.detectedAt || now) || now,
    source: "chrome_extension",
    status: blocked ? "blocked" : (toText(product.status || "new") || "new"),
    notes: toText(product.notes || ""),
    score: toText(product.score || ""),
    linkedSupplierId,
    linkedSupplierName: supplierMatch.linkedSupplierName || "",
    importedAt: toText(product.importedAt || now) || now,
    updatedAt: toText(product.updatedAt || now) || now,
    blockedByHumanVerification: blocked
  };
}

function parseJsonObjectFromText(value) {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  const text = String(value || "").trim();
  if (!text) return null;
  const candidates = [
    text,
    text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim(),
  ];
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Providers can wrap JSON in Markdown or prose. Try next candidate.
    }
  }
  return null;
}

function normalizeStringArray(value, limit = 12) {
  return toArray(value).map(toText).filter(Boolean).slice(0, limit);
}

function normalizeAiPrepared(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    cleanTitle: toText(source.cleanTitle || source.title || ""),
    rawDescription: toText(source.rawDescription || ""),
    cleanDescription: toText(source.cleanDescription || source.description || ""),
    bulletPoints: normalizeStringArray(source.bulletPoints || source.bullets || source.features, 16),
    technicalDetails: toObject(source.technicalDetails || source.specifications || source.details),
    includedItems: normalizeStringArray(source.includedItems || source.packageContents || source.includes, 12),
    material: toText(source.material || ""),
    dimensions: toText(source.dimensions || source.size || ""),
    shippingInfo: toText(source.shippingInfo || source.shipping || ""),
    supplierWarnings: normalizeStringArray(source.supplierWarnings || source.warnings, 12),
    complianceHints: normalizeStringArray(source.complianceHints || source.compliance || source.risks, 12),
    elyonSummary: toText(source.elyonSummary || source.summary || ""),
    confidence: Number.isFinite(Number(source.confidence)) ? Math.max(0, Math.min(100, Number(source.confidence))) : 0,
  };
}

function buildBrowserImportAiPrompt(product) {
  const payload = {
    title: product.title,
    price: product.price,
    currency: product.currency,
    supplier: product.supplier,
    domain: product.domain,
    url: product.url,
    description: product.description,
    descriptionCandidates: product.descriptionCandidates || [],
    productDetails: product.productDetails || {},
    variants: product.variants || [],
    shipping: product.shipping || {},
    availability: product.availability,
    category: product.category,
    complianceRisks: product.complianceRisks || [],
    elyonProduct: product.elyonProduct || product.normalizedProduct || null,
    extractionDebug: product.extractionDebug || null,
  };

  return [
    "Du strukturierst einen Browser-Import fuer das Elyon Seller Tool.",
    "Ziel: Originaldaten bewahren, aber eine saubere Elyon-Version vorbereiten.",
    "Keine Bestellung, kein Listing, keine Live-Aktion. Nur Daten strukturieren.",
    "Waehle die echte Artikelbeschreibung aus den Kandidaten. Entferne Menue-, Cookie-, Policy-, Login-, Empfehlungs- und Werbetexte.",
    "Erfinde keine Fakten. Wenn etwas fehlt, leer lassen.",
    "Antworte ausschliesslich mit validem JSON ohne Markdown.",
    'Schema: {"cleanTitle":"","rawDescription":"","cleanDescription":"","bulletPoints":[],"technicalDetails":{},"includedItems":[],"material":"","dimensions":"","shippingInfo":"","supplierWarnings":[],"complianceHints":[],"elyonSummary":"","confidence":0}',
    "",
    "Produktdaten:",
    JSON.stringify(payload, null, 2).slice(0, 18000),
  ].join("\n");
}

async function prepareBrowserImportWithAi(product) {
  const provider = toText(process.env.BROWSER_IMPORT_AI_PROVIDER || process.env.AI_BROWSER_IMPORT_PROVIDER || "qwen").toLowerCase();
  const model =
    provider === "deepseek"
      ? toText(process.env.BROWSER_IMPORT_AI_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-v4-flash")
      : provider === "openai"
        ? toText(process.env.BROWSER_IMPORT_AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini")
        : toText(process.env.BROWSER_IMPORT_AI_MODEL || process.env.QWEN_MODEL || "qwen-plus");

  try {
    const result = await routeAIRequest({
      provider,
      model,
      task: "browser_import_structure",
      prompt: buildBrowserImportAiPrompt(product),
      temperature: 0.1,
      maxTokens: 1800,
      allowFallback: true,
      safety: {
        securityMode: true,
        sandboxMode: true,
        autonomyLocked: true,
        requiresLiveAction: false,
        userApproved: false,
      },
      context: { source: "chrome_extension_browser_import", productId: product.id },
    });

    if (!result || !result.ok || result.fallbackUsed && result.provider === "local") {
      return {
        ...product,
        aiPrepared: null,
        aiStatus: "not_available",
        aiError: result?.error?.message || result?.content || "KI-Struktur nicht verfuegbar.",
      };
    }

    const parsed = parseJsonObjectFromText(result.result || result.content);
    if (!parsed) {
      return {
        ...product,
        aiPrepared: null,
        aiStatus: "parse_failed",
        aiProvider: result.provider || provider,
        aiModel: result.model || model,
        aiError: "KI-Antwort war kein verwertbares JSON.",
      };
    }

    return {
      ...product,
      aiPrepared: normalizeAiPrepared(parsed),
      aiPreparedAt: new Date().toISOString(),
      aiProvider: result.provider || provider,
      aiModel: result.model || model,
      aiStatus: "prepared",
      aiError: "",
    };
  } catch (error) {
    return {
      ...product,
      aiPrepared: null,
      aiStatus: "failed",
      aiError: error && error.message ? error.message : "KI-Strukturierung fehlgeschlagen.",
    };
  }
}

function normalizeList(list) {
  return Array.isArray(list) ? list.map(normalizeImport) : [];
}

function readStore() {
  const raw = globalThis.__elyonBrowserImports;
  return Array.isArray(raw) ? normalizeList(raw) : [];
}

function writeStore(next) {
  globalThis.__elyonBrowserImports = normalizeList(next);
  return globalThis.__elyonBrowserImports;
}

function getStorageInfo(persisted = false) {
  const config = getRedisConfig();
  const configured = Boolean(config.url && config.token);
  return {
    configured,
    persisted: Boolean(persisted),
    mode: configured ? "server_persistent" : "server_memory",
    source: config.source,
    message: configured
      ? "Serverseitige Persistenz aktiv."
      : "Serverseitig aktiv, aber ohne persistente Storage-Umgebung. Bitte Vercel Storage/Upstash verbinden."
  };
}

function getRedisConfig() {
  const pairs = [
    { source: "custom_upstash_backup", url: process.env.UPSTASH_BACKUP_URL, token: process.env.UPSTASH_BACKUP_TOKEN },
    { source: "upstash_redis_rest", url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN },
    { source: "vercel_kv_rest", url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN }
  ];
  const found = pairs.find((pair) => pair.url && pair.token);
  return found || { source: "memory", url: "", token: "" };
}

async function redisCommand(command) {
  const { url, token } = getRedisConfig();
  if (!url || !token) return null;
  const response = await fetch(url.replace(/\/$/, ""), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(command)
  });
  if (!response.ok) throw new Error(`Redis REST ${response.status}`);
  return response.json().catch(() => null);
}

function parseStoredList(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.value)) return raw.value;
  if (typeof raw !== "string") return [];

  try {
    const parsed = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.value)) return parsed.value;
    return [];
  } catch {
    return [];
  }
}

async function readPersistentList(key) {
  const data = await redisCommand(["GET", key]);
  return normalizeList(parseStoredList(data?.result));
}

function browserImportFromProduct(product = {}) {
  const sourceType = toText(product.sourceType || product.source || "");
  const sourceProvider = toText(product.sourceProvider || "");
  const sourceDomain = toText(product.sourceDomain || product.domain || "");
  const sourceUrl = toText(product.supplierLink || product.url || "");
  const looksLikeBrowserImport =
    sourceType === "chrome_extension" ||
    sourceProvider === "browser-import" ||
    Boolean(product.sourceOnlineTitle || product.sourceOnlineImage || product.sourceOnlineImages);

  if (!looksLikeBrowserImport) return null;

  let images = [];
  if (Array.isArray(product.images)) images = product.images;
  if (Array.isArray(product.sourceOnlineImages)) images = product.sourceOnlineImages;
  if (typeof product.sourceOnlineImages === "string" && product.sourceOnlineImages.trim()) {
    try {
      const parsed = JSON.parse(product.sourceOnlineImages);
      if (Array.isArray(parsed)) images = parsed;
    } catch {
      images = [];
    }
  }

  return normalizeImport({
    id: product.browserImportId || product.id || sourceUrl,
    title: product.sourceOnlineTitle || product.title || product.name || "",
    price: product.sourceOnlinePrice || product.price || "",
    currency: product.sourceOnlineCurrency || product.currency || "",
    image: product.sourceOnlineImage || product.image || images[0] || "",
    images,
    description: product.sourceOnlineDescription || product.description || product.notes || "",
    url: sourceUrl,
    supplier: product.supplier || product.supplierId || product.sourceProvider || "",
    domain: sourceDomain,
    status: product.sourceImportStatus || product.status || "reviewed",
    detectedAt: product.sourceOnlineCheckedAt || product.detectedAt || product.createdAt || "",
    importedAt: product.sourceOnlineCheckedAt || product.importedAt || product.createdAt || "",
    linkedSupplierId: product.supplierId || product.linkedSupplierId || "",
    linkedSupplierName: product.linkedSupplierName || product.supplier || "",
    availability: product.sourceOnlineAvailability || "",
    category: product.sourceOnlineCategory || product.category || "",
    rating: product.sourceOnlineRating || product.rating || "",
    reviewsCount: product.sourceOnlineReviews || product.reviewsCount || "",
    soldCount: product.sourceOnlineSold || product.soldCount || "",
  });
}

async function loadPersistentStore() {
  const { url, token } = getRedisConfig();
  if (!url || !token) {
    return readStore();
  }

  try {
    let normalized = await readPersistentList("elyon_browser_imports");
    if (!normalized.length) {
      const recovered = (await readPersistentList("elyon_products"))
        .map(browserImportFromProduct)
        .filter(Boolean);
      if (recovered.length) {
        normalized = recovered;
        await redisCommand(["SET", "elyon_browser_imports", JSON.stringify(normalized)]);
      }
    }
    writeStore(normalized);
    return normalized;
  } catch {
    return readStore();
  }
}

async function savePersistentStore(items) {
  const normalized = writeStore(items);
  const { url, token } = getRedisConfig();
  if (!url || !token) {
    return { persisted: false, items: normalized };
  }

  try {
    await redisCommand(["SET", "elyon_browser_imports", JSON.stringify(normalized)]);
    return { persisted: true, items: normalized };
  } catch {
    return { persisted: false, items: normalized };
  }
}

function upsertImport(list, incoming) {
  const item = normalizeImport(incoming);
  const existingIndex = list.findIndex((entry) => entry.url && entry.url === item.url);
  if (existingIndex >= 0) {
    const current = list[existingIndex];
    const merged = { ...current, ...item, updatedAt: new Date().toISOString() };
    const changed = JSON.stringify(current) !== JSON.stringify(merged);
    const next = [...list];
    next[existingIndex] = merged;
    return { next, status: changed ? "updated" : "duplicate", product: merged };
  }
  return { next: [item, ...list], status: "saved", product: item };
}

function deleteImport(list, incoming) {
  const id = toText(incoming.id || incoming.productId || "");
  const url = toText(incoming.url || "");
  const next = list.filter((entry) => {
    const sameId = id && toText(entry.id) === id;
    const sameUrl = url && toText(entry.url) === url;
    return !(sameId || sameUrl);
  });
  return { next, deleted: next.length !== list.length };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const items = await loadPersistentStore();
    return json(res, 200, {
      ok: true,
      route: "/api/extension/import-product",
      items,
      total: items.length,
      storage: getStorageInfo(false)
    });
  }

  if (req.method === "DELETE") {
    const body = normalizeBody(req.body);
    const incoming = body.product || body.item || body.data || body || {};
    const current = await loadPersistentStore();
    const result = deleteImport(current, incoming);
    const persisted = await savePersistentStore(result.next);
    return json(res, 200, {
      ok: true,
      route: "/api/extension/import-product",
      status: result.deleted ? "deleted" : "not_found",
      deleted: result.deleted,
      total: persisted.items.length,
      persisted: persisted.persisted,
      storage: getStorageInfo(persisted.persisted),
      message: result.deleted ? "Browser Import verworfen." : "Browser Import nicht gefunden."
    });
  }

  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Nur GET, POST und DELETE erlaubt." });
  }

  const body = normalizeBody(req.body);
  const incoming = body.product || body.item || body.data || body || {};
  const current = await loadPersistentStore();
  const normalizedIncoming = normalizeImport(incoming);
  const aiReadyIncoming = await prepareBrowserImportWithAi(normalizedIncoming);
  const result = upsertImport(current, aiReadyIncoming);
  const persisted = await savePersistentStore(result.next);

  return json(res, 200, {
    ok: true,
    route: "/api/extension/import-product",
    status: result.status,
    productId: result.product.id,
    linkedSupplierId: result.product.linkedSupplierId || "",
    message: result.status === "duplicate"
      ? "Browser Import war bereits vorhanden."
      : result.status === "updated"
        ? "Browser Import aktualisiert."
        : "Browser Import gespeichert.",
    product: result.product,
    total: persisted.items.length,
    persisted: persisted.persisted,
    storage: getStorageInfo(persisted.persisted)
  });
}
