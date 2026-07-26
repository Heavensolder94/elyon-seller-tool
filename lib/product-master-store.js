import { normalizeProduct } from "./product-master.js";

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

function productKey(product) {
  const normalized = normalizeProduct(product);
  const raw = normalized.raw || {};
  return String(raw.sourceImportId || raw.companyOsProductId || normalized.supplier?.url || normalized.id || "").trim();
}

export function upsertProductMasterItem(list, incoming) {
  const product = normalizeProduct(incoming);
  const key = productKey(product);
  const next = Array.isArray(list) ? [...list] : [];
  const index = next.findIndex((entry) => {
    const normalized = normalizeProduct(entry);
    return productKey(normalized) === key || normalized.id === product.id || (normalized.supplier?.url && normalized.supplier.url === product.supplier?.url);
  });
  if (index >= 0) {
    const current = normalizeProduct(next[index]);
    next[index] = normalizeProduct({
      ...current.raw,
      ...incoming,
      id: current.id || product.id,
      createdAt: current.createdAt || product.createdAt,
      updatedAt: new Date().toISOString(),
    });
    return { status: "updated", product: next[index], items: next };
  }
  next.unshift(product);
  return { status: "saved", product, items: next };
}

export function deleteProductMasterItem(list, idOrUrl) {
  const value = String(idOrUrl || "").trim();
  const next = (Array.isArray(list) ? list : []).filter((entry) => {
    const product = normalizeProduct(entry);
    return product.id !== value && product.supplier?.url !== value && String(product.raw?.sourceImportId || "") !== value;
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
