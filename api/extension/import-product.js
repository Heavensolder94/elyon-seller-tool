import { applyCors } from "../../lib/api-cors.js";
import { normalizeBrowserImport, normalizeBrowserImportList } from "../../lib/browser-import-normalizer.js";
import { normalizeSupplierProduct } from "../../lib/supplier-product-normalizer.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

function decodeHtmlEntities(value) {
  return toText(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isHumanVerificationText(value) {
  return /\b(human verification|verify you are human|captcha|bot detection|access denied|forbidden)\b/i.test(toText(value));
}

function sanitizeProductTitle(value) {
  const text = toText(value);
  if (isHumanVerificationText(text)) return "";
  return text
    .replace(/\s*:\s*Amazon\.[^:]+(?::.*)?$/i, "")
    .replace(/\s*-\s*AliExpress.*$/i, "")
    .replace(/\s*\|\s*eBay.*$/i, "")
    .trim()
    .slice(0, 260);
}

function sanitizeProductDescription(value) {
  const text = toText(value);
  return isHumanVerificationText(text) ? "" : text;
}

function cleanAvailability(value) {
  let text = toText(value);
  if (!text) return "";
  text = text.replace(/\{[\s\S]*$/, "").trim();
  text = text.replace(/\[[\s\S]*$/, "").trim();
  text = text.replace(/"\s*,?\s*".*$/g, "").trim();
  text = text.replace(/\b(isInternal|showInsightsHub|isRobot|showFaceout|merchantId|availableBadges|loggedIn|asin|showBadge|ingressFaceout|availableFaceouts)\b[\s\S]*$/i, "").trim();
  text = text.replace(/\s{2,}/g, " ");
  return text.slice(0, 160);
}

function normalizeImageUrl(value) {
  const text = decodeHtmlEntities(value);
  if (!text || /^data:/i.test(text) || /^blob:/i.test(text)) return "";
  try {
    const url = new URL(text);
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function detectCurrency(value, fallback = "") {
  const text = toText(value);
  if (/€|\bEUR\b|\bEuro\b/i.test(text)) return "EUR";
  if (/\$|\bUSD\b/i.test(text)) return "USD";
  if (/£|\bGBP\b/i.test(text)) return "GBP";
  if (/¥|\bJPY\b/i.test(text)) return "JPY";
  return toText(fallback);
}

function normalizePrice(value, fallbackCurrency = "") {
  const text = toText(value);
  const currency = detectCurrency(text, fallbackCurrency);
  if (!text) return { price: "", currency };
  const withoutCurrency = text
    .replace(/\b(EUR|Euro|USD|GBP|JPY)\b/gi, "")
    .replace(/[€$£¥]/g, "")
    .trim();
  const match = withoutCurrency.match(/[\d]{1,3}(?:[.\s]\d{3})*(?:[.,]\d{1,2})?|[\d]+/);
  return {
    price: match ? match[0].replace(/\s+/g, "") : withoutCurrency,
    currency
  };
}

function normalizeImages(primary, images) {
  const list = [primary, ...toArray(images)]
    .map(normalizeImageUrl)
    .filter(Boolean);
  return Array.from(new Set(list)).slice(0, 20);
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

function normalizeList(list) {
  return normalizeBrowserImportList(list);
}

function toTimestamp(value) {
  const time = new Date(toText(value)).getTime();
  return Number.isFinite(time) ? time : 0;
}

function latestImportTimestamp(items) {
  return normalizeList(items).reduce((latest, item) => {
    return Math.max(
      latest,
      toTimestamp(item.updatedAt),
      toTimestamp(item.importedAt),
      toTimestamp(item.detectedAt)
    );
  }, 0);
}

function shouldPreferLocalFallback(remoteItems, localItems) {
  const remote = normalizeList(remoteItems);
  const local = normalizeList(localItems);
  if (!local.length) return false;
  if (!remote.length) return true;
  const remoteLatest = latestImportTimestamp(remote);
  const localLatest = latestImportTimestamp(local);
  if (localLatest > remoteLatest) return true;
  if (local.length > remote.length && localLatest >= remoteLatest) return true;
  return false;
}

function mergeImportLists(remoteItems, localItems) {
  const byKey = new Map();
  const append = (entry) => {
    const item = normalizeBrowserImport(entry);
    const key = toText(item.url || item.id || `${item.title}|${item.importedAt}`);
    if (!key) return;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, item);
      return;
    }
    const currentStamp = Math.max(
      toTimestamp(current.updatedAt),
      toTimestamp(current.importedAt),
      toTimestamp(current.detectedAt)
    );
    const nextStamp = Math.max(
      toTimestamp(item.updatedAt),
      toTimestamp(item.importedAt),
      toTimestamp(item.detectedAt)
    );
    if (nextStamp >= currentStamp) {
      byKey.set(key, { ...current, ...item });
    }
  };

  normalizeList(remoteItems).forEach(append);
  normalizeList(localItems).forEach(append);

  return Array.from(byKey.values()).sort((a, b) => {
    return latestImportTimestamp([b]) - latestImportTimestamp([a]);
  });
}

function readStore() {
  const raw = globalThis.__elyonBrowserImports;
  return Array.isArray(raw) ? normalizeList(raw) : [];
}

function writeStore(next) {
  globalThis.__elyonBrowserImports = normalizeList(next);
  return globalThis.__elyonBrowserImports;
}

function getLocalFallbackPath() {
  if (process.env.ELYON_BROWSER_IMPORTS_PATH) return process.env.ELYON_BROWSER_IMPORTS_PATH;
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return join(moduleDir, "../../data/browser-imports.json");
}

async function ensureDirectoryFor(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function readLocalFallbackStore() {
  const filePath = getLocalFallbackPath();
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeList(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

async function writeLocalFallbackStore(items) {
  const filePath = getLocalFallbackPath();
  try {
    await ensureDirectoryFor(filePath);
    await writeFile(filePath, JSON.stringify(normalizeList(items), null, 2), "utf8");
    return { ok: true, path: filePath };
  } catch (error) {
    return { ok: false, path: filePath, error: error?.message || "Lokales Speichern fehlgeschlagen." };
  }
}

function getStorageInfo(persisted = false) {
  const config = getRedisConfig();
  const configured = Boolean(config.url && config.token);
  return {
    configured,
    persisted: Boolean(persisted),
    mode: configured ? "server_persistent" : "server_memory_with_file_fallback",
    source: config.source,
    message: configured
      ? "Serverseitige Persistenz aktiv."
      : "Serverseitig aktiv. Ohne Upstash wird ein lokaler Dateifallback genutzt."
  };
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

async function readPersistentValue(key) {
  const { url, token } = getRedisConfig();
  if (!url || !token) return null;
  const response = await fetch(`${url.replace(/\/$/, "")}/get/${encodeURIComponent(key)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Redis REST ${response.status}`);
  return data?.result ?? null;
}

async function writePersistentValue(key, payload) {
  const { url, token } = getRedisConfig();
  if (!url || !token) return { ok: false, error: "Redis nicht konfiguriert." };
  const response = await fetch(`${url.replace(/\/$/, "")}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return { ok: false, error: data?.error || data?.message || `Redis REST ${response.status}` };
  }
  return { ok: true };
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

async function readPersistentList(key) {
  const value = await readPersistentValue(key);
  return normalizeList(parseStoredList(value));
}

function browserImportFromProduct(product = {}) {
  const sourceType = toText(product.sourceType || product.source || "");
  const sourceProvider = toText(product.sourceProvider || "");
  const sourceDomain = toText(product.sourceDomain || product.domain || "");
  const sourceUrl = toText(product.supplierLink || product.url || "");
  const looksLikeBrowserImport =
    sourceType === "chrome_extension" ||
    sourceProvider === "browser-import" ||
    Boolean(product.sourceOnlineTitle || product.sourceOnlineImage || product.sourceOnlineImages);

  if (!looksLikeBrowserImport) return null;

  let images = [];
  if (Array.isArray(product.images)) images = product.images;
  if (Array.isArray(product.sourceOnlineImages)) images = product.sourceOnlineImages;
  if (typeof product.sourceOnlineImages === "string" && product.sourceOnlineImages.trim()) {
    try {
      const parsed = JSON.parse(product.sourceOnlineImages);
      if (Array.isArray(parsed)) images = parsed;
    } catch {
      images = [];
    }
  }

  return normalizeBrowserImport({
    id: product.browserImportId || product.id || sourceUrl,
    title: product.sourceOnlineTitle || product.title || product.name || "",
    price: product.sourceOnlinePrice || product.price || "",
    currency: product.sourceOnlineCurrency || product.currency || "",
    image: product.sourceOnlineImage || product.image || images[0] || "",
    images,
    description: product.sourceOnlineDescription || product.description || product.notes || "",
    url: sourceUrl,
    supplier: product.supplier || product.supplierId || product.sourceProvider || "",
    domain: sourceDomain,
    status: product.sourceImportStatus || product.status || "reviewed",
    detectedAt: product.sourceOnlineCheckedAt || product.detectedAt || product.createdAt || "",
    importedAt: product.sourceOnlineCheckedAt || product.importedAt || product.createdAt || "",
    linkedSupplierId: product.supplierId || product.linkedSupplierId || "",
    linkedSupplierName: product.linkedSupplierName || product.supplier || "",
    availability: product.sourceOnlineAvailability || "",
    category: product.sourceOnlineCategory || product.category || "",
    rating: product.sourceOnlineRating || product.rating || "",
    reviewsCount: product.sourceOnlineReviews || product.reviewsCount || "",
    soldCount: product.sourceOnlineSold || product.soldCount || "",
  });
}

async function loadPersistentStore() {
  const { url, token } = getRedisConfig();
  if (!url || !token) {
    const localFallback = await readLocalFallbackStore();
    if (localFallback.length) {
      writeStore(localFallback);
      return localFallback;
    }
    return readStore();
  }

  try {
    let normalized = await readPersistentList("elyon_browser_imports");
    const localFallback = await readLocalFallbackStore();
    if (localFallback.length) {
      normalized = mergeImportLists(normalized, localFallback);
    }
    if (shouldPreferLocalFallback(normalized, localFallback)) {
      await writePersistentValue("elyon_browser_imports", normalized).catch(() => null);
    }
    if (!normalized.length) {
      const recovered = (await readPersistentList("elyon_products"))
        .map(browserImportFromProduct)
        .filter(Boolean);
      if (recovered.length) {
        normalized = recovered;
        await writePersistentValue("elyon_browser_imports", normalized);
      }
    }
    if (!normalized.length && localFallback.length) {
      writeStore(localFallback);
      return localFallback;
    }
    writeStore(normalized);
    return normalized;
  } catch {
    const localFallback = await readLocalFallbackStore();
    if (localFallback.length) {
      writeStore(localFallback);
      return localFallback;
    }
    return readStore();
  }
}

async function savePersistentStore(items) {
  const normalized = writeStore(items);
  const localFallback = await writeLocalFallbackStore(normalized);
  const { url, token } = getRedisConfig();
  if (!url || !token) {
    return { persisted: localFallback.ok, items: normalized, localFallback };
  }

  try {
    const remote = await writePersistentValue("elyon_browser_imports", normalized);
    return { persisted: remote.ok || localFallback.ok, items: normalized, localFallback, remote };
  } catch {
    return { persisted: localFallback.ok, items: normalized, localFallback };
  }
}

function upsertImport(list, incoming) {
  const item = normalizeBrowserImport(incoming);
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

function deleteImport(list, incoming) {
  const id = toText(incoming.id || incoming.productId || "");
  const url = toText(incoming.url || "");
  const next = list.filter((entry) => {
    const sameId = id && toText(entry.id) === id;
    const sameUrl = url && toText(entry.url) === url;
    return !(sameId || sameUrl);
  });
  return { next, deleted: next.length !== list.length };
}

export default async function handler(req, res) {
  if (applyCors(req, res, ["GET", "POST", "DELETE", "OPTIONS"])) return;

  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const items = await loadPersistentStore();
    return json(res, 200, {
      ok: true,
      route: "/api/extension/import-product",
      items,
      total: items.length,
      storage: getStorageInfo(false)
    });
  }

  if (req.method === "DELETE") {
    const body = normalizeBody(req.body);
    const incoming = body.product || body.item || body.data || body || {};
    const current = await loadPersistentStore();
    const result = deleteImport(current, incoming);
    const persisted = await savePersistentStore(result.next);
    return json(res, 200, {
      ok: true,
      route: "/api/extension/import-product",
      status: result.deleted ? "deleted" : "not_found",
      deleted: result.deleted,
      total: persisted.items.length,
      persisted: persisted.persisted,
      storage: getStorageInfo(persisted.persisted),
      message: result.deleted ? "Browser Import verworfen." : "Browser Import nicht gefunden."
    });
  }

  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Nur GET, POST und DELETE erlaubt." });
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
    browserImport: result.product,
    linkedSupplierId: result.product.linkedSupplierId || "",
    supplierProduct: normalizeSupplierProduct(result.product),
    warnings: result.product.warnings || [],
    message: result.status === "duplicate"
      ? "Browser Import war bereits vorhanden."
      : result.status === "updated"
        ? "Browser Import aktualisiert."
        : "Browser Import gespeichert.",
    product: result.product,
    total: persisted.items.length,
    persisted: persisted.persisted,
    storage: getStorageInfo(persisted.persisted)
  });
}
