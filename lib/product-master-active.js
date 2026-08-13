import {
  mergeProductLists as mergeBaseProductLists,
  normalizeProduct as normalizeBaseProduct,
  normalizeProductList as normalizeBaseProductList,
} from "./product-master.js";

const ARTICLE_NUMBER_PATTERN = /^ELY-\d{6,}$/i;
const VARIANT_SKU_PATTERN = /^ELY-\d{6,}-\d{2,}$/i;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function firstText(...values) {
  for (const value of values.flat(Infinity)) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return "";
}

function validArticleNumber(value) {
  const candidate = text(value).toUpperCase();
  return ARTICLE_NUMBER_PATTERN.test(candidate) ? candidate : "";
}

function validVariantSku(value) {
  const candidate = text(value).toUpperCase();
  return VARIANT_SKU_PATTERN.test(candidate) ? candidate : "";
}

function supplierSkuIdFromUrl(value) {
  const candidate = text(value);
  if (!candidate) return "";

  try {
    const parsed = new URL(candidate);
    return firstText(
      parsed.searchParams.get("skuId"),
      parsed.searchParams.get("sku_id"),
      parsed.searchParams.get("supplierSkuId"),
    );
  } catch {
    const match = candidate.match(/[?&](?:sku(?:_|-)?id|supplierSkuId)=([^&#]+)/i);
    if (!match?.[1]) return "";
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
}

function deepestRaw(value) {
  let current = object(value);
  let deepest = current;
  const seen = new Set();
  for (let index = 0; index < 8; index += 1) {
    if (!current || seen.has(current)) break;
    seen.add(current);
    deepest = current;
    const next = object(current.raw);
    if (!Object.keys(next).length) break;
    current = next;
  }
  return deepest;
}

function uniqueVariantSupplierSku(source = {}, raw = {}, listing = {}, rawListing = {}) {
  const variantGroups = [
    source.variants,
    object(source.logistics).variants,
    listing.variants,
    raw.variants,
    object(raw.logistics).variants,
    rawListing.variants,
  ];
  const candidates = [];

  for (const group of variantGroups) {
    if (!Array.isArray(group)) continue;
    for (const item of group) {
      const variant = object(item);
      const sku = text(variant.sku);
      const candidate = firstText(
        variant.supplierSku,
        variant.supplierSkuId,
        variant.skuId,
        sku && !validVariantSku(sku) ? sku : "",
      );
      if (candidate) candidates.push(candidate);
    }
  }

  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique[0] : "";
}

export function adaptSellerProductInput(input = {}) {
  const product = object(input);
  const supplier = object(product.supplier);
  const supplierUrl = text(
    product.supplierLink ||
    product.supplierUrl ||
    supplier.url ||
    product.url ||
    product.sourceUrl ||
    product.productUrl
  );

  if (!supplierUrl || text(product.supplierLink)) return product;
  return {
    ...product,
    supplierLink: supplierUrl,
    supplier: {
      ...supplier,
      ...(text(supplier.url) ? {} : { url: supplierUrl }),
    },
  };
}

export function productIdentityFrom(input = {}) {
  const source = object(input);
  const raw = deepestRaw(source);
  const listing = object(source.listing);
  const rawListing = object(raw.listing);
  const supplier = object(source.supplier);
  const rawSupplier = object(raw.supplier);

  const articleNumber = [
    source.articleNumber,
    source.elyonArticleNumber,
    raw.articleNumber,
    raw.elyonArticleNumber,
    listing.articleNumber,
    rawListing.articleNumber,
    source.sku,
    source.productSku,
    raw.sku,
    raw.productSku,
    listing.sku,
    rawListing.sku,
  ].map(validArticleNumber).find(Boolean) || "";

  const variantSupplierSku = uniqueVariantSupplierSku(source, raw, listing, rawListing);
  const supplierSkuFromUrl = firstText(
    supplierSkuIdFromUrl(source.supplierLink),
    supplierSkuIdFromUrl(source.supplierUrl),
    supplierSkuIdFromUrl(supplier.url),
    supplierSkuIdFromUrl(source.url),
    supplierSkuIdFromUrl(source.sourceUrl),
    supplierSkuIdFromUrl(source.productUrl),
    supplierSkuIdFromUrl(raw.supplierLink),
    supplierSkuIdFromUrl(raw.supplierUrl),
    supplierSkuIdFromUrl(rawSupplier.url),
    supplierSkuIdFromUrl(raw.url),
    supplierSkuIdFromUrl(raw.sourceUrl),
    supplierSkuIdFromUrl(raw.productUrl),
  );
  const rawSku = firstText(
    source.supplierSku,
    source.supplierSkuId,
    source.skuId,
    listing.supplierSku,
    listing.supplierSkuId,
    listing.skuId,
    raw.supplierSku,
    raw.supplierSkuId,
    raw.skuId,
    rawListing.supplierSku,
    rawListing.supplierSkuId,
    rawListing.skuId,
    supplierSkuFromUrl,
    variantSupplierSku,
  );
  const fallbackSku = firstText(source.sku, source.productSku, raw.sku, raw.productSku);
  const supplierSku = rawSku || (
    fallbackSku && !validArticleNumber(fallbackSku) && !validVariantSku(fallbackSku)
      ? fallbackSku
      : ""
  );

  return {
    articleNumber,
    sku: articleNumber || firstText(source.sku, raw.sku),
    supplierSku,
  };
}

function normalizeVariantIdentity(rawVariant = {}, articleNumber = "") {
  const variant = object(rawVariant);
  const sku = validVariantSku(variant.sku) || text(variant.sku);
  const supplierSku = firstText(
    variant.supplierSku,
    variant.supplierSkuId,
    variant.skuId,
    sku && !validVariantSku(sku) ? sku : ""
  );
  return {
    ...variant,
    ...(sku ? { sku } : {}),
    ...(supplierSku ? { supplierSku } : {}),
    ...(articleNumber ? { articleNumber } : {}),
  };
}

export function enrichProductIdentity(normalized = {}, original = {}) {
  const identity = productIdentityFrom(original);
  if (!identity.articleNumber && !identity.sku && !identity.supplierSku) return normalized;

  const articleNumber = identity.articleNumber;
  const sku = articleNumber || identity.sku;
  const variants = Array.isArray(normalized?.logistics?.variants)
    ? normalized.logistics.variants.map((variant) => normalizeVariantIdentity(variant, articleNumber))
    : [];

  return {
    ...normalized,
    ...(articleNumber ? { articleNumber } : {}),
    ...(sku ? { sku } : {}),
    ...(identity.supplierSku ? { supplierSku: identity.supplierSku } : {}),
    identity: {
      ...(object(normalized.identity)),
      ...(articleNumber ? { articleNumber, sku: articleNumber } : {}),
      ...(identity.supplierSku ? { supplierSku: identity.supplierSku } : {}),
      source: articleNumber ? "elyon_unified_product_identity_v1" : "legacy",
    },
    logistics: {
      ...object(normalized.logistics),
      variants,
    },
    listing: {
      ...object(normalized.listing),
      ...(articleNumber ? { articleNumber } : {}),
      ...(sku ? { sku } : {}),
    },
  };
}

export function normalizeProduct(input = {}) {
  const adapted = adaptSellerProductInput(input);
  return enrichProductIdentity(normalizeBaseProduct(adapted), adapted);
}

export function normalizeProductList(items = []) {
  return Array.isArray(items) ? items.map(normalizeProduct) : [];
}

export function mergeProductLists(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const rawProduct of Array.isArray(list) ? list : []) {
      const product = normalizeProduct(rawProduct);
      const key = product.articleNumber || product.sku || product.raw?.sourceImportId || product.raw?.companyOsProductId || product.supplier?.url || product.id;
      const current = map.get(key);
      map.set(key, current ? normalizeProduct({ ...current.raw, ...rawProduct, ...current, ...product }) : product);
    }
  }
  return Array.from(map.values()).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export const legacyNormalizeProductList = normalizeBaseProductList;
