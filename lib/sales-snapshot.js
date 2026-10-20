// Dauerhafte Sicherung der Verkaufsdaten. Die Browser-Wahrheit bleibt localStorage;
// dieser Speicher ist das Wiederherstellungsnetz gegen Profil-Reset und Geraetewechsel.
const SALES_KEY = "elyon:prod:seller_tool:sales:v1";
const MAX_SALES = 2000;
const REQUEST_TIMEOUT_MS = 10000;

const text = (value, max = 2000) => String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);

function redisConfig(env = process.env) {
  const pairs = [
    { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN },
    { url: env.UPSTASH_BACKUP_URL, token: env.UPSTASH_BACKUP_TOKEN },
    { url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN },
  ];
  const found = pairs.find((pair) => pair.url && pair.token);
  return found ? { url: found.url, token: found.token } : null;
}

async function redisCommand(command, options = {}) {
  const config = redisConfig(options.env || process.env);
  if (!config) {
    const error = new Error("Upstash/KV ist nicht konfiguriert.");
    error.code = "storage_not_configured";
    throw error;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(config.url.replace(/\/$/, ""), {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(command),
      cache: "no-store",
      signal: controller.signal,
    });
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
    if (!response.ok || data.error) {
      const error = new Error(data.error || `Redis REST ${response.status}`);
      error.code = "storage_failed";
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function resultOf(response, fallback = null) {
  return response && Object.prototype.hasOwnProperty.call(response, "result") ? response.result : fallback;
}

// Nur die Felder uebernehmen, die auch fachlich gebraucht werden; alles andere
// wuerde beliebige Browser-Payloads dauerhaft speichern.
export function normalizeSale(entry = {}) {
  const source = entry && typeof entry === "object" ? entry : {};
  const orderNo = text(source.orderNo || source.orderId || "", 80);
  return {
    id: text(source.id, 80),
    orderNo,
    product: text(source.product, 300),
    price: Number(source.price) || 0,
    qty: Number(source.qty) || 0,
    cost: Number(source.cost) || 0,
    fees: Number(source.fees) || 0,
    profit: Number(source.profit) || 0,
    platform: text(source.platform, 40),
    status: text(source.status, 40),
    carrier: text(source.carrier, 40),
    trackingNumber: text(source.trackingNumber, 120),
    shipDate: text(source.shipDate, 40),
    buyerRef: text(source.buyerRef, 120),
    createdAt: text(source.createdAt, 40),
    created: text(source.created, 40),
    updatedAt: text(source.updatedAt, 40),
  };
}

// Duplikatfrei ueber orderNo, sonst id. Spaetere Eintraege gewinnen.
export function mergeSales(existing = [], incoming = [], { limit = MAX_SALES } = {}) {
  const byKey = new Map();
  const all = [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])];
  for (const entry of all) {
    const sale = normalizeSale(entry);
    const key = sale.orderNo || sale.id;
    if (!key) continue;
    byKey.set(key, sale);
  }
  const values = [...byKey.values()];
  const max = Number(limit) > 0 ? Math.floor(Number(limit)) : MAX_SALES;
  return values.slice(-max);
}

export async function loadSalesSnapshot(options = {}) {
  const raw = resultOf(await redisCommand(["GET", SALES_KEY], options), null);
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeSale) : [];
  } catch {
    return [];
  }
}

export async function saveSalesSnapshot(sales = [], options = {}) {
  const existing = await loadSalesSnapshot(options);
  const merged = mergeSales(existing, sales, options.limit ? { limit: options.limit } : undefined);
  await redisCommand(["SET", SALES_KEY, JSON.stringify(merged)], options);
  return { ok: true, stored: merged.length, incoming: Array.isArray(sales) ? sales.length : 0, existing: existing.length };
}

export const SALES_SNAPSHOT_KEY = SALES_KEY;
