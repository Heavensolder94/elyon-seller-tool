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

function normalizeProduct(product = {}) {
  const now = new Date().toISOString();
  const url = toText(product.url || "");
  return {
    id: toText(product.id || url || `${now}-${Math.random().toString(36).slice(2, 10)}`),
    title: toText(product.title || product.name || "Unbekanntes Produkt"),
    price: toText(product.price || ""),
    currency: toText(product.currency || ""),
    image: toText(product.image || ""),
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

async function loadPersistentStore() {
  const endpoint = process.env.UPSTASH_BACKUP_URL || "";
  const token = process.env.UPSTASH_BACKUP_TOKEN || "";
  if (!endpoint || !token) {
    return readStore();
  }

  try {
    const url = `${endpoint.replace(/\/$/, "")}/elyon_products`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      return readStore();
    }
    const data = await response.json().catch(() => null);
    const items = Array.isArray(data?.value) ? data.value : Array.isArray(data) ? data : [];
    const normalized = normalizeList(items);
    writeStore(normalized);
    return normalized;
  } catch {
    return readStore();
  }
}

async function savePersistentStore(items) {
  const normalized = writeStore(items);
  const endpoint = process.env.UPSTASH_BACKUP_URL || "";
  const token = process.env.UPSTASH_BACKUP_TOKEN || "";
  if (!endpoint || !token) {
    return { persisted: false, items: normalized };
  }

  try {
    const url = `${endpoint.replace(/\/$/, "")}/elyon_products`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ value: normalized })
    });
    return { persisted: response.ok, items: normalized };
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
      total: items.length
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
    persisted: persisted.persisted
  });
}
