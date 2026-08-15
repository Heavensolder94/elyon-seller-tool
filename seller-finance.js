import {
  parseEbayCsv,
  normalizeFinanceTransaction,
  mergeTransactions,
  bookingProposal,
  calculateMetrics,
  exportTransactionsCsv,
  exportDatevPreparation,
  buildEurSummary,
  createAuditEvent,
} from "./seller-finance-core.js";

const TAB_ID = "financeTab";
const STYLE_ID = "elyonFinanceStyles";
const STATE_KEY = "elyon_finance_v1";
const BACKUP_PREFIX = "elyon_finance_backup_";
const DB_NAME = "elyon-finance-documents";
const DB_STORE = "files";
const BASE_CURRENCY = "EUR";
const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const percent = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" });
const day = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });

let state = defaultState();
let activePanel = "dashboard";
let stagedImport = null;
let serverStatus = null;
let selectedTransactionIds = new Set();
let period = defaultPeriod();
let installDone = false;

function text(value) { return String(value ?? "").trim(); }
function num(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function money(value) { return euro.format(num(value)); }
function formatDate(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? dateTime.format(date) : "–"; }
function escapeHtml(value) { return text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function safeJson(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
function uid(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`; }

function defaultState() {
  return {
    version: 2,
    transactions: [], documents: [], suppliers: [], imports: [], auditLog: [], monthClosures: {},
    settings: {
      locale: "de-DE", currency: BASE_CURRENCY, taxMode: "unconfigured", defaultTaxCode: "",
      invoicePrefix: "ELYON", nextInvoiceNumber: 1,
      revenueAccount: "Erlöse", ebayFeeAccount: "eBay-Gebühren", advertisingAccount: "Werbekosten",
      goodsAccount: "Wareneinkauf", shippingAccount: "Versandkosten", refundAccount: "Erlösminderungen",
      otherIncomeAccount: "Sonstige Erträge", otherExpenseAccount: "Sonstige Kosten",
    },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function normalizeState(value = {}) {
  const defaults = defaultState();
  const source = value && typeof value === "object" ? value : {};
  return {
    ...defaults, ...source, version: 2,
    transactions: Array.isArray(source.transactions) ? source.transactions : [],
    documents: Array.isArray(source.documents) ? source.documents : [],
    suppliers: Array.isArray(source.suppliers) ? source.suppliers : [],
    imports: Array.isArray(source.imports) ? source.imports : [],
    auditLog: Array.isArray(source.auditLog) ? source.auditLog : [],
    monthClosures: source.monthClosures && typeof source.monthClosures === "object" ? source.monthClosures : {},
    settings: { ...defaults.settings, ...(source.settings || {}) },
  };
}

function defaultPeriod(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { preset: "month", start: start.toISOString(), end: end.toISOString(), label: monthLabel(start) };
}

function monthLabel(date) { return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(date); }
function isoDay(date) { return new Date(date).toISOString().slice(0, 10); }
function monthKey(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; }

export function resolveFinancePeriod(preset = "month", now = new Date(), customStart = "", customEnd = "") {
  const base = new Date(now);
  let start;
  let end;
  if (preset === "previous_month") {
    start = new Date(base.getFullYear(), base.getMonth() - 1, 1);
    end = new Date(base.getFullYear(), base.getMonth(), 0, 23, 59, 59, 999);
  } else if (preset === "quarter") {
    const qStart = Math.floor(base.getMonth() / 3) * 3;
    start = new Date(base.getFullYear(), qStart, 1);
    end = new Date(base.getFullYear(), qStart + 3, 0, 23, 59, 59, 999);
  } else if (preset === "year") {
    start = new Date(base.getFullYear(), 0, 1);
    end = new Date(base.getFullYear(), 11, 31, 23, 59, 59, 999);
  } else if (preset === "all") {
    return { preset, start: "", end: "", label: "Gesamter Datenbestand" };
  } else if (preset === "custom" && customStart && customEnd) {
    start = new Date(`${customStart}T00:00:00`);
    end = new Date(`${customEnd}T23:59:59.999`);
  } else {
    start = new Date(base.getFullYear(), base.getMonth(), 1);
    end = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999);
    preset = "month";
  }
  const label = preset === "quarter"
    ? `Q${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()}`
    : preset === "year" ? String(start.getFullYear())
      : preset === "custom" ? `${new Intl.DateTimeFormat("de-DE").format(start)}–${new Intl.DateTimeFormat("de-DE").format(end)}`
        : monthLabel(start);
  return { preset, start: start.toISOString(), end: end.toISOString(), label };
}

export function filterFinanceTransactions(transactions = [], selectedPeriod = {}) {
  const start = selectedPeriod.start ? new Date(selectedPeriod.start).getTime() : -Infinity;
  const end = selectedPeriod.end ? new Date(selectedPeriod.end).getTime() : Infinity;
  return transactions.map((entry) => normalizeFinanceTransaction(entry, entry.source)).filter((entry) => {
    const stamp = new Date(entry.transactionDate).getTime();
    return Number.isFinite(stamp) && stamp >= start && stamp <= end;
  });
}

function activeTransactions(transactions = []) { return transactions.filter((entry) => !entry.voidedAt); }
function eurTransactions(transactions = []) { return transactions.filter((entry) => text(entry.currency).toUpperCase() === BASE_CURRENCY); }
function approvedTransactions(transactions = []) { return transactions.filter((entry) => entry.status === "approved"); }
function currentTransactions() { return filterFinanceTransactions(state.transactions, period); }
function currentActiveTransactions() { return activeTransactions(currentTransactions()); }
function currentEurTransactions() { return eurTransactions(currentActiveTransactions()); }
function currentMetrics() { return calculateMetrics(currentEurTransactions()); }

export function buildFinanceDataQuality(transactions = [], documents = []) {
  const active = activeTransactions(transactions.map((entry) => normalizeFinanceTransaction(entry, entry.source)));
  const docs = new Set((documents || []).map((entry) => text(entry.id)).filter(Boolean));
  const revenueOrders = new Set(active.filter((entry) => entry.category === "revenue" && entry.orderId).map((entry) => entry.orderId));
  const supplierOrders = new Set(active.filter((entry) => entry.category === "supplier_expense" && entry.orderId).map((entry) => entry.orderId));
  const missingSupplierOrders = [...revenueOrders].filter((orderId) => !supplierOrders.has(orderId));
  const expenseRows = active.filter((entry) => ["supplier_expense", "shipping_expense", "advertising_expense", "other_expense", "refund"].includes(entry.category));
  const missingDocuments = expenseRows.filter((entry) => !(entry.documentIds || []).some((id) => docs.has(id)));
  const foreignCurrencies = [...new Set(active.map((entry) => text(entry.currency).toUpperCase()).filter((currency) => currency && currency !== BASE_CURRENCY))];
  const missingOrderId = active.filter((entry) => ["revenue", "refund", "supplier_expense"].includes(entry.category) && !entry.orderId);
  const unapproved = active.filter((entry) => entry.status !== "approved");
  return {
    activeCount: active.length,
    approvedCount: active.length - unapproved.length,
    unapprovedCount: unapproved.length,
    missingSupplierOrders,
    missingSupplierCount: missingSupplierOrders.length,
    missingDocuments,
    missingDocumentCount: missingDocuments.length,
    foreignCurrencies,
    foreignCurrencyCount: foreignCurrencies.length,
    missingOrderIdCount: missingOrderId.length,
    documentCoverage: active.length ? active.filter((entry) => entry.documentIds?.length).length / active.length * 100 : 0,
    ready: unapproved.length === 0 && missingSupplierOrders.length === 0 && foreignCurrencies.length === 0,
  };
}

function transactionEconomicValue(entry) {
  const value = Math.abs(num(entry.amount || entry.totalFeeAmount));
  if (["revenue", "other_income", "fee_credit"].includes(entry.category)) return value;
  if (entry.category === "transfer") return 0;
  return -value;
}

export function buildOrderProfitability(transactions = []) {
  const active = activeTransactions(transactions.map((entry) => normalizeFinanceTransaction(entry, entry.source)));
  const rows = new Map();
  for (const entry of active) {
    if (!entry.orderId || entry.category === "transfer") continue;
    const row = rows.get(entry.orderId) || {
      orderId: entry.orderId, itemIds: new Set(), titles: new Set(), revenue: 0, refunds: 0, ebayFees: 0,
      advertising: 0, supplier: 0, shipping: 0, otherExpenses: 0, profit: 0, complete: true,
    };
    if (entry.itemId) row.itemIds.add(entry.itemId);
    if (entry.title) row.titles.add(entry.title);
    const amount = Math.abs(num(entry.amount || entry.totalFeeAmount));
    if (["revenue", "other_income", "fee_credit"].includes(entry.category)) row.revenue += amount;
    else if (entry.category === "refund") row.refunds += amount;
    else if (entry.category === "ebay_fee") row.ebayFees += amount;
    else if (entry.category === "advertising_expense") row.advertising += amount;
    else if (entry.category === "supplier_expense") row.supplier += amount;
    else if (entry.category === "shipping_expense") row.shipping += amount;
    else row.otherExpenses += amount;
    row.profit += transactionEconomicValue(entry);
    rows.set(entry.orderId, row);
  }
  return [...rows.values()].map((row) => {
    row.complete = row.revenue > 0 && row.supplier > 0;
    return { ...row, itemIds: [...row.itemIds], titles: [...row.titles], marginPercent: row.revenue > 0 ? row.profit / row.revenue * 100 : 0 };
  }).sort((a, b) => b.profit - a.profit);
}

export function buildProductProfitability(transactions = []) {
  const active = activeTransactions(transactions.map((entry) => normalizeFinanceTransaction(entry, entry.source)));
  const rows = new Map();
  for (const entry of active) {
    if (!entry.itemId || entry.category === "transfer") continue;
    const key = entry.itemId;
    const row = rows.get(key) || { itemId: key, title: entry.title || key, revenue: 0, costs: 0, profit: 0, orders: new Set() };
    if (entry.orderId) row.orders.add(entry.orderId);
    const delta = transactionEconomicValue(entry);
    if (delta >= 0) row.revenue += delta; else row.costs += Math.abs(delta);
    row.profit += delta;
    rows.set(key, row);
  }
  return [...rows.values()].map((row) => ({ ...row, orderCount: row.orders.size, orders: [...row.orders], marginPercent: row.revenue > 0 ? row.profit / row.revenue * 100 : 0 })).sort((a, b) => b.profit - a.profit);
}

export function reconcilePayouts(transactions = []) {
  const active = activeTransactions(transactions.map((entry) => normalizeFinanceTransaction(entry, entry.source)));
  let expected = 0;
  let payouts = 0;
  const ebayCategories = new Set(["revenue", "refund", "ebay_fee", "advertising_expense", "fee_credit", "shipping_expense"]);
  for (const entry of active) {
    const value = Math.abs(num(entry.amount || entry.totalFeeAmount));
    if (entry.category === "transfer") { payouts += value; continue; }
    const ebaySource = text(entry.source).toLowerCase().includes("ebay");
    if (!ebayCategories.has(entry.category) && !ebaySource) continue;
    if (entry.category === "supplier_expense") continue;
    expected += transactionEconomicValue(entry);
  }
  return { expected, payouts, difference: payouts - expected, balanced: Math.abs(payouts - expected) < 0.01 };
}

export function buildMonthlyBuckets(transactions = [], months = 6, now = new Date()) {
  const rows = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0, 23, 59, 59, 999);
    const selected = filterFinanceTransactions(transactions, { start: start.toISOString(), end: end.toISOString() });
    const metrics = calculateMetrics(eurTransactions(activeTransactions(selected)));
    rows.push({ key: monthKey(start), label: new Intl.DateTimeFormat("de-DE", { month: "short" }).format(start), revenue: metrics.revenue, profit: metrics.profit });
  }
  return rows;
}

function closureForDate(value) { const key = monthKey(value); return key ? state.monthClosures?.[key] : null; }
function isLockedDate(value) { return Boolean(closureForDate(value)?.closedAt); }
function selectedMonthKey() {
  if (!period.start || !period.end) return "";
  const startKey = monthKey(period.start);
  const endKey = monthKey(period.end);
  return startKey && startKey === endKey ? startKey : "";
}

export function buildMonthCloseReadiness(transactions = [], documents = []) {
  const quality = buildFinanceDataQuality(transactions, documents);
  const blockers = [];
  if (quality.unapprovedCount) blockers.push(`${quality.unapprovedCount} ungeprüfte Vorgänge`);
  if (quality.missingSupplierCount) blockers.push(`${quality.missingSupplierCount} Bestellung(en) ohne Lieferantenkosten`);
  if (quality.foreignCurrencyCount) blockers.push(`${quality.foreignCurrencyCount} Fremdwährung(en) ungeklärt`);
  if (quality.missingDocumentCount) blockers.push(`${quality.missingDocumentCount} Ausgabe(n)/Erstattung(en) ohne Beleg`);
  return { ready: blockers.length === 0, blockers, quality };
}

function loadLocal() {
  try { state = normalizeState(safeJson(localStorage.getItem(STATE_KEY), defaultState())); }
  catch { state = defaultState(); }
}

function backupLocal(reason = "before_change") {
  try {
    const key = `${BACKUP_PREFIX}${Date.now()}`;
    localStorage.setItem(key, JSON.stringify({ reason, createdAt: new Date().toISOString(), state }));
    Object.keys(localStorage).filter((entry) => entry.startsWith(BACKUP_PREFIX)).sort().reverse().slice(5).forEach((entry) => localStorage.removeItem(entry));
  } catch {}
}

async function sha256(value) {
  if (!globalThis.crypto?.subtle) return "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function appendAudit(action, summary, metadata = {}) {
  const previous = state.auditLog.at(-1);
  const base = createAuditEvent(action, { entityType: "finance_state", entityId: "v2", summary, metadata });
  base.previousHash = text(previous?.hash);
  base.hash = await sha256(JSON.stringify({ ...base, previousHash: base.previousHash }));
  state.auditLog = [...state.auditLog, base].slice(-5000);
}

async function saveLocal(action = "local_save", summary = "Finanzdaten lokal gespeichert.", metadata = {}) {
  state.updatedAt = new Date().toISOString();
  await appendAudit(action, summary, metadata);
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (error) { toast(error.message, "Speicherfehler"); }
}

function toast(message, eyebrow = "Elyon Finance") {
  if (typeof window !== "undefined" && typeof window.toast === "function") return window.toast(message, eyebrow);
  if (typeof document === "undefined") return;
  document.getElementById("elyonFinanceToast")?.remove();
  const node = document.createElement("div"); node.id = "elyonFinanceToast"; node.className = "ef-toast";
  node.innerHTML = `<strong>${escapeHtml(eyebrow)}</strong><span>${escapeHtml(message)}</span>`; document.body.appendChild(node);
  requestAnimationFrame(() => node.classList.add("show")); setTimeout(() => node.remove(), 3600);
}

async function api(action, options = {}) {
  const method = options.method || "GET";
  const query = new URLSearchParams({ action, ...(options.query || {}) });
  const response = await fetch(`/api/finance?${query}`, { method, credentials: "same-origin", cache: "no-store", headers: method === "GET" ? { Accept: "application/json" } : { "Content-Type": "application/json", Accept: "application/json" }, body: method === "GET" ? undefined : JSON.stringify(options.body || {}) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `Finance API HTTP ${response.status}`);
  return data;
}

async function refreshServerStatus() { try { serverStatus = await api("status"); } catch (error) { serverStatus = { ok: false, message: error.message }; } render(); return serverStatus; }
async function loadServer() {
  try {
    const data = await api("load"); backupLocal("before_server_load");
    const merged = mergeTransactions(state.transactions, data.state?.transactions || []);
    state = normalizeState({ ...state, ...data.state, transactions: merged.transactions, monthClosures: { ...(state.monthClosures || {}), ...(data.state?.monthClosures || {}) }, settings: { ...state.settings, ...(data.state?.settings || {}) }, auditLog: [...(data.state?.auditLog || []), ...state.auditLog].slice(-5000) });
    await saveLocal("server_load", `Serverdaten geladen: ${merged.inserted} neue Transaktionen.`); render(); toast("Serverdaten wurden zusammengeführt.");
  } catch (error) { toast(error.message, "Server-Sync blockiert"); }
}
async function saveServer() {
  try {
    const data = await api("save", { method: "POST", body: { state, action: "finance_v2_sync", source: "seller_finance_v2", summary: "Manuell bestätigter Finance-V2-Sync." } });
    state = normalizeState(data.state || state); await saveLocal("server_save", "Finanzdaten persistent gesichert."); render(); toast("Finanzdaten persistent gesichert.");
  } catch (error) { toast(error.message, "Server-Sync blockiert"); }
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style"); style.id = STYLE_ID; style.textContent = `
#${TAB_ID}{display:none;max-width:1540px;margin:0 auto;padding:0 0 54px}.ef-shell{display:grid;gap:16px}.ef-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap}.ef-head h2{font-size:32px;margin:0 0 6px}.ef-eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#a78bfa;font-weight:900}.ef-muted{color:#94a3b8;line-height:1.5}.ef-actions{display:flex;gap:9px;flex-wrap:wrap}.ef-btn{border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.72);color:#e5e7eb;border-radius:12px;padding:9px 12px;font-weight:800;cursor:pointer}.ef-btn.primary{background:linear-gradient(135deg,#7c3aed,#4f46e5);border:0}.ef-btn.success{background:rgba(34,197,94,.15);color:#86efac;border-color:rgba(34,197,94,.3)}.ef-btn.danger{background:rgba(239,68,68,.12);color:#fca5a5;border-color:rgba(239,68,68,.25)}.ef-btn:disabled{opacity:.45;cursor:not-allowed}.ef-nav{display:flex;gap:6px;flex-wrap:wrap;padding:7px;border:1px solid rgba(148,163,184,.15);background:rgba(2,6,23,.45);border-radius:16px}.ef-nav button{background:transparent;border:0;color:#94a3b8;padding:9px 11px;border-radius:11px;font-weight:800;cursor:pointer;font-size:12px}.ef-nav button.active{background:rgba(124,58,237,.22);color:#ddd6fe}.ef-period{display:grid;grid-template-columns:minmax(190px,.8fr) repeat(2,minmax(150px,.5fr)) 1fr;gap:10px;align-items:end;padding:14px;border-radius:18px;background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.13)}.ef-period label{font-size:11px;color:#94a3b8}.ef-period select,.ef-period input,.ef-form input,.ef-form select,.ef-form textarea{width:100%;margin-top:6px;padding:10px 11px;border:1px solid rgba(148,163,184,.18);background:rgba(2,6,23,.62);color:#e5e7eb;border-radius:11px}.ef-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:11px}.ef-card{border:1px solid rgba(148,163,184,.14);background:linear-gradient(145deg,rgba(15,23,42,.86),rgba(2,6,23,.78));border-radius:18px;padding:15px;box-shadow:0 18px 50px rgba(0,0,0,.16)}.ef-card small{display:block;color:#94a3b8;margin-bottom:7px}.ef-card strong{font-size:24px}.ef-positive{color:#86efac}.ef-negative{color:#fca5a5}.ef-warning{color:#fde68a}.ef-panel{border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.76);border-radius:20px;padding:17px}.ef-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:13px}.ef-panel h3{margin:0}.ef-columns{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(300px,.55fr);gap:14px}.ef-table-wrap{overflow:auto;border-radius:14px;border:1px solid rgba(148,163,184,.12)}.ef-table{width:100%;border-collapse:collapse;min-width:1000px}.ef-table th,.ef-table td{padding:10px 11px;text-align:left;border-bottom:1px solid rgba(148,163,184,.1);font-size:12px;vertical-align:top}.ef-table th{color:#94a3b8;background:rgba(2,6,23,.55);position:sticky;top:0}.ef-table input[type=checkbox]{width:auto}.ef-status{display:inline-flex;padding:5px 8px;border-radius:999px;font-size:10px;font-weight:900}.ef-status.approved{background:rgba(34,197,94,.13);color:#86efac}.ef-status.needs_review,.ef-status.draft{background:rgba(245,158,11,.13);color:#fde68a}.ef-status.voided{background:rgba(239,68,68,.13);color:#fca5a5}.ef-callout{padding:13px 15px;border-radius:15px;background:rgba(245,158,11,.09);border:1px solid rgba(245,158,11,.22);color:#fde68a;line-height:1.5;font-size:12px}.ef-callout.good{background:rgba(34,197,94,.08);border-color:rgba(34,197,94,.2);color:#bbf7d0}.ef-callout.bad{background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.2);color:#fecaca}.ef-list{display:grid;gap:9px}.ef-list-item{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:12px;border-radius:13px;border:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.36)}.ef-list-item strong{display:block;margin-bottom:3px}.ef-bars{display:grid;gap:10px}.ef-bar-row{display:grid;grid-template-columns:150px 1fr 90px;gap:10px;align-items:center;font-size:12px}.ef-bar{height:9px;background:rgba(148,163,184,.13);border-radius:999px;overflow:hidden}.ef-bar span{display:block;height:100%;background:linear-gradient(90deg,#8b5cf6,#3b82f6);border-radius:999px}.ef-quality{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.ef-quality>div{padding:11px;border-radius:13px;background:rgba(2,6,23,.36);border:1px solid rgba(148,163,184,.1)}.ef-chart{display:flex;align-items:flex-end;gap:9px;height:210px;padding:15px 8px 4px;border-radius:15px;background:rgba(2,6,23,.36);overflow:auto}.ef-chart-col{min-width:64px;flex:1;display:grid;grid-template-columns:1fr 1fr;align-items:end;gap:4px;height:100%;position:relative;padding-bottom:25px}.ef-chart-bar{min-height:2px;border-radius:7px 7px 2px 2px;background:linear-gradient(180deg,#60a5fa,#4f46e5)}.ef-chart-bar.profit{background:linear-gradient(180deg,#34d399,#16a34a)}.ef-chart-label{position:absolute;bottom:2px;left:0;right:0;text-align:center;color:#94a3b8;font-size:10px}.ef-drop{border:1px dashed rgba(167,139,250,.45);border-radius:16px;padding:22px;text-align:center;background:rgba(124,58,237,.06)}.ef-drop input{display:none}.ef-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.ef-form label{font-size:11px;color:#94a3b8}.ef-form .full{grid-column:1/-1}.ef-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:#c4b5fd}.ef-empty{text-align:center;padding:30px;color:#94a3b8}.ef-toast{position:fixed;right:22px;bottom:22px;z-index:99999;display:grid;gap:4px;padding:14px 17px;border-radius:15px;background:#0f172a;border:1px solid rgba(167,139,250,.35);box-shadow:0 18px 60px rgba(0,0,0,.45);transform:translateY(20px);opacity:0;transition:.2s}.ef-toast.show{transform:none;opacity:1}.ef-toast span{color:#cbd5e1}.ef-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:999px;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.22);color:#bfdbfe;font-size:11px;font-weight:800}.ef-lock{border-color:rgba(245,158,11,.3)!important}.ef-invoice-host{margin-top:0}.ef-hidden{display:none!important}
@media(max-width:1200px){.ef-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.ef-columns{grid-template-columns:1fr}}@media(max-width:760px){.ef-grid,.ef-form,.ef-quality,.ef-period{grid-template-columns:1fr}.ef-head h2{font-size:26px}.ef-bar-row{grid-template-columns:110px 1fr 75px}.ef-panel{padding:14px}}
`;
  document.head.appendChild(style);
}

function installMenu() {
  const menu = document.getElementById("mainMenu");
  if (menu && !menu.querySelector(`option[value="${TAB_ID}"]`)) { const option = document.createElement("option"); option.value = TAB_ID; option.textContent = "Finanzen & Buchhaltung"; menu.appendChild(option); }
  const nav = document.querySelector(".nav-menu");
  if (nav && !document.getElementById("elyonFinanceNav")) { const link = document.createElement("a"); link.id = "elyonFinanceNav"; link.className = "nav-item"; link.href = "#finance"; link.innerHTML = '<span class="nav-icon">€</span><span>Finanzen</span>'; link.addEventListener("click", (event) => { event.preventDefault(); openFinance(); }); nav.appendChild(link); }
}
function ensureTab() { let tab = document.getElementById(TAB_ID); if (!tab) { tab = document.createElement("section"); tab.id = TAB_ID; tab.className = "tab"; (document.querySelector("main") || document.body).appendChild(tab); } return tab; }
function openFinance() { installMenu(); const menu = document.getElementById("mainMenu"); if (menu) menu.value = TAB_ID; document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.id === TAB_ID)); const financeTab = ensureTab(); financeTab.style.display = "block"; financeTab.classList.add("active"); if (location.hash !== "#finance") history.replaceState(null, "", "#finance"); render(); }
function leaveFinance() { const tab = document.getElementById(TAB_ID); if (tab) tab.style.display = "none"; }

function periodMarkup() {
  const custom = period.preset === "custom";
  return `<section class="ef-period"><label>Zeitraum<select id="efPeriodPreset"><option value="month" ${period.preset === "month" ? "selected" : ""}>Aktueller Monat</option><option value="previous_month" ${period.preset === "previous_month" ? "selected" : ""}>Vorheriger Monat</option><option value="quarter" ${period.preset === "quarter" ? "selected" : ""}>Aktuelles Quartal</option><option value="year" ${period.preset === "year" ? "selected" : ""}>Aktuelles Jahr</option><option value="all" ${period.preset === "all" ? "selected" : ""}>Gesamter Datenbestand</option><option value="custom" ${custom ? "selected" : ""}>Benutzerdefiniert</option></select></label><label>Von<input id="efPeriodStart" type="date" value="${period.start ? isoDay(period.start) : ""}" ${custom ? "" : "disabled"}></label><label>Bis<input id="efPeriodEnd" type="date" value="${period.end ? isoDay(period.end) : ""}" ${custom ? "" : "disabled"}></label><div><div class="ef-eyebrow">Aktiver Zeitraum</div><strong>${escapeHtml(period.label)}</strong><div class="ef-muted" style="font-size:11px;margin-top:4px">${selectedMonthKey() && state.monthClosures?.[selectedMonthKey()]?.closedAt ? "🔒 Monat abgeschlossen" : "Live bearbeitbar"}</div></div></section>`;
}
function navMarkup() { const items = [["dashboard","Übersicht"],["transactions","Transaktionen"],["profitability","Profitabilität"],["payouts","Auszahlungen"],["bookings","Buchungen"],["documents","Belege"],["imports","Importe & eBay"],["invoices","Rechnungen"],["month_close","Monatsabschluss"],["reports","EÜR & Export"],["audit","Audit-Log"],["settings","Einstellungen"]]; return `<nav class="ef-nav">${items.map(([id,label]) => `<button type="button" data-ef2-panel="${id}" class="${activePanel===id?"active":""}">${label}</button>`).join("")}</nav>`; }

function render() {
  if (typeof document === "undefined") return;
  const tab = ensureTab();
  if (!tab.classList.contains("active") && document.getElementById("mainMenu")?.value !== TAB_ID && location.hash !== "#finance") return;
  const metrics = currentMetrics();
  const quality = buildFinanceDataQuality(currentTransactions(), state.documents);
  tab.innerHTML = `<div class="ef-shell"><header class="ef-head"><div><div class="ef-eyebrow">Elyon Seller Tool · Finance V2</div><h2>Finanzen & Buchhaltung</h2><p class="ef-muted">Echte eBay-Finanzdaten, Kosten, Profitabilität, Belege, Auszahlungsabgleich und Monatsabschluss – mit prüfbaren Exporten.</p></div><div class="ef-actions"><button class="ef-btn" data-ef2-action="load-server">Server laden</button><button class="ef-btn" data-ef2-action="save-server">Persistent sichern</button><button class="ef-btn primary" data-ef2-action="ebay-preview">eBay synchronisieren</button></div></header><div class="ef-callout">Buchhaltungs- und Steuerdatenvorbereitung: keine Steuererklärung, keine automatische Übermittlung und keine eBay-Live-Aktion. DATEV-/EÜR-Exporte bleiben Arbeitsunterlagen bis zur fachlichen Prüfung.</div>${periodMarkup()}${navMarkup()}<div id="elyonFinancePanel">${panelMarkup(activePanel, metrics, quality)}</div></div>`;
  if (activePanel === "invoices") setTimeout(() => window.ElyonOrderInvoices?.mount?.(), 0);
}

function panelMarkup(panel, metrics, quality) {
  if (panel === "transactions") return transactionsMarkup();
  if (panel === "profitability") return profitabilityMarkup();
  if (panel === "payouts") return payoutsMarkup();
  if (panel === "bookings") return bookingsMarkup();
  if (panel === "documents") return documentsMarkup();
  if (panel === "imports") return importsMarkup();
  if (panel === "invoices") return `<section id="elyonOrderInvoicePanel" class="ef-panel ef-invoice-host"><div class="ef-empty">Bestell- und Rechnungszentrale wird geladen …</div></section>`;
  if (panel === "month_close") return monthCloseMarkup();
  if (panel === "reports") return reportsMarkup();
  if (panel === "audit") return auditMarkup();
  if (panel === "settings") return settingsMarkup();
  return dashboardMarkup(metrics, quality);
}

function metricCard(label, value, tone, note) { return `<article class="ef-card"><small>${escapeHtml(label)}</small><strong class="${tone ? `ef-${tone}` : ""}">${money(value)}</strong><div class="ef-muted" style="font-size:11px;margin-top:6px">${escapeHtml(note)}</div></article>`; }
function dashboardMarkup(metrics, quality) {
  const payouts = reconcilePayouts(currentEurTransactions());
  const buckets = buildMonthlyBuckets(state.transactions, 6);
  const maximum = Math.max(1, ...buckets.flatMap((row) => [row.revenue, Math.abs(row.profit)]));
  return `<div class="ef-grid">${metricCard("Umsatz",metrics.revenue,"positive",`${metrics.transactionCount} Vorgänge im Zeitraum`)}${metricCard("Realer Gewinn",metrics.profit,metrics.profit>=0?"positive":"negative",`${percent.format(metrics.marginPercent)} % Marge`)}${metricCard("eBay-Gebühren",-metrics.ebayFees,"negative","Plattform- und Verkaufsgebühren")}${metricCard("Werbung",-metrics.advertising,"warning","Promoted Listings / Ads")}${metricCard("Wareneinkauf",-metrics.supplier,"negative","Lieferantenkosten")}${metricCard("Auszahlungen",metrics.payouts,"","Transfer, kein zweiter Umsatz")}</div><div class="ef-columns"><section class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">Entwicklung</div><h3>Umsatz & Gewinn · 6 Monate</h3></div></div><div class="ef-chart">${buckets.map((row)=>`<div class="ef-chart-col" title="${escapeHtml(row.key)} · Umsatz ${escapeHtml(money(row.revenue))} · Gewinn ${escapeHtml(money(row.profit))}"><div class="ef-chart-bar" style="height:${Math.max(2,row.revenue/maximum*160)}px"></div><div class="ef-chart-bar profit" style="height:${Math.max(2,Math.abs(row.profit)/maximum*160)}px"></div><span class="ef-chart-label">${escapeHtml(row.label)}</span></div>`).join("")}</div></section><aside class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">Finanz-Check</div><h3>Datenqualität</h3></div><span class="ef-status ${quality.ready?"approved":"needs_review"}">${quality.ready?"bereit":"prüfen"}</span></div><div class="ef-quality"><div><small>Geprüft</small><strong>${quality.approvedCount}/${quality.activeCount}</strong></div><div><small>Belegabdeckung</small><strong>${percent.format(quality.documentCoverage)} %</strong></div><div><small>EK fehlt</small><strong class="${quality.missingSupplierCount?"ef-warning":"ef-positive"}">${quality.missingSupplierCount}</strong></div><div><small>Fremdwährung</small><strong class="${quality.foreignCurrencyCount?"ef-negative":"ef-positive"}">${quality.foreignCurrencyCount}</strong></div></div><div class="ef-callout ${quality.ready?"good":""}" style="margin-top:12px">${quality.ready?"Der Zeitraum ist für den fachlichen Abschluss vorbereitet.":`${quality.unapprovedCount} ungeprüft · ${quality.missingDocumentCount} ohne Beleg · ${quality.missingOrderIdCount} ohne Order-ID`}</div></aside></div><div class="ef-columns"><section class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">Kostenstruktur</div><h3>Was kostet dein Umsatz?</h3></div></div>${costBars(metrics)}</section><aside class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">eBay-Verrechnung</div><h3>Auszahlungsabgleich</h3></div></div><div class="ef-list"><div class="ef-list-item"><span>Erwartete eBay-Auszahlung</span><strong>${money(payouts.expected)}</strong></div><div class="ef-list-item"><span>Tatsächlich erfasst</span><strong>${money(payouts.payouts)}</strong></div><div class="ef-list-item"><span>Differenz</span><strong class="${payouts.balanced?"ef-positive":"ef-warning"}">${money(payouts.difference)}</strong></div></div><button class="ef-btn" style="width:100%;margin-top:12px" data-ef2-panel="payouts">Abgleich öffnen</button></aside></div>`;
}
function costBars(metrics) { const rows=[["eBay-Gebühren",metrics.ebayFees],["Werbung",metrics.advertising],["Lieferanten",metrics.supplier],["Versand",metrics.shipping],["Erstattungen",metrics.refunds],["Sonstige",metrics.otherExpenses]]; const max=Math.max(1,...rows.map(([,v])=>v)); return `<div class="ef-bars">${rows.map(([label,value])=>`<div class="ef-bar-row"><span>${label}</span><div class="ef-bar"><span style="width:${Math.min(100,value/max*100)}%"></span></div><strong>${money(value)}</strong></div>`).join("")}</div>`; }

function categoryLabel(category) { return ({revenue:"Umsatz",ebay_fee:"eBay-Gebühr",advertising_expense:"Werbung",refund:"Erstattung",fee_credit:"Gebührengutschrift",shipping_expense:"Versand",supplier_expense:"Wareneinkauf",transfer:"Auszahlung",other_income:"Sonstiger Ertrag",other_expense:"Sonstige Ausgabe"})[category]||category||"Offen"; }
function transactionTable(rows) {
  if (!rows.length) return `<div class="ef-empty">Keine Vorgänge im ausgewählten Zeitraum.</div>`;
  return `<div class="ef-table-wrap"><table class="ef-table"><thead><tr><th>✓</th><th>Datum</th><th>Vorgang</th><th>Bestellung</th><th>Kategorie</th><th>Betrag</th><th>Währung</th><th>Status</th><th>Beleg</th><th>Aktion</th></tr></thead><tbody>${rows.map((entry)=>{const item=normalizeFinanceTransaction(entry,entry.source);const voided=Boolean(item.voidedAt);const locked=isLockedDate(item.transactionDate);const docOptions=state.documents.map((doc)=>`<option value="${escapeHtml(doc.id)}" ${(item.documentIds||[]).includes(doc.id)?"selected":""}>${escapeHtml(doc.name)}</option>`).join("");return `<tr class="${locked?"ef-lock":""}"><td><input type="checkbox" data-ef2-select="${escapeHtml(item.id)}" ${selectedTransactionIds.has(item.id)?"checked":""} ${voided||locked?"disabled":""}></td><td>${escapeHtml(formatDate(item.transactionDate))}</td><td><strong>${escapeHtml(item.title)}</strong><div class="ef-code">${escapeHtml(item.transactionId||item.id)}</div>${locked?'<div class="ef-status needs_review" style="margin-top:5px">🔒 abgeschlossen</div>':""}</td><td>${escapeHtml(item.orderId||"–")}</td><td>${escapeHtml(categoryLabel(item.category))}</td><td class="${["revenue","other_income","fee_credit","transfer"].includes(item.category)?"ef-positive":"ef-negative"}">${money(item.amount)}</td><td>${escapeHtml(item.currency)}</td><td><span class="ef-status ${voided?"voided":item.status}">${voided?"Storno":item.status==="approved"?"geprüft":"prüfen"}</span></td><td><select data-ef2-doc-select="${escapeHtml(item.id)}" style="max-width:180px;background:#020617;color:#e5e7eb;border:1px solid rgba(148,163,184,.2);border-radius:8px;padding:6px"><option value="">Beleg …</option>${docOptions}</select><button class="ef-btn" style="padding:5px 7px;margin-left:4px" data-ef2-attach-doc="${escapeHtml(item.id)}" ${locked?"disabled":""}>Zuordnen</button></td><td><div class="ef-actions"><button class="ef-btn" data-ef2-approve="${escapeHtml(item.id)}" ${voided||locked||item.status==="approved"?"disabled":""}>Freigeben</button><button class="ef-btn danger" data-ef2-void="${escapeHtml(item.id)}" ${voided||locked?"disabled":""}>Storno</button></div></td></tr>`;}).join("")}</tbody></table></div>`;
}
function transactionsMarkup() { const rows=currentTransactions(); return `<section class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">Sichere Freigaben</div><h3>Verkäufe & Transaktionen</h3><p class="ef-muted">Nur ausgewählte Vorgänge werden freigegeben. Abgeschlossene Monate sind gesperrt.</p></div><div class="ef-actions"><button class="ef-btn" data-ef2-action="select-unapproved">Ungeprüfte auswählen</button><button class="ef-btn success" data-ef2-action="approve-selected" ${selectedTransactionIds.size?"":"disabled"}>${selectedTransactionIds.size} ausgewählte freigeben</button><button class="ef-btn" data-ef2-action="download-csv">Zeitraum CSV</button></div></div>${transactionTable(rows)}</section>`; }

function profitabilityMarkup() { const orders=buildOrderProfitability(currentEurTransactions()); const products=buildProductProfitability(currentEurTransactions()); return `<div class="ef-columns"><section class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">Order-Ebene</div><h3>Gewinn je Bestellung</h3></div><span class="ef-badge">${orders.length} Orders</span></div>${orders.length?`<div class="ef-table-wrap"><table class="ef-table"><thead><tr><th>Bestellung</th><th>Umsatz</th><th>EK</th><th>eBay</th><th>Ads</th><th>Versand</th><th>Erstattung</th><th>Gewinn</th><th>Marge</th><th>Status</th></tr></thead><tbody>${orders.map((row)=>`<tr><td><strong>${escapeHtml(row.orderId)}</strong></td><td>${money(row.revenue)}</td><td>${money(row.supplier)}</td><td>${money(row.ebayFees)}</td><td>${money(row.advertising)}</td><td>${money(row.shipping)}</td><td>${money(row.refunds)}</td><td class="${row.profit>=0?"ef-positive":"ef-negative"}"><strong>${money(row.profit)}</strong></td><td>${percent.format(row.marginPercent)} %</td><td><span class="ef-status ${row.complete?"approved":"needs_review"}">${row.complete?"vollständig":"EK fehlt"}</span></td></tr>`).join("")}</tbody></table></div>`:`<div class="ef-empty">Noch keine zuordenbaren Order-Finanzdaten.</div>`}</section><aside class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">SKU / Artikel</div><h3>Produktprofitabilität</h3></div></div><div class="ef-list">${products.slice(0,20).map((row)=>`<div class="ef-list-item"><div><strong>${escapeHtml(row.title||row.itemId)}</strong><span class="ef-muted">${row.orderCount} Bestellung(en) · ${percent.format(row.marginPercent)} % Marge</span></div><div style="text-align:right"><strong class="${row.profit>=0?"ef-positive":"ef-negative"}">${money(row.profit)}</strong><span class="ef-muted">${money(row.revenue)} Umsatz</span></div></div>`).join("")||'<div class="ef-empty">Noch keine Artikelzuordnung.</div>'}</div></aside></div>`; }

function payoutsMarkup() { const rec=reconcilePayouts(currentEurTransactions()); const transfers=currentEurTransactions().filter((entry)=>entry.category==="transfer"); return `<div class="ef-columns"><section class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">eBay-Verrechnungskonto</div><h3>Auszahlungsabgleich</h3></div><span class="ef-status ${rec.balanced?"approved":"needs_review"}">${rec.balanced?"abgeglichen":"Differenz prüfen"}</span></div><div class="ef-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${metricCard("Erwartete Auszahlung",rec.expected,"", "eBay-Umsatz minus eBay-interne Kosten")}${metricCard("Tatsächlich erfasst",rec.payouts,"positive","Auszahlungen / Transfers")}${metricCard("Differenz",rec.difference,rec.balanced?"positive":"warning",rec.balanced?"0,00 € bzw. Rundungsdifferenz":"Abrechnung prüfen")}</div><div class="ef-callout ${rec.balanced?"good":""}" style="margin-top:13px">Lieferantenkosten werden bewusst nicht in den eBay-Auszahlungsabgleich eingerechnet, weil sie außerhalb des eBay-Verrechnungskontos anfallen.</div></section><aside class="ef-panel"><h3>Erfasste Auszahlungen</h3><div class="ef-list">${transfers.map((entry)=>`<div class="ef-list-item"><div><strong>${escapeHtml(formatDate(entry.transactionDate))}</strong><span class="ef-muted">${escapeHtml(entry.payoutId||entry.transactionId||"Transfer")}</span></div><strong>${money(Math.abs(entry.amount))}</strong></div>`).join("")||'<div class="ef-empty">Keine Auszahlungen im Zeitraum.</div>'}</div></aside></div>`; }

function bookingsMarkup() { const rows=currentTransactions().filter((entry)=>!entry.voidedAt); const proposals=rows.map((entry)=>bookingProposal(entry,state.settings)); return `<section class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">Doppelte Erfassung vermeiden</div><h3>Buchungsvorschläge</h3></div><span class="ef-badge">${proposals.length} Vorschläge</span></div><div class="ef-callout good">eBay-Auszahlungen sind Geldtransfers und kein zusätzlicher Umsatz.</div>${proposals.length?`<div class="ef-table-wrap" style="margin-top:13px"><table class="ef-table"><thead><tr><th>Datum</th><th>Vorgang</th><th>Sollkonto</th><th>Habenkonto</th><th>Betrag</th><th>Steuer</th><th>Status</th></tr></thead><tbody>${proposals.map((item)=>`<tr><td>${escapeHtml(formatDate(item.date))}</td><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.debitAccount)}</td><td>${escapeHtml(item.creditAccount)}</td><td>${money(item.amount)}</td><td>${escapeHtml(item.taxCode||"ungeklärt")}</td><td><span class="ef-status ${item.status}">${item.status==="approved"?"geprüft":"Entwurf"}</span></td></tr>`).join("")}</tbody></table></div>`:'<div class="ef-empty">Noch keine Vorschläge.</div>'}</section>`; }

function documentsMarkup() { return `<div class="ef-columns"><section class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">Originaldatei + SHA-256</div><h3>Belegarchiv</h3></div><span class="ef-badge">${state.documents.length} Belege</span></div><div class="ef-drop"><strong>Rechnungen, eBay-Abrechnungen und Zahlungsnachweise</strong><p class="ef-muted">Originaldatei lokal in IndexedDB; Metadaten und SHA-256-Prüfsumme im Finance-State.</p><input id="efDocumentInput" type="file" multiple><label class="ef-btn primary" for="efDocumentInput">Belege auswählen</label></div><div class="ef-list" style="margin-top:13px">${state.documents.map((doc)=>`<div class="ef-list-item"><div><strong>${escapeHtml(doc.name)}</strong><span class="ef-muted">${escapeHtml(doc.type||"Datei")} · ${escapeHtml(formatDate(doc.createdAt))}</span><div class="ef-code">SHA-256 ${escapeHtml(doc.sha256||"offen")}</div></div><button class="ef-btn" data-ef2-download-doc="${escapeHtml(doc.id)}">Öffnen</button></div>`).join("")||'<div class="ef-empty">Noch keine Belege archiviert.</div>'}</div></section><aside class="ef-panel"><h3>Belegzuordnung</h3><p class="ef-muted">Öffne „Transaktionen“ und ordne dort den passenden Beleg direkt dem Vorgang zu. Bestehende Zuordnungen werden nicht überschrieben, sondern ergänzt.</p><div class="ef-callout" style="margin-top:13px">Originalbelege bleiben unverändert. Eine neue Datei erhält eine neue SHA-256-Prüfsumme und einen Audit-Eintrag.</div></aside></div>`; }

function importsMarkup() { return `<div class="ef-columns"><section class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">CSV</div><h3>eBay-CSV importieren</h3></div></div><div class="ef-drop"><strong>eBay-Abrechnungs- oder Transaktionsbericht</strong><p class="ef-muted">Vor Übernahme wird eine Vorschau erzeugt. Datensätze aus abgeschlossenen Monaten werden beim Import blockiert.</p><input id="efCsvInput" type="file" accept=".csv,.txt,text/csv"><label class="ef-btn primary" for="efCsvInput">CSV auswählen</label></div>${stagedImport?`<div class="ef-callout good" style="margin-top:13px"><strong>${stagedImport.transactions.length} Datensätze erkannt</strong><br>${escapeHtml(stagedImport.warnings?.join(" · ")||"Spalten wurden zugeordnet.")}</div><div class="ef-actions" style="margin-top:10px"><button class="ef-btn primary" data-ef2-action="confirm-csv">Import übernehmen</button><button class="ef-btn" data-ef2-action="cancel-csv">Verwerfen</button></div>`:""}</section><aside class="ef-panel"><div class="ef-eyebrow">API</div><h3>eBay Finances API</h3><p class="ef-muted">Liest Verkäufe, Gebühren, Anzeigenkosten, Erstattungen, Gutschriften und Auszahlungen ausschließlich lesend.</p><label class="ef-muted">Zeitraum<select id="efEbayDays" style="width:100%;margin-top:6px;padding:10px;border-radius:11px;background:#020617;color:#e5e7eb;border:1px solid rgba(148,163,184,.18)"><option value="30">30 Tage</option><option value="90" selected>90 Tage</option><option value="365">365 Tage</option></select></label><div class="ef-actions" style="margin-top:12px"><button class="ef-btn" data-ef2-action="ebay-preview">Vorschau laden</button><button class="ef-btn primary" data-ef2-action="confirm-ebay-preview" ${stagedImport?.source==="ebay_api"?"":"disabled"}>Vorschau übernehmen</button></div><div class="ef-callout" style="margin-top:13px">Finance V2 nutzt absichtlich zuerst die Vorschau. So können abgeschlossene Monate vor dem lokalen Merge geschützt werden.</div></aside></div><section class="ef-panel"><div class="ef-panel-head"><h3>Lieferantenkosten ergänzen</h3></div><form id="efSupplierForm" class="ef-form"><label>Bestellnummer<input name="orderId" required></label><label>Lieferant<input name="supplier" placeholder="AliExpress, CJ, ..."></label><label>Betrag (€)<input name="amount" type="number" min="0" step="0.01" required></label><label>Datum<input name="date" type="date" required></label><label>Artikel-ID optional<input name="itemId"></label><label>Notiz<input name="memo"></label><div class="full"><button class="ef-btn primary" type="submit">Wareneinkauf erfassen</button></div></form></section><section class="ef-panel"><div class="ef-panel-head"><h3>Importverlauf</h3><span class="ef-badge">${state.imports.length}</span></div><div class="ef-list">${state.imports.slice().reverse().slice(0,20).map((item)=>`<div class="ef-list-item"><div><strong>${escapeHtml(item.source||"Import")}</strong><span class="ef-muted">${escapeHtml(formatDate(item.createdAt))} · ${num(item.inserted||item.normalizedCount)} neu · ${num(item.duplicates)} Duplikate · ${num(item.blockedLockedMonths)} gesperrt</span></div><span class="ef-code">${escapeHtml(item.id)}</span></div>`).join("")||'<div class="ef-empty">Noch keine Importe.</div>'}</div></section>`; }

function monthCloseMarkup() { const key=selectedMonthKey(); if(!key) return `<section class="ef-panel"><div class="ef-callout">Für einen Monatsabschluss bitte „Aktueller Monat“, „Vorheriger Monat“ oder einen benutzerdefinierten Zeitraum innerhalb genau eines Kalendermonats wählen.</div></section>`; const rows=currentTransactions(); const readiness=buildMonthCloseReadiness(rows,state.documents); const closure=state.monthClosures?.[key]; return `<section class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">Kontrollierter Abschluss</div><h3>${escapeHtml(period.label)} ${closure?.closedAt?"🔒":""}</h3><p class="ef-muted">Nach Abschluss sind Freigabe, Storno, Belegänderungen und Lieferantenkosten für diesen Monat gesperrt.</p></div><span class="ef-status ${closure?.closedAt||readiness.ready?"approved":"needs_review"}">${closure?.closedAt?"abgeschlossen":readiness.ready?"bereit":"nicht bereit"}</span></div>${closure?.closedAt?`<div class="ef-callout good">Abgeschlossen am ${escapeHtml(formatDate(closure.closedAt))}. Snapshot: Umsatz ${money(closure.snapshot?.revenue)} · Gewinn ${money(closure.snapshot?.profit)} · ${closure.snapshot?.transactionCount||0} Vorgänge.</div><button class="ef-btn danger" style="margin-top:13px" data-ef2-action="reopen-month">Monat erneut öffnen</button>`:`<div class="ef-quality">${readiness.blockers.length?readiness.blockers.map((blocker)=>`<div><strong class="ef-warning">⚠ ${escapeHtml(blocker)}</strong></div>`).join(""):'<div><strong class="ef-positive">✓ Vorgänge geprüft</strong></div><div><strong class="ef-positive">✓ Lieferantenkosten zugeordnet</strong></div><div><strong class="ef-positive">✓ Währungen geklärt</strong></div><div><strong class="ef-positive">✓ Belegcheck bestanden</strong></div>'}</div><button class="ef-btn success" style="margin-top:13px" data-ef2-action="close-month" ${readiness.ready?"":"disabled"}>${escapeHtml(period.label)} abschließen</button>`}</section>`; }

function reportsMarkup() { const rows=currentEurTransactions(); const approved=approvedTransactions(rows); const eur=buildEurSummary(approved); const quality=buildFinanceDataQuality(currentTransactions(),state.documents); return `<div class="ef-columns"><section class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">Arbeitsauswertung</div><h3>Einnahmenüberschuss</h3></div><span class="ef-badge">nur freigegebene EUR-Vorgänge</span></div><div class="ef-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${metricCard("Betriebseinnahmen",eur.operatingIncome,"positive","freigegeben")}${metricCard("Betriebsausgaben",-eur.operatingExpenses,"negative","freigegeben")}${metricCard("Überschuss",eur.surplus,eur.surplus>=0?"positive":"negative","Arbeitsauswertung")}</div><div class="ef-callout" style="margin-top:13px">${escapeHtml(eur.disclaimer)}</div></section><aside class="ef-panel"><h3>Sichere Exporte</h3><div class="ef-list"><button class="ef-btn" data-ef2-action="download-csv">Transaktionen CSV</button><button class="ef-btn" data-ef2-action="download-datev">DATEV-Vorbereitung</button><button class="ef-btn" data-ef2-action="download-eur">EÜR-Arbeitsauswertung</button><button class="ef-btn" data-ef2-action="download-backup">Komplettes JSON-Backup</button><button class="ef-btn" data-ef2-action="download-audit">Audit-Log</button></div><div class="ef-callout ${quality.foreignCurrencyCount||quality.unapprovedCount?"bad":"good"}" style="margin-top:13px">DATEV/EÜR verwenden nur freigegebene EUR-Vorgänge. ${quality.unapprovedCount} ungeprüft · ${quality.foreignCurrencyCount} Fremdwährung(en).</div></aside></div>`; }

function auditMarkup() { const rows=state.auditLog.slice().reverse().slice(0,150); return `<section class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">Nachvollziehbarkeit</div><h3>Audit-Log</h3></div><button class="ef-btn" data-ef2-action="download-audit">Exportieren</button></div><div class="ef-callout good">Server-Sync-Ereignisse besitzen eine SHA-256-Hashkette. Finance V2 erzeugt auch für neue lokale Audit-Einträge einen SHA-256-Wert mit previousHash-Verknüpfung, sofern Web Crypto verfügbar ist.</div><div class="ef-list" style="margin-top:12px">${rows.map((entry)=>`<div class="ef-list-item"><div><strong>${escapeHtml(entry.action)}</strong><span class="ef-muted">${escapeHtml(entry.summary||"Änderung protokolliert")} · ${escapeHtml(formatDate(entry.timestamp))}</span>${entry.previousHash?`<div class="ef-code">prev ${escapeHtml(entry.previousHash.slice(0,18))}…</div>`:""}</div><div class="ef-code">${entry.hash?`${escapeHtml(entry.hash.slice(0,22))}…`:"lokal / unverifiziert"}</div></div>`).join("")||'<div class="ef-empty">Noch keine Audit-Ereignisse.</div>'}</div></section>`; }

function settingsMarkup() { const s=state.settings; return `<div class="ef-columns"><section class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">Buchhaltungsparameter</div><h3>Konten & Steuerstatus</h3></div></div><form id="efSettingsForm" class="ef-form"><label>Steuerstatus<select name="taxMode"><option value="unconfigured" ${s.taxMode==="unconfigured"?"selected":""}>Noch nicht festgelegt</option><option value="small_business" ${s.taxMode==="small_business"?"selected":""}>Kleinunternehmer-Regel prüfen</option><option value="vat_standard" ${s.taxMode==="vat_standard"?"selected":""}>Regelbesteuerung prüfen</option></select></label><label>Standard-Steuerschlüssel<input name="defaultTaxCode" value="${escapeHtml(s.defaultTaxCode)}"></label><label>Erlöskonto<input name="revenueAccount" value="${escapeHtml(s.revenueAccount)}"></label><label>eBay-Gebühren<input name="ebayFeeAccount" value="${escapeHtml(s.ebayFeeAccount)}"></label><label>Werbekosten<input name="advertisingAccount" value="${escapeHtml(s.advertisingAccount)}"></label><label>Wareneinkauf<input name="goodsAccount" value="${escapeHtml(s.goodsAccount)}"></label><label>Versandkosten<input name="shippingAccount" value="${escapeHtml(s.shippingAccount)}"></label><label>Erlösminderungen<input name="refundAccount" value="${escapeHtml(s.refundAccount)}"></label><label>Sonstige Erträge<input name="otherIncomeAccount" value="${escapeHtml(s.otherIncomeAccount)}"></label><label>Sonstige Kosten<input name="otherExpenseAccount" value="${escapeHtml(s.otherExpenseAccount)}"></label><label>Rechnungspräfix<input name="invoicePrefix" value="${escapeHtml(s.invoicePrefix)}"></label><label>Nächste Rechnungsnummer<input name="nextInvoiceNumber" type="number" min="1" value="${num(s.nextInvoiceNumber)||1}"></label><div class="full ef-actions"><button class="ef-btn primary" type="submit">Einstellungen speichern</button><button class="ef-btn" type="button" data-ef2-action="reserve-invoice">Nächste Rechnungsnummer reservieren</button></div></form></section><aside class="ef-panel"><h3>Systemstatus</h3><div class="ef-list"><div class="ef-list-item"><span>Persistenter Speicher</span><strong>${escapeHtml(serverStatus?.store?.mode||"noch nicht geprüft")}</strong></div><div class="ef-list-item"><span>Währung für Kennzahlen</span><strong>EUR</strong></div><div class="ef-list-item"><span>Fremdwährungen</span><strong>${buildFinanceDataQuality(currentTransactions(),state.documents).foreignCurrencyCount}</strong></div></div><button class="ef-btn" style="width:100%;margin-top:12px" data-ef2-action="refresh-status">Systemstatus prüfen</button></aside></div>`; }

function download(name, content, type="text/plain;charset=utf-8") { const blob=content instanceof Blob?content:new Blob([content],{type}); const url=URL.createObjectURL(blob); const anchor=document.createElement("a"); anchor.href=url; anchor.download=name; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
function fileStamp() { return new Date().toISOString().replace(/[:.]/g,"-"); }
function exportRows() { return currentTransactions().filter((entry)=>!entry.voidedAt); }
function safeAccountingRows() { return approvedTransactions(eurTransactions(exportRows())); }
function exportAction(action) {
  const rows=exportRows(); const safe=safeAccountingRows(); const quality=buildFinanceDataQuality(rows,state.documents);
  if (["download-datev","download-eur"].includes(action) && (quality.unapprovedCount || quality.foreignCurrencyCount)) return toast(`Export blockiert: ${quality.unapprovedCount} ungeprüfte Vorgänge, ${quality.foreignCurrencyCount} Fremdwährung(en).`,"Sicherer Export");
  if (action==="download-csv") return download(`elyon_finance_${fileStamp()}.csv`,`\uFEFF${exportTransactionsCsv(rows)}`,"text/csv;charset=utf-8");
  if (action==="download-datev") return download(`elyon_datev_vorbereitung_${fileStamp()}.csv`,`\uFEFF${exportDatevPreparation(safe,state.settings)}`,"text/csv;charset=utf-8");
  if (action==="download-eur") return download(`elyon_euer_arbeitsauswertung_${fileStamp()}.json`,JSON.stringify(buildEurSummary(safe),null,2),"application/json");
  if (action==="download-audit") return download(`elyon_finance_audit_${fileStamp()}.json`,JSON.stringify(state.auditLog,null,2),"application/json");
  if (action==="download-backup") return download(`elyon_finance_backup_${fileStamp()}.json`,JSON.stringify(state,null,2),"application/json");
}

function openDb() { return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE,{keyPath:"id"});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}); }
async function hashFile(file) { const buffer=await file.arrayBuffer(); const digest=await crypto.subtle.digest("SHA-256",buffer); return [...new Uint8Array(digest)].map((byte)=>byte.toString(16).padStart(2,"0")).join(""); }
async function storeDocumentFile(id,file) { const db=await openDb(); await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,"readwrite");tx.objectStore(DB_STORE).put({id,file});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);}); db.close(); }
async function readDocumentFile(id) { const db=await openDb(); const result=await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,"readonly");const request=tx.objectStore(DB_STORE).get(id);request.onsuccess=()=>resolve(request.result?.file||null);request.onerror=()=>reject(request.error);});db.close();return result; }
async function importDocuments(files) { backupLocal("before_document_import"); for(const file of files){const sha=await hashFile(file);if(state.documents.some((entry)=>entry.sha256===sha))continue;const id=uid("doc");await storeDocumentFile(id,file);state.documents.push({id,name:file.name,type:file.type,size:file.size,sha256:sha,createdAt:new Date().toISOString(),storage:"indexeddb"});} await saveLocal("documents_imported","Belege mit SHA-256-Prüfsumme archiviert.");render(); }

async function approveTransaction(id) { const item=state.transactions.find((entry)=>entry.id===id);if(!item||item.voidedAt)return;if(isLockedDate(item.transactionDate))return toast("Dieser Monat ist abgeschlossen.","Monat gesperrt");item.status="approved";item.updatedAt=new Date().toISOString();await saveLocal("transaction_approved",`Transaktion ${item.transactionId||item.id} geprüft.`);render(); }
async function voidTransaction(id) { const item=state.transactions.find((entry)=>entry.id===id);if(!item||item.voidedAt)return;if(isLockedDate(item.transactionDate))return toast("Dieser Monat ist abgeschlossen.","Monat gesperrt");const reason=window.prompt("Grund für das Storno / die Korrektur:","Korrektur erforderlich");if(!reason)return;item.voidedAt=new Date().toISOString();item.voidReason=reason;item.status="voided";await saveLocal("transaction_voided",`Transaktion ${item.transactionId||item.id} storniert: ${reason}`);render(); }
async function approveSelected() { const ids=[...selectedTransactionIds];let changed=0;for(const id of ids){const item=state.transactions.find((entry)=>entry.id===id);if(item&&!item.voidedAt&&!isLockedDate(item.transactionDate)&&item.status!=="approved"){item.status="approved";item.updatedAt=new Date().toISOString();changed+=1;}}selectedTransactionIds.clear();await saveLocal("transactions_selected_approved",`${changed} ausgewählte Vorgänge freigegeben.`,{count:changed});render();toast(`${changed} Vorgänge freigegeben.`); }
async function attachDocument(id,docId) { const item=state.transactions.find((entry)=>entry.id===id);if(!item||!docId)return;if(isLockedDate(item.transactionDate))return toast("Dieser Monat ist abgeschlossen.","Monat gesperrt");item.documentIds=[...new Set([...(item.documentIds||[]),docId])];await saveLocal("document_linked",`Beleg ${docId} mit ${item.transactionId||item.id} verknüpft.`);render(); }

async function handleCsvFile(file) { stagedImport={...parseEbayCsv(await file.text()),fileName:file.name,source:"csv",createdAt:new Date().toISOString()};render(); }
async function confirmStagedImport(sourceLabel="csv") { if(!stagedImport)return;backupLocal("before_import");const allowed=[];let blocked=0;for(const row of stagedImport.transactions||[]){const item=normalizeFinanceTransaction(row,row.source);if(isLockedDate(item.transactionDate))blocked+=1;else allowed.push(item);}const merged=mergeTransactions(state.transactions,allowed);state.transactions=merged.transactions;state.imports.push({id:uid("import"),source:sourceLabel,fileName:stagedImport.fileName,inserted:merged.inserted,duplicates:merged.duplicates,blockedLockedMonths:blocked,createdAt:new Date().toISOString()});await saveLocal("finance_import",`${merged.inserted} neue Vorgänge importiert; ${blocked} wegen Monatsabschluss blockiert.`);stagedImport=null;render();toast(`${merged.inserted} neu · ${blocked} gesperrt.`); }
async function ebayPreview() { try { const days=document.getElementById("efEbayDays")?.value||90;const data=await api("ebay-preview",{query:{days}});stagedImport={transactions:data.transactions||[],warnings:[`eBay Finances API: ${data.count||0} normalisierte Vorgänge`],fileName:"eBay Finances API",source:"ebay_api",createdAt:new Date().toISOString()};activePanel="imports";render();toast("eBay-Finanzvorschau geladen. Noch nichts gespeichert."); } catch(error){toast(error.message,"eBay Finances API");} }
async function handleSupplierSubmit(form) { const data=new FormData(form);const orderId=text(data.get("orderId"));const amount=num(data.get("amount"));const date=text(data.get("date"));if(!orderId||amount<=0||!date)return toast("Bestellnummer, Datum und Betrag werden benötigt.");if(isLockedDate(date))return toast("Dieser Monat ist abgeschlossen.","Monat gesperrt");const transaction=normalizeFinanceTransaction({transactionId:`supplier_${orderId}_${Date.now()}`,orderId,itemId:text(data.get("itemId")),transactionDate:date,transactionType:"SUPPLIER_PURCHASE",bookingEntry:"DEBIT",amount:-Math.abs(amount),currency:"EUR",title:`${text(data.get("supplier"))||"Lieferant"} Wareneinkauf`,memo:data.get("memo"),category:"supplier_expense",status:"needs_review"},"elyon_supplier_manual");backupLocal("before_supplier_cost");state.transactions=mergeTransactions(state.transactions,[transaction]).transactions;await saveLocal("supplier_cost_added",`Lieferantenkosten für ${orderId} erfasst.`);form.reset();render(); }
async function saveSettings(form) { const data=Object.fromEntries(new FormData(form).entries());state.settings={...state.settings,...data,nextInvoiceNumber:Math.max(1,num(data.nextInvoiceNumber)||1)};await saveLocal("finance_settings_updated","Buchhaltungsparameter aktualisiert.");render();toast("Einstellungen gespeichert."); }

async function reserveInvoice() {
  const current=Math.max(1,num(state.settings.nextInvoiceNumber)||1);
  const prefix=text(state.settings.invoicePrefix||"ELYON").replace(/[^A-Za-z0-9_-]/g,"")||"ELYON";
  const invoiceNumber=`${prefix}-${new Date().getFullYear()}-${String(current).padStart(5,"0")}`;
  state.settings.nextInvoiceNumber=current+1;
  await saveLocal("invoice_number_reserved",`Rechnungsnummer ${invoiceNumber} reserviert.`,{invoiceNumber});
  render();toast(`${invoiceNumber} wurde reserviert.`);
}

async function closeMonth() { const key=selectedMonthKey();if(!key)return;const rows=currentTransactions();const readiness=buildMonthCloseReadiness(rows,state.documents);if(!readiness.ready)return toast(readiness.blockers.join(" · "),"Monatsabschluss blockiert");const metrics=calculateMetrics(eurTransactions(activeTransactions(rows)));state.monthClosures[key]={closedAt:new Date().toISOString(),periodLabel:period.label,snapshot:{revenue:metrics.revenue,expenses:metrics.expenses,profit:metrics.profit,marginPercent:metrics.marginPercent,transactionCount:metrics.transactionCount},auditState:"closed"};await saveLocal("month_closed",`${period.label} abgeschlossen.`,{month:key,snapshot:state.monthClosures[key].snapshot});render();toast(`${period.label} wurde abgeschlossen.`); }
async function reopenMonth() { const key=selectedMonthKey();const closure=state.monthClosures?.[key];if(!key||!closure)return;const reason=window.prompt(`Grund für das erneute Öffnen von ${period.label}:`,"Korrektur erforderlich");if(!reason)return;state.monthClosures[key]={...closure,reopenedAt:new Date().toISOString(),reopenReason:reason,closedAt:"",auditState:"reopened"};await saveLocal("month_reopened",`${period.label} erneut geöffnet: ${reason}`,{month:key});render(); }

function updatePeriodFromControls() { const preset=document.getElementById("efPeriodPreset")?.value||"month";const start=document.getElementById("efPeriodStart")?.value||"";const end=document.getElementById("efPeriodEnd")?.value||"";period=resolveFinancePeriod(preset,new Date(),start,end);selectedTransactionIds.clear();render(); }

function bindEvents() {
  document.addEventListener("click",async(event)=>{
    const panel=event.target.closest?.("[data-ef2-panel]")?.dataset.ef2Panel;if(panel){event.preventDefault();activePanel=panel;openFinance();return;}
    const approve=event.target.closest?.("[data-ef2-approve]")?.dataset.ef2Approve;if(approve)return approveTransaction(approve);
    const voidId=event.target.closest?.("[data-ef2-void]")?.dataset.ef2Void;if(voidId)return voidTransaction(voidId);
    const attach=event.target.closest?.("[data-ef2-attach-doc]")?.dataset.ef2AttachDoc;if(attach){const select=document.querySelector(`[data-ef2-doc-select="${CSS.escape(attach)}"]`);return attachDocument(attach,select?.value);}
    const docId=event.target.closest?.("[data-ef2-download-doc]")?.dataset.ef2DownloadDoc;if(docId){const file=await readDocumentFile(docId);const meta=state.documents.find((entry)=>entry.id===docId);return file?download(meta?.name||"beleg",file,file.type):toast("Originaldatei ist auf diesem Gerät nicht verfügbar.");}
    const action=event.target.closest?.("[data-ef2-action]")?.dataset.ef2Action;if(!action)return;
    if(action==="load-server")return loadServer();if(action==="save-server")return saveServer();if(action==="refresh-status")return refreshServerStatus();if(action==="reserve-invoice")return reserveInvoice();if(action==="ebay-preview")return ebayPreview();if(action==="confirm-ebay-preview")return confirmStagedImport("ebay_finances_api");if(action==="confirm-csv")return confirmStagedImport("ebay_csv");if(action==="cancel-csv"){stagedImport=null;return render();}if(action==="select-unapproved"){selectedTransactionIds=new Set(currentTransactions().filter((entry)=>!entry.voidedAt&&entry.status!=="approved"&&!isLockedDate(entry.transactionDate)).map((entry)=>entry.id));return render();}if(action==="approve-selected")return approveSelected();if(action==="close-month")return closeMonth();if(action==="reopen-month")return reopenMonth();if(action.startsWith("download-"))return exportAction(action);
  });
  document.addEventListener("change",(event)=>{
    if(event.target?.id==="mainMenu"){if(event.target.value===TAB_ID)openFinance();else leaveFinance();}
    if(event.target?.id==="efPeriodPreset"){const preset=event.target.value;if(preset==="custom"){period={...period,preset:"custom"};render();}else updatePeriodFromControls();}
    if(event.target?.id==="efPeriodStart"||event.target?.id==="efPeriodEnd")updatePeriodFromControls();
    if(event.target?.id==="efCsvInput"&&event.target.files?.[0])handleCsvFile(event.target.files[0]);
    if(event.target?.id==="efDocumentInput"&&event.target.files?.length)importDocuments([...event.target.files]).catch((error)=>toast(error.message,"Belegarchiv"));
    const selectId=event.target?.dataset?.ef2Select;if(selectId){if(event.target.checked)selectedTransactionIds.add(selectId);else selectedTransactionIds.delete(selectId);render();}
  });
  document.addEventListener("submit",(event)=>{if(event.target?.id==="efSupplierForm"){event.preventDefault();handleSupplierSubmit(event.target);}if(event.target?.id==="efSettingsForm"){event.preventDefault();saveSettings(event.target);}});
  window.addEventListener("hashchange",()=>{if(location.hash==="#finance")openFinance();});
}

function install() {
  if (installDone || typeof document === "undefined") return;
  installDone=true;installStyles();loadLocal();installMenu();ensureTab();bindEvents();
  window.ElyonSellerFinance={open:openFinance,state:()=>structuredClone(state),status:refreshServerStatus,load:loadServer,save:saveServer,period:()=>({...period}),quality:()=>buildFinanceDataQuality(currentTransactions(),state.documents)};
  if(location.hash==="#finance"||document.getElementById("mainMenu")?.value===TAB_ID)openFinance();
}

if(typeof document!=="undefined"){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();}
