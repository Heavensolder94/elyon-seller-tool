import { sanitizeSupplierProductImport } from "./supplier-import-sanitizer.js";
import { normalizeSupplierProduct } from "./supplier-product-normalizer.js";
import { detectSupplierByUrl } from "./supplier-registry.js";

function text(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && !value.length) continue;
    if (typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length) continue;
    return value;
  }
  return "";
}

function mergeDebug(...values) {
  return values.reduce((acc, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(acc, value);
    }
    return acc;
  }, {});
}

function cleanAvailability(value) {
  let raw = text(value);
  if (!raw) return "";
  raw = raw.replace(/\{[\s\S]*$/, "").trim();
  raw = raw.replace(/\[[\s\S]*$/, "").trim();
  raw = raw.replace(/"\s*,?\s*".*$/g, "").trim();
  raw = raw.replace(/\b(isInternal|showInsightsHub|isRobot|showFaceout|merchantId|availableBadges|loggedIn|asin|showBadge|ingressFaceout|availableFaceouts)\b[\s\S]*$/i, "").trim();
  return raw.replace(/\s{2,}/g, " ").slice(0, 220);
}

function collectRawBrowserImport(input = {}) {
  const wrapper = toObject(input);
  const product = toObject(wrapper.product || wrapper.item || wrapper.data || wrapper);
  const elyonProduct = toObject(product.elyonProduct || product.normalizedProduct || product.product || wrapper.elyonProduct || wrapper.normalizedProduct);
  const identity = toObject(elyonProduct.identity);
  const content = toObject(elyonProduct.content);
  const media = toObject(elyonProduct.media);
  const pricing = toObject(elyonProduct.pricing);
  const availability = toObject(elyonProduct.availability);
  const supplier = toObject(elyonProduct.supplier);
  const reviews = toObject(elyonProduct.reviews);
  const variants = toObject(elyonProduct.variants);
  const raw = toObject(product.raw || elyonProduct.raw || product.extractionDebug || wrapper.raw);
  const sourceUrl = text(first(product.url, elyonProduct.meta?.sourceUrl, wrapper.url));
  const detected = detectSupplierByUrl(sourceUrl || first(product.domain, wrapper.domain, supplier.supplierName));
  return {
    id: text(first(product.id, product.productId, sourceUrl)),
    url: sourceUrl,
    domain: text(first(product.domain, elyonProduct.meta?.sourceDomain, detected.domain)),
    supplier: text(first(product.supplier, supplier.supplierName, supplier.storeName, wrapper.supplier, detected.supplier?.name)),
    title: text(first(product.title, identity.title, product.name, wrapper.title)),
    price: text(first(product.price, pricing.currentPrice, pricing.priceText, wrapper.price)),
    currency: text(first(product.currency, pricing.currency, wrapper.currency)),
    image: text(first(product.image, media.mainImage, wrapper.image)),
    images: first(product.images, media.images, wrapper.images, []),
    description: text(first(product.description, content.longDescription, content.shortDescription, wrapper.description)),
    descriptionCandidates: [
      ...toArray(product.descriptionCandidates),
      ...toArray(content.descriptionCandidates),
      content.longDescription,
      content.shortDescription,
      product.description,
      wrapper.description,
    ].filter(Boolean),
    descriptionSource: text(first(product.descriptionSource, wrapper.descriptionSource, content.descriptionSource, "browser-import")),
    variants: first(product.variants, product.platformVariants, product.aliexpressVariants, product.sourceOnlineVariants, variants.variantGroups, variants.variantItems, []),
    variantSource: text(first(product.variantSource, "browser-import")),
    shipping: toObject(first(product.shipping, {
      cost: pricing.shippingCost,
      deliveryText: availability.deliveryText,
      shipsFrom: availability.shipsFrom,
    })),
    availability: cleanAvailability(first(product.availability, availability.stockText, availability.deliveryText, wrapper.availability)),
    category: text(first(product.category, identity.category, elyonProduct.marketplace?.marketplaceCategory, wrapper.category)),
    rating: text(first(product.rating, reviews.ratingValue, wrapper.rating)),
    reviewsCount: text(first(product.reviewsCount, reviews.reviewsCount, wrapper.reviewsCount)),
    soldCount: text(first(product.soldCount, wrapper.soldCount)),
    productDetails: toObject(first(product.productDetails, content.productDetails, content.specifications, wrapper.productDetails)),
    complianceRisks: toArray(first(product.complianceRisks, wrapper.complianceRisks)),
    notes: text(first(product.notes, wrapper.notes)),
    linkedSupplierId: text(first(product.linkedSupplierId, wrapper.linkedSupplierId)),
    linkedSupplierName: text(first(product.linkedSupplierName, wrapper.linkedSupplierName, detected.supplier?.name)),
    errorState: toObject(product.errorState || wrapper.errorState),
    warnings: toArray(first(product.warnings, raw.extractionWarnings, [])),
    extractorUsed: text(first(product.extractorUsed, raw.extractorUsed, wrapper.extractorUsed, "browser-extension")),
    elyonProduct,
    raw,
  };
}

export function normalizeBrowserImport(input = {}) {
  const now = new Date().toISOString();
  const rawProduct = collectRawBrowserImport(input);
  const sanitized = sanitizeSupplierProductImport(rawProduct, rawProduct.supplier);
  const normalizedSupplier = normalizeSupplierProduct(sanitized, { supplier: sanitized.supplierDetected || sanitized.supplier });

  return {
    id: text(first(rawProduct.id, normalizedSupplier.sourceUrl, `${now}-${Math.random().toString(36).slice(2, 10)}`)),
    source: "chrome-extension",
    status: text(first(rawProduct.status, "draft")) || "draft",
    importedAt: text(first(rawProduct.importedAt, now)) || now,
    updatedAt: text(first(rawProduct.updatedAt, now)) || now,
    title: normalizedSupplier.title || "Nicht erkannt",
    price: normalizedSupplier.price,
    currency: normalizedSupplier.currency,
    image: normalizedSupplier.images[0] || "",
    images: normalizedSupplier.images,
    url: normalizedSupplier.sourceUrl,
    domain: rawProduct.domain,
    supplier: normalizedSupplier.supplier,
    description: normalizedSupplier.description,
    descriptionCandidates: toArray(sanitized.descriptionCandidates),
    descriptionSource: text(sanitized.descriptionSource),
    shipping: toObject(rawProduct.shipping),
    availability: rawProduct.availability,
    category: normalizedSupplier.category,
    rating: rawProduct.rating,
    reviewsCount: rawProduct.reviewsCount,
    soldCount: rawProduct.soldCount,
    variants: normalizedSupplier.variants,
    rawVariants: toArray(sanitized.rawVariants),
    productDetails: rawProduct.productDetails,
    complianceRisks: toArray(rawProduct.complianceRisks),
    elyonProduct: Object.keys(rawProduct.elyonProduct).length ? rawProduct.elyonProduct : {},
    raw: rawProduct.raw,
    linkedSupplierId: rawProduct.linkedSupplierId,
    linkedSupplierName: text(first(rawProduct.linkedSupplierName, sanitized.supplierDetected)),
    notes: rawProduct.notes,
    errorState: rawProduct.errorState,
    warnings: rawProduct.warnings,
    blockedByHumanVerification: false,
    debug: mergeDebug(toObject(input.debug), toObject(input.supplierImportDebug), toObject(sanitized.debug), toObject(normalizedSupplier.debug)),
    supplierProduct: normalizedSupplier,
  };
}

export function normalizeBrowserImportList(list) {
  return Array.isArray(list) ? list.map(normalizeBrowserImport) : [];
}
