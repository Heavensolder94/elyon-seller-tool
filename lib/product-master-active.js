import {
  mergeProductLists as mergeBaseProductLists,
  normalizeProduct as normalizeBaseProduct,
  normalizeProductList as normalizeBaseProductList,
} from "./product-master.js";

const ARTICLE_NUMBER_PATTERN = /^ELY-\d{6,}$/i;
const VARIANT_SKU_PATTERN = /^ELY-\d{6,}-\d{2,}$/i;
const MISSING_ARTICLE_NUMBER_BLOCKER = "Elyon-Artikelnummer fehlt; zuerst über Company OS Produktprüfung synchronisieren.";

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

function readableText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const candidate = text(value);
  if (!candidate || /^\[object\s+Object\]$/i.test(candidate)) return "";
  return candidate;
}

function firstReadableText(...values) {
  for (const value of values.flat(Infinity)) {
    const candidate = readableText(value);
    if (candidate) return candidate;
  }
  return "";
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : null;
}

function firstFiniteNumber(...values) {
  for (const value of values.flat(Infinity)) {
    const candidate = finiteNumber(value);
    if (candidate !== null) return candidate;
  }
  return null;
}

function round2(value) {
  return Number(Number(value || 0).toFixed(2));
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

function providerNameFrom(source, supplierUrl) {
  const marker = `${readableText(source)} ${readableText(supplierUrl)}`.toLowerCase();
  if (marker.includes("aliexpress")) return "AliExpress";
  if (marker.includes("cjdropshipping") || /(^|\s)cj($|\s)/.test(marker)) return "CJdropshipping";
  if (marker.includes("bigbuy")) return "BigBuy";
  if (marker.includes("temu")) return "Temu";
  if (marker.includes("alibaba")) return "Alibaba";
  if (marker.includes("amazon")) return "Amazon";
  return "";
}

function repairSupplier(normalized = {}, original = {}) {
  const supplier = object(normalized.supplier);
  const sourceSupplier = object(original.supplier);
  const raw = deepestRaw(original);
  const rawSupplier = object(raw.supplier);
  const supplierUrl = firstReadableText(
    supplier.url,
    original.supplierLink,
    original.supplierUrl,
    sourceSupplier.url,
    original.url,
    original.sourceUrl,
    original.productUrl,
    raw.supplierLink,
    raw.supplierUrl,
    rawSupplier.url,
    raw.url,
    raw.sourceUrl,
    raw.productUrl,
  );
  const supplierName = firstReadableText(
    supplier.name,
    original.linkedSupplierName,
    original.supplierName,
    sourceSupplier.name,
    raw.linkedSupplierName,
    raw.supplierName,
    rawSupplier.name,
    typeof original.supplier === "string" ? original.supplier : "",
    typeof raw.supplier === "string" ? raw.supplier : "",
  ) || providerNameFrom(normalized.source || original.source || raw.source, supplierUrl);

  return {
    ...normalized,
    supplier: {
      ...supplier,
      ...(supplierName ? { name: supplierName } : { name: "" }),
      ...(supplierUrl ? { url: supplierUrl } : {}),
    },
  };
}

function reconcilePricing(normalized = {}, original = {}) {
  const pricing = object(normalized.pricing);
  if (!Object.keys(pricing).length) return normalized;

  const buyPrice = Math.max(0, finiteNumber(pricing.buyPrice) ?? 0);
  const salePrice = Math.max(0, finiteNumber(pricing.salePrice) ?? 0);
  const shippingCost = Math.max(0, finiteNumber(pricing.shippingCost) ?? 0);
  const importCosts = Math.max(0, finiteNumber(pricing.importCosts) ?? 0);
  const returnReserve = Math.max(0, finiteNumber(pricing.returnReserve) ?? 0);
  const otherCosts = Math.max(0, finiteNumber(pricing.otherCosts) ?? 0);
  const marketplaceFeePercent = Math.max(0, finiteNumber(pricing.marketplaceFeePercent) ?? 0);
  const paymentFeePercent = Math.max(0, finiteNumber(pricing.paymentFeePercent) ?? 0);
  const feePercent = marketplaceFeePercent + paymentFeePercent;
  const percentageFees = salePrice > 0 && feePercent > 0 ? salePrice * (feePercent / 100) : 0;
  const storedFees = finiteNumber(pricing.estimatedFees);
  const staleZeroFees = salePrice > 0 && feePercent > 0 && storedFees !== null && Math.abs(storedFees) < 0.005 && percentageFees > 0;
  const estimatedFees = staleZeroFees
    ? percentageFees
    : Math.max(0, storedFees ?? percentageFees);

  const fixedCosts = buyPrice + shippingCost + importCosts + returnReserve + otherCosts;
  const calculatedProfit = salePrice > 0 ? salePrice - fixedCosts - estimatedFees : 0;
  const storedProfit = finiteNumber(pricing.profit);
  const storedMargin = finiteNumber(pricing.marginPercent);
  const staleZeroProfit = salePrice > 0
    && Math.abs(calculatedProfit) >= 0.005
    && storedProfit !== null
    && storedMargin !== null
    && Math.abs(storedProfit) < 0.005
    && Math.abs(storedMargin) < 0.005;

  const raw = deepestRaw(original);
  const sourceEconomics = object(original.economics);
  const sourcePricing = object(original.pricing);
  const rawEconomics = object(raw.economics);
  const rawPricing = object(raw.pricing);
  const originalFees = firstFiniteNumber(
    sourceEconomics.estimatedEbayFees,
    sourceEconomics.ebayFees,
    sourcePricing.estimatedFees,
    original.estimatedEbayFees,
    original.ebayFees,
    rawEconomics.estimatedEbayFees,
    rawEconomics.ebayFees,
    rawPricing.estimatedFees,
    raw.estimatedEbayFees,
    raw.ebayFees,
  );
  const originalProfit = firstFiniteNumber(
    sourceEconomics.realisticProfit,
    sourceEconomics.estimatedProfit,
    sourcePricing.profit,
    original.realisticProfit,
    original.estimatedProfit,
    rawEconomics.realisticProfit,
    rawEconomics.estimatedProfit,
    rawPricing.profit,
    raw.realisticProfit,
    raw.estimatedProfit,
  );
  const originalMargin = firstFiniteNumber(
    sourceEconomics.marginPercent,
    sourcePricing.marginPercent,
    original.marginPercent,
    rawEconomics.marginPercent,
    rawPricing.marginPercent,
    raw.marginPercent,
  );
  const sourceAlreadyReconciled = [
    sourcePricing.calculationSource,
    original.calculationSource,
    rawPricing.calculationSource,
    raw.calculationSource,
  ].some((value) => readableText(value) === "seller_validation_reconciled");
  const sourceHasStaleZeroEconomics = salePrice > 0 && (
    (feePercent > 0 && originalFees !== null && Math.abs(originalFees) < 0.005 && percentageFees > 0)
    || (
      Math.abs(calculatedProfit) >= 0.005
      && originalProfit !== null
      && originalMargin !== null
      && Math.abs(originalProfit) < 0.005
      && Math.abs(originalMargin) < 0.005
    )
  );

  const needsRecalculation = staleZeroFees || staleZeroProfit || sourceHasStaleZeroEconomics;
  const reconciled = needsRecalculation || sourceAlreadyReconciled;
  const profit = needsRecalculation ? calculatedProfit : (storedProfit ?? calculatedProfit);
  const calculatedMargin = salePrice > 0 ? (profit / salePrice) * 100 : 0;
  const marginPercent = needsRecalculation ? calculatedMargin : (storedMargin ?? calculatedMargin);
  const minimumRulePassed = profit >= 5 || marginPercent >= 20;

  return {
    ...normalized,
    pricing: {
      ...pricing,
      estimatedFees: round2(estimatedFees),
      totalKnownCost: round2(fixedCosts + estimatedFees),
      profit: round2(profit),
      marginPercent: round2(marginPercent),
      minimumRulePassed,
      calculationSource: reconciled
        ? "seller_validation_reconciled"
        : (readableText(pricing.calculationSource) || "seller_validation"),
    },
  };
}

function applyIdentityReadiness(normalized = {}) {
  const readiness = object(normalized.readiness);
  const articleNumber = validArticleNumber(normalized.articleNumber || normalized.sku || normalized.identity?.articleNumber);
  const existingBlockers = Array.isArray(readiness.blockers) ? readiness.blockers.filter(Boolean) : [];
  const existingReviewItems = Array.isArray(readiness.reviewItems) ? readiness.reviewItems.filter(Boolean) : [];
  const blockersWithoutIdentity = existingBlockers.filter((item) => item !== MISSING_ARTICLE_NUMBER_BLOCKER);
  const warningsWithoutIdentity = (Array.isArray(readiness.warnings) ? readiness.warnings : [])
    .filter(Boolean)
    .filter((item) => item !== MISSING_ARTICLE_NUMBER_BLOCKER);

  if (articleNumber) {
    return {
      ...normalized,
      identity: {
        ...object(normalized.identity),
        articleNumber,
        sku: articleNumber,
        status: "ready",
        requiredAction: null,
      },
      readiness: {
        ...readiness,
        blockers: blockersWithoutIdentity,
        warnings: [...new Set([...blockersWithoutIdentity, ...existingReviewItems, ...warningsWithoutIdentity])],
      },
    };
  }

  const approvedCompanyOsCompatibilityRecord = normalized.source === "elyon_company_os"
    && object(normalized.approval).companyOsApproved === true;
  if (approvedCompanyOsCompatibilityRecord) {
    return {
      ...normalized,
      identity: {
        ...object(normalized.identity),
        status: "missing_elyon_article_number",
        requiredAction: "sync_through_company_os_product_review",
      },
    };
  }

  const blockers = [...new Set([...blockersWithoutIdentity, MISSING_ARTICLE_NUMBER_BLOCKER])];
  const warnings = [...new Set([...warningsWithoutIdentity, MISSING_ARTICLE_NUMBER_BLOCKER])];

  return {
    ...normalized,
    identity: {
      ...object(normalized.identity),
      status: "missing_elyon_article_number",
      requiredAction: "sync_through_company_os_product_review",
    },
    readiness: {
      ...readiness,
      score: Math.min(Number.isFinite(Number(readiness.score)) ? Number(readiness.score) : 55, 55),
      state: "not_ready",
      blockers,
      warnings,
      reviewItems: existingReviewItems,
    },
  };
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
  const normalized = enrichProductIdentity(normalizeBaseProduct(adapted), adapted);
  const repaired = repairSupplier(normalized, adapted);
  return applyIdentityReadiness(reconcilePricing(repaired, adapted));
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