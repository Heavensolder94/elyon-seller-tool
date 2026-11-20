import crypto from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { mergeTransactions, createAuditEvent } from "../seller-finance-core.js";

const DEFAULT_KEY = "elyon-seller-tool:finance:v1";
const DEFAULT_FILE = "./data/elyon-finance.json";

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }

function upstashConfig() {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) return { source: "upstash_redis_rest", url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN };
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) return { source: "vercel_kv_rest", url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
  if (process.env.EBAY_TOKEN_STORE_URL && process.env.EBAY_TOKEN_STORE_TOKEN) return { source: "ebay_token_store", url: process.env.EBAY_TOKEN_STORE_URL, token: process.env.EBAY_TOKEN_STORE_TOKEN };
  return { source: "none", url: "", token: "" };
}

function hosted() { return Boolean(process.env.VERCEL || process.env.VERCEL_ENV || process.env.NODE_ENV === "production"); }
function mode() {
  const explicit = text(process.env.ELYON_FINANCE_STORE_MODE).toLowerCase();
  if (["upstash", "redis", "kv"].includes(explicit)) return "upstash";
  if (explicit === "file") return hosted() ? "unconfigured" : "file";
  const config = upstashConfig();
  if (config.url && config.token) return "upstash";
  return hosted() ? "unconfigured" : "file";
}
function key() { return text(process.env.ELYON_FINANCE_STORE_KEY) || DEFAULT_KEY; }
function filePath() { return text(process.env.ELYON_FINANCE_STORE_PATH) || DEFAULT_FILE; }

function emptyState() {
  return {
    version: 1,
    revision: 0,
    transactions: [],
    orderOperations: {},
    invoiceMeta: {},
    inventory: {},
    returns: {},
    monthClosures: {},
    documents: [],
    suppliers: [],
    settings: { locale: "de-DE", currency: "EUR", taxMode: "unconfigured", invoicePrefix: "ELYON", nextInvoiceNumber: 1, defaultTaxCode: "",
      sellerLegalName: "", sellerBrand: "ELYON", sellerStreet: "", sellerPostalCode: "", sellerCity: "", sellerCountry: "DE", sellerTaxId: "" },
    imports: [],
    auditLog: [],
    safety: { livePublishingEnabled: false, trackingSyncEnabled: false },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((entry) => [entry, stable(value[entry])]));
}
function auditHash(event, previousHash = "") { return crypto.createHash("sha256").update(JSON.stringify(stable({ ...event, previousHash }))).digest("hex"); }
function appendAudit(state, event) {
  const previous = list(state.auditLog).at(-1);
  const base = { ...createAuditEvent(event.action || "finance_sync", event, event.actor || "seller"), ...event, previousHash: text(previous?.hash) };
  base.hash = auditHash(base, base.previousHash);
  state.auditLog = [...list(state.auditLog), base].slice(-5000);
  return state;
}

function appendClientAudit(state, incomingEvents = []) {
  const seen = new Set(list(state.auditLog).map((event) => text(event.metadata?.clientEventId || event.id)));
  for (const event of list(incomingEvents).slice(-1000)) {
    const id = text(event?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    // The server recalculates the hash, rather than trusting a browser hash.
    appendAudit(state, {
      action: text(event.action).slice(0, 120) || "finance_client_event",
      actor: "seller",
      entityType: text(event.entityType).slice(0, 120),
      entityId: text(event.entityId).slice(0, 300),
      summary: text(event.summary).slice(0, 1000),
      metadata: {
        ...(JSON.stringify(object(event.metadata)).length <= 8192 ? object(event.metadata) : { metadataTruncated: true }),
        clientEventId: id, clientTimestamp: text(event.timestamp).slice(0, 50),
      },
    });
  }
}

function mergeRecordMaps(existing, incoming) {
  const result = { ...object(existing) };
  for (const [id, value] of Object.entries(object(incoming))) {
    if (!id || !value || typeof value !== "object") continue;
    result[id] = { ...(result[id] || {}), ...value, updatedAt: new Date().toISOString() };
  }
  return result;
}
// Issued invoices are never rewritten by an ordinary browser sync, including
// stale tabs, restore operations, and imports of old local invoices.
function mergeInvoiceMeta(existing, incoming, allowIssue = false) {
  const result = { ...object(existing) };
  for (const [id, raw] of Object.entries(object(incoming))) {
    if (!id || !raw || typeof raw !== 'object') continue;
    const previous = result[id];
    if (previous?.immutable === true) continue;
    // A legacy record appearing during issuance is evidence of a prior invoice.
    // Never replace it with an issued snapshot after a concurrent write.
    if (previous && raw.immutable === true) continue;
    if (raw.immutable === true && (!allowIssue || !raw.invoice || !raw.invoiceNumber)) continue;
    result[id] = { ...(previous || {}), ...raw,
      updatedAt: previous?.updatedAt || new Date().toISOString() };
  }
  return result;
}
function mergeById(existing, incoming, options = {}) {
  const byId = new Map(list(existing).map((entry) => [text(entry?.id), entry]).filter(([id]) => id));
  for (const entry of list(incoming)) {
    const id = text(entry?.id);
    if (!id) continue;
    const previous = byId.get(id);
    if (!previous) { byId.set(id, { ...entry, createdAt: entry.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() }); continue; }
    const protectedOriginal = {};
    if (options.preserveOriginal) {
      for (const field of ["original", "name", "type", "size", "sha256", "cloudFileId", "cloudStoredAt"]) {
        if (previous[field] !== undefined && previous[field] !== null && previous[field] !== "") protectedOriginal[field] = previous[field];
      }
    }
    byId.set(id, { ...previous, ...entry, ...protectedOriginal, id, createdAt: previous.createdAt || entry.createdAt, updatedAt: new Date().toISOString() });
  }
  return [...byId.values()];
}

export function normalizeFinanceState(value = {}) {
  const source = object(value);
  const defaults = emptyState();
  const mergedTransactions = mergeTransactions([], list(source.transactions)).transactions;
  return {
    ...defaults, ...source, version: 1,
    revision: Number.isSafeInteger(source.revision) && source.revision >= 0 ? source.revision : 0,
    transactions: mergedTransactions,
    orderOperations: object(source.orderOperations),
    invoiceMeta: object(source.invoiceMeta),
    inventory: object(source.inventory),
    returns: object(source.returns),
    monthClosures: object(source.monthClosures),
    documents: mergeById([], source.documents),
    suppliers: mergeById([], source.suppliers),
    settings: { ...defaults.settings, ...object(source.settings) },
    imports: mergeById([], source.imports),
    auditLog: list(source.auditLog).slice(-5000),
    safety: { ...defaults.safety, ...object(source.safety) },
    createdAt: source.createdAt || defaults.createdAt,
    updatedAt: source.updatedAt || defaults.updatedAt,
  };
}

export function mergeFinanceState(currentValue = {}, incomingValue = {}, audit = {}, options = {}) {
  const current = normalizeFinanceState(currentValue);
  const incomingRaw = object(incomingValue);
  const incoming = normalizeFinanceState(incomingRaw);
  // New receipt-backed allocations can only enter through the checked server action.
  const knownTransactionKeys = new Set(current.transactions.map(entry => entry.dedupeKey));
  const safeIncomingTransactions = incoming.transactions.filter(entry => options.allowReceiptCosts === true || entry.source !== "supplier_receipt_verified" || knownTransactionKeys.has(entry.dedupeKey));
  const transactionMerge = mergeTransactions(current.transactions, safeIncomingTransactions);
  const next = {
    ...current, ...incoming,
    transactions: transactionMerge.transactions,
    orderOperations: mergeRecordMaps(current.orderOperations, incoming.orderOperations),
    invoiceMeta: mergeInvoiceMeta(current.invoiceMeta, incoming.invoiceMeta, options.allowIssuedInvoices === true),
    inventory: mergeRecordMaps(current.inventory, incoming.inventory),
    returns: mergeRecordMaps(current.returns, incoming.returns),
    monthClosures: mergeRecordMaps(current.monthClosures, incoming.monthClosures),
    documents: mergeById(current.documents, incoming.documents, { preserveOriginal: true }),
    suppliers: mergeById(current.suppliers, incoming.suppliers),
    imports: mergeById(current.imports, incoming.imports),
    settings: { ...current.settings, ...object(incomingRaw.settings) },
    safety: { ...current.safety, ...object(incomingRaw.safety) },
    auditLog: current.auditLog,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  };
  appendClientAudit(next, incomingRaw.auditLog);
  appendAudit(next, {
    action: audit.action || "finance_state_merged", actor: audit.actor || "seller", entityType: "finance_state", entityId: "v1",
    summary: audit.summary || `Finanzdaten zusammengeführt: ${transactionMerge.inserted} neu, ${transactionMerge.duplicates} bereits bekannt.`,
    metadata: { inserted: transactionMerge.inserted, updated: transactionMerge.updated, duplicates: transactionMerge.duplicates, source: audit.source || "api" },
  });
  return { state: next, merge: transactionMerge };
}

async function upstashGet() {
  const config = upstashConfig(); if (!config.url || !config.token) return null;
  const response = await fetch(`${config.url.replace(/\/$/, "")}/get/${encodeURIComponent(key())}`, { headers: { Authorization: `Bearer ${config.token}` } });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) throw new Error(data?.error || data?.message || `Finance Store HTTP ${response.status}`);
  if (data?.result === null || data?.result === undefined) return null;
  if (typeof data.result === "string") {
    try { return JSON.parse(data.result); }
    catch { throw new Error("Ungültige Finance-Serverdaten: kein automatisches Überschreiben."); }
  }
  return data.result;
}
// Compare-and-set is atomic: concurrent tabs/devices cannot silently overwrite
// one another between GET and SET. Upstash REST accepts Redis commands as JSON.
async function upstashCompareAndSet(payload, expectedRevision) {
  const config = upstashConfig();
  if (!config.url || !config.token) throw new Error("Persistenter Upstash-/KV-Speicher für Elyon Finance fehlt.");
  const lua = [
    "local raw = redis.call('GET', KEYS[1])",
    "local previous = 0",
    "if raw then previous = tonumber(cjson.decode(raw).revision or 0) end",
    "if previous ~= tonumber(ARGV[1]) then return 0 end",
    "redis.call('SET', KEYS[1], ARGV[2])",
    "return 1",
  ].join("\n");
  const response = await fetch(config.url.replace(/\/$/, ""), {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(["EVAL", lua, 1, key(), expectedRevision, JSON.stringify(payload)]),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) throw new Error(data?.error || data?.message || `Finance Store HTTP ${response.status}`);
  return Number(data?.result) === 1;
}
async function fileGet() {
  try { return JSON.parse(await readFile(filePath(), "utf8")); }
  catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error("Finanzdatei nicht lesbar oder beschädigt; kein automatisches Überschreiben.", { cause: error });
  }
}
async function fileSet(payload) { await mkdir(dirname(filePath()), { recursive: true }); await writeFile(filePath(), `${JSON.stringify(payload, null, 2)}\n`, "utf8"); return { ok: true, mode: "file", path: filePath(), persistent: false }; }

export async function readFinanceState() {
  const selected = mode();
  const value = selected === "upstash" ? await upstashGet() : selected === "file" ? await fileGet() : null;
  return normalizeFinanceState(value || emptyState());
}
export async function writeFinanceState(payload, audit = {}, options = {}) {
  const selected = mode();
  if (selected === "unconfigured") return { ok: false, mode: selected, error: "Persistenter Finanzspeicher fehlt. Lokale Browserdaten bleiben nutzbar." };
  const expected = options.expectedRevision;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await readFinanceState();
    if (expected !== undefined && expected !== current.revision) {
      return { ok: false, conflict: true, error: "Finanzdaten wurden auf einem anderen Gerät geändert. Bitte zuerst den Konflikt prüfen.", currentRevision: current.revision };
    }
    const merged = mergeFinanceState(current, payload, audit, options);
    merged.state.revision = current.revision + 1;
    const saved = selected === "upstash"
      ? await upstashCompareAndSet(merged.state, current.revision)
      : Boolean(await fileSet(merged.state));
    if (saved) return {
      ok: true, mode: selected, state: merged.state, merge: merged.merge,
      ...(selected === "upstash" ? { source: upstashConfig().source, key: key(), persistent: true } : { persistent: false }),
    };
    if (expected !== undefined) break;
  }
  return { ok: false, conflict: true, error: "Zeitgleiche Finanzänderung erkannt. Bitte die Daten vor erneutem Speichern abgleichen." };
}

/**
 * Atomically reserve invoice numbers per order. A retry returns the same
 * number, even if the initial browser request was interrupted.
 */
export async function reserveFinanceInvoiceNumber(orderId, prefix = "ELYON", year = new Date().getFullYear()) {
  const order = text(orderId);
  const cleanPrefix = text(prefix).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "ELYON";
  const invoiceYear = Number(year);
  if (!order || order.length > 200 || !Number.isInteger(invoiceYear) || invoiceYear < 2000 || invoiceYear > 2100) {
    return { ok: false, error: "Ungültige Rechnungsnummern-Anfrage." };
  }
  if (mode() !== "upstash") return { ok: false, error: "Sichere Rechnungsnummern benötigen persistenten Redis-Speicher." };
  const state = await readFinanceState();
  const invoicePattern = new RegExp("^" + cleanPrefix + "-" + invoiceYear + "-(\\d+)$");
  const existingNumbers = Object.values(state.invoiceMeta).map((invoice) => String(invoice?.invoiceNumber || "").match(invoicePattern))
    .filter(Boolean).map((match) => Number(match[1]));
  const highest = Math.max(0, Number(state.settings.nextInvoiceNumber || 1) - 1, ...existingNumbers);
  const config = upstashConfig();
  const orderHash = crypto.createHash("sha256").update(order).digest("hex");
  const counterKey = `${key()}:invoice-seq:${invoiceYear}:${cleanPrefix}`;
  const reservationKey = `${key()}:invoice-order:${orderHash}`;
  const lua = [
    "local prior = redis.call('GET', KEYS[2])",
    "if prior then return prior end",
    "redis.call('SET', KEYS[1], ARGV[1], 'NX')",
    "local sequence = redis.call('INCR', KEYS[1])",
    "local value = ARGV[2] .. string.format('%05d', sequence)",
    "redis.call('SET', KEYS[2], value)",
    "return value",
  ].join("\n");
  const response = await fetch(config.url.replace(/\/$/, ""), {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(["EVAL", lua, 2, counterKey, reservationKey, highest, `${cleanPrefix}-${invoiceYear}-`]),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error || typeof data?.result !== "string") {
    throw new Error(data?.error || data?.message || "Rechnungsnummer konnte nicht sicher reserviert werden.");
  }
  return { ok: true, invoiceNumber: data.result };
}

export function getFinanceStoreDescription() {
  const selected = mode(); const config = upstashConfig();
  if (selected === "upstash") return { mode: selected, source: config.source, key: key(), persistent: true, configured: Boolean(config.url && config.token) };
  if (selected === "file") return { mode: selected, path: filePath(), persistent: false, localOnly: true, configured: true };
  return { mode: "unconfigured", persistent: false, configured: false, message: "Upstash/KV ist für Elyon Finance noch nicht konfiguriert." };
}
