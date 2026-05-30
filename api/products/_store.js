import { normalizeSupplierProduct } from "../../lib/supplier-product-normalizer.js";
import { sanitizeSupplierProductImport } from "../../lib/supplier-import-sanitizer.js";

function toText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    return value
      .split(/\r?\n|\s*\|\s*|\s*;\s*/)
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }
  return [];
}

function looksLikeVariantGroups(value) {
  return Array.isArray(value) && value.every((item) => item && typeof item === "object" && typeof item.name === "string" && Array.isArray(item.options));
}

function normalizeStatus(value) {
  const text = toText(value);
  if (!text) return "Draft";
  return text;
}

export function normalizeProduct(product = {}) {
  const now = new Date().toISOString();
  const sanitizedImport = sanitizeSupplierProductImport(product, product.supplier || product.sourceProvider || product.supplierId || "");
  const normalizedSupplier = normalizeSupplierProduct(sanitizedImport, {
    supplier: product.supplier || product.sourceProvider || product.supplierId || "",
  });
  const images = Array.isArray(product.images)
    ? product.images
    : toArray(product.sourceOnlineImages || product.image || product.sourceOnlineImage);
  const image = toText(
    product.image ||
      product.sourceOnlineImage ||
      images[0] ||
      product.thumbnail
  );
  const salePrice = toNumber(product.salePrice ?? product.sell ?? product.price ?? 0, 0);
  const buyPrice = toNumber(product.buyPrice ?? product.buy ?? 0, 0);
  const shippingCost = toNumber(product.shippingCost ?? product.ship ?? 0, 0);
  const suggestedSalePrice = toNumber(
    product.suggestedSalePrice ?? product.recommendedPrice ?? product.suggestedPrice ?? 0,
    salePrice
  );
  const profit = toNumber(
    product.profit ?? salePrice - buyPrice - shippingCost,
    salePrice - buyPrice - shippingCost
  );
  const margin = toNumber(
    product.margin ?? (salePrice > 0 ? (profit / salePrice) * 100 : 0),
    salePrice > 0 ? (profit / salePrice) * 100 : 0
  );
  const reviewItems = toArray(product.reviewItems ?? product.issues);
  const warnings = toArray(product.warnings ?? product.complianceRisks);

  return {
    ...product,
    id: toText(product.id || product.sku || product.url || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    title: toText(product.title || product.name || "Unbenanntes Produkt"),
    name: toText(product.name || product.title || "Unbenanntes Produkt"),
    image,
    images: images.map((item) => toText(item)).filter(Boolean).slice(0, 20),
    source: toText(product.source || product.sourceProvider || product.supplier || product.supplierId),
    supplier: toText(product.supplier || product.sourceProvider || product.supplierId),
    supplierLink: toText(product.supplierLink || product.url),
    sourceProvider: toText(product.sourceProvider || normalizedSupplier.supplier || product.supplierId),
    supplierProduct: normalizedSupplier,
    supplierImportDebug: sanitizedImport.debug || {},
    sourceUrl: toText(product.sourceUrl || normalizedSupplier.sourceUrl || product.supplierLink || product.url),
    currency: toText(product.currency || normalizedSupplier.currency || product.sourceOnlineCurrency),
    description: toText(product.description || normalizedSupplier.description || product.sourceOnlineDescription),
    variants: looksLikeVariantGroups(product.variants) ? product.variants : normalizedSupplier.variants,
    shipping: product.shipping && typeof product.shipping === "object" ? product.shipping : normalizedSupplier.shipping,
    category: toText(product.category || normalizedSupplier.category || product.sourceOnlineCategory),
    importedAt: toText(product.importedAt || normalizedSupplier.importedAt || product.createdAt || now),
    sourceOnlineDescription: toText(product.sourceOnlineDescription || normalizedSupplier.description),
    sourceOnlineVariants: Array.isArray(product.sourceOnlineVariants) ? product.sourceOnlineVariants : JSON.stringify(normalizedSupplier.variants || []),
    buyPrice,
    salePrice,
    suggestedSalePrice,
    shippingCost,
    profit: Math.round(profit * 100) / 100,
    margin: Math.round(margin * 100) / 100,
    readinessScore: toNumber(product.readinessScore ?? product.listingScore ?? product.score ?? 0, 0),
    reviewItems,
    warnings,
    status: normalizeStatus(product.status || product.productStatus),
    createdAt: toText(product.createdAt || product.savedAt || now) || now,
    updatedAt: toText(product.updatedAt || now) || now,
  };
}

function normalizeList(list) {
  return Array.isArray(list) ? list.map(normalizeProduct) : [];
}

function getRedisConfig() {
  const pairs = [
    { source: "custom_upstash_backup", url: process.env.UPSTASH_BACKUP_URL, token: process.env.UPSTASH_BACKUP_TOKEN },
    { source: "upstash_redis_rest", url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN },
    { source: "vercel_kv_rest", url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN },
  ];
  return pairs.find((pair) => pair.url && pair.token) || { source: "memory", url: "", token: "" };
}

async function redisCommand(command) {
  const { url, token } = getRedisConfig();
  if (!url || !token) return null;
  const response = await fetch(url.replace(/\/$/, ""), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(command),
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
  } catch {}
  return [];
}

function readMemoryStore() {
  const raw = globalThis.__elyonProductsStore;
  return Array.isArray(raw) ? normalizeList(raw) : [];
}

function writeMemoryStore(items) {
  globalThis.__elyonProductsStore = normalizeList(items);
  return globalThis.__elyonProductsStore;
}

export async function loadProducts() {
  const { url, token } = getRedisConfig();
  if (!url || !token) return readMemoryStore();
  try {
    const data = await redisCommand(["GET", "elyon_products_v2"]);
    const items = normalizeList(parseStoredList(data?.result));
    writeMemoryStore(items);
    return items;
  } catch {
    return readMemoryStore();
  }
}

export async function saveProducts(items) {
  const normalized = writeMemoryStore(items);
  const { url, token } = getRedisConfig();
  if (!url || !token) return { items: normalized, persisted: false };
  try {
    await redisCommand(["SET", "elyon_products_v2", JSON.stringify(normalized)]);
    return { items: normalized, persisted: true };
  } catch {
    return { items: normalized, persisted: false };
  }
}

export function upsertProduct(list, incoming) {
  const product = normalizeProduct(incoming);
  const index = list.findIndex((item) => String(item.id) === String(product.id));
  if (index >= 0) {
    const next = [...list];
    next[index] = normalizeProduct({ ...next[index], ...product, updatedAt: new Date().toISOString() });
    return { items: next, product: next[index] };
  }
  return { items: [product, ...list], product };
}

export function deleteProductById(list, id) {
  const next = list.filter((item) => String(item.id) !== String(id));
  return { items: next, removed: next.length !== list.length };
}

export function buildDraftPreview(product) {
  const normalized = normalizeProduct(product);
  const title = normalized.title;
  const description = [
    `Produkt: ${normalized.title}`,
    normalized.source ? `Quelle: ${normalized.source}` : "",
    normalized.supplierLink ? `Supplier-Link: ${normalized.supplierLink}` : "",
    normalized.reviewItems.length ? `Review: ${normalized.reviewItems.join(", ")}` : "",
    normalized.warnings.length ? `Warnungen: ${normalized.warnings.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    ok: true,
    draft: {
      source: "product-api",
      productId: normalized.id,
      productStatus: normalized.status,
      status: normalized.status,
      listingScore: normalized.readinessScore,
      issues: normalized.reviewItems,
      supplier: normalized.source || normalized.supplier,
      supplierLink: normalized.supplierLink,
      images: normalized.images.length ? normalized.images : normalized.image ? [normalized.image] : [],
      pricing: {
        buyPrice: normalized.buyPrice,
        salePrice: normalized.salePrice,
        suggestedSalePrice: normalized.suggestedSalePrice,
        shippingCost: normalized.shippingCost,
        profit: normalized.profit,
        margin: normalized.margin,
      },
      briefing: {
        name: title,
        mainKeyword: title,
        supplier: normalized.source || normalized.supplier,
        supplierLink: normalized.supplierLink,
        mode: "manual_preview",
      },
      draft: {
        title,
        description,
        notes: "Nur Vorschau. Keine Veröffentlichung und kein automatisches eBay-Posting.",
      },
      generated: {
        title,
        description,
        keywords: [normalized.source, normalized.supplier].filter(Boolean).join(", "),
      },
      updatedAt: new Date().toISOString(),
      savedAt: new Date().toISOString(),
    },
  };
}

export function getStorageMeta(persisted = false) {
  const config = getRedisConfig();
  const configured = Boolean(config.url && config.token);
  return {
    configured,
    persisted: Boolean(persisted),
    mode: configured ? "server_persistent" : "server_memory",
    source: config.source,
  };
}
