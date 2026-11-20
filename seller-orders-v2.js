import {
  escapeHtml as h, normalizeEbayOrder, workflowStatus, paymentConfirmed,
  productForLine, estimatedOrderCosts, actualOrderProfit, summarizeOrders,
  visibleOrders, normalizeOperationInput,
} from "./seller-orders-v2-core.js";

const ROOT_ID = "elyonOrdersV2Root";
const RANGE_KEY = "elyon_orders_v2_range";
const money = (value, currency = "EUR") => new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(Number(value || 0));
const date = (value) => {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(d) : "–";
};
const text = (value) => String(value ?? "").trim();
const obj = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const statusLabels = {
  new: "Neu · bezahlt", processing: "In Bearbeitung", supplier_ordered: "Beim Lieferanten bestellt",
  shipped: "Versendet", completed: "Abgeschlossen", awaiting_payment: "Zahlung offen",
  issue: "Problemfall", cancelled: "Storniert",
};
const phaseOptions = [
  ["NEW", "Neu"], ["PROCESSING", "In Bearbeitung"], ["SUPPLIER_ORDERED", "Lieferant beauftragt"],
  ["SHIPPED", "Intern als versendet"], ["COMPLETED", "Abgeschlossen"],
  ["ISSUE", "Problemfall"], ["CANCELLED", "Storniert (intern)"],
];
const state = {
  orders: [], products: [], operations: {}, invoices: {}, revision: null,
  selectedId: "", filter: "all", query: "", days: 90, loading: false,
  saving: false, refreshedAt: "", error: "", warning: "", saveNotice: "",
  truncated: false, sourceReady: false, financeReady: false, drafts: {},
};
try { const v = Number(localStorage.getItem(RANGE_KEY)); if ([7, 30, 90].includes(v)) state.days = v; } catch {}

const root = () => document.getElementById(ROOT_ID);
const opFor = (id) => obj(state.operations[id]);
const statusOf = (order) => workflowStatus(order, opFor(order.id));
const readableMoney = (val, curr = "EUR") => val === null || val === undefined ? "Noch offen" : money(val, curr);
const cleanAttr = (value) => h(value);
function labelForLine(line) {
  const p = productForLine(line, state.products);
  return p ? `<span class="ocv2-match">✓ ${h(p.articleNumber || p.sku || p.id)} · ${h(p.title || "")}</span>` :
    '<span class="ocv2-unknown">Keine eindeutige Company-OS-Zuordnung</span>';
}
function statsCard(label, value, tone = "") {
  return `<div class="ocv2-stat"><small>${h(label)}</small><strong class="${h(tone)}">${h(value)}</strong></div>`;
}
function rowMarkup(order) {
  const status = statusOf(order);
  const chosen = state.selectedId === order.id;
  const first = order.lines[0];
  const title = first?.title || "eBay-Bestellung";
  const more = order.lines.length > 1 ? ` + ${order.lines.length - 1} weitere` : "";
  return `<button type="button" class="ocv2-order ${chosen ? "is-selected" : ""}" data-order-open="${cleanAttr(order.id)}" aria-pressed="${chosen}">
    <div class="ocv2-order-main"><strong>${h(title + more)}</strong><span class="ocv2-small">#${h(order.id)} · ${h(date(order.createdAt))}</span>
    <span class="ocv2-small">${h(order.buyerRef || "Käuferreferenz unbekannt")} · ${order.lines.reduce((sum, line) => sum + line.quantity, 0)} Stk.</span></div>
    <div class="ocv2-order-right"><strong>${h(money(order.total, order.currency))}</strong>
    <span class="ocv2-state ocv2-state--${h(status)}">${h(statusLabels[status] || status)}</span></div>
  </button>`;
}
function detailsMarkup(order) {
  const op = { ...opFor(order.id), ...obj(state.drafts[order.id]) };
  const status = statusOf(order);
  const estimated = estimatedOrderCosts(order, state.products);
  const profit = actualOrderProfit(order, op);
  const lines = order.lines.length ? order.lines.map((line) => `<div class="ocv2-line">
    <div><strong>${h(line.title)}</strong><span class="ocv2-small">SKU: ${h(line.sku || "Nicht angegeben")} · ${h(line.quantity)} Stk. · ${h(readableMoney(line.total, order.currency))}</span>
    ${labelForLine(line)}</div></div>`).join("") : '<p class="ocv2-muted">Keine Artikelpositionen übermittelt.</p>';
  const products = order.lines.map((line) => productForLine(line, state.products)).filter(Boolean);
  const supplierGuess = products.length === order.lines.length && products.length &&
    products.every((p) => text(p.supplier?.name || p.product?.supplier?.name) === text(products[0].supplier?.name || products[0].product?.supplier?.name)) ?
    text(products[0].supplier?.name || products[0].product?.supplier?.name) : "";
  const help = estimated ? `<p class="ocv2-hint">Company OS: geschätzter EK ${h(readableMoney(estimated.purchase))}, Versand ${h(readableMoney(estimated.shipping))}, Gebühren ${h(readableMoney(estimated.fees))}. Diese Werte sind <strong>keine Ist-Kosten</strong>.</p>` :
    '<p class="ocv2-hint">Keine vollständigen Company-OS-Kostenschätzungen vorhanden. Bitte Lieferantenkosten prüfen.</p>';
  const fields = [
    ["purchaseCost", "Tatsächlicher Einkauf €", op.purchaseCost, "0.00"],
    ["shippingCost", "Tatsächlicher Versand €", op.shippingCost, "0.00"],
    ["feeCost", "Tatsächliche eBay-Gebühren €", op.feeCost, "0.00"],
  ].map(([name, label, value, placeholder]) => `<label>${h(label)}<input type="number" min="0" step="0.01" name="${name}" value="${value !== null && value !== undefined ? h(value) : ""}" placeholder="${placeholder}"></label>`).join("");
  const invoice = state.invoices[order.id];
  return `<div class="ocv2-details-head"><div><small>eBay-Bestellung</small><h3>${h(order.id)}</h3></div><span class="ocv2-state ocv2-state--${h(status)}">${h(statusLabels[status] || status)}</span></div>
    <div class="ocv2-details-meta"><span>${h(date(order.createdAt))}</span><strong>${h(money(order.total, order.currency))}</strong></div>
    <div class="ocv2-chips"><span>Bezahlung: ${h(order.paymentStatus)}</span><span>eBay-Versand: ${h(order.fulfillmentStatus)}</span>
    <span>Rechnung: ${invoice ? h(invoice.invoiceNumber) : "noch keine"}</span></div>
    ${!paymentConfirmed(order) ? '<p class="ocv2-alert">eBay meldet die Bestellung nicht als vollständig bezahlt. Vor einem Einkauf bitte überprüfen.</p>' : ""}
    <h4>Artikel & Produktverknüpfungen</h4><div class="ocv2-lines">${lines}</div>
    <form id="ocv2OrderForm" data-order-id="${cleanAttr(order.id)}">
      <h4>Lieferant und Bearbeitung</h4>
      <div class="ocv2-fields"><label>Interner Bearbeitungsstatus<select name="workflowStatus">${phaseOptions.map(([id, label]) =>
        `<option value="${id}" ${(op.workflowStatus || (order.fulfillmentStatus === "FULFILLED" || op.status === "SHIPPED" ? "SHIPPED" : "NEW")) === id ? "selected" : ""}>${h(label)}</option>`).join("")}</select></label>
        <label>Lieferant<input name="supplierName" maxlength="160" value="${h(op.supplierName || "")}" placeholder="${h(supplierGuess || "Lieferant eintragen")}"></label>
        <label>Lieferanten-Bestellnummer<input name="supplierOrderId" maxlength="160" value="${h(op.supplierOrderId || "")}" placeholder="Nach deinem Einkauf eintragen"></label>
        <label>Versanddienstleister<input name="carrier" maxlength="80" value="${h(op.carrier || "")}" placeholder="z. B. DHL"></label>
        <label>Trackingnummer<input name="trackingNumber" maxlength="120" value="${h(op.trackingNumber || "")}" placeholder="Sendungsnummer"></label>
      </div>
      <h4>Kosten und Gewinn</h4>
      ${help}
      <div class="ocv2-fields ocv2-cost-fields">${fields}</div>
      <div class="ocv2-profit ${profit === null ? "is-open" : profit < 0 ? "is-loss" : ""}"><span>Ergebnis nach erfassten Kosten</span><strong>${profit === null ? "Noch nicht berechenbar" : h(money(profit))}</strong>
        ${profit === null ? '<small>Erst wenn EK, Versand und Gebühren vollständig sind. Weitere Ausgaben und Retouren separat prüfen.</small>' : ""}</div>
      <label class="ocv2-note">Interne Notiz<textarea name="note" rows="3" maxlength="1600" placeholder="Liefertermin, Sonderfall, Einkauf prüfen …">${h(op.note || "")}</textarea></label>
      <div class="ocv2-details-actions"><button type="submit" class="ocv2-primary" ${state.saving || !state.financeReady ? "disabled" : ""}>${state.saving ? "Speichert…" : "Interne Angaben sichern"}</button>
        <button type="button" data-order-shipping>Versand öffnen</button><button type="button" data-order-invoice>Rechnung öffnen</button></div>
      <p class="ocv2-hint">Interne Angaben werden revisionsgeschützt gespeichert. Kein automatischer Lieferantenkauf, keine eBay-Versandmeldung und keine Rechnungsausstellung.</p>
    </form>`;
}
function render() {
  const host = root(); if (!host) return;
  const summary = summarizeOrders(state.orders, state.operations);
  const rows = visibleOrders(state.orders, state.operations, { query: state.query, filter: state.filter });
  const selected = state.orders.find((entry) => entry.id === state.selectedId);
  host.innerHTML = `<div class="ocv2-shell"><header class="ocv2-header">
      <div><span class="ocv2-kicker">ELYON · Order Operations</span><h2>Bestellungen</h2>
      <p>eBay-Aufträge verwalten, Lieferanten zuordnen und tatsächliche Kosten dokumentieren.</p></div>
      <div class="ocv2-header-actions"><label>Zeitraum<select id="ocv2Range"><option value="7" ${state.days === 7 ? "selected" : ""}>7 Tage</option><option value="30" ${state.days === 30 ? "selected" : ""}>30 Tage</option><option value="90" ${state.days === 90 ? "selected" : ""}>90 Tage</option></select></label>
      <button type="button" class="ocv2-primary" id="ocv2Refresh" ${state.loading ? "disabled" : ""}>${state.loading ? "Wird geladen…" : "Mit eBay abgleichen"}</button></div></header>
      ${state.error ? `<p class="ocv2-alert" role="alert">${h(state.error)}</p>` : ""}
      ${state.warning ? `<p class="ocv2-warning">${h(state.warning)}</p>` : ""}
      ${state.saveNotice ? `<p class="ocv2-success" role="status">${h(state.saveNotice)}</p>` : ""}
      <div class="ocv2-stats">${statsCard("Bestellungen", String(summary.total))}${statsCard("Neu", String(summary.new))}
        ${statsCard("Versand offen", String(summary.shipping))}${statsCard("Achtung / Zahlung", String(summary.issues))}</div>
      <div class="ocv2-content">
        <section class="ocv2-list-card"><div class="ocv2-list-header"><div><h3>Bestellübersicht</h3>
          <span class="ocv2-small">${rows.length} angezeigt · ${summary.shipped} versendet/abgeschlossen
            ${state.refreshedAt ? " · Aktualisiert " + h(date(state.refreshedAt)) : ""}</span></div>
          <input id="ocv2Search" aria-label="Bestellungen durchsuchen" value="${h(state.query)}" placeholder="Bestellung, Artikel, SKU suchen …" type="search"></div>
          <nav class="ocv2-filters" aria-label="Bestellstatus">
          ${[["all", "Alle"], ["new", "Neu"], ["processing", "Bearbeitung"], ["shipping", "Versand offen"], ["shipped", "Versendet"], ["issues", "Prüfen"]].map(([id, label]) =>
            `<button type="button" data-ocv2-filter="${id}" class="${state.filter === id ? "active" : ""}">${label}</button>`).join("")}</nav>
          <div class="ocv2-order-list">${!state.sourceReady && !state.loading ? '<div class="ocv2-empty">Noch keine eBay-Daten geladen.</div>' :
            !rows.length ? `<div class="ocv2-empty"><strong>${state.loading ? "Bestellungen werden geladen…" : "Keine passenden Bestellungen"}</strong>
            <span>${state.loading ? "eBay wird gelesen." : "Im gewählten Zeitraum liegen keine passenden Aufträge vor."}</span></div>` :
            rows.map(rowMarkup).join("")}</div></section>
        <section class="ocv2-detail-card" id="ocv2Details">
          ${selected ? detailsMarkup(selected) : '<div class="ocv2-empty ocv2-empty-detail"><strong>Bestellung auswählen</strong><span>Hier erscheinen Artikel, Lieferant, Kosten, Rechnung und Versand.</span></div>'}
        </section></div></div>`;
}
async function json(url, options) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(text(data.message || data.error || "HTTP " + response.status));
  return data;
}
async function refresh() {
  if (state.loading) return;
  if (Object.keys(state.drafts).length) {
    state.warning = "Nicht gespeicherte Änderungen vorhanden. Bitte zuerst die Bestellangaben sichern oder die Seite neu laden.";
    render();
    return;
  }
  state.loading = true; state.error = ""; state.warning = ""; state.saveNotice = ""; render();
  const [ebay, finance, product] = await Promise.allSettled([
    json(`/api/ebay?action=orders&environment=production&days=${state.days}&status=all`),
    json("/api/orders/operations"),
    json("/api/products"),
  ]);
  if (ebay.status === "fulfilled") {
    state.orders = [...new Map((ebay.value.orders || []).map((raw) => {
      const order = normalizeEbayOrder(raw); return [order.id, order];
    }).filter(([id]) => id))].map(([, order]) => order);
    state.truncated = ebay.value.truncated === true;
    state.refreshedAt = new Date().toISOString();
    state.sourceReady = true;
    if (state.truncated) state.warning = "Sehr viele Bestellungen: Der eBay-Abruf wurde aus Sicherheitsgründen auf 1.000 Aufträge begrenzt. Zeitraum verkürzen.";
  } else {
    state.sourceReady = false;
    state.orders = []; state.error = "eBay-Bestellungen konnten nicht abgerufen werden: " + ebay.reason.message;
  }
  if (finance.status === "fulfilled") {
    state.operations = obj(finance.value.orderOperations);
    state.invoices = obj(finance.value.invoices);
    state.revision = Number.isSafeInteger(finance.value.revision) ? finance.value.revision : null;
    state.financeReady = finance.value.persistent === true && state.revision !== null;
    if (!state.financeReady) state.warning += " Der dauerhafte Finance-Speicher ist nicht verfügbar; internes Speichern bleibt gesperrt.";
  } else {
    state.financeReady = false; state.revision = null; state.operations = {}; state.invoices = {};
    state.warning += " Interne Bestelldaten konnten nicht geladen werden; Speichern ist aus Sicherheitsgründen gesperrt.";
  }
  if (product.status === "fulfilled") {
    state.products = Array.isArray(product.value.products) ? product.value.products : [];
  } else {
    state.products = [];
    state.warning += " Company OS konnte nicht geladen werden; Produktverknüpfungen sind vorübergehend nicht verfügbar.";
  }
  if (!state.orders.some((order) => order.id === state.selectedId)) state.selectedId = state.orders[0]?.id || "";
  state.loading = false; render();
}
async function save(form) {
  const id = form.dataset.orderId;
  if (!state.financeReady || state.saving || !state.orders.some((item) => item.id === id)) return;
  const values = Object.fromEntries(new FormData(form).entries());
  const operation = normalizeOperationInput(values);
  state.drafts[id] = values;
  state.saving = true; state.error = ""; state.saveNotice = ""; render();
  try {
    const result = await json("/api/orders/operations", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ orderId: id, operation, expectedRevision: state.revision }),
    });
    state.operations[id] = result.operation;
    delete state.drafts[id];
    state.revision = result.revision;
    state.saveNotice = "Interne Bestellangaben sicher gespeichert. eBay wurde nicht verändert.";
  } catch (error) {
    state.error = "Nicht gespeichert: " + error.message + " Bei zeitgleichen Änderungen bitte erneut mit eBay abgleichen.";
    state.financeReady = false; // Prevent stale retries.
  } finally { state.saving = false; render(); }
}
function goToTab(tab) {
  const select = document.getElementById("mainMenu");
  if (select) {
    select.value = tab;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
}
function bind() {
  const host = root();
  if (!host) return;
  host.addEventListener("click", (event) => {
    if (event.target.closest("#ocv2Refresh")) return refresh();
    const choose = event.target.closest("[data-order-open]");
    if (choose) { state.selectedId = choose.dataset.orderOpen; state.saveNotice = ""; return render(); }
    const filter = event.target.closest("[data-ocv2-filter]");
    if (filter) { state.filter = filter.dataset.ocv2Filter; return render(); }
    if (event.target.closest("[data-order-invoice]")) {
      if (window.ElyonSellerFinance?.openInvoices) window.ElyonSellerFinance.openInvoices();
      else goToTab("financeTab");
    }
    if (event.target.closest("[data-order-shipping]")) goToTab("automationTab");
  });
  host.addEventListener("input", (event) => {
    if (event.target.closest("#ocv2OrderForm")) {
      const form = event.target.closest("#ocv2OrderForm");
      state.drafts[form.dataset.orderId] = Object.fromEntries(new FormData(form).entries());
      return;
    }
    if (event.target.id !== "ocv2Search") return;
    const value = event.target.value, pos = event.target.selectionStart;
    state.query = value;
    const list = host.querySelector(".ocv2-order-list");
    if (!list) return;
    const rows = visibleOrders(state.orders, state.operations, { query: value, filter: state.filter });
    list.innerHTML = rows.length ? rows.map(rowMarkup).join("") : '<div class="ocv2-empty">Keine passenden Bestellungen.</div>';
    event.target.setSelectionRange(pos, pos);
  });
  host.addEventListener("change", (event) => {
    if (event.target.closest("#ocv2OrderForm")) {
      const form = event.target.closest("#ocv2OrderForm");
      state.drafts[form.dataset.orderId] = Object.fromEntries(new FormData(form).entries());
      return;
    }
    if (event.target.id === "ocv2Range") {
      state.days = Number(event.target.value);
      try { localStorage.setItem(RANGE_KEY, String(state.days)); } catch {}
      return refresh();
    }
  });
  host.addEventListener("submit", (event) => {
    if (event.target.id !== "ocv2OrderForm") return;
    event.preventDefault();
    void save(event.target);
  });
}
function mount() {
  const tab = document.getElementById("ordersTab");
  if (!tab || root()) return;
  const host = document.createElement("div"); host.id = ROOT_ID;
  tab.appendChild(host);
  tab.classList.add("elyon-orders-v2-active");
  bind(); render(); void refresh();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && document.getElementById("ordersTab")?.classList.contains("active") &&
      Date.now() - Date.parse(state.refreshedAt || 0) > 5 * 60 * 1000) void refresh();
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
else mount();
