import { readProductMasterList, writeProductMasterList } from "./product-master-store.js";
import { normalizeProduct } from "./product-master-active.js";

export const PRODUCT_MASTER_V2_SCHEMA = "elyon-product-master-v2";
export const PRODUCT_MASTER_V2_CACHE_KEY = "elyon_product_master_v2_cache";
export const DEFAULT_COMPANY_OS_URL = "https://elyon-company-os.vercel.app";

const ARTICLE_NUMBER_PATTERN = /^ELY-\d{6,}$/i;
const VARIANT_SKU_PATTERN = /^ELY-\d{6,}-\d{2,}$/i;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, max = 2000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function canonicalIdentity(record = {}) {
  const identity = object(record.identity || record);
  const articleNumber = validArticleNumber(
    identity.articleNumber || identity.elyonArticleNumber || identity.sku,
  );
  return {
    productId: text(identity.productId),
    companyOsProductId: text(identity.companyOsProductId),
    productKey: text(identity.productKey),
    articleNumber,
    sku: articleNumber || text(identity.sku),
    supplierSku: text(identity.supplierSku),
    sourceImportId: text(identity.sourceImportId),
  };
}

function variantView(variant, articleNumber) {
  const source = object(variant);
  const sku = text(source.sku);
  const supplierSku = firstText(
    source.supplierSku,
    source.supplierSkuId,
    source.skuId,
    sku && !validVariantSku(sku) ? sku : "",
  );
  return {
    ...source,
    ...(sku ? { sku } : {}),
    ...(supplierSku ? { supplierSku } : {}),
    ...(articleNumber ? { articleNumber } : {}),
  };
}

function compatibilityReadiness(workflow, channel) {
  const current = object(workflow);
  const stage = text(current.stage).toLowerCase();
  if (current.rejected === true || current.active === false) {
    return { state: "not_ready", score: 0, blockers: ["Company OS hat das Produkt abgelehnt oder deaktiviert."], warnings: [] };
  }
  if (["product_review", "market_review", "review"].includes(stage)) {
    return { state: "needs_review", score: 50, blockers: [], warnings: ["Produkt befindet sich noch im Company-OS-Workflow."] };
  }
  if (["DRAFT", "LIVE"].includes(text(channel.status).toUpperCase())) {
    return { state: "ready_for_manual_listing", score: 100, blockers: [], warnings: [] };
  }
  return { state: "needs_review", score: 60, blockers: [], warnings: ["Company-OS-Listingstatus muss noch geprüft werden."] };
}

function sellerView(record, meta = {}) {
  const source = object(record);
  const identity = canonicalIdentity(source);
  if (!identity.articleNumber) return null;

  const product = object(source.product);
  const supplier = object(product.supplier);
  const economics = object(source.economics);
  const listing = object(source.listing);
  const workflow = object(source.workflow);
  const market = object(source.market);
  const compliance = object(source.compliance);
  const channel = object(source.channels?.ebay);
  const variants = array(product.variants).map((variant) => variantView(variant, identity.articleNumber));
  const images = array(product.images).map((value) => text(value, 2500)).filter(Boolean);
  const readiness = compatibilityReadiness(workflow, channel);

  const pricing = {
    currency: firstText(economics.currency, "EUR") || "EUR",
    buyPrice: numberOrNull(economics.buyPrice),
    shippingCost: numberOrNull(economics.shippingCost),
    salePrice: numberOrNull(economics.salePrice),
    estimatedFees: numberOrNull(economics.fees),
    profit: numberOrNull(economics.profit),
    marginPercent: numberOrNull(economics.marginPercent),
    minimumRulePassed: economics.minimumRulePassed ?? null,
    calculationSource: "company_os",
    source: "company_os",
  };
  const listingView = {
    ...listing,
    title: text(listing.title),
    descriptionHtml: text(listing.descriptionHtml, 20000),
    images: array(listing.images).length ? array(listing.images) : images,
    sku: identity.articleNumber,
    articleNumber: identity.articleNumber,
    offerId: text(channel.offerId) || null,
    ebayItemId: text(channel.listingId) || null,
    listingId: text(channel.listingId) || null,
    status: text(channel.status || listing.status || "not_started"),
    autonomousPostingAllowed: false,
    manualApprovalRequired: true,
  };

  return {
    schemaVersion: PRODUCT_MASTER_V2_SCHEMA,
    source: "elyon_company_os",
    sourceSystem: "elyon_company_os",
    ownerSystem: "elyon_company_os",
    sourceOfTruth: "company_os_canonical_state",
    id: identity.productId || identity.companyOsProductId || identity.articleNumber,
    productId: identity.productId,
    companyOsProductId: identity.companyOsProductId,
    productKey: identity.productKey,
    sourceImportId: identity.sourceImportId,
    articleNumber: identity.articleNumber,
    sku: identity.articleNumber,
    supplierSku: identity.supplierSku || null,
    identity: {
      ...identity,
      source: text(source.identity?.source || "elyon_company_os_article_registry_v1"),
    },
    title: text(product.title) || "Unbenanntes Produkt",
    description: text(product.description, 20000),
    images,
    variants,
    product: {
      ...product,
      title: text(product.title) || "Unbenanntes Produkt",
      description: text(product.description, 20000),
      images,
      variants,
      supplier: { ...supplier },
    },
    supplier: { ...supplier },
    economics: { ...economics },
    pricing,
    market: { ...market },
    compliance: { ...compliance },
    workflow: { ...workflow },
    listing: listingView,
    channels: { ebay: { ...channel, sku: identity.articleNumber } },
    logistics: { variants },
    readiness,
    approval: {
      companyOsApproved: readiness.state !== "not_ready",
      manualListingRequired: true,
      automaticListingAllowed: false,
    },
    status: text(workflow.status || listingView.status || "new"),
    raw: source,
    rawServerProduct: source,
    sellerView: {
      role: "consumer",
      sourceOfTruth: "company_os_canonical_state",
      freshness: text(meta.freshness || "fresh"),
      cachedAt: text(meta.cachedAt),
    },
    createdAt: text(source.timestamps?.createdAt),
    updatedAt: text(source.timestamps?.updatedAt),
  };
}

export function isProductMasterV2Record(record = {}) {
  const identity = canonicalIdentity(record);
  return text(record.schemaVersion) === PRODUCT_MASTER_V2_SCHEMA && Boolean(identity.articleNumber);
}

export function adaptProductMasterForSeller(record, options = {}) {
  if (!isProductMasterV2Record(record)) return null;
  return sellerView(record, options);
}

export function adaptLegacyProductForSeller(record, options = {}) {
  const normalized = normalizeProduct(record);
  if (!validArticleNumber(normalized.articleNumber || normalized.sku)) return null;
  return {
    ...normalized,
    schemaVersion: "elyon-seller-legacy-compatibility-v1",
    source: "elyon_company_os_legacy_compatibility",
    ownerSystem: "elyon_company_os",
    sellerView: {
      role: "compatibility",
      sourceOfTruth: "legacy_seller_product_master",
      freshness: text(options.freshness || "stale"),
      cachedAt: text(options.cachedAt),
    },
    rawServerProduct: record,
  };
}

function identityValues(record = {}) {
  const identity = canonicalIdentity(record);
  const channel = object(record.channels?.ebay || record.listing);
  return new Set([
    identity.articleNumber,
    identity.sku,
    identity.productId,
    identity.companyOsProductId,
    identity.productKey,
    identity.sourceImportId,
    identity.supplierSku,
    text(channel.offerId),
    text(channel.listingId || channel.ebayItemId),
  ].filter(Boolean).map((value) => value.toUpperCase()));
}

export function resolveProductMasterRecord(records = [], candidate = {}) {
  const wanted = object(candidate);
  const candidates = [
    wanted.articleNumber,
    wanted.elyonArticleNumber,
    wanted.sku,
    wanted.offerId,
    wanted.listingId,
    wanted.productId,
    wanted.companyOsProductId,
    wanted.productKey,
    wanted.sourceImportId,
    wanted.supplierSku,
  ].map((value) => text(value).toUpperCase()).filter(Boolean);
  for (const value of candidates) {
    const match = array(records).find((record) => identityValues(record).has(value));
    if (match) return match;
  }
  return null;
}

function errorWith(code, message, status = 503, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  Object.assign(error, details);
  return error;
}

function companyOsUrl(env = process.env) {
  return text(env.ELYON_COMPANY_OS_URL || env.COMPANY_OS_URL || DEFAULT_COMPANY_OS_URL, 1000);
}

function companyOsSyncCode(env = process.env) {
  return text(env.ELYON_COMPANY_OS_SYNC_CODE || env.COMPANY_OS_SYNC_CODE, 500);
}

export async function fetchCompanyOsProductMaster(options = {}) {
  const env = options.env || process.env;
  const syncCode = companyOsSyncCode(env);
  if (!syncCode) {
    throw errorWith(
      "company_os_sync_code_missing",
      "Company OS Product Master v2 ist nicht konfiguriert: Sync-Code fehlt.",
      503,
    );
  }

  let url;
  try {
    url = new URL("/api/product-master-v2", companyOsUrl(env));
  } catch {
    throw errorWith("company_os_url_invalid", "Company-OS-URL ist ungültig.", 503);
  }
  const identity = text(options.identity, 240);
  if (identity) url.searchParams.set("id", identity);
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Elyon-Sync-Code": syncCode,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw errorWith(
      text(payload?.error) || `company_os_product_master_http_${response.status}`,
      text(payload?.message) || "Company OS Product Master v2 konnte nicht geladen werden.",
      response.status || 503,
    );
  }
  const records = identity ? (payload.product ? [payload.product] : []) : array(payload.products);
  return {
    payload,
    records,
    fetchedAt: new Date().toISOString(),
  };
}

async function readCache(options = {}) {
  if (options.readCache) return options.readCache();
  return readProductMasterList(PRODUCT_MASTER_V2_CACHE_KEY, options.redisOptions);
}

async function writeCache(records, options = {}) {
  if (options.writeCache) return options.writeCache(records);
  return writeProductMasterList(PRODUCT_MASTER_V2_CACHE_KEY, records, options.redisOptions);
}

function productViews(records, adapter, meta) {
  return array(records).map((record) => adapter(record, meta)).filter(Boolean);
}

export async function loadProductMasterForSeller(options = {}) {
  const identity = text(options.identity, 240);
  let remoteError = null;
  try {
    const remote = await fetchCompanyOsProductMaster({ ...options, identity });
    const products = productViews(remote.records, adaptProductMasterForSeller, { freshness: "fresh" });
    if (identity && !products.length) {
      throw errorWith("product_master_record_not_found", "Kein Product-Master-Datensatz für diese Identität gefunden.", 404);
    }
    let cacheStatus = { persisted: false, mode: "cache_unavailable" };
    if (!identity && remote.records.length) {
      try {
        cacheStatus = await writeCache(remote.records, options);
      } catch {
        cacheStatus = { persisted: false, mode: "cache_write_failed" };
      }
    }
    return {
      products,
      source: "company_os_product_master_v2",
      freshness: "fresh",
      generatedAt: text(remote.payload?.generatedAt),
      cacheStatus,
      contract: remote.payload?.contract || null,
      safety: remote.payload?.safety || { projectionOnly: true, createsIdentity: false, publishesToEbay: false, createsOrders: false },
    };
  } catch (error) {
    remoteError = error;
    if (Number(error?.status) === 404) throw error;
  }

  const cached = await readCache(options).catch(() => []);
  const cachedProducts = productViews(cached, adaptProductMasterForSeller, { freshness: "stale" });
  if (identity) {
    const match = resolveProductMasterRecord(cached, { id: identity, articleNumber: identity, sku: identity, offerId: identity, listingId: identity, productId: identity });
    const product = match ? adaptProductMasterForSeller(match, { freshness: "stale" }) : null;
    if (product) {
      return {
        products: [product],
        source: "company_os_product_master_v2_cache",
        freshness: "stale",
        cacheStatus: { persisted: true, mode: "read_only_cache" },
        staleReason: text(remoteError?.code || remoteError?.message),
        safety: { projectionOnly: true, createsIdentity: false, publishesToEbay: false, createsOrders: false },
      };
    }
  } else if (cachedProducts.length) {
    return {
      products: cachedProducts,
      source: "company_os_product_master_v2_cache",
      freshness: "stale",
      cacheStatus: { persisted: true, mode: "read_only_cache" },
      staleReason: text(remoteError?.code || remoteError?.message),
      safety: { projectionOnly: true, createsIdentity: false, publishesToEbay: false, createsOrders: false },
    };
  }

  const legacy = await (options.readLegacy || (() => readProductMasterList("elyon_products", options.redisOptions)))().catch(() => []);
  const legacyProducts = array(legacy).map((record) => adaptLegacyProductForSeller(record, { freshness: "stale" })).filter(Boolean);
  if (identity) {
    const match = resolveProductMasterRecord(legacyProducts, { id: identity, articleNumber: identity, sku: identity, offerId: identity, listingId: identity, productId: identity });
    if (match) {
      return {
        products: [match],
        source: "legacy_seller_product_master_compatibility",
        freshness: "stale",
        cacheStatus: { persisted: false, mode: "legacy_compatibility" },
        staleReason: text(remoteError?.code || remoteError?.message),
        safety: { projectionOnly: true, createsIdentity: false, publishesToEbay: false, createsOrders: false },
      };
    }
  } else if (legacyProducts.length) {
    return {
      products: legacyProducts,
      source: "legacy_seller_product_master_compatibility",
      freshness: "stale",
      cacheStatus: { persisted: false, mode: "legacy_compatibility" },
      staleReason: text(remoteError?.code || remoteError?.message),
      safety: { projectionOnly: true, createsIdentity: false, publishesToEbay: false, createsOrders: false },
    };
  }

  throw remoteError || errorWith("product_master_unavailable", "Product Master v2 ist nicht erreichbar.", 503);
}

export function productMasterSummary(products = []) {
  const list = array(products);
  return {
    total: list.length,
    fresh: list.filter((product) => product.sellerView?.freshness === "fresh").length,
    stale: list.filter((product) => product.sellerView?.freshness === "stale").length,
    ebayDrafts: list.filter((product) => text(product.channels?.ebay?.status).toUpperCase() === "DRAFT").length,
    ebayLive: list.filter((product) => text(product.channels?.ebay?.status).toUpperCase() === "LIVE").length,
  };
}

export function productMasterIdentityValues(record = {}) {
  return identityValues(record);
}
