import { detectSupplierByUrl } from "./supplier-registry.js";
import { sanitizeSupplierProductImport } from "./supplier-import-sanitizer.js";

function text(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && !value.length) continue;
    return value;
  }
  return "";
}

function normalizeCurrency(value, fallback = "") {
  const raw = text(value);
  if (!raw) return text(fallback);
  if (/€|\bEUR\b/i.test(raw)) return "EUR";
  if (/\$|\bUSD\b/i.test(raw)) return "USD";
  if (/£|\bGBP\b/i.test(raw)) return "GBP";
  return text(fallback);
}

function normalizePrice(value) {
  const raw = text(value);
  if (!raw) return "";
  const match = raw.replace(/[^\d.,-]/g, "").match(/-?\d+(?:[.,]\d+)?/);
  return match ? match[0].replace(",", ".") : raw;
}

function normalizeImage(value) {
  const raw = text(value);
  if (!raw || /^data:/i.test(raw) || /^blob:/i.test(raw)) return "";
  try {
    const url = new URL(raw);
    if (!/^https?:$/i.test(url.protocol)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizeImages(primary, images) {
  const list = [primary, ...toArray(images)].map(normalizeImage).filter(Boolean);
  return Array.from(new Set(list)).slice(0, 40);
}

function normalizeVariants(value) {
  return toArray(value).slice(0, 100).map((variant, index) => {
    const item = toObject(variant);
    if (item.name && Array.isArray(item.options)) {
      return {
        name: text(item.name),
        options: toArray(item.options).map((option) => text(option && typeof option === "object" ? first(option.value, option.label, option.name) : option)).filter(Boolean).slice(0, 100),
      };
    }
    return {
      id: text(first(item.id, item.variantSku, item.sku, `variant-${index + 1}`)),
      sku: text(first(item.sku, item.variantSku, item.productSku)),
      title: text(first(item.title, item.name, item.variantName)),
      price: normalizePrice(first(item.price, item.sellPrice, item.variantPrice)),
      image: normalizeImage(first(item.image, item.variantImage)),
      shipping: text(first(item.shipping, item.deliveryTime)),
    };
  }).filter((item) => (item.name && item.options?.length) || item.id || item.title || item.sku || item.price);
}

export function normalizeSupplierProduct(input = {}, options = {}) {
  const source = sanitizeSupplierProductImport(toObject(input), options.supplier || "");
  const now = new Date().toISOString();
  const sourceUrl = text(first(source.sourceUrl, source.url, source.supplierLink, options.sourceUrl));
  const detected = detectSupplierByUrl(sourceUrl || first(source.domain, source.supplier));
  const supplierName = text(first(source.supplier, source.sourceProvider, source.supplierName, detected.supplier?.name, options.supplier));
  const images = normalizeImages(first(source.image, source.sourceOnlineImage), first(source.images, source.sourceOnlineImages));
  const shipping = toObject(first(source.shipping, {
    cost: first(source.shippingCost, source.ship),
    deliveryTime: first(source.delivery, source.sourceOnlineShipping),
  }));

  return {
    supplier: supplierName || text(options.supplier) || "",
    sourceUrl,
    title: text(first(source.title, source.name, source.sourceOnlineTitle, "Nicht erkannt")),
    price: normalizePrice(first(source.price, source.buyPrice, source.buy, source.sourceOnlinePrice)),
    currency: normalizeCurrency(first(source.currency, source.sourceOnlineCurrency), options.currency),
    images,
    description: text(first(source.description, source.sourceOnlineDescription, source.notes)),
    variants: normalizeVariants(first(source.variants, source.sourceOnlineVariants, source.rawVariants)),
    shipping,
    sku: text(first(source.sku, source.productSku, source.variantSku)),
    category: text(first(source.category, source.sourceOnlineCategory)),
    importedAt: text(first(source.importedAt, source.createdAt, now)) || now,
    debug: toObject(source.debug),
  };
}
