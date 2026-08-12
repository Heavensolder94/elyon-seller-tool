import { normalizeProduct } from "./product-master-active.js";

export function getProductMasterRedisConfig(env = process.env) {
  const pairs = [
    { source: "custom_upstash_backup", url: env.UPSTASH_BACKUP_URL, token: env.UPSTASH_BACKUP_TOKEN },
    { source: "upstash_redis_rest", url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN },
    { source: "vercel_kv_rest", url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN },
  ];
  return pairs.find((pair) => pair.url && pair.token) || { source: "unconfigured", url: "", token: "" };
}

export function hasProductMasterStorage(env = process.env) {
  const config = getProductMasterRedisConfig(env);
  return Boolean(config.url && config.token);
}

async function redisCommand(command, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const config = getProductMasterRedisConfig(env);
  if (!config.url || !config.token) throw new Error("Persistenter Product-Master-Speicher ist nicht konfiguriert.");
  const response = await fetchImpl(config.url.replace(/\/$/, ""), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
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
    return [];
  } catch {
    return [];
  }
}

export async function readProductMasterList(key, options = {}) {
  const data = await redisCommand(["GET", key], options);
  return parseStoredList(data?.result);
}

export async function writeProductMasterList(key, items, options = {}) {
  const env = options.env || process.env;
  const config = getProductMasterRedisConfig(env);
  if (!config.url || !config.token) return { persisted: false, mode: "unconfigured", source: config.source };
  await redisCommand(["SET", key, JSON.stringify(items || [])], options);
  return { persisted: true, mode: "server_persistent", source: config.source };
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
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

function explicitNumber(source, names) {
  for (const name of names) {
    if (!Object.prototype.hasOwnProperty.call(source, name)) continue;
    const value = source[name];
    if (value === "" || value === null || value === undefined) continue;
    return value;
  }
  return undefined;
}

function mergeForUpdate(currentEntry, incomingEntry) {
  const current = object(currentEntry);
  const incoming = object(incomingEntry);
  const currentRaw = deepestRaw(current);
  const incomingRaw = deepestRaw(incoming);
  const merged = {
    ...currentRaw,
    ...current,
    ...incomingRaw,
    ...incoming,
  };

  const buyPrice = explicitNumber(incoming, ["buyPrice", "costPrice", "purchasePrice", "sourceOnlinePrice"])
    ?? explicitNumber(incomingRaw, ["buyPrice", "costPrice", "purchasePrice", "sourceOnlinePrice"]);
  const salePrice = explicitNumber(incoming, ["salePrice", "targetPrice", "ebayPrice", "retailPrice", "sellPrice"])
    ?? explicitNumber(incomingRaw, ["salePrice", "targetPrice", "ebayPrice", "retailPrice", "sellPrice"]);
  const shippingCost = explicitNumber(incoming, ["shippingCost", "deliveryCost"])
    ?? explicitNumber(incomingRaw, ["shippingCost", "deliveryCost"]);

  if (buyPrice !== undefined || salePrice !== undefined || shippingCost !== undefined || incoming.pricing || incomingRaw.pricing) {
    merged.pricing = {
      ...object(currentRaw.pricing),
      ...object(current.pricing),
      ...object(incomingRaw.pricing),
      ...object(incoming.pricing),
      ...(buyPrice !== undefined ? { buyPrice } : {}),
      ...(salePrice !== undefined ? { salePrice } : {}),
      ...(shippingCost !== undefined ? { shippingCost } : {}),
    };
  }

  return merged;
}

function productKey(product) {
  const normalized = normalizeProduct(product);
  const raw = deepestRaw(product);
  return String(
    normalized.articleNumber ||
    normalized.sku ||
    raw.articleNumber ||
    raw.sourceImportId ||
    raw.companyOsProductId ||
    normalized.raw?.sourceImportId ||
    normalized.raw?.companyOsProductId ||
    normalized.supplier?.url ||
    normalized.id ||
    ""
  ).trim();
}

function sameMasterProduct(leftEntry, rightEntry) {
  const left = normalizeProduct(leftEntry);
  const right = normalizeProduct(rightEntry);
  if (left.articleNumber && right.articleNumber) return left.articleNumber === right.articleNumber;
  if (productKey(leftEntry) === productKey(rightEntry)) return true;
  if (left.id && right.id && left.id === right.id) return true;
  return Boolean(left.supplier?.url && right.supplier?.url && left.supplier.url === right.supplier.url);
}

function preserveImmutableIdentity(currentEntry, mergedInput) {
  const current = normalizeProduct(currentEntry);
  const incoming = normalizeProduct(mergedInput);
  if (!current.articleNumber) return mergedInput;

  return {
    ...mergedInput,
    articleNumber: current.articleNumber,
    sku: current.articleNumber,
    ...(incoming.supplierSku || current.supplierSku
      ? { supplierSku: incoming.supplierSku || current.supplierSku }
      : {}),
    identity: {
      ...object(mergedInput.identity),
      articleNumber: current.articleNumber,
      sku: current.articleNumber,
      ...(incoming.supplierSku || current.supplierSku
        ? { supplierSku: incoming.supplierSku || current.supplierSku }
        : {}),
      source: "elyon_unified_product_identity_v1",
    },
  };
}

export function upsertProductMasterItem(list, incoming) {
  const product = normalizeProduct(incoming);
  const next = Array.isArray(list) ? [...list] : [];
  const index = next.findIndex((entry) => sameMasterProduct(entry, incoming));

  if (index >= 0) {
    const current = normalizeProduct(next[index]);
    const incomingArticle = product.articleNumber;
    const articleConflict = Boolean(current.articleNumber && incomingArticle && current.articleNumber !== incomingArticle);
    const mergedInput = preserveImmutableIdentity(next[index], {
      ...mergeForUpdate(next[index], incoming),
      id: current.id || product.id,
      createdAt: current.createdAt || product.createdAt,
      updatedAt: new Date().toISOString(),
    });
    next[index] = normalizeProduct(mergedInput);
    return {
      status: "updated",
      product: next[index],
      items: next,
      identity: {
        articleNumber: next[index].articleNumber || "",
        immutable: Boolean(next[index].articleNumber),
        conflictIgnored: articleConflict,
      },
    };
  }

  next.unshift(product);
  return {
    status: "saved",
    product,
    items: next,
    identity: {
      articleNumber: product.articleNumber || "",
      immutable: Boolean(product.articleNumber),
      conflictIgnored: false,
    },
  };
}

export function deleteProductMasterItem(list, idOrUrl) {
  const value = String(idOrUrl || "").trim();
  const next = (Array.isArray(list) ? list : []).filter((entry) => {
    const product = normalizeProduct(entry);
    const raw = deepestRaw(entry);
    return product.id !== value &&
      product.articleNumber !== value &&
      product.sku !== value &&
      product.supplier?.url !== value &&
      String(raw.sourceImportId || raw.companyOsProductId || "") !== value;
  });
  return { deleted: next.length !== (Array.isArray(list) ? list.length : 0), items: next };
}

export function summarizeProductMaster(products) {
  const list = Array.isArray(products) ? products.map(normalizeProduct) : [];
  const ready = list.filter((product) => product.readiness?.state === "ready_for_manual_listing").length;
  const needsReview = list.filter((product) => product.readiness?.state === "needs_review").length;
  const notReady = list.filter((product) => product.readiness?.state === "not_ready").length;
  const avgReadiness = list.length
    ? Math.round(list.reduce((sum, product) => sum + Number(product.readiness?.score || 0), 0) / list.length)
    : 0;
  return { total: list.length, ready, needsReview, notReady, avgReadiness };
}
