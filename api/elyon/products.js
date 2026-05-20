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

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeProduct(product = {}) {
  const now = new Date().toISOString();
  const url = toText(product.url || "");
  return {
    id: toText(product.id || url || `${now}-${Math.random().toString(36).slice(2, 10)}`),
    title: toText(product.title || product.name || "Unbekanntes Produkt"),
    price: toText(product.price || ""),
    currency: toText(product.currency || ""),
    image: toText(product.image || ""),
    images: toArray(product.images).map(toText).filter(Boolean).slice(0, 20),
    description: toText(product.description || product.productDescription || product.summary || ""),
    variants: toArray(product.variants).slice(0, 50),
    shipping: toObject(product.shipping),
    rating: toText(product.rating || ""),
    reviewsCount: toText(product.reviewsCount || ""),
    soldCount: toText(product.soldCount || ""),
    productDetails: toObject(product.productDetails),
    availability: toText(product.availability || ""),
    category: toText(product.category || ""),
    supplierInfo: toObject(product.supplierInfo),
    complianceRisks: toArray(product.complianceRisks).map(toText).filter(Boolean).slice(0, 20),
    url,
    supplier: toText(product.supplier || ""),
    domain: toText(product.domain || ""),
    status: toText(product.status || "new") || "new",
    notes: toText(product.notes || ""),
    score: toText(product.score || ""),
    detectedAt: toText(product.detectedAt || now) || now,
    updatedAt: toText(product.updatedAt || now) || now,
    savedAt: toText(product.savedAt || now) || now,
  };
}

function normalizeList(list) {
  return Array.isArray(list) ? list.map(normalizeProduct) : [];
}

function readStore() {
  const raw = globalThis.__elyonProductStore;
  return Array.isArray(raw) ? normalizeList(raw) : [];
}

function writeStore(next) {
  globalThis.__elyonProductStore = normalizeList(next);
  return globalThis.__elyonProductStore;
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

async function loadPersistentStore() {
  const { url, token } = getRedisConfig();
  if (!url || !token) {
    return readStore();
  }

  try {
    const data = await redisCommand(["GET", "elyon_products"]);
    const items = parseStoredList(data?.result);
    const normalized = normalizeList(items);
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
    await redisCommand(["SET", "elyon_products", JSON.stringify(normalized)]);
    return { persisted: true, items: normalized };
  } catch {
    return { persisted: false, items: normalized };
  }
}

function upsertProduct(list, incoming) {
  const product = normalizeProduct(incoming);
  const existingIndex = list.findIndex((item) => item.url && item.url === product.url);
  if (existingIndex >= 0) {
    const next = [...list];
    next[existingIndex] = { ...next[existingIndex], ...product, updatedAt: new Date().toISOString() };
    return next;
  }
  return [product, ...list];
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const items = await loadPersistentStore();
    return json(res, 200, {
      ok: true,
      route: "/api/elyon/products",
      items,
      total: items.length,
      storage: getStorageInfo(false)
    });
  }

  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Nur GET und POST erlaubt." });
  }

  const body = normalizeBody(req.body);
  const incoming = body.product || body.item || body.data || {};
  const current = await loadPersistentStore();
  const next = upsertProduct(current, incoming);
  const persisted = await savePersistentStore(next);

  return json(res, 200, {
    ok: true,
    route: "/api/elyon/products",
    message: persisted.persisted
      ? "Produkt empfangen und serverseitig gespeichert."
      : "Produkt empfangen und lokal vorbereitet.",
    product: normalizeProduct(incoming),
    total: persisted.items.length,
    persisted: persisted.persisted,
    storage: getStorageInfo(persisted.persisted)
  });
}
