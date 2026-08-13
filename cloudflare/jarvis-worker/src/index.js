import { normalizeProduct } from "../../../lib/product-master-active.js";

const WORKER_VERSION = "0.4.1";
const TASK_TTL_SECONDS = 86400;
const IDEMPOTENCY_TTL_SECONDS = 2592000;
const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_DELAYS_SECONDS = [15, 60];
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
const PRODUCT_MASTER_KEYS = ["elyon_products", "elyon_browser_imports"];

const json = (data, init = {}) => Response.json(data, {
  ...init,
  headers: {
    "cache-control": "no-store",
    ...(init.headers || {})
  }
});

const requireRedis = (env) => {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error("upstash_not_configured");
  }
};

const requireSupabase = (env) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("supabase_not_configured");
  }
};

const requireQueue = (env) => {
  if (!env.JARVIS_TASK_QUEUE || typeof env.JARVIS_TASK_QUEUE.send !== "function") {
    throw new Error("queue_not_configured");
  }
};

const hasSupabase = (env) => Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
const hasQueue = (env) => Boolean(env.JARVIS_TASK_QUEUE && typeof env.JARVIS_TASK_QUEUE.send === "function");
const hasSellerToolProductSource = (env) => Boolean(env.ELYON_SELLER_TOOL_URL && env.ELYON_SELLER_ACCESS_TOKEN);

const normalizeSupabaseUrl = (url) => {
  const normalized = String(url || "").trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:") throw new Error("invalid_protocol");
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    throw new Error("supabase_invalid_url");
  }
};

const normalizeSellerToolUrl = (url) => {
  const normalized = String(url || "").trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:") throw new Error("invalid_protocol");
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    throw new Error("product_source_invalid_url");
  }
};

const isSupabaseSecretKey = (key) => String(key || "").startsWith("sb_secret_");

const normalizeText = (value, max = 500) => String(value || "").trim().slice(0, max);
const nowIso = () => new Date().toISOString();
const safeError = (error) => error instanceof Error ? error.message : "internal_error";
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const array = (value) => Array.isArray(value) ? value : [];
const taskKey = (id) => `jarvis:task:${id}`;
const taskAttemptKey = (id) => `jarvis:task:${id}:attempt`;
const idempotencyKey = (key) => `jarvis:idempotency:${key}`;
const defaultIdempotencyKey = (task) => `${task.type}:${task.id}:v1`;
const retryDelaySeconds = (attempt) => RETRY_DELAYS_SECONDS[Math.min(RETRY_DELAYS_SECONDS.length - 1, Math.max(0, attempt - 1))];

const publicError = (error) => {
  if (!(error instanceof Error)) return "internal_error";
  if (/^(upstash|supabase|queue|product_source)_/.test(error.message)) return error.message;
  return "internal_error";
};

const taskError = (message, { retryable = true } = {}) => {
  const error = new Error(message);
  error.retryable = retryable;
  return error;
};

const isRetryableError = (error) => error?.retryable !== false;

const redis = async (env, command) => {
  requireRedis(env);
  const response = await fetch(env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    throw new Error(body.error || `upstash_http_${response.status}`);
  }
  return body.result;
};

const supabaseRequest = async (env, path, init = {}) => {
  requireSupabase(env);

  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeaders = isSupabaseSecretKey(supabaseKey)
    ? { apikey: supabaseKey }
    : {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`
      };

  const response = await fetch(`${normalizeSupabaseUrl(env.SUPABASE_URL)}${path}`, {
    ...init,
    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`supabase_http_${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json().catch(() => null);
};

const taskToDb = (task) => ({
  id: task.id,
  type: task.type,
  status: task.status,
  payload: task.payload ?? {},
  output: task.output ?? null,
  progress: Number(task.progress ?? 0),
  error: task.error ?? null,
  created_at: task.createdAt,
  updated_at: task.updatedAt,
  started_at: task.startedAt ?? null,
  finished_at: task.finishedAt ?? null,
  attempt_count: Number(task.attemptCount ?? 0),
  max_attempts: Number(task.maxAttempts ?? DEFAULT_MAX_ATTEMPTS),
  idempotency_key: task.idempotencyKey ?? null,
  last_error: task.lastError ?? null
});

const taskFromDb = (row) => ({
  id: row.id,
  type: row.type,
  payload: row.payload ?? {},
  output: row.output ?? null,
  status: row.status,
  progress: Number(row.progress ?? 0),
  error: row.error ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  startedAt: row.started_at ?? null,
  finishedAt: row.finished_at ?? null,
  attemptCount: Number(row.attempt_count ?? 0),
  maxAttempts: Number(row.max_attempts ?? DEFAULT_MAX_ATTEMPTS),
  idempotencyKey: row.idempotency_key ?? null,
  lastError: row.last_error ?? null,
  source: "supabase"
});

const runtimeOutput = (type) => ({
  processed: true,
  handler: "runtime-test",
  taskType: type,
  message: "Jarvis Task Runtime V1 completed successfully"
});

const parseStoredProductList = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.value)) return raw.value;
  if (typeof raw !== "string") return [];

  try {
    const parsed = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.value)) return parsed.value;
  } catch {
    return [];
  }

  return [];
};

const textFrom = (value, max = 500) => String(value ?? "").trim().slice(0, max);

const numberFrom = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = textFrom(value).replace(/\s/g, "").replace(",", ".");
  if (!raw) return null;
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};

const roundMoney = (value) => Number.isFinite(Number(value)) ? Number(Number(value).toFixed(2)) : null;
const roundPercent = (value) => Number.isFinite(Number(value)) ? Number(Number(value).toFixed(2)) : null;

const valueAt = (source, path) => path.split(".").reduce((current, part) => object(current)[part], source);

const firstTextAt = (source, paths, max = 500) => {
  for (const path of paths) {
    const value = valueAt(source, path);
    if (Array.isArray(value)) {
      const item = value.map((entry) => textFrom(entry, max)).find(Boolean);
      if (item) return item;
    } else {
      const text = textFrom(value, max);
      if (text) return text;
    }
  }
  return "";
};

const firstNumberAt = (source, paths) => {
  for (const path of paths) {
    const value = numberFrom(valueAt(source, path));
    if (value !== null) return value;
  }
  return null;
};

const hasPath = (source, paths) => paths.some((path) => {
  const current = valueAt(source, path);
  if (Array.isArray(current)) return current.length > 0;
  if (current && typeof current === "object") return Object.keys(current).length > 0;
  return textFrom(current) !== "";
});

const hasContactData = (value) => {
  const current = object(value);
  if (!Object.keys(current).length) return false;
  return Object.values(current).some((entry) => {
    if (entry && typeof entry === "object") return hasContactData(entry);
    return textFrom(entry) !== "";
  });
};

const explicitNumberAt = (source, paths) => {
  for (const path of paths) {
    const parentPath = path.split(".").slice(0, -1).join(".");
    const key = path.split(".").at(-1);
    const parent = parentPath ? object(valueAt(source, parentPath)) : object(source);
    if (!Object.prototype.hasOwnProperty.call(parent, key)) continue;
    const value = numberFrom(parent[key]);
    if (value !== null) return value;
  }
  return null;
};

const compactProductSnapshot = (product) => ({
  id: product.id,
  articleNumber: product.articleNumber ?? null,
  sku: product.sku ?? null,
  title: product.title,
  source: product.source,
  supplier: {
    id: product.supplier?.id || null,
    name: product.supplier?.name || null,
    url: product.supplier?.url || null
  },
  pricing: product.pricing,
  readiness: product.readiness
});

const productIdentityMatches = (rawProduct, normalizedProduct, productId) => {
  const id = textFrom(productId);
  if (!id) return false;
  const candidates = [
    normalizedProduct.id,
    normalizedProduct.articleNumber,
    normalizedProduct.sku,
    normalizedProduct.supplierSku,
    normalizedProduct.supplier?.url,
    rawProduct.id,
    rawProduct.productId,
    rawProduct.masterProductId,
    rawProduct.companyOsProductId,
    rawProduct.sourceImportId,
    rawProduct.sku,
    rawProduct.productSku,
    rawProduct.articleNumber,
    rawProduct.elyonArticleNumber,
    rawProduct.url,
    rawProduct.sourceUrl,
    rawProduct.supplierLink,
    rawProduct.supplier?.url,
    rawProduct.listing?.sku
  ].map((value) => textFrom(value)).filter(Boolean);
  return candidates.some((candidate) => candidate === id);
};

const findProductInList = (products, id, source) => {
  for (const rawProduct of Array.isArray(products) ? products : []) {
    const normalized = normalizeProduct(rawProduct);
    if (productIdentityMatches(rawProduct, normalized, id)) {
      return { product: normalized, rawProduct, source };
    }
  }
  return null;
};

const loadProductFromSellerTool = async (env, id) => {
  if (!hasSellerToolProductSource(env)) return null;

  let response;
  try {
    const baseUrl = normalizeSellerToolUrl(env.ELYON_SELLER_TOOL_URL);
    response = await fetch(`${baseUrl}/api/products?includeLegacyImports=true`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-elyon-seller-token": env.ELYON_SELLER_ACCESS_TOKEN
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "product_source_invalid_url") throw taskError(error.message, { retryable: false });
    throw taskError("product_source_unavailable");
  }

  if (response.status === 401 || response.status === 403) {
    throw taskError("product_source_auth_failed", { retryable: false });
  }
  if (!response.ok) {
    throw taskError(`product_source_http_${response.status}`);
  }

  const body = await response.json().catch(() => null);
  if (!body || body.ok !== true || !Array.isArray(body.products)) {
    throw taskError("product_source_invalid_response");
  }

  const activeMatch = findProductInList(body.products, id, "seller_tool_product_master");
  if (activeMatch) return activeMatch;

  const legacyMatch = findProductInList(body.legacyBrowserImports, id, "seller_tool_legacy_imports");
  return legacyMatch;
};

const readProductMasterKey = async (env, key) => {
  try {
    return parseStoredProductList(await redis(env, ["GET", key]));
  } catch (error) {
    console.error("elyon-jarvis-worker product source unavailable", error);
    throw taskError("product_source_unavailable");
  }
};

const loadProductForTask = async (env, productId) => {
  const id = textFrom(productId, 200);
  if (!id) throw taskError("invalid_product_id", { retryable: false });

  let sourceError = null;

  if (hasSellerToolProductSource(env)) {
    try {
      const remoteProduct = await loadProductFromSellerTool(env, id);
      if (remoteProduct) return remoteProduct;
    } catch (error) {
      sourceError = error;
      console.error("elyon-jarvis-worker Seller Tool product lookup failed", safeError(error));
    }
  }

  for (const key of PRODUCT_MASTER_KEYS) {
    try {
      const products = await readProductMasterKey(env, key);
      const match = findProductInList(
        products,
        id,
        key === "elyon_products" ? "worker_product_master" : "worker_legacy_browser_imports"
      );
      if (match) return match;
    } catch (error) {
      sourceError = sourceError || error;
    }
  }

  if (sourceError) throw sourceError;
  throw taskError("product_not_found", { retryable: false });
};

const analyzeDataQuality = (product, rawProduct) => {
  const source = { ...object(rawProduct), normalized: product };
  const checks = [
    { id: "title", weight: 10, ok: product.title && product.title !== "Unbenanntes Produkt" },
    { id: "description", weight: 10, ok: textFrom(product.description) || textFrom(product.listing?.descriptionHtml) },
    { id: "mainImage", weight: 9, ok: array(product.images).length > 0 },
    { id: "purchasePrice", weight: 9, ok: Number(product.pricing?.buyPrice || 0) > 0 },
    { id: "sellingPrice", weight: 9, ok: Number(product.pricing?.salePrice || 0) > 0 },
    { id: "supplier", weight: 8, ok: textFrom(product.supplier?.url || product.supplier?.name) },
    { id: "productId", weight: 7, ok: textFrom(product.id || product.sku || product.articleNumber) },
    { id: "category", weight: 7, ok: hasPath(source, ["category", "categoryId", "listing.categoryId", "listing.category", "normalized.listing.categoryId"]) },
    { id: "variants", weight: 5, ok: array(product.logistics?.variants).length > 0 || hasPath(source, ["variants", "options"]) },
    { id: "shippingData", weight: 8, ok: textFrom(product.logistics?.deliveryTime || product.logistics?.shippingInfo) },
    { id: "manufacturer", weight: 6, ok: hasContactData(rawProduct.manufacturer) || hasContactData(rawProduct.compliance?.manufacturer) || hasPath(source, ["manufacturerName", "gpsr.manufacturerName", "listing.compliance.manufacturer.companyName"]) },
    { id: "euResponsiblePerson", weight: 5, ok: hasContactData(rawProduct.responsiblePerson) || hasContactData(rawProduct.compliance?.responsiblePerson) || hasPath(source, ["responsiblePersonName", "gpsr.responsiblePersonName", "listing.compliance.responsiblePerson.companyName"]) },
    { id: "complianceData", weight: 7, ok: hasPath(source, ["compliance", "gpsr", "listing.compliance"]) }
  ];

  const total = checks.reduce((sum, check) => sum + check.weight, 0);
  const passed = checks.filter((check) => Boolean(check.ok)).reduce((sum, check) => sum + check.weight, 0);
  const missingFields = checks.filter((check) => !check.ok).map((check) => check.id);
  const warnings = [];
  if (product.readiness?.blockers?.length) warnings.push(...product.readiness.blockers.slice(0, 12));
  if (product.readiness?.reviewItems?.length) warnings.push(...product.readiness.reviewItems.slice(0, 8));

  return {
    score: Math.round((passed / total) * 100),
    missingFields,
    warnings: [...new Set(warnings)]
  };
};

const calculateEconomics = (product, rawProduct) => {
  const source = { ...object(rawProduct), normalized: product };
  const purchasePrice = firstNumberAt(source, [
    "economics.purchasePrice",
    "economics.buyPrice",
    "pricing.buyPrice",
    "buyPrice",
    "costPrice",
    "purchasePrice",
    "sourceOnlinePrice",
    "normalized.pricing.buyPrice"
  ]);
  const sellingPrice = firstNumberAt(source, [
    "economics.salePrice",
    "economics.sellingPrice",
    "pricing.salePrice",
    "salePrice",
    "targetPrice",
    "ebayPrice",
    "retailPrice",
    "normalized.pricing.salePrice"
  ]);

  if (purchasePrice === null || purchasePrice <= 0 || sellingPrice === null || sellingPrice <= 0) {
    return {
      purchasePrice: roundMoney(purchasePrice),
      sellingPrice: roundMoney(sellingPrice),
      absoluteMargin: null,
      marginPercent: null,
      knownAdditionalCosts: 0,
      feeAmount: null,
      status: "unknown",
      minimumRule: "Mindestens 20 % Marge oder mindestens 5 EUR Gewinn.",
      reasons: ["pricing_data_missing"]
    };
  }

  const shippingCost = explicitNumberAt(source, ["economics.shippingCost", "economics.supplierShipping", "pricing.shippingCost", "shippingCost", "deliveryCost"]) ?? 0;
  const importCosts = explicitNumberAt(source, ["economics.importCosts", "economics.estimatedImportCost", "pricing.importCosts", "importCosts", "estimatedImportCost"]) ?? 0;
  const returnReserve = explicitNumberAt(source, ["economics.returnReserve", "pricing.returnReserve", "returnReserve", "returnsReserve"]) ?? 0;
  const otherCosts = explicitNumberAt(source, ["economics.otherCosts", "pricing.otherCosts", "otherCosts", "additionalCosts"]) ?? 0;
  const explicitFees = explicitNumberAt(source, ["economics.estimatedEbayFees", "economics.ebayFees", "pricing.estimatedFees", "estimatedEbayFees", "ebayFees"]);
  const explicitMarketplaceFeePercent = explicitNumberAt(source, ["economics.marketplaceFeePercent", "pricing.marketplaceFeePercent", "marketplaceFeePercent"]);
  const explicitPaymentFeePercent = explicitNumberAt(source, ["economics.paymentFeePercent", "pricing.paymentFeePercent", "paymentFeePercent"]);
  const feeAmount = explicitFees !== null
    ? explicitFees
    : (explicitMarketplaceFeePercent !== null || explicitPaymentFeePercent !== null)
      ? sellingPrice * (((explicitMarketplaceFeePercent ?? 0) + (explicitPaymentFeePercent ?? 0)) / 100)
      : 0;

  const knownAdditionalCosts = shippingCost + importCosts + returnReserve + otherCosts;
  const absoluteMargin = sellingPrice - purchasePrice - knownAdditionalCosts - feeAmount;
  const marginPercent = sellingPrice > 0 ? (absoluteMargin / sellingPrice) * 100 : null;
  const pass = absoluteMargin >= 5 || (marginPercent ?? -Infinity) >= 20;
  const status = absoluteMargin < 0 ? "fail" : pass ? "pass" : "review";
  const reasons = [];
  if (!pass) reasons.push("margin_below_threshold");
  if (explicitFees === null && explicitMarketplaceFeePercent === null && explicitPaymentFeePercent === null) {
    reasons.push("fees_not_provided");
  }

  return {
    purchasePrice: roundMoney(purchasePrice),
    sellingPrice: roundMoney(sellingPrice),
    absoluteMargin: roundMoney(absoluteMargin),
    marginPercent: roundPercent(marginPercent),
    knownAdditionalCosts: roundMoney(knownAdditionalCosts),
    feeAmount: explicitFees === null && explicitMarketplaceFeePercent === null && explicitPaymentFeePercent === null ? null : roundMoney(feeAmount),
    status,
    minimumRule: "Mindestens 20 % Marge oder mindestens 5 EUR Gewinn.",
    reasons
  };
};

const analyzeCompliance = (product, rawProduct, dataQuality) => {
  const titleAndCategory = [
    product.title,
    rawProduct.category,
    rawProduct.categoryName,
    rawProduct.listing?.category,
    rawProduct.productType
  ].map((value) => textFrom(value).toLowerCase()).join(" ");
  const riskyPattern = /\b(akku|batterie|battery|spielzeug|toy|baby|kosmetik|cosmetic|medizin|medical|lebensmittel|food|laser|magnet|elektrisch|electronics?|ce)\b/i;
  const source = { ...object(rawProduct), normalized: product };
  const missing = [];

  if (!hasContactData(rawProduct.manufacturer) && !hasContactData(rawProduct.compliance?.manufacturer) && !hasPath(source, ["manufacturerName", "gpsr.manufacturerName", "listing.compliance.manufacturer.companyName"])) {
    missing.push("manufacturer");
  }
  if (!hasContactData(rawProduct.responsiblePerson) && !hasContactData(rawProduct.compliance?.responsiblePerson) && !hasPath(source, ["responsiblePersonName", "gpsr.responsiblePersonName", "listing.compliance.responsiblePerson.companyName"])) {
    missing.push("eu_responsible_person");
  }
  if (!hasPath(source, ["compliance", "gpsr", "listing.compliance"])) {
    missing.push("compliance_data");
  }

  const warnings = [...array(product.compliance?.risks).map((entry) => textFrom(entry)).filter(Boolean)];
  const complianceStatus = textFrom(product.compliance?.status || rawProduct.complianceStatus || rawProduct.compliance?.status).toLowerCase();
  if (riskyPattern.test(titleAndCategory)) warnings.push("sensitive_product_class_review_required");
  if (["blocked", "rejected", "risk", "risiko", "nicht freigegeben"].includes(complianceStatus)) warnings.push("blocking_compliance_status");

  const risk = warnings.includes("blocking_compliance_status") || (riskyPattern.test(titleAndCategory) && missing.length >= 2)
    ? "high"
    : missing.length || warnings.length
      ? "medium"
      : dataQuality.missingFields.includes("complianceData")
        ? "unknown"
        : "low";

  return {
    risk,
    missing,
    warnings: [...new Set(warnings)]
  };
};

const determineListingReadiness = ({ dataQuality, economics, compliance }) => {
  const reasons = [];
  const criticalMissing = dataQuality.missingFields.filter((field) => [
    "title",
    "description",
    "mainImage",
    "purchasePrice",
    "sellingPrice",
    "supplier",
    "productId"
  ].includes(field));

  if (criticalMissing.length) reasons.push(...criticalMissing.map((field) => `missing_${field}`));
  if (criticalMissing.length) reasons.push("missing_required_product_data");
  if (economics.status === "unknown") reasons.push("pricing_data_missing");
  if (economics.status === "review") reasons.push("margin_below_threshold");
  if (economics.status === "fail") reasons.push("negative_margin");
  if (compliance.missing.length) reasons.push("missing_compliance_data");
  if (compliance.risk === "high") reasons.push("high_compliance_risk");
  if (dataQuality.score < 70) reasons.push("data_quality_below_threshold");

  const status = economics.status === "fail" || compliance.risk === "high" || dataQuality.score < 40
    ? "reject"
    : criticalMissing.length
      ? "needs_data"
      : economics.status !== "pass" || compliance.risk === "medium" || dataQuality.score < 85
        ? "needs_review"
        : "ready";

  return {
    status,
    reasons: [...new Set(reasons)]
  };
};

const recommendationFromReadiness = (listingReadiness) => {
  if (listingReadiness.status === "ready") {
    return { decision: "pass", reasons: [] };
  }
  if (listingReadiness.status === "reject") {
    return { decision: "reject", reasons: listingReadiness.reasons };
  }
  return { decision: "review", reasons: listingReadiness.reasons };
};

const runProductCheck = async (task, env) => {
  const productId = textFrom(task.payload?.productId || task.payload?.product_id || task.payload?.id, 200);
  const loaded = await loadProductForTask(env, productId);
  const { product, rawProduct, source } = loaded;
  const dataQuality = analyzeDataQuality(product, rawProduct);
  const economics = calculateEconomics(product, rawProduct);
  const compliance = analyzeCompliance(product, rawProduct, dataQuality);
  const listingReadiness = determineListingReadiness({ dataQuality, economics, compliance });
  const recommendation = recommendationFromReadiness(listingReadiness);

  return {
    processed: true,
    handler: "product-check",
    productId,
    productSource: source,
    product: compactProductSnapshot(product),
    dataQuality,
    economics,
    compliance,
    listingReadiness,
    recommendation,
    cost: {
      llmUsed: false,
      model: null,
      amount: 0
    }
  };
};

const RuntimeTestHandler = {
  agentName: "runtime-test-handler",
  async handle(task) {
    await Promise.resolve();
    return runtimeOutput(task.type);
  }
};

const ProductCheckHandler = {
  agentName: "product-check-handler",
  async handle(task, env) {
    return runProductCheck(task, env);
  }
};

const UnsupportedTaskHandler = {
  agentName: "unsupported-task-handler",
  async handle() {
    throw new Error("unsupported_task_type");
  }
};

const handlers = {
  "runtime-test": RuntimeTestHandler,
  "product-check": ProductCheckHandler
};

const getHandler = (type) => {
  const handler = handlers[type];
  return handler || UnsupportedTaskHandler;
};

const parseJsonBody = async (request) => {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, error: "invalid_json_payload" };
  }
};

const createTask = (body) => {
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const type = normalizeText(body.type, 100);
  const providedKey = normalizeText(body.idempotencyKey || body.idempotency_key, 500);
  const task = {
    id,
    type,
    payload: body.payload ?? {},
    output: null,
    status: "queued",
    progress: 0,
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: null,
    finishedAt: null,
    attemptCount: 0,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    idempotencyKey: providedKey || null,
    lastError: null
  };

  task.idempotencyKey = task.idempotencyKey || defaultIdempotencyKey(task);
  return task;
};

const saveTaskToRedis = (env, task) => redis(env, ["SET", taskKey(task.id), JSON.stringify(task), "EX", String(TASK_TTL_SECONDS)]);

const saveAttemptToRedis = (env, task) => redis(env, ["SET", taskAttemptKey(task.id), String(task.attemptCount ?? 0), "EX", String(TASK_TTL_SECONDS)]);

const persistTaskToSupabase = (env, task) => supabaseRequest(env, "/rest/v1/jarvis_tasks", {
  method: "POST",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify(taskToDb(task))
});

const patchTaskInSupabase = (env, id, patch) => supabaseRequest(
  env,
  `/rest/v1/jarvis_tasks?id=eq.${encodeURIComponent(id)}`,
  {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch)
  }
);

const updateTaskStores = async (env, task, patch = {}) => {
  const updated = {
    ...task,
    ...patch,
    updatedAt: patch.updatedAt ?? nowIso()
  };

  await saveTaskToRedis(env, updated);
  await saveAttemptToRedis(env, updated);
  await patchTaskInSupabase(env, updated.id, taskToDb(updated));
  return updated;
};

const getTaskFromSupabase = async (env, id) => {
  const rows = await supabaseRequest(
    env,
    `/rest/v1/jarvis_tasks?id=eq.${encodeURIComponent(id)}&select=*`,
    { method: "GET" }
  );

  if (!Array.isArray(rows) || rows.length === 0) return null;
  return taskFromDb(rows[0]);
};

const getTaskFromRedis = async (env, id) => {
  const raw = await redis(env, ["GET", taskKey(id)]);
  return raw ? JSON.parse(raw) : null;
};

const getTask = async (env, id, { source = "redis-first" } = {}) => {
  if (source === "supabase-first" && hasSupabase(env)) {
    const task = await getTaskFromSupabase(env, id);
    if (task) return task;
  }

  const redisTask = await getTaskFromRedis(env, id);
  if (redisTask) return redisTask;

  if (source !== "supabase-first" && hasSupabase(env)) {
    return getTaskFromSupabase(env, id);
  }

  return null;
};

const setIdempotencyCompleted = (env, task) => redis(env, [
  "SET",
  idempotencyKey(task.idempotencyKey),
  JSON.stringify({
    taskId: task.id,
    status: "completed",
    output: task.output ?? null,
    completedAt: task.finishedAt ?? nowIso()
  }),
  "EX",
  String(IDEMPOTENCY_TTL_SECONDS)
]);

const getCompletedIdempotency = async (env, key) => {
  if (!key) return null;

  const raw = await redis(env, ["GET", idempotencyKey(key)]);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed?.status === "completed") return parsed;
  }

  if (!hasSupabase(env)) return null;

  const rows = await supabaseRequest(
    env,
    `/rest/v1/jarvis_tasks?idempotency_key=eq.${encodeURIComponent(key)}&status=eq.completed&select=id,output,finished_at&order=finished_at.desc&limit=1`,
    { method: "GET" }
  );

  if (!Array.isArray(rows) || rows.length === 0) return null;
  return {
    taskId: rows[0].id,
    status: "completed",
    output: rows[0].output ?? null,
    completedAt: rows[0].finished_at ?? null
  };
};

const createAgentRun = async (env, { task, handler, attempt, input }) => {
  const run = {
    id: crypto.randomUUID(),
    task_id: task.id,
    agent_name: handler.agentName,
    status: "running",
    input: input ?? { taskId: task.id, type: task.type, attempt },
    output: null,
    error: null,
    duration_ms: null,
    model: null,
    cost: 0,
    created_at: nowIso(),
    finished_at: null
  };

  await supabaseRequest(env, "/rest/v1/jarvis_agent_runs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(run)
  });

  return run;
};

const finishAgentRun = (env, run, patch) => supabaseRequest(
  env,
  `/rest/v1/jarvis_agent_runs?id=eq.${encodeURIComponent(run.id)}`,
  {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      ...patch,
      finished_at: patch.finished_at ?? nowIso()
    })
  }
);

const publishTaskToQueue = async (env, task) => {
  requireQueue(env);
  await env.JARVIS_TASK_QUEUE.send({ taskId: task.id, type: task.type });
};

const failTaskAfterQueueError = async (env, task, error) => {
  const failed = {
    status: "failed",
    progress: 0,
    error: "queue_publish_failed",
    lastError: publicError(error),
    finishedAt: nowIso()
  };

  try {
    return await updateTaskStores(env, task, failed);
  } catch (updateError) {
    console.error("elyon-jarvis-worker queue failure state update failed", updateError);
    return { ...task, ...failed, updatedAt: nowIso() };
  }
};

const validateQueueMessage = (body) => {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_queue_message" };
  const taskId = normalizeText(body.taskId, 100);
  const type = normalizeText(body.type, 100);
  if (!taskId || !type) return { ok: false, error: "invalid_queue_message" };
  return { ok: true, taskId, type };
};

const ack = (message) => {
  if (typeof message.ack === "function") message.ack();
};

const retry = (message, delaySeconds) => {
  if (typeof message.retry === "function") {
    message.retry({ delaySeconds });
  }
};

const processQueueMessage = async (message, env) => {
  const validation = validateQueueMessage(message.body);
  if (!validation.ok) {
    ack(message);
    return { ok: false, error: validation.error, action: "ack" };
  }

  try {
    return await processValidQueueMessage(message, env, validation);
  } catch (error) {
    console.error("elyon-jarvis-worker queue message failed before task handling", error);
    retry(message, RETRY_DELAYS_SECONDS[0]);
    return { ok: false, error: publicError(error), action: "retry" };
  }
};

const processValidQueueMessage = async (message, env, validation) => {
  let task = await getTask(env, validation.taskId, { source: "supabase-first" });
  if (!task) {
    ack(message);
    return { ok: false, error: "task_not_found", action: "ack" };
  }

  if (task.type !== validation.type) {
    ack(message);
    return { ok: false, error: "task_type_mismatch", action: "ack" };
  }

  if (task.status === "cancelled") {
    ack(message);
    return { ok: true, status: "cancelled", action: "ack" };
  }

  if (TERMINAL_STATUSES.has(task.status)) {
    ack(message);
    return { ok: true, status: task.status, action: "ack" };
  }

  const completedIdempotency = await getCompletedIdempotency(env, task.idempotencyKey);
  if (completedIdempotency) {
    task = await updateTaskStores(env, task, {
      status: "completed",
      progress: 100,
      output: completedIdempotency.output,
      error: null,
      lastError: null,
      finishedAt: completedIdempotency.completedAt || nowIso()
    });
    ack(message);
    return { ok: true, status: task.status, action: "ack", idempotent: true };
  }

  const handler = getHandler(task.type);
  const attempt = Number(task.attemptCount ?? 0) + 1;
  const maxAttempts = Number(task.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const startedAt = nowIso();
  let run = null;

  try {
    run = await createAgentRun(env, {
      task,
      handler,
      attempt,
      input: {
        taskId: task.id,
        type: task.type,
        attempt,
        idempotencyKey: task.idempotencyKey,
        payload: task.payload ?? {}
      }
    });

    task = await updateTaskStores(env, task, {
      status: "running",
      progress: 10,
      attemptCount: attempt,
      startedAt: task.startedAt || startedAt,
      lastError: null
    });

    const output = await handler.handle(task, env);
    const finishedAt = nowIso();
    const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));

    await finishAgentRun(env, run, {
      status: "completed",
      output,
      error: null,
      duration_ms: durationMs,
      model: null,
      cost: 0,
      finished_at: finishedAt
    });

    task = await updateTaskStores(env, task, {
      status: "completed",
      progress: 100,
      output,
      error: null,
      lastError: null,
      finishedAt
    });
    await setIdempotencyCompleted(env, task);
    ack(message);
    return { ok: true, status: task.status, action: "ack" };
  } catch (error) {
    const errorMessage = safeError(error);
    const finishedAt = nowIso();
    const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));

    if (run) {
      try {
        await finishAgentRun(env, run, {
          status: "failed",
          output: null,
          error: errorMessage,
          duration_ms: durationMs,
          model: null,
          cost: 0,
          finished_at: finishedAt
        });
      } catch (runError) {
        console.error("elyon-jarvis-worker agent run failure update failed", runError);
      }
    }

    const retrying = isRetryableError(error) && attempt < maxAttempts;
    task = await updateTaskStores(env, task, {
      status: retrying ? "queued" : "failed",
      progress: retrying ? 0 : Number(task.progress ?? 0),
      attemptCount: attempt,
      error: retrying ? null : errorMessage,
      lastError: errorMessage,
      finishedAt: retrying ? null : finishedAt
    });

    if (retrying) {
      retry(message, retryDelaySeconds(attempt));
      return { ok: false, status: task.status, action: "retry", attempt };
    }

    ack(message);
    return { ok: false, status: task.status, action: "ack", attempt };
  }
};

const fetchHandler = async (request, env) => {
  const url = new URL(request.url);

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "elyon-jarvis-worker", version: WORKER_VERSION });
    }

    if (request.method === "GET" && url.pathname === "/redis/health") {
      const pong = await redis(env, ["PING"]);
      return json({ ok: pong === "PONG", service: "upstash-redis", result: pong });
    }

    if (request.method === "GET" && url.pathname === "/supabase/health") {
      await supabaseRequest(env, "/rest/v1/jarvis_tasks?select=id&limit=1", { method: "GET" });
      return json({ ok: true, service: "supabase", status: "connected" });
    }

    if (request.method === "GET" && url.pathname === "/runtime/health") {
      return json({
        ok: true,
        service: "jarvis-task-runtime",
        queue: hasQueue(env) ? "configured" : "missing",
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        productSource: hasSellerToolProductSource(env) ? "seller-tool-api+worker-fallback" : "worker-fallback-only"
      });
    }

    if (request.method === "POST" && url.pathname === "/tasks") {
      const parsed = await parseJsonBody(request);
      if (!parsed.ok) {
        return json({ ok: false, error: parsed.error }, { status: 400 });
      }

      const body = parsed.body;
      if (!body || typeof body.type !== "string" || !body.type.trim()) {
        return json({ ok: false, error: "invalid_task_type" }, { status: 400 });
      }

      if (!hasSupabase(env)) {
        return json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
      }

      const task = createTask(body);
      await saveTaskToRedis(env, task);
      await saveAttemptToRedis(env, task);

      try {
        await persistTaskToSupabase(env, task);
      } catch (error) {
        console.error("elyon-jarvis-worker supabase persist failed", error);
        return json({
          ok: false,
          error: "supabase_persist_failed",
          taskId: task.id,
          task
        }, { status: 502 });
      }

      try {
        await publishTaskToQueue(env, task);
      } catch (error) {
        console.error("elyon-jarvis-worker queue publish failed", error);
        const failedTask = await failTaskAfterQueueError(env, task, error);
        return json({
          ok: false,
          error: "queue_publish_failed",
          taskId: task.id,
          task: failedTask
        }, { status: 502 });
      }

      return json({ ok: true, task }, { status: 201 });
    }

    if (request.method === "GET" && url.pathname.startsWith("/tasks/")) {
      const id = url.pathname.slice("/tasks/".length).trim();
      if (!id) return json({ ok: false, error: "missing_task_id" }, { status: 400 });

      const task = await getTask(env, id);
      if (!task) return json({ ok: false, error: "task_not_found" }, { status: 404 });

      return json({ ok: true, task });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return json({
        service: "elyon-jarvis-worker",
        status: "online",
        version: WORKER_VERSION,
        endpoints: [
          "/health",
          "/redis/health",
          "/supabase/health",
          "/runtime/health",
          "POST /tasks",
          "GET /tasks/:id"
        ]
      });
    }

    return json({ ok: false, error: "not_found" }, { status: 404 });
  } catch (error) {
    console.error("elyon-jarvis-worker error", error);
    return json({ ok: false, error: publicError(error) }, { status: 500 });
  }
};

export default {
  fetch: fetchHandler,
  async queue(batch, env) {
    for (const message of batch.messages || []) {
      await processQueueMessage(message, env);
    }
  }
};

export {
  loadProductForTask,
  processQueueMessage
};
