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

function normalizeDomain(value) {
  const text = toText(value).toLowerCase();
  try {
    const url = text.includes("://") ? new URL(text) : new URL(`https://${text}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return text.replace(/^www\./, "");
  }
}

const SUPPLIER_MAP = [
  { id: "supplier-cjdropshipping", name: "CJdropshipping", domains: ["cjdropshipping.com"] },
  { id: "supplier-aliexpress", name: "AliExpress", domains: ["aliexpress.com"] },
  { id: "supplier-amazon-de", name: "Amazon.de", domains: ["amazon.de"] },
  { id: "supplier-amazon", name: "Amazon", domains: ["amazon.com"] },
  { id: "supplier-temu", name: "Temu", domains: ["temu.com"] },
  { id: "supplier-alibaba", name: "Alibaba", domains: ["alibaba.com"] },
  { id: "supplier-bigbuy", name: "BigBuy", domains: ["bigbuy.eu", "bigbuy.com"] },
  { id: "supplier-dropxl", name: "dropXL", domains: ["dropxl.com"] },
  { id: "supplier-vidaxl", name: "vidaXL", domains: ["vidaxl.de", "vidaxl.com", "dropshippingxl.com"] }
];

function resolveSupplier(domain, supplier) {
  const domainValue = normalizeDomain(domain);
  const supplierValue = toText(supplier).toLowerCase();
  const found = SUPPLIER_MAP.find((entry) =>
    entry.domains.some((candidate) => domainValue === candidate || domainValue.endsWith(`.${candidate}`) || supplierValue.includes(entry.name.toLowerCase()))
  );

  if (!found) {
    return { linkedSupplierId: "", linkedSupplierName: "" };
  }

  return { linkedSupplierId: found.id, linkedSupplierName: found.name };
}

function normalizeImport(product = {}) {
  const now = new Date().toISOString();
  const url = toText(product.url || "");
  const domain = normalizeDomain(product.domain || (url ? (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })() : ""));
  const supplier = toText(product.supplier || "");
  const supplierMatch = resolveSupplier(domain, supplier);
  const linkedSupplierId = toText(product.linkedSupplierId || supplierMatch.linkedSupplierId);
  return {
    id: toText(product.id || url || `${now}-${Math.random().toString(36).slice(2, 10)}`),
    title: toText(product.title || product.name || "Unbekanntes Produkt"),
    price: toText(product.price || ""),
    currency: toText(product.currency || ""),
    image: toText(product.image || ""),
    description: toText(product.description || product.productDescription || product.summary || ""),
    url,
    supplier: supplier || supplierMatch.linkedSupplierName || "",
    domain,
    detectedAt: toText(product.detectedAt || now) || now,
    source: "chrome_extension",
    status: toText(product.status || "new") || "new",
    notes: toText(product.notes || ""),
    score: toText(product.score || ""),
    linkedSupplierId,
    linkedSupplierName: supplierMatch.linkedSupplierName || "",
    importedAt: toText(product.importedAt || now) || now,
    updatedAt: toText(product.updatedAt || now) || now
  };
}

function normalizeList(list) {
  return Array.isArray(list) ? list.map(normalizeImport) : [];
}

function readStore() {
  const raw = globalThis.__elyonBrowserImports;
  return Array.isArray(raw) ? normalizeList(raw) : [];
}

function writeStore(next) {
  globalThis.__elyonBrowserImports = normalizeList(next);
  return globalThis.__elyonBrowserImports;
}

async function loadPersistentStore() {
  const endpoint = process.env.UPSTASH_BACKUP_URL || "";
  const token = process.env.UPSTASH_BACKUP_TOKEN || "";
  if (!endpoint || !token) {
    return readStore();
  }

  try {
    const url = `${endpoint.replace(/\/$/, "")}/elyon_browser_imports`;
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
    const url = `${endpoint.replace(/\/$/, "")}/elyon_browser_imports`;
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

function upsertImport(list, incoming) {
  const item = normalizeImport(incoming);
  const existingIndex = list.findIndex((entry) => entry.url && entry.url === item.url);
  if (existingIndex >= 0) {
    const current = list[existingIndex];
    const merged = { ...current, ...item, updatedAt: new Date().toISOString() };
    const changed = JSON.stringify(current) !== JSON.stringify(merged);
    const next = [...list];
    next[existingIndex] = merged;
    return { next, status: changed ? "updated" : "duplicate", product: merged };
  }
  return { next: [item, ...list], status: "saved", product: item };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const items = await loadPersistentStore();
    return json(res, 200, {
      ok: true,
      route: "/api/extension/import-product",
      items,
      total: items.length
    });
  }

  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Nur GET und POST erlaubt." });
  }

  const body = normalizeBody(req.body);
  const incoming = body.product || body.item || body.data || body || {};
  const current = await loadPersistentStore();
  const result = upsertImport(current, incoming);
  const persisted = await savePersistentStore(result.next);

  return json(res, 200, {
    ok: true,
    route: "/api/extension/import-product",
    status: result.status,
    productId: result.product.id,
    linkedSupplierId: result.product.linkedSupplierId || "",
    message: result.status === "duplicate"
      ? "Browser Import war bereits vorhanden."
      : result.status === "updated"
        ? "Browser Import aktualisiert."
        : "Browser Import gespeichert.",
    product: result.product,
    total: persisted.items.length,
    persisted: persisted.persisted
  });
}
