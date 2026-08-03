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
const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const percent = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" });

let state = defaultState();
let activePanel = "dashboard";
let stagedImport = null;
let serverStatus = null;

function defaultState() {
  return {
    version: 1,
    transactions: [],
    documents: [],
    suppliers: [],
    imports: [],
    auditLog: [],
    settings: {
      locale: "de-DE",
      currency: "EUR",
      taxMode: "unconfigured",
      defaultTaxCode: "",
      invoicePrefix: "ELYON",
      nextInvoiceNumber: 1,
      revenueAccount: "Erlöse",
      ebayFeeAccount: "eBay-Gebühren",
      advertisingAccount: "Werbekosten",
      goodsAccount: "Wareneinkauf",
      shippingAccount: "Versandkosten",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function text(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value) {
  return euro.format(Number(value || 0));
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? dateTime.format(date) : "–";
}

function toast(message, eyebrow = "Elyon Finance") {
  if (typeof window.toast === "function") return window.toast(message, eyebrow);
  const existing = document.getElementById("elyonFinanceToast");
  if (existing) existing.remove();
  const node = document.createElement("div");
  node.id = "elyonFinanceToast";
  node.className = "ef-toast";
  node.innerHTML = `<strong>${escapeHtml(eyebrow)}</strong><span>${escapeHtml(message)}</span>`;
  document.body.appendChild(node);
  requestAnimationFrame(() => node.classList.add("show"));
  setTimeout(() => node.remove(), 3500);
}

function safeJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeState(value = {}) {
  const defaults = defaultState();
  const source = value && typeof value === "object" ? value : {};
  return {
    ...defaults,
    ...source,
    transactions: Array.isArray(source.transactions) ? source.transactions : [],
    documents: Array.isArray(source.documents) ? source.documents : [],
    suppliers: Array.isArray(source.suppliers) ? source.suppliers : [],
    imports: Array.isArray(source.imports) ? source.imports : [],
    auditLog: Array.isArray(source.auditLog) ? source.auditLog : [],
    settings: { ...defaults.settings, ...(source.settings || {}) },
  };
}

function loadLocal() {
  try {
    state = normalizeState(safeJson(localStorage.getItem(STATE_KEY), defaultState()));
  } catch {
    state = defaultState();
  }
}

function backupLocal(reason = "before_change") {
  try {
    const key = `${BACKUP_PREFIX}${Date.now()}`;
    localStorage.setItem(key, JSON.stringify({ reason, createdAt: new Date().toISOString(), state }));
    const keys = Object.keys(localStorage).filter((entry) => entry.startsWith(BACKUP_PREFIX)).sort().reverse();
    keys.slice(5).forEach((entry) => localStorage.removeItem(entry));
  } catch {}
}

function saveLocal(action = "local_save", summary = "Finanzdaten lokal gespeichert.") {
  state.updatedAt = new Date().toISOString();
  state.auditLog = [...state.auditLog, createAuditEvent(action, { entityType: "finance_state", entityId: "v1", summary })].slice(-5000);
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (error) { toast(error.message, "Speicherfehler"); }
}

async function api(action, options = {}) {
  const method = options.method || "GET";
  const query = new URLSearchParams({ action, ...(options.query || {}) });
  const response = await fetch(`/api/finance?${query}`, {
    method,
    credentials: "same-origin",
    headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(options.body || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `Finance API HTTP ${response.status}`);
  return data;
}

async function refreshServerStatus() {
  try {
    serverStatus = await api("status");
  } catch (error) {
    serverStatus = { ok: false, message: error.message };
  }
  render();
}

async function loadServer() {
  try {
    const data = await api("load");
    backupLocal("before_server_load");
    const merged = mergeTransactions(state.transactions, data.state?.transactions || []);
    state = normalizeState({
      ...state,
      ...data.state,
      transactions: merged.transactions,
      documents: mergeObjects(state.documents, data.state?.documents),
      suppliers: mergeObjects(state.suppliers, data.state?.suppliers),
      imports: mergeObjects(state.imports, data.state?.imports),
      settings: { ...state.settings, ...(data.state?.settings || {}) },
      auditLog: [...(data.state?.auditLog || []), ...state.auditLog].slice(-5000),
    });
    saveLocal("server_load", `Serverdaten geladen: ${merged.inserted} neue Transaktionen.`);
    render();
    toast("Serverdaten wurden mit dem lokalen Bestand zusammengeführt.");
  } catch (error) {
    toast(error.message, "Server-Sync blockiert");
  }
}

async function saveServer() {
  try {
    const data = await api("save", {
      method: "POST",
      body: { state, action: "finance_ui_sync", source: "seller_finance_ui", summary: "Manuell bestätigter Finance-Sync." },
    });
    state = normalizeState(data.state || state);
    saveLocal("server_save", "Finanzdaten auf persistentem Speicher gesichert.");
    render();
    toast("Finanzdaten persistent gesichert.");
  } catch (error) {
    toast(error.message, "Server-Sync blockiert");
  }
}

function mergeObjects(existing = [], incoming = []) {
  const map = new Map((Array.isArray(existing) ? existing : []).map((entry) => [text(entry?.id), entry]).filter(([id]) => id));
  for (const entry of Array.isArray(incoming) ? incoming : []) {
    const id = text(entry?.id);
    if (id) map.set(id, { ...(map.get(id) || {}), ...entry });
  }
  return [...map.values()];
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${TAB_ID}{display:none;max-width:1500px;margin:0 auto;padding:0 0 54px}.ef-shell{display:grid;gap:18px}.ef-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap}.ef-head h2{font-size:30px;margin:0 0 6px}.ef-eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#a78bfa;font-weight:900}.ef-muted{color:#94a3b8;line-height:1.5}.ef-actions{display:flex;gap:10px;flex-wrap:wrap}.ef-btn{border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.72);color:#e5e7eb;border-radius:13px;padding:10px 13px;font-weight:800;cursor:pointer}.ef-btn.primary{background:linear-gradient(135deg,#7c3aed,#4f46e5);border:0}.ef-btn.success{background:rgba(34,197,94,.15);color:#86efac;border-color:rgba(34,197,94,.3)}.ef-btn.danger{background:rgba(239,68,68,.12);color:#fca5a5;border-color:rgba(239,68,68,.25)}.ef-btn:disabled{opacity:.45;cursor:not-allowed}.ef-nav{display:flex;gap:8px;flex-wrap:wrap;padding:7px;border:1px solid rgba(148,163,184,.15);background:rgba(2,6,23,.45);border-radius:17px}.ef-nav button{background:transparent;border:0;color:#94a3b8;padding:10px 13px;border-radius:12px;font-weight:800;cursor:pointer}.ef-nav button.active{background:rgba(124,58,237,.22);color:#ddd6fe}.ef-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:13px}.ef-card{border:1px solid rgba(148,163,184,.14);background:linear-gradient(145deg,rgba(15,23,42,.86),rgba(2,6,23,.78));border-radius:20px;padding:17px;box-shadow:0 18px 50px rgba(0,0,0,.18)}.ef-card small{display:block;color:#94a3b8;margin-bottom:8px}.ef-card strong{font-size:25px}.ef-positive{color:#86efac}.ef-negative{color:#fca5a5}.ef-warning{color:#fde68a}.ef-panel{border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.76);border-radius:22px;padding:18px}.ef-panel-head{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:14px}.ef-panel h3{margin:0}.ef-columns{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(280px,.5fr);gap:16px}.ef-table-wrap{overflow:auto;border-radius:15px;border:1px solid rgba(148,163,184,.12)}.ef-table{width:100%;border-collapse:collapse;min-width:900px}.ef-table th,.ef-table td{padding:11px 12px;text-align:left;border-bottom:1px solid rgba(148,163,184,.1);font-size:13px}.ef-table th{color:#94a3b8;background:rgba(2,6,23,.55);position:sticky;top:0}.ef-status{display:inline-flex;padding:5px 8px;border-radius:999px;font-size:11px;font-weight:900}.ef-status.approved{background:rgba(34,197,94,.13);color:#86efac}.ef-status.needs_review,.ef-status.draft{background:rgba(245,158,11,.13);color:#fde68a}.ef-status.voided{background:rgba(239,68,68,.13);color:#fca5a5}.ef-callout{padding:14px 16px;border-radius:16px;background:rgba(245,158,11,.09);border:1px solid rgba(245,158,11,.22);color:#fde68a;line-height:1.5}.ef-success{background:rgba(34,197,94,.08);border-color:rgba(34,197,94,.2);color:#bbf7d0}.ef-drop{border:1px dashed rgba(167,139,250,.45);border-radius:18px;padding:25px;text-align:center;background:rgba(124,58,237,.06)}.ef-drop input{display:none}.ef-drop label{display:inline-flex;margin-top:12px}.ef-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.ef-form label{font-size:12px;color:#94a3b8}.ef-form input,.ef-form select,.ef-form textarea{width:100%;margin-top:6px;padding:11px 12px;border:1px solid rgba(148,163,184,.18);background:rgba(2,6,23,.62);color:#e5e7eb;border-radius:12px}.ef-form .full{grid-column:1/-1}.ef-list{display:grid;gap:10px}.ef-list-item{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:13px;border-radius:14px;border:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.36)}.ef-list-item strong{display:block;margin-bottom:4px}.ef-bars{display:grid;gap:11px}.ef-bar-row{display:grid;grid-template-columns:150px 1fr 90px;gap:10px;align-items:center;font-size:13px}.ef-bar{height:10px;background:rgba(148,163,184,.13);border-radius:999px;overflow:hidden}.ef-bar span{display:block;height:100%;background:linear-gradient(90deg,#8b5cf6,#3b82f6);border-radius:999px}.ef-kpi-note{margin-top:7px;font-size:12px;color:#94a3b8}.ef-empty{text-align:center;padding:35px;color:#94a3b8}.ef-toast{position:fixed;right:22px;bottom:22px;z-index:99999;display:grid;gap:4px;padding:14px 17px;border-radius:15px;background:#0f172a;border:1px solid rgba(167,139,250,.35);box-shadow:0 18px 60px rgba(0,0,0,.45);transform:translateY(20px);opacity:0;transition:.2s}.ef-toast.show{transform:none;opacity:1}.ef-toast span{color:#cbd5e1}.ef-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:999px;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.22);color:#bfdbfe;font-size:12px;font-weight:800}.ef-split{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.ef-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#c4b5fd}.ef-hidden{display:none!important}
    @media(max-width:1100px){.ef-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ef-columns{grid-template-columns:1fr}}
    @media(max-width:720px){.ef-grid,.ef-form{grid-template-columns:1fr}.ef-head h2{font-size:25px}.ef-bar-row{grid-template-columns:110px 1fr 75px}.ef-panel{padding:14px}}
  `;
  document.head.appendChild(style);
}

function installMenu() {
  const menu = document.getElementById("mainMenu");
  if (menu && !menu.querySelector(`option[value="${TAB_ID}"]`)) {
    const option = document.createElement("option");
    option.value = TAB_ID;
    option.textContent = "Finanzen & Buchhaltung";
    menu.appendChild(option);
  }
  const nav = document.querySelector(".nav-menu");
  if (nav && !document.getElementById("elyonFinanceNav")) {
    const link = document.createElement("a");
    link.id = "elyonFinanceNav";
    link.className = "nav-item";
    link.href = "#finance";
    link.innerHTML = `<span class="nav-icon">€</span><span>Finanzen</span>`;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      openFinance();
    });
    nav.appendChild(link);
  }
}

function ensureTab() {
  let tab = document.getElementById(TAB_ID);
  if (tab) return tab;
  tab = document.createElement("section");
  tab.id = TAB_ID;
  tab.className = "tab";
  const host = document.querySelector("main") || document.querySelector(".container") || document.body;
  host.appendChild(tab);
  return tab;
}

function openFinance() {
  installMenu();
  const menu = document.getElementById("mainMenu");
  if (menu) menu.value = TAB_ID;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.id === TAB_ID));
  const financeTab = ensureTab();
  financeTab.style.display = "block";
  financeTab.classList.add("active");
  window.location.hash = "finance";
  render();
}

function leaveFinance() {
  const tab = document.getElementById(TAB_ID);
  if (tab) tab.style.display = "none";
}

function navMarkup() {
  const items = [
    ["dashboard", "Dashboard"],
    ["transactions", "Verkäufe & Transaktionen"],
    ["bookings", "Buchungsvorschläge"],
    ["documents", "Belege"],
    ["imports", "Importe & eBay"],
    ["reports", "EÜR & Export"],
    ["audit", "Audit-Log"],
    ["settings", "Einstellungen"],
  ];
  return `<nav class="ef-nav">${items.map(([id, label]) => `<button type="button" data-ef-panel="${id}" class="${activePanel === id ? "active" : ""}">${label}</button>`).join("")}</nav>`;
}

function render() {
  const tab = ensureTab();
  if (!tab.classList.contains("active") && document.getElementById("mainMenu")?.value !== TAB_ID && window.location.hash !== "#finance") return;
  const metrics = calculateMetrics(state.transactions);
  tab.innerHTML = `
    <div class="ef-shell">
      <header class="ef-head">
        <div><div class="ef-eyebrow">Elyon Seller Tool</div><h2>Finanzen & Buchhaltung</h2><p class="ef-muted">eBay-Finanzdaten, Elyon-Kosten, Buchungsvorschläge, Belege und prüfbare Exporte an einem Ort.</p></div>
        <div class="ef-actions">
          <button class="ef-btn" data-ef-action="load-server">Server laden</button>
          <button class="ef-btn" data-ef-action="save-server">Persistent sichern</button>
          <button class="ef-btn primary" data-ef-panel="imports">eBay / CSV importieren</button>
        </div>
      </header>
      <div class="ef-callout">Elyon Finance bereitet Buchhaltung vor. Steuerkennzeichen, Konten und Exporte bleiben bis zur fachlichen Prüfung ausdrücklich Entwürfe. Es werden keine Steuererklärungen übermittelt und keine eBay-Live-Aktionen ausgeführt.</div>
      ${navMarkup()}
      <div id="elyonFinancePanel">${panelMarkup(activePanel, metrics)}</div>
    </div>
  `;
}

function panelMarkup(panel, metrics) {
  if (panel === "transactions") return transactionsMarkup();
  if (panel === "bookings") return bookingsMarkup();
  if (panel === "documents") return documentsMarkup();
  if (panel === "imports") return importsMarkup();
  if (panel === "reports") return reportsMarkup(metrics);
  if (panel === "audit") return auditMarkup();
  if (panel === "settings") return settingsMarkup();
  return dashboardMarkup(metrics);
}

function dashboardMarkup(metrics) {
  const maxCost = Math.max(metrics.ebayFees, metrics.advertising, metrics.supplier, metrics.shipping, metrics.otherExpenses, 1);
  return `
    <div class="ef-grid">
      ${metricCard("Umsatz", metrics.revenue, "positive", `${metrics.transactionCount} Transaktionen`)}
      ${metricCard("Realer Gewinn", metrics.profit, metrics.profit >= 0 ? "positive" : "negative", `${percent.format(metrics.marginPercent)} % Marge`)}
      ${metricCard("eBay-Gebühren", -metrics.ebayFees, "negative", "Verkaufs- und Plattformkosten")}
      ${metricCard("Werbekosten", -metrics.advertising, "warning", "Promoted Listings / Ads")}
      ${metricCard("Auszahlungen", metrics.payouts, "", "Nur Geldtransfer, kein zweiter Umsatz")}
    </div>
    <div class="ef-columns">
      <section class="ef-panel">
        <div class="ef-panel-head"><div><div class="ef-eyebrow">Kostenstruktur</div><h3>Ausgaben nach Kategorie</h3></div><span class="ef-badge">${money(metrics.expenses)} gesamt</span></div>
        <div class="ef-bars">
          ${barRow("eBay-Gebühren", metrics.ebayFees, maxCost)}
          ${barRow("Werbung", metrics.advertising, maxCost)}
          ${barRow("Lieferanten", metrics.supplier, maxCost)}
          ${barRow("Versand", metrics.shipping, maxCost)}
          ${barRow("Sonstige", metrics.otherExpenses, maxCost)}
        </div>
      </section>
      <aside class="ef-panel">
        <div class="ef-panel-head"><h3>Kontrollstatus</h3></div>
        <div class="ef-list">
          <div class="ef-list-item"><div><strong>Ungeprüfte Vorgänge</strong><span class="ef-muted">Vor Freigabe kontrollieren</span></div><span class="ef-status ${metrics.needsReview ? "needs_review" : "approved"}">${metrics.needsReview}</span></div>
          <div class="ef-list-item"><div><strong>Belegabdeckung</strong><span class="ef-muted">Transaktionen mit Beleg</span></div><strong>${percent.format(metrics.documentCoverage)} %</strong></div>
          <div class="ef-list-item"><div><strong>Persistenter Speicher</strong><span class="ef-muted">${escapeHtml(serverStatus?.store?.mode || "noch nicht geprüft")}</span></div><span class="ef-status ${serverStatus?.store?.persistent ? "approved" : "needs_review"}">${serverStatus?.store?.persistent ? "Aktiv" : "Lokal"}</span></div>
        </div>
        <button class="ef-btn primary" style="width:100%;margin-top:13px" data-ef-action="refresh-status">Systemstatus prüfen</button>
      </aside>
    </div>
    <section class="ef-panel">
      <div class="ef-panel-head"><div><div class="ef-eyebrow">Letzte Vorgänge</div><h3>Verkäufe und Kosten</h3></div><button class="ef-btn" data-ef-panel="transactions">Alle anzeigen</button></div>
      ${transactionTable(state.transactions.slice(0, 8))}
    </section>
  `;
}

function metricCard(label, value, tone, note) {
  return `<article class="ef-card"><small>${label}</small><strong class="${tone ? `ef-${tone}` : ""}">${money(value)}</strong><div class="ef-kpi-note">${escapeHtml(note)}</div></article>`;
}

function barRow(label, value, max) {
  const width = Math.max(0, Math.min(100, (Number(value || 0) / max) * 100));
  return `<div class="ef-bar-row"><span>${label}</span><div class="ef-bar"><span style="width:${width}%"></span></div><strong>${money(value)}</strong></div>`;
}

function transactionsMarkup() {
  return `
    <section class="ef-panel">
      <div class="ef-panel-head"><div><div class="ef-eyebrow">Kontrollierte Einzelvorgänge</div><h3>Verkäufe & Transaktionen</h3></div><div class="ef-actions"><button class="ef-btn" data-ef-action="approve-all">Alle sichtbaren freigeben</button><button class="ef-btn" data-ef-action="download-csv">CSV Export</button></div></div>
      ${state.transactions.length ? transactionTable(state.transactions) : `<div class="ef-empty">Noch keine Finanztransaktionen vorhanden.</div>`}
    </section>
  `;
}

function transactionTable(rows) {
  if (!rows.length) return `<div class="ef-empty">Noch keine Vorgänge.</div>`;
  return `<div class="ef-table-wrap"><table class="ef-table"><thead><tr><th>Datum</th><th>Vorgang</th><th>Bestellung</th><th>Kategorie</th><th>Betrag</th><th>Status</th><th>Beleg</th><th>Aktion</th></tr></thead><tbody>${rows.map((entry) => {
    const item = normalizeFinanceTransaction(entry, entry.source);
    const voided = Boolean(item.voidedAt);
    return `<tr><td>${escapeHtml(formatDate(item.transactionDate))}</td><td><strong>${escapeHtml(item.title)}</strong><div class="ef-code">${escapeHtml(item.transactionId || item.id)}</div></td><td>${escapeHtml(item.orderId || "–")}</td><td>${escapeHtml(categoryLabel(item.category))}</td><td class="${["revenue", "other_income", "fee_credit", "transfer"].includes(item.category) ? "ef-positive" : "ef-negative"}">${money(item.amount)}</td><td><span class="ef-status ${voided ? "voided" : item.status}">${voided ? "storniert" : item.status === "approved" ? "geprüft" : "prüfen"}</span></td><td>${item.documentIds?.length ? `✓ ${item.documentIds.length}` : "–"}</td><td><div class="ef-actions"><button class="ef-btn" data-ef-approve="${escapeHtml(item.id)}" ${voided ? "disabled" : ""}>Freigeben</button><button class="ef-btn danger" data-ef-void="${escapeHtml(item.id)}" ${voided ? "disabled" : ""}>Storno</button></div></td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function categoryLabel(category) {
  return ({ revenue: "Umsatz", ebay_fee: "eBay-Gebühr", advertising_expense: "Werbung", refund: "Erstattung", fee_credit: "Gebührengutschrift", shipping_expense: "Versand", supplier_expense: "Wareneinkauf", transfer: "Auszahlung", other_income: "Sonstiger Ertrag", other_expense: "Sonstige Ausgabe" })[category] || category || "Offen";
}

function bookingsMarkup() {
  const proposals = state.transactions.filter((entry) => !entry.voidedAt).map((entry) => bookingProposal(entry, state.settings));
  return `<section class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">Doppelte Erfassung vermeiden</div><h3>Buchungsvorschläge</h3></div><button class="ef-btn primary" data-ef-action="approve-all">Geprüfte Vorschläge freigeben</button></div><div class="ef-callout ef-success">eBay-Auszahlungen werden als Transfer zwischen eBay-Verrechnung und Bank behandelt – nicht als zusätzlicher Umsatz.</div>${proposals.length ? `<div class="ef-table-wrap" style="margin-top:14px"><table class="ef-table"><thead><tr><th>Datum</th><th>Vorgang</th><th>Sollkonto</th><th>Habenkonto</th><th>Betrag</th><th>Steuer</th><th>Status</th></tr></thead><tbody>${proposals.map((item) => `<tr><td>${escapeHtml(formatDate(item.date))}</td><td><strong>${escapeHtml(item.label)}</strong><div class="ef-muted">${escapeHtml(item.note)}</div></td><td>${escapeHtml(item.debitAccount)}</td><td>${escapeHtml(item.creditAccount)}</td><td>${money(item.amount)}</td><td>${escapeHtml(item.taxCode || "ungeklärt")}</td><td><span class="ef-status ${item.status}">${item.status === "approved" ? "geprüft" : "Entwurf"}</span></td></tr>`).join("")}</tbody></table></div>` : `<div class="ef-empty">Noch keine Vorschläge.</div>`}</section>`;
}

function documentsMarkup() {
  return `<div class="ef-columns"><section class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">Originaldatei + Hash</div><h3>Belegarchiv</h3></div><span class="ef-badge">${state.documents.length} Belege</span></div><div class="ef-drop"><strong>Rechnungen, eBay-Abrechnungen und Zahlungsnachweise</strong><p class="ef-muted">Die Datei wird lokal in IndexedDB abgelegt. Metadaten und SHA-256-Prüfsumme werden im Finance-State gespeichert.</p><input id="efDocumentInput" type="file" multiple><label class="ef-btn primary" for="efDocumentInput">Belege auswählen</label></div><div class="ef-list" style="margin-top:14px">${state.documents.length ? state.documents.map((doc) => `<div class="ef-list-item"><div><strong>${escapeHtml(doc.name)}</strong><span class="ef-muted">${escapeHtml(doc.type || "Datei")} · ${escapeHtml(formatDate(doc.createdAt))}</span><div class="ef-code">SHA-256 ${escapeHtml(doc.sha256 || "wird berechnet")}</div></div><button class="ef-btn" data-ef-download-doc="${escapeHtml(doc.id)}">Öffnen</button></div>`).join("") : `<div class="ef-empty">Noch keine Belege archiviert.</div>`}</div></section><aside class="ef-panel"><h3>Beleg zuordnen</h3><p class="ef-muted">Öffne einen Transaktionsdatensatz und verknüpfe dort den passenden Beleg. Bis zur Zuordnung bleibt die Belegabdeckung offen.</p><div class="ef-callout" style="margin-top:14px">Originalbelege werden nicht überschrieben. Korrekturen erhalten eine neue Datei und einen neuen Audit-Eintrag.</div></aside></div>`;
}

function importsMarkup() {
  return `<div class="ef-columns"><section class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">Stufe 1</div><h3>eBay-CSV importieren</h3></div></div><div class="ef-drop"><strong>eBay-Abrechnungs- oder Transaktionsbericht</strong><p class="ef-muted">CSV mit Komma, Semikolon oder Tab. Vor Übernahme wird eine Vorschau erzeugt.</p><input id="efCsvInput" type="file" accept=".csv,.txt,text/csv"><label class="ef-btn primary" for="efCsvInput">CSV auswählen</label></div>${stagedImport ? importPreviewMarkup() : ""}</section><aside class="ef-panel"><div class="ef-eyebrow">Stufe 2</div><h3>eBay Finances API</h3><p class="ef-muted">Liest Verkäufe, Gebühren, Anzeigenkosten, Erstattungen, Gutschriften und Auszahlungsreferenzen. Keine eBay-Daten werden verändert.</p><label class="ef-muted" for="efEbayDays">Zeitraum</label><select id="efEbayDays" style="width:100%;margin:7px 0 13px;padding:11px;border-radius:12px;background:#020617;color:#e5e7eb;border:1px solid rgba(148,163,184,.18)"><option value="30">30 Tage</option><option value="90" selected>90 Tage</option><option value="365">365 Tage</option></select><div class="ef-actions"><button class="ef-btn" data-ef-action="ebay-preview">Vorschau laden</button><button class="ef-btn primary" data-ef-action="ebay-sync">Bestätigt importieren</button></div><div class="ef-callout" style="margin-top:14px">Nach einer Scope-Erweiterung muss eBay einmal neu verbunden werden. Der Import ist dedupliziert und überschreibt keine Originaldaten.</div></aside></div><section class="ef-panel"><div class="ef-panel-head"><h3>Lieferantenkosten manuell ergänzen</h3></div><form id="efSupplierForm" class="ef-form"><label>Bestellnummer<input name="orderId" required></label><label>Lieferant<input name="supplier" placeholder="AliExpress, CJ, ..."></label><label>Betrag (€)<input name="amount" type="number" min="0" step="0.01" required></label><label>Datum<input name="date" type="date" required></label><label class="full">Notiz<textarea name="memo" placeholder="Produkt, Variante oder Belegreferenz"></textarea></label><div class="full"><button class="ef-btn primary" type="submit">Wareneinkauf erfassen</button></div></form></section><section class="ef-panel"><div class="ef-panel-head"><h3>Importverlauf</h3><span class="ef-badge">${state.imports.length}</span></div><div class="ef-list">${state.imports.slice().reverse().slice(0, 20).map((item) => `<div class="ef-list-item"><div><strong>${escapeHtml(item.source || "Import")}</strong><span class="ef-muted">${escapeHtml(formatDate(item.createdAt))} · ${Number(item.inserted || item.normalizedCount || 0)} neu · ${Number(item.duplicates || 0)} Duplikate</span></div><span class="ef-code">${escapeHtml(item.id)}</span></div>`).join("") || `<div class="ef-empty">Noch keine Importe.</div>`}</div></section>`;
}

function importPreviewMarkup() {
  return `<div class="ef-callout ef-success" style="margin-top:14px"><strong>${stagedImport.transactions.length} Datensätze erkannt</strong><br>${escapeHtml(stagedImport.warnings.join(" · ") || "Spalten wurden erfolgreich zugeordnet.")}</div><div class="ef-actions" style="margin-top:12px"><button class="ef-btn primary" data-ef-action="confirm-csv">Import übernehmen</button><button class="ef-btn" data-ef-action="cancel-csv">Verwerfen</button></div>`;
}

function reportsMarkup(metrics) {
  const eur = buildEurSummary(state.transactions);
  return `<div class="ef-columns"><section class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">Arbeitsauswertung</div><h3>Einnahmenüberschuss</h3></div><span class="ef-badge">EÜR-Vorbereitung</span></div><div class="ef-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${metricCard("Betriebseinnahmen", eur.operatingIncome, "positive", "aus erfassten Vorgängen")}${metricCard("Betriebsausgaben", -eur.operatingExpenses, "negative", "inkl. Gebühren und Werbung")}${metricCard("Überschuss", eur.surplus, eur.surplus >= 0 ? "positive" : "negative", "noch nicht steuerlich freigegeben")}</div><div class="ef-callout" style="margin-top:14px">${escapeHtml(eur.disclaimer)}</div></section><aside class="ef-panel"><h3>Exporte</h3><div class="ef-list"><button class="ef-btn" data-ef-action="download-csv">Transaktionen CSV</button><button class="ef-btn" data-ef-action="download-datev">DATEV-Vorbereitung</button><button class="ef-btn" data-ef-action="download-eur">EÜR-Arbeitsauswertung</button><button class="ef-btn" data-ef-action="download-backup">Komplettes JSON-Backup</button><button class="ef-btn" data-ef-action="download-audit">Audit-Log</button></div><p class="ef-muted" style="margin-top:14px">Der DATEV-Export ist bewusst als Vorbereitung gekennzeichnet. Kontenrahmen, Steuerschlüssel und Mandanteneinstellungen müssen vor Nutzung geprüft werden.</p></aside></div>`;
}

function auditMarkup() {
  return `<section class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">Nachvollziehbarkeit</div><h3>Audit-Log</h3></div><button class="ef-btn" data-ef-action="download-audit">Exportieren</button></div><div class="ef-list">${state.auditLog.slice().reverse().slice(0, 100).map((entry) => `<div class="ef-list-item"><div><strong>${escapeHtml(entry.action)}</strong><span class="ef-muted">${escapeHtml(entry.summary || "Änderung protokolliert")} · ${escapeHtml(formatDate(entry.timestamp))}</span></div><span class="ef-code">${escapeHtml(entry.hash || entry.id)}</span></div>`).join("") || `<div class="ef-empty">Noch keine Audit-Ereignisse.</div>`}</div></section>`;
}

function settingsMarkup() {
  const s = state.settings;
  return `<div class="ef-columns"><section class="ef-panel"><div class="ef-panel-head"><div><div class="ef-eyebrow">Stufe 3</div><h3>Buchhaltungsparameter</h3></div></div><form id="efSettingsForm" class="ef-form"><label>Steuerstatus<select name="taxMode"><option value="unconfigured" ${s.taxMode === "unconfigured" ? "selected" : ""}>Noch nicht festgelegt</option><option value="small_business" ${s.taxMode === "small_business" ? "selected" : ""}>Kleinunternehmer-Regel prüfen</option><option value="vat_standard" ${s.taxMode === "vat_standard" ? "selected" : ""}>Regelbesteuerung prüfen</option></select></label><label>Standard-Steuerschlüssel<input name="defaultTaxCode" value="${escapeHtml(s.defaultTaxCode)}" placeholder="erst nach fachlicher Prüfung"></label><label>Rechnungspräfix<input name="invoicePrefix" value="${escapeHtml(s.invoicePrefix)}"></label><label>Nächste Nummer<input name="nextInvoiceNumber" type="number" min="1" value="${Number(s.nextInvoiceNumber || 1)}"></label><label>Erlöskonto<input name="revenueAccount" value="${escapeHtml(s.revenueAccount)}"></label><label>eBay-Gebührenkonto<input name="ebayFeeAccount" value="${escapeHtml(s.ebayFeeAccount)}"></label><label>Werbekostenkonto<input name="advertisingAccount" value="${escapeHtml(s.advertisingAccount)}"></label><label>Wareneinkaufskonto<input name="goodsAccount" value="${escapeHtml(s.goodsAccount)}"></label><div class="full ef-actions"><button class="ef-btn primary" type="submit">Einstellungen speichern</button><button class="ef-btn" type="button" data-ef-action="reserve-invoice">Nächste Rechnungsnummer reservieren</button></div></form></section><aside class="ef-panel"><h3>Aktuelle Rechnungsnummer</h3><div class="ef-card" style="margin-top:12px"><small>Nächste Nummer</small><strong>${escapeHtml(`${s.invoicePrefix}-${new Date().getFullYear()}-${String(s.nextInvoiceNumber || 1).padStart(5, "0")}`)}</strong></div><div class="ef-callout" style="margin-top:14px">Nummern werden nicht wiederverwendet. Eine Reservierung wird im Audit-Log protokolliert. Die eigentliche Rechnungsstellung bleibt im vorhandenen Rechnungsbereich des Seller Tools.</div></aside></div>`;
}

function download(name, content, type = "text/plain;charset=utf-8") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function hashFile(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeDocumentFile(id, file) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readwrite");
    transaction.objectStore(DB_STORE).put({ id, file });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function readDocumentFile(id) {
  const db = await openDb();
  const result = await new Promise((resolve, reject) => {
    const transaction = db.transaction(DB_STORE, "readonly");
    const request = transaction.objectStore(DB_STORE).get(id);
    request.onsuccess = () => resolve(request.result?.file || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

async function importDocuments(files) {
  backupLocal("before_document_import");
  for (const file of files) {
    const sha256 = await hashFile(file);
    const existing = state.documents.find((entry) => entry.sha256 === sha256);
    if (existing) continue;
    const id = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    await storeDocumentFile(id, file);
    state.documents.push({ id, name: file.name, type: file.type, size: file.size, sha256, createdAt: new Date().toISOString(), storage: "indexeddb" });
    state.auditLog.push(createAuditEvent("document_archived", { entityType: "document", entityId: id, summary: `Originalbeleg ${file.name} lokal archiviert.`, metadata: { sha256, size: file.size } }));
  }
  saveLocal("documents_imported", "Belege wurden mit Prüfsumme archiviert.");
  render();
}

function approveTransaction(id) {
  const item = state.transactions.find((entry) => entry.id === id);
  if (!item || item.voidedAt) return;
  item.status = "approved";
  item.updatedAt = new Date().toISOString();
  saveLocal("transaction_approved", `Transaktion ${item.transactionId || item.id} geprüft.`);
  render();
}

function voidTransaction(id) {
  const item = state.transactions.find((entry) => entry.id === id);
  if (!item || item.voidedAt) return;
  const reason = window.prompt("Grund für das Storno / die Korrektur:", "Korrektur erforderlich");
  if (!reason) return;
  item.voidedAt = new Date().toISOString();
  item.voidReason = reason;
  item.status = "voided";
  saveLocal("transaction_voided", `Transaktion ${item.transactionId || item.id} storniert: ${reason}`);
  render();
}

async function handleCsvFile(file) {
  const source = await file.text();
  stagedImport = { ...parseEbayCsv(source), fileName: file.name, createdAt: new Date().toISOString() };
  render();
}

function confirmCsvImport() {
  if (!stagedImport) return;
  backupLocal("before_csv_import");
  const merged = mergeTransactions(state.transactions, stagedImport.transactions);
  state.transactions = merged.transactions;
  state.imports.push({ id: `csv_${Date.now()}`, source: "ebay_csv", fileName: stagedImport.fileName, inserted: merged.inserted, duplicates: merged.duplicates, normalizedCount: stagedImport.transactions.length, createdAt: new Date().toISOString() });
  saveLocal("ebay_csv_import", `CSV importiert: ${merged.inserted} neu, ${merged.duplicates} Duplikate.`);
  stagedImport = null;
  render();
  toast(`${merged.inserted} neue Finanzvorgänge übernommen.`);
}

async function ebayPreview() {
  try {
    const days = document.getElementById("efEbayDays")?.value || 90;
    const data = await api("ebay-preview", { query: { days } });
    stagedImport = { transactions: data.transactions || [], warnings: [`eBay API: ${data.count || 0} normalisierte Vorgänge`], fileName: "eBay Finances API", createdAt: new Date().toISOString() };
    render();
    toast("eBay-Finanzvorschau geladen. Noch nichts gespeichert.");
  } catch (error) {
    toast(error.message, "eBay Finances API");
  }
}

async function ebaySync() {
  try {
    const days = document.getElementById("efEbayDays")?.value || 90;
    const data = await api("ebay-sync", { method: "POST", body: { confirm: true, days, environment: "production" } });
    backupLocal("before_ebay_api_sync");
    state = normalizeState(data.state || state);
    saveLocal("ebay_finances_sync", `eBay-Finanzdaten synchronisiert: ${data.merge?.inserted || 0} neu.`);
    render();
    toast(`${data.merge?.inserted || 0} neue eBay-Finanzvorgänge importiert.`);
  } catch (error) {
    toast(error.message, "eBay Finances API");
  }
}

function handleSupplierSubmit(form) {
  const data = new FormData(form);
  const orderId = text(data.get("orderId"));
  const amount = Number(data.get("amount") || 0);
  if (!orderId || amount <= 0) return toast("Bestellnummer und Betrag werden benötigt.");
  const transaction = normalizeFinanceTransaction({
    transactionId: `supplier_${orderId}_${Date.now()}`,
    orderId,
    transactionDate: data.get("date"),
    transactionType: "SUPPLIER_PURCHASE",
    bookingEntry: "DEBIT",
    amount: -Math.abs(amount),
    currency: "EUR",
    title: `${text(data.get("supplier")) || "Lieferant"} Wareneinkauf`,
    memo: data.get("memo"),
    category: "supplier_expense",
    status: "needs_review",
  }, "elyon_supplier_manual");
  backupLocal("before_supplier_cost");
  state.transactions = mergeTransactions(state.transactions, [transaction]).transactions;
  saveLocal("supplier_cost_added", `Lieferantenkosten für ${orderId} erfasst.`);
  form.reset();
  render();
}

function saveSettings(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  state.settings = { ...state.settings, ...data, nextInvoiceNumber: Math.max(1, Number(data.nextInvoiceNumber || 1)) };
  saveLocal("finance_settings_updated", "Buchhaltungsparameter aktualisiert.");
  render();
  toast("Einstellungen gespeichert.");
}

function reserveInvoice() {
  const current = Math.max(1, Number(state.settings.nextInvoiceNumber || 1));
  const invoiceNumber = `${state.settings.invoicePrefix}-${new Date().getFullYear()}-${String(current).padStart(5, "0")}`;
  state.settings.nextInvoiceNumber = current + 1;
  saveLocal("invoice_number_reserved", `Rechnungsnummer ${invoiceNumber} reserviert.`);
  render();
  toast(`${invoiceNumber} wurde reserviert.`);
}

function approveAll() {
  let count = 0;
  state.transactions.forEach((entry) => {
    if (!entry.voidedAt && entry.status !== "approved") { entry.status = "approved"; entry.updatedAt = new Date().toISOString(); count += 1; }
  });
  saveLocal("transactions_bulk_approved", `${count} Finanzvorgänge geprüft und freigegeben.`);
  render();
  toast(`${count} Vorgänge freigegeben.`);
}

function exportAction(action) {
  if (action === "download-csv") return download(`elyon_finance_transactions_${fileStamp()}.csv`, `\uFEFF${exportTransactionsCsv(state.transactions)}`, "text/csv;charset=utf-8");
  if (action === "download-datev") return download(`elyon_datev_vorbereitung_${fileStamp()}.csv`, `\uFEFF${exportDatevPreparation(state.transactions, state.settings)}`, "text/csv;charset=utf-8");
  if (action === "download-eur") return download(`elyon_euer_arbeitsauswertung_${fileStamp()}.json`, JSON.stringify(buildEurSummary(state.transactions), null, 2), "application/json");
  if (action === "download-audit") return download(`elyon_finance_audit_${fileStamp()}.json`, JSON.stringify(state.auditLog, null, 2), "application/json");
  if (action === "download-backup") return download(`elyon_finance_backup_${fileStamp()}.json`, JSON.stringify(state, null, 2), "application/json");
}

function bindEvents() {
  document.addEventListener("click", async (event) => {
    const panel = event.target.closest?.("[data-ef-panel]")?.dataset.efPanel;
    if (panel) {
      if (panel === "imports" || document.getElementById(TAB_ID)?.classList.contains("active")) {
        event.preventDefault();
        activePanel = panel;
        openFinance();
      }
      return;
    }
    const approve = event.target.closest?.("[data-ef-approve]")?.dataset.efApprove;
    if (approve) return approveTransaction(approve);
    const voidId = event.target.closest?.("[data-ef-void]")?.dataset.efVoid;
    if (voidId) return voidTransaction(voidId);
    const documentId = event.target.closest?.("[data-ef-download-doc]")?.dataset.efDownloadDoc;
    if (documentId) {
      const file = await readDocumentFile(documentId);
      const meta = state.documents.find((entry) => entry.id === documentId);
      return file ? download(meta?.name || "beleg", file, file.type) : toast("Die Originaldatei ist auf diesem Gerät nicht verfügbar.");
    }
    const action = event.target.closest?.("[data-ef-action]")?.dataset.efAction;
    if (!action) return;
    if (action === "load-server") return loadServer();
    if (action === "save-server") return saveServer();
    if (action === "refresh-status") return refreshServerStatus();
    if (action === "confirm-csv") return confirmCsvImport();
    if (action === "cancel-csv") { stagedImport = null; return render(); }
    if (action === "ebay-preview") return ebayPreview();
    if (action === "ebay-sync") return ebaySync();
    if (action === "approve-all") return approveAll();
    if (action === "reserve-invoice") return reserveInvoice();
    if (action.startsWith("download-")) return exportAction(action);
  });

  document.addEventListener("change", (event) => {
    if (event.target?.id === "mainMenu") {
      if (event.target.value === TAB_ID) openFinance(); else leaveFinance();
    }
    if (event.target?.id === "efCsvInput" && event.target.files?.[0]) handleCsvFile(event.target.files[0]);
    if (event.target?.id === "efDocumentInput" && event.target.files?.length) importDocuments([...event.target.files]).catch((error) => toast(error.message, "Belegarchiv"));
  });

  document.addEventListener("submit", (event) => {
    if (event.target?.id === "efSupplierForm") { event.preventDefault(); handleSupplierSubmit(event.target); }
    if (event.target?.id === "efSettingsForm") { event.preventDefault(); saveSettings(event.target); }
  });

  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#finance") openFinance();
  });
}

function install() {
  installStyles();
  loadLocal();
  installMenu();
  ensureTab();
  bindEvents();
  if (window.location.hash === "#finance" || document.getElementById("mainMenu")?.value === TAB_ID) openFinance();
  window.ElyonSellerFinance = {
    open: openFinance,
    state: () => structuredClone(state),
    status: refreshServerStatus,
    load: loadServer,
    save: saveServer,
  };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
else install();
