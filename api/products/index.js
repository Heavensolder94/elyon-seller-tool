import { mergeProductLists, normalizeProduct } from "../../lib/product-master.js";

function getRedisConfig() {
  const pairs = [
    { source: "custom_upstash_backup", url: process.env.UPSTASH_BACKUP_URL, token: process.env.UPSTASH_BACKUP_TOKEN },
    { source: "upstash_redis_rest", url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN },
    { source: "vercel_kv_rest", url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN },
  ];
  return pairs.find((pair) => pair.url && pair.token) || { source: "memory", url: "", token: "" };
}

async function redisCommand(command) {
  const { url, token } = getRedisConfig();
  if (!url || !token) return null;
  const response = await fetch(url.replace(/\/$/, ""), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
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

async function readList(key) {
  const data = await redisCommand(["GET", key]);
  return parseStoredList(data?.result);
}

async function writeList(key, items) {
  const config = getRedisConfig();
  if (!config.url || !config.token) {
    globalThis.__elyonProductMaster = Array.isArray(items) ? items : [];
    return { persisted: false, mode: "server_memory", source: config.source };
  }
  await redisCommand(["SET", key, JSON.stringify(items || [])]);
  return { persisted: true, mode: "server_persistent", source: config.source };
}

async function loadMasterProducts() {
  const config = getRedisConfig();
  if (!config.url || !config.token) {
    return Array.isArray(globalThis.__elyonProductMaster) ? globalThis.__elyonProductMaster : [];
  }
  return readList("elyon_products");
}

async function loadBrowserImports() {
  return readList("elyon_browser_imports");
}

function productKey(product) {
  return product?.supplier?.url || product?.id || "";
}

function upsertProduct(list, incoming) {
  const product = normalizeProduct(incoming);
  const key = productKey(product);
  const next = Array.isArray(list) ? [...list] : [];
  const index = next.findIndex((entry) => {
    const normalized = normalizeProduct(entry);
    return productKey(normalized) === key || normalized.id === product.id;
  });
  if (index >= 0) {
    next[index] = normalizeProduct({ ...next[index], ...incoming, updatedAt: new Date().toISOString() });
    return { status: "updated", product: next[index], items: next };
  }
  next.unshift(product);
  return { status: "saved", product, items: next };
}

function deleteProduct(list, idOrUrl) {
  const value = String(idOrUrl || "").trim();
  const next = (Array.isArray(list) ? list : []).filter((entry) => {
    const product = normalizeProduct(entry);
    return product.id !== value && product.supplier.url !== value;
  });
  return { deleted: next.length !== (Array.isArray(list) ? list.length : 0), items: next };
}

function summarize(products) {
  const ready = products.filter((product) => product.readiness?.state === "ready_for_manual_listing").length;
  const needsReview = products.filter((product) => product.readiness?.state === "needs_review").length;
  const notReady = products.filter((product) => product.readiness?.state === "not_ready").length;
  const avgReadiness = products.length
    ? Math.round(products.reduce((sum, product) => sum + Number(product.readiness?.score || 0), 0) / products.length)
    : 0;
  return { total: products.length, ready, needsReview, notReady, avgReadiness };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const config = getRedisConfig();

  try {
    if (req.method === "GET") {
      const [masterProducts, browserImports] = await Promise.all([loadMasterProducts(), loadBrowserImports()]);
      const products = mergeProductLists(masterProducts, browserImports);
      return res.status(200).json({
        ok: true,
        route: "/api/products",
        products,
        summary: summarize(products),
        sources: {
          masterProducts: masterProducts.length,
          browserImports: browserImports.length,
        },
        storage: {
          configured: Boolean(config.url && config.token),
          mode: config.url && config.token ? "server_persistent" : "server_memory",
          source: config.source,
        },
        safety: {
          automaticListing: false,
          automaticOrder: false,
          manualApprovalRequired: true,
        },
      });
    }

    if (req.method === "POST") {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const incoming = body.product || body.item || body.data || body;
      const current = await loadMasterProducts();
      const result = upsertProduct(current, incoming);
      const storage = await writeList("elyon_products", result.items);
      return res.status(200).json({
        ok: true,
        route: "/api/products",
        status: result.status,
        product: normalizeProduct(result.product),
        total: result.items.length,
        storage,
        message: result.status === "updated" ? "Produkt aktualisiert." : "Produkt im Master gespeichert.",
      });
    }

    if (req.method === "DELETE") {
      const id = String(req.query.id || req.query.url || req.body?.id || req.body?.url || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "id oder url fehlt." });
      const current = await loadMasterProducts();
      const result = deleteProduct(current, id);
      const storage = await writeList("elyon_products", result.items);
      return res.status(200).json({
        ok: true,
        route: "/api/products",
        deleted: result.deleted,
        total: result.items.length,
        storage,
        message: result.deleted ? "Produkt gelöscht." : "Produkt nicht gefunden.",
      });
    }

    return res.status(405).json({ ok: false, error: "Nur GET, POST und DELETE erlaubt." });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      route: "/api/products",
      error: error && error.message ? error.message : "Product API Fehler",
      storage: {
        configured: Boolean(config.url && config.token),
        source: config.source,
      },
    });
  }
}
