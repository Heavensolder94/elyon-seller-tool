import {
  escapeHtml as h, normalizeEbayOrder, workflowStatus, paymentConfirmed,
  productForLine, estimatedOrderCosts, actualOrderProfit, summarizeOrders,
  visibleOrders, normalizeOperationInput, financeOrderCostHints, suggestRecordedCosts,
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
// Preview-only example orders, kept in memory. Never sent to any backend.
const DEMO = {
  orders: [
    normalizeEbayOrder({ orderId:"DEMO-1001", creationDate:new Date().toISOString(),
      orderPaymentStatus:"PAID", orderFulfillmentStatus:"NOT_STARTED",
      buyer:{username:"demo_kunde_01"}, fulfillmentStartInstructions:[{shippingStep:{shipTo:{fullName:"Beispielkunde A",contactAddress:{addressLine1:"Musterstraße 12",postalCode:"12345",city:"Musterstadt",countryCode:"DE"}}}}],
      pricingSummary:{total:{value:"59.90",currency:"EUR"}},
      lineItems:[{lineItemId:"d1",title:"USB-C Schreibtischlampe (Beispiel)",sku:"ELY-000001",quantity:1,lineItemCost:{value:"59.90"}}] }),
    normalizeEbayOrder({ orderId:"DEMO-1002", creationDate:new Date(Date.now()-86400000).toISOString(),
      orderPaymentStatus:"PAID", orderFulfillmentStatus:"NOT_STARTED",
      buyer:{username:"demo_kunde_02"}, pricingSummary:{total:{value:"32.50",currency:"EUR"}},
      lineItems:[{lineItemId:"d2",title:"Kabel-Organizer (Beispiel)",sku:"ELY-000002",quantity:2,lineItemCost:{value:"32.50"}}] }),
    normalizeEbayOrder({ orderId:"DEMO-1003", creationDate:new Date(Date.now()-2*86400000).toISOString(),
      orderPaymentStatus:"NOT_PAID", orderFulfillmentStatus:"NOT_STARTED",
      buyer:{username:"demo_kunde_03"}, pricingSummary:{total:{value:"89.00",currency:"EUR"}},
      lineItems:[{lineItemId:"d3",title:"Monitorhalterung (Beispiel)",sku:"ELY-000003",quantity:1,lineItemCost:{value:"89.00"}}] }),
  ],
  products:[
    {id:"demo-p1",articleNumber:"ELY-000001",title:"USB-C Schreibtischlampe",supplier:{name:"Demo-Lieferant A"},pricing:{buyPrice:24,shippingCost:4,estimatedFees:7}},
    {id:"demo-p2",articleNumber:"ELY-000002",title:"Kabel-Organizer",supplier:{name:"Demo-Lieferant B"},pricing:{buyPrice:6,shippingCost:2,estimatedFees:2}},
    {id:"demo-p3",articleNumber:"ELY-000003",title:"Monitorhalterung",supplier:{name:"Demo-Lieferant C"},pricing:{buyPrice:42,shippingCost:8,estimatedFees:10}},
  ],
  operations:{"DEMO-1002":{workflowStatus:"PROCESSING",supplierName:"Demo-Lieferant B"}},
  history:[],
  financeTransactions:[
    {id:"DEMO-PURCHASE-1",orderId:"DEMO-1001",category:"supplier_expense",amount:-24,currency:"EUR",status:"approved"},
    {id:"DEMO-SHIPPING-1",orderId:"DEMO-1001",category:"shipping_expense",amount:-4,currency:"EUR",status:"approved"},
    {id:"DEMO-EBAY-FEE-1",orderId:"DEMO-1001",category:"ebay_fee",amount:-7,currency:"EUR",status:"needs_review"},
    {id:"DEMO-PURCHASE-2",orderId:"DEMO-1002",category:"supplier_expense",amount:-12,currency:"EUR",status:"needs_review"},
  ],
};
const ordersNow = () => state.demoMode ? DEMO.orders : state.orders;
const operationsNow = () => state.demoMode ? DEMO.operations : state.operations;
const productsNow = () => state.demoMode ? DEMO.products : state.products;
const financeHintsNow = () => state.demoMode ? financeOrderCostHints(DEMO.financeTransactions) : state.financeCostHints;
const state = {
  orders: [], products: [], operations: {}, invoices: {}, revision: null,
  selectedId: "", filter: "all", query: "", days: 90, loading: false,
  saving: false, refreshedAt: "", error: "", warning: "", saveNotice: "",
  truncated: false, sourceReady: false, financeReady: false, drafts: {},
  demoMode: false, activeSection: "overview", demoModal: "", demoNotice: "", financeCostHints: {},
};
try { const v = Number(localStorage.getItem(RANGE_KEY)); if ([7, 30, 90].includes(v)) state.days = v; } catch {}

const root = () => document.getElementById(ROOT_ID);
const opFor = (id) => obj(operationsNow()[id]);
const statusOf = (order) => workflowStatus(order, opFor(order.id));
const readableMoney = (val, curr = "EUR") => val === null || val === undefined ? "Noch offen" : money(val, curr);
const cleanAttr = (value) => h(value);
function labelForLine(line) {
  const p = productForLine(line, productsNow());
  return p ? `<span class="ocv2-match">✓ ${h(p.articleNumber || p.sku || p.id)} · ${h(p.title || "")}</span>` :
    '<span class="ocv2-unknown">Keine eindeutige Company-OS-Zuordnung</span>';
}
function statsCard(label, value, filter = "all") {
  return `<button type="button" data-ocv2-filter="${filter}" class="ocv2-stat ${state.filter===filter?"active":""}" aria-pressed="${state.filter===filter}"><small>${h(label)}</small><strong>${h(value)}</strong></button>`;
}
function rowMarkup(order) {
  const status = statusOf(order);
  const first = order.lines[0];
  const title = first?.title || "eBay-Bestellung";
  const more = order.lines.length > 1 ? ` + ${order.lines.length - 1} weitere` : "";
  const qty = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  const selected = state.selectedId === order.id;
  const dateLabel = date(order.createdAt);
  return `<button type="button" class="ocv2-order ocv4-order-row ${selected ? "is-selected" : ""}"
      data-order-open="${cleanAttr(order.id)}" aria-pressed="${selected}"
      aria-label="Bestellung ${h(order.id)} öffnen: ${h(title)}">
    <span class="ocv4-order-product">
      <strong>${h(title + more)}</strong>
      <small>${h(order.id)} · ${h(String(qty))} Stk.</small>
      <small class="ocv4-mobile-meta">${h(order.buyerRef || "Käufer unbekannt")} · ${h(dateLabel)}</small>
    </span>
    <span class="ocv4-buyer" title="${h(order.buyerRef || "")}">${h(order.buyerRef || "–")}</span>
    <span class="ocv4-date">${h(dateLabel)}</span>
    <span class="ocv4-amount">${h(money(order.total, order.currency))}</span>
    <span class="ocv4-status ocv4-status--${h(status)}"><span class="ocv4-status-dot" aria-hidden="true"></span>${h(statusLabels[status] || status)}</span>
  </button>`;
}
const SECTION_TABS = [["overview","Überblick"],["supplier","Lieferant"],["shipping","Versand"],["finance","Finanzen"]];
function sectionNav() {
  return `<nav class="ocv2-detail-tabs" aria-label="Bestellbereiche">${SECTION_TABS.map(([key,label]) =>
    `<button type="button" data-ocv2-section="${key}" class="${state.activeSection===key?"active":""}" aria-pressed="${state.activeSection===key}">${label}</button>`).join("")}</nav>`;
}
function progressMarkup(order, op) {
  const steps = [["NEW","Eingang"],["PROCESSING","Bearbeitung"],["SUPPLIER_ORDERED","Lieferant"],["SHIPPED","Versand"],["COMPLETED","Fertig"]];
  const current = text(op.workflowStatus || op.status || (order.fulfillmentStatus==="FULFILLED" ? "SHIPPED":"NEW")).toUpperCase();
  const index = Math.max(0, steps.findIndex(([id]) => id===current));
  const finished = current === "COMPLETED";
  return `<div class="ocv2-progress" aria-label="${finished ? "Bestellung abgeschlossen" : "Interner Bestellablauf"}">${steps.map(([id,label],i) => {
    const done = i < index || (finished && i === index);
    return `<button type="button" data-ocv2-phase="${id}" aria-label="Internen Schritt ${h(label)} auswählen" aria-current="${!finished && index===i?"step":"false"}" class="${done?"done":i===index?"current":""}"><span class="ocv2-dot">${done?"✓":i+1}</span><span>${h(label)}</span></button>`;
  }).join("")}</div>`;
}
function nextActionMarkup(order) {
  const status = statusOf(order);
  const actions = {
    new:["Lieferant und EK prüfen","supplier"],
    processing:["Lieferantenbestellung dokumentieren","supplier"],
    supplier_ordered:["Versand und Tracking vorbereiten","shipping"],
    shipped:["Kosten und Ergebnis kontrollieren","finance"],
    completed:["Rechnungsstand prüfen","finance"],
    issue:["Problemfall dokumentieren","supplier"],
    awaiting_payment:["Erst eBay-Zahlung prüfen","overview"],
    cancelled:["Stornierung prüfen","overview"],
  };
  const [label,section] = actions[status] || actions.new;
  return `<div class="ocv2-next"><span><small>Nächster Schritt</small><strong>${h(label)}</strong></span>
    <button type="button" data-ocv2-section="${section}">Öffnen →</button></div>`;
}
function detailsMarkup(order) {
  const op = { ...opFor(order.id), ...obj(state.drafts[order.id]) };
  const status = statusOf(order);
  const estimated = estimatedOrderCosts(order, productsNow());
  const costHints = obj(financeHintsNow()[order.id]);
  const autoCost = suggestRecordedCosts(op, costHints);
  const calculatedOp = autoCost.values;
  const hasUnconfirmedFinanceCosts = Object.keys(autoCost.sources).length > 0;
  const actualProfit = state.drafts[order.id] ? null : actualOrderProfit(order, opFor(order.id));
  const financePreviewProfit = actualOrderProfit(order, calculatedOp);
  const estimatedProfit = estimated && [estimated.purchase, estimated.shipping, estimated.fees].every(Number.isFinite)
    && order.currency === "EUR"
    ? Math.round((order.total - estimated.purchase - estimated.shipping - estimated.fees) * 100) / 100
    : null;
  const profit = actualProfit ?? financePreviewProfit ?? estimatedProfit;
  const profitStage = actualProfit !== null ? "confirmed"
    : financePreviewProfit !== null ? "finance_preview"
    : estimatedProfit !== null ? "estimate" : "missing";
  const profitHeadline = {
    confirmed: state.demoMode ? "Ergebnis nach übernommenen Demo-Kosten" : "Ergebnis nach gespeicherten Ist-Kosten",
    finance_preview: "Vorläufiges Ergebnis aus Finanzbuchungen",
    estimate: "Geschätzter Gewinn aus Company OS",
    missing: "Gewinn noch nicht berechenbar"
  }[profitStage];
  const profitHelp = profitStage === "confirmed" ? "Weitere Werbung, Retouren und Ausgaben bitte separat prüfen."
    : profitStage === "finance_preview" ? "Automatisch zugeordnete Buchungen müssen noch geprüft und gespeichert werden. Zusätzliche Kosten können fehlen."
    : profitStage === "estimate" ? "Nur eine Prognose auf Basis der Company-OS-Kalkulation. Kein bestätigter Gewinn."
    : "Noch nicht alle Ist-Kosten vorhanden. Vorschläge werden nur bei eindeutiger Bestellzuordnung angezeigt.";
  const lines = order.lines.length ? order.lines.map((line) => `<div class="ocv2-line">
    <div><strong>${h(line.title)}</strong><span class="ocv2-small">SKU: ${h(line.sku || "Nicht angegeben")} · ${h(line.quantity)} Stk. · ${h(readableMoney(line.total, order.currency))}</span>
    ${labelForLine(line)}</div></div>`).join("") : '<p class="ocv2-muted">Keine Artikelpositionen übermittelt.</p>';
  const products = order.lines.map((line) => productForLine(line, productsNow())).filter(Boolean);
  const supplierGuess = products.length === order.lines.length && products.length &&
    products.every((p) => text(p.supplier?.name || p.product?.supplier?.name) === text(products[0].supplier?.name || products[0].product?.supplier?.name)) ?
    text(products[0].supplier?.name || products[0].product?.supplier?.name) : "";
  const help = estimated ? `<p class="ocv2-hint">Company OS: geschätzter EK ${h(readableMoney(estimated.purchase))}, Versand ${h(readableMoney(estimated.shipping))}, Gebühren ${h(readableMoney(estimated.fees))}. Diese Werte sind <strong>keine Ist-Kosten</strong>.</p>` :
    '<p class="ocv2-hint">Keine vollständigen Company-OS-Kostenschätzungen vorhanden. Bitte Lieferantenkosten prüfen.</p>';
  const fields = [
    ["purchaseCost", "Tatsächlicher Einkauf €"],
    ["shippingCost", "Tatsächlicher Versand €"],
    ["feeCost", "Tatsächliche eBay-Gebühren €"],
  ].map(([name, label]) => {
    const value = calculatedOp[name];
    const source = autoCost.sources[name];
    const provenance = source ? `<small class="ocv2-cost-provenance">${source.approved ? "Automatisch aus geprüfter Finanzbuchung" : "Automatisch aus Finanzbuchung · noch prüfen"}${state.demoMode ? " · DEMO" : ""}</small>` : "";
    return `<label>${h(label)}<input type="number" min="0" step="0.01" name="${name}" value="${value !== null && value !== undefined ? h(value) : ""}" placeholder="Noch kein Ist-Betrag">${provenance}</label>`;
  }).join("");
  const costHintCount = Object.keys(autoCost.sources).length;
  const sourceInfo = costHintCount
    ? `<div class="ocv2-cost-import"><strong>${h(costHintCount)} von 3 Kostenpositionen automatisch vorgeschlagen</strong>
      <span>${state.demoMode ? "Simulierte" : "Gespeicherte"} Finanzbuchungen wurden anhand der genauen Bestellnummer zugeordnet. Die Werte stehen bereits in den Feldern, werden aber erst mit „Interne Angaben sichern“ bestätigt.</span></div>`
    : '<p class="ocv2-hint">Noch keine passenden tatsächlichen Kostenbuchungen vorhanden. Die Company-OS-Schätzung bleibt separat als Prognose sichtbar.</p>';
  const invoice = state.invoices[order.id];
  const addr = obj(order.shippingAddress);
  const addressParts = [addr.recipient, addr.street, addr.extra,
    [addr.postalCode, addr.city].filter(Boolean).join(" "), addr.country].filter(Boolean);
  const shippingAddress = addressParts.length > 1 ?
    `<h4>Lieferadresse laut eBay</h4><div class="ocv2-address">${addressParts.map(h).join("<br>")}
    <p class="ocv2-hint">Vor dem Einkauf beim Lieferanten mit dem eBay-Auftrag abgleichen.</p></div>` : "";
  return `<div class="ocv2-details-head"><div><small>eBay-Bestellung</small><h3>${h(order.id)}</h3></div><span class="ocv2-state ocv2-state--${h(status)}">${h(statusLabels[status] || status)}</span></div>
    ${progressMarkup(order, op)}
    ${sectionNav()}
    <section class="ocv2-pane" data-pane="overview" ${state.activeSection!=="overview"?"hidden":""}>
    ${nextActionMarkup(order)}
    <div class="ocv2-details-meta"><span>${h(date(order.createdAt))}</span><strong>${h(money(order.total, order.currency))}</strong></div>
    <div class="ocv2-chips"><span>Bezahlung: ${h(order.paymentStatus)}</span><span>eBay-Versand: ${h(order.fulfillmentStatus)}</span>
    <span>Rechnung: ${invoice ? h(invoice.invoiceNumber) : "noch keine"}</span></div>
    ${!paymentConfirmed(order) ? '<p class="ocv2-alert">eBay meldet die Bestellung nicht als vollständig bezahlt. Vor einem Einkauf bitte überprüfen.</p>' : ""}
    <h4>Artikel & Produktverknüpfungen</h4><div class="ocv2-lines">${lines}</div>
    ${shippingAddress}
    </section>
    <form id="ocv2OrderForm" data-order-id="${cleanAttr(order.id)}">
      <section class="ocv2-pane" data-pane="supplier" ${state.activeSection!=="supplier"?"hidden":""}>
      <h4>Lieferant und Bearbeitung</h4>
      <div class="ocv2-fields"><label>Interner Bearbeitungsstatus<select name="workflowStatus">${phaseOptions.map(([id, label]) =>
        `<option value="${id}" ${(op.workflowStatus || (order.fulfillmentStatus === "FULFILLED" || op.status === "SHIPPED" ? "SHIPPED" : "NEW")) === id ? "selected" : ""}>${h(label)}</option>`).join("")}</select></label>
        <label>Lieferant<input name="supplierName" maxlength="160" value="${h(op.supplierName || "")}" placeholder="${h(supplierGuess || "Lieferant eintragen")}"></label>
        <label>Lieferanten-Bestellnummer<input name="supplierOrderId" maxlength="160" value="${h(op.supplierOrderId || "")}" placeholder="Nach deinem Einkauf eintragen"></label>
      </div></section>
      <section class="ocv2-pane" data-pane="shipping" ${state.activeSection!=="shipping"?"hidden":""}>
      <h4>Versand vorbereiten</h4>
      <p class="ocv2-hint">Die Sendungsdaten sind zunächst nur intern. eBay wird nicht automatisch benachrichtigt.</p>
      <div class="ocv2-fields">
        <label>Versanddienstleister<input name="carrier" maxlength="80" value="${h(op.carrier || "")}" placeholder="z. B. DHL"></label>
        <label>Trackingnummer<input name="trackingNumber" maxlength="120" value="${h(op.trackingNumber || "")}" placeholder="Sendungsnummer"></label>
      </div></section>
      <section class="ocv2-pane" data-pane="finance" ${state.activeSection!=="finance"?"hidden":""}>
      <h4>Kosten und Gewinn</h4>
      ${help}
      ${sourceInfo}
      <div class="ocv2-fields ocv2-cost-fields">${fields}</div>
      <div class="ocv2-profit ${profit === null ? "is-open" : profit < 0 ? "is-loss" : ""} ${profitStage !== "confirmed" ? "is-provisional" : ""}"><span data-ocv2-profit-label>${h(profitHeadline)}</span><strong>${profit === null ? "Noch nicht berechenbar" : h(money(profit))}</strong>
        <small data-ocv2-profit-help>${h(profitHelp)}</small></div>
      </section>
      <label class="ocv2-note">Interne Notiz<textarea name="note" rows="3" maxlength="1600" placeholder="Liefertermin, Sonderfall, Einkauf prüfen …">${h(op.note || "")}</textarea></label>
      <div class="ocv2-details-actions"><button type="submit" class="ocv2-primary" ${state.saving || (!state.financeReady && !state.demoMode) ? "disabled" : ""}>${state.saving ? "Speichert…" : state.demoMode ? "Demo-Änderung übernehmen" : "Interne Angaben sichern"}</button>
        <button type="button" data-order-shipping>Versand öffnen</button><button type="button" data-order-invoice>Rechnung öffnen</button></div>
      ${state.demoMode ? '<div class="ocv2-demo-note">Demo: Kein API-Aufruf, keine Bestellung beim Lieferanten, kein eBay-Update.</div>' : ""}
      ${state.demoMode && DEMO.history.length ? `<div class="ocv2-demo-history"><strong>Letzte Demo-Aktionen</strong>${DEMO.history.slice(0,3).map((entry) => `<span>• ${h(entry)}</span>`).join("")}</div>` : ""}
      <p class="ocv2-hint">Interne Angaben werden revisionsgeschützt gespeichert. Kein automatischer Lieferantenkauf, keine eBay-Versandmeldung und keine Rechnungsausstellung.</p>
    </form>`;
}
// All demonstration dialogs are local UI only. Never create invoice numbers or call any API.
const demoInvoiceChecks = new Set();
function demoModalMarkup() {
  if (!state.demoMode || !["shipping", "invoice"].includes(state.demoModal)) return "";
  const order = DEMO.orders.find((item) => item.id === state.selectedId);
  if (!order) return "";
  const draft = { ...obj(DEMO.operations[order.id]), ...obj(state.drafts[order.id]) };
  const shipping = state.demoModal === "shipping";
  const address = obj(order.shippingAddress);
  const addressLines = [address.recipient, address.street, address.extra,
    [address.postalCode, address.city].filter(Boolean).join(" "), address.country].filter(Boolean);
  const rows = order.lines.map((line) =>
    `<tr><td>${h(line.title)}<span class="ocv2-small">SKU ${h(line.sku || "–")}</span></td>
      <td>${h(line.quantity)}</td><td>${h(line.total===null?"–":money(line.total,order.currency))}</td></tr>`).join("");
  const title = shipping ? "Versand simulieren" : "Rechnungsvorschau";
  const content = shipping ?
    `<p class="ocv2-hint">Du kannst Versanddienst und Tracking für die Beispielbestellung eingeben. Der Versandstatus ändert sich nur in der Demo.</p>
      <div class="ocv2-demo-panel"><strong>Versandadresse (Beispiel)</strong><p>${addressLines.length ? addressLines.map(h).join("<br>") : "Keine Beispieladresse hinterlegt."}</p></div>
      <form id="ocv2DemoShippingForm" data-demo-order="${h(order.id)}">
        <div class="ocv2-fields"><label>Versanddienstleister
          <select name="carrier" required><option value="">Bitte auswählen</option>
          ${["DHL","Hermes","DPD","GLS","UPS","Sonstige"].map((carrier) =>
            `<option value="${h(carrier)}" ${text(draft.carrier)===carrier?"selected":""}>${h(carrier)}</option>`).join("")}</select></label>
          <label>Beispiel-Trackingnummer<input name="trackingNumber" required maxlength="120" minlength="3"
            value="${h(draft.trackingNumber || "")}" placeholder="z. B. DEMO-TRACK-12345" /></label></div>
        ${!paymentConfirmed(order) ?
          '<p class="ocv2-alert">Zahlung offen: Die Simulation einer Versandbestätigung ist für diesen Auftrag gesperrt.</p>' : ""}
        <button type="submit" class="ocv2-primary" ${!paymentConfirmed(order)?"disabled":""}>Versand in Demo simulieren</button>
      </form>` :
    `<div class="ocv2-demo-panel"><strong>Belegstatus</strong><p>${demoInvoiceChecks.has(order.id)?
      "Rechnungsangaben in der Demo als geprüft markiert. Keine Rechnung ausgestellt.":
      "Noch nicht geprüft. Keine Rechnungsnummer vergeben."}</p></div>
      <div class="ocv2-invoice-sheet">
        <div class="ocv2-invoice-stamp">MUSTER · KEINE GÜLTIGE RECHNUNG</div>
        <div class="ocv2-invoice-top"><strong>ELYON · DEMO</strong><span>Rechnungsnummer: nicht vergeben</span></div>
        <p>Beispielkundenreferenz: ${h(order.buyerRef || "Demo-Kunde")}<br>
          eBay-Beispielbestellung: ${h(order.id)}<br>Datum der Beispielbestellung: ${h(date(order.createdAt))}</p>
        <table class="ocv2-invoice-table"><thead><tr><th>Position</th><th>Menge</th><th>Betrag laut eBay</th></tr></thead>
          <tbody>${rows}</tbody></table>
        <div class="ocv2-invoice-total"><span>eBay-Bestellsumme (Beispiel)</span><strong>${h(money(order.total,order.currency))}</strong></div>
        <p class="ocv2-hint">Dies ist ausschließlich eine interaktive Vorschau mit erfundenen Daten. Keine Steuerberechnung, keine Nummernvergabe und kein rechtsgültiger Beleg.</p>
      </div>
      <button type="button" class="ocv2-primary" data-demo-invoice-check>
        ${demoInvoiceChecks.has(order.id)?"Erneut als geprüft markieren":"Rechnungsdaten in Demo prüfen"}</button>`;
  return `<div class="ocv2-demo-overlay" role="presentation">
    <div class="ocv2-demo-dialog" role="dialog" aria-modal="true" aria-labelledby="ocv2DemoDialogTitle" tabindex="-1">
      <div class="ocv2-demo-dialog-head"><div><small>INTERAKTIVE DEMO · ${h(order.id)}</small>
        <h3 id="ocv2DemoDialogTitle">${title}</h3></div>
        <button type="button" data-demo-modal-close aria-label="Vorschau schließen">✕</button></div>
      <div class="ocv2-demo-dialog-body">${state.demoNotice?
        `<div class="ocv2-success" role="status">${h(state.demoNotice)}</div>`:""}
        ${content}</div>
      <div class="ocv2-demo-dialog-footer"><span>Keine echten Daten oder API-Aktionen</span>
        <button type="button" data-demo-modal-close>Zurück zur Bestellung</button></div>
    </div></div>`;
}
function openDemoModal(type) {
  if (!state.demoMode || !["shipping", "invoice"].includes(type)) return;
  state.demoModal = type;
  state.demoNotice = "";
  render();
  root()?.querySelector(".ocv2-demo-dialog")?.focus();
}
function closeDemoModal() {
  state.demoModal = "";
  state.demoNotice = "";
  render();
  root()?.querySelector('[data-order-shipping]')?.focus();
}
function submitDemoShipping(form) {
  if (!state.demoMode || state.demoModal !== "shipping") return;
  const order = DEMO.orders.find((item) => item.id === form.dataset.demoOrder && item.id === state.selectedId);
  if (!order || !paymentConfirmed(order)) return;
  const values = Object.fromEntries(new FormData(form).entries());
  const carrier = text(values.carrier).slice(0, 80);
  const trackingNumber = text(values.trackingNumber).slice(0, 120);
  if (!["DHL","Hermes","DPD","GLS","UPS","Sonstige"].includes(carrier) || trackingNumber.length < 3) return;
  DEMO.operations[order.id] = { ...obj(DEMO.operations[order.id]), carrier, trackingNumber,
    workflowStatus:"SHIPPED" };
  // Clear only the draft fields we just simulated; other unsaved inputs stay untouched.
  if (state.drafts[order.id]) {
    state.drafts[order.id] = { ...state.drafts[order.id], carrier, trackingNumber, workflowStatus:"SHIPPED" };
  }
  DEMO.history.unshift("Demo-Versand für " + order.id + " simuliert (" + carrier + ")");
  state.demoNotice = "Versand in der Demo simuliert. Bei eBay wurde nichts gemeldet.";
  state.saveNotice = "Beispielbestellung intern als versendet markiert – nur Demo.";
  render();
  root()?.querySelector(".ocv2-demo-dialog")?.focus();
}

function render() {
  const host = root(); if (!host) return;
  const summary = summarizeOrders(ordersNow(), operationsNow());
  const rows = visibleOrders(ordersNow(), operationsNow(), { query: state.query, filter: state.filter });
  const selected = ordersNow().find((entry) => entry.id === state.selectedId);
  host.innerHTML = `<div class="ocv2-shell"><header class="ocv2-header">
      <div><span class="ocv2-kicker">ELYON · AUFTRAGSVERWALTUNG</span><h2>Bestellungen</h2>
      <p>Deine eBay-Verkäufe übersichtlich an einem Ort – Details nur, wenn du sie brauchst.</p></div>
      <div class="ocv2-header-actions"><button type="button" class="ocv2-demo-btn" id="ocv2DemoToggle">${state.demoMode ? "Demo beenden" : "Interaktive Demo starten"}</button><label>Zeitraum<select id="ocv2Range"><option value="7" ${state.days === 7 ? "selected" : ""}>7 Tage</option><option value="30" ${state.days === 30 ? "selected" : ""}>30 Tage</option><option value="90" ${state.days === 90 ? "selected" : ""}>90 Tage</option></select></label>
      <button type="button" class="ocv2-primary" id="ocv2Refresh" ${state.loading ? "disabled" : ""}>${state.loading && !state.demoMode ? "Wird geladen…" : state.demoMode ? "Echte Bestellungen anzeigen" : "Mit eBay abgleichen"}</button></div></header>
      ${state.demoMode ? '<div class="ocv2-demo-banner" role="status"><strong>INTERAKTIVE DEMO</strong> · Alle Bestellungen und Kunden sind erfunden. Änderungen bleiben nur in diesem Browser-Tab und werden nicht gespeichert.</div>' : ""}
      ${state.error ? `<p class="ocv2-alert" role="alert">${h(state.error)}</p>` : ""}
      ${state.warning ? `<p class="ocv2-warning">${h(state.warning)}</p>` : ""}
      ${state.saveNotice ? `<p class="ocv2-success" role="status">${h(state.saveNotice)}</p>` : ""}
      <div class="ocv2-stats">${statsCard("Alle Bestellungen", String(summary.total), "all")}${statsCard("Neu", String(summary.new), "new")}
        ${statsCard("Versand offen", String(summary.shipping), "shipping")}${statsCard("Prüfen", String(summary.issues), "issues")}</div>
      <div class="ocv2-content">
        <section class="ocv2-list-card"><div class="ocv2-list-header"><div><h3>Deine Bestellungen</h3>
          <span class="ocv2-small">${rows.length} angezeigt · ${summary.shipped} versendet/abgeschlossen
            ${state.refreshedAt ? " · Aktualisiert " + h(date(state.refreshedAt)) : ""}</span></div>
          <input id="ocv2Search" aria-label="Bestellungen durchsuchen" value="${h(state.query)}" placeholder="Bestellung, Artikel, SKU suchen …" type="search"></div>
          <nav class="ocv2-filters" aria-label="Bestellstatus">
          ${[["all", "Alle"], ["new", "Neu"], ["processing", "Bearbeitung"], ["shipping", "Versand offen"], ["shipped", "Versendet"], ["issues", "Prüfen"]].map(([id, label]) =>
            `<button type="button" data-ocv2-filter="${id}" class="${state.filter === id ? "active" : ""}">${label}</button>`).join("")}</nav>
          <div class="ocv3-order-list-header ocv4-order-head" aria-hidden="true"><span>Bestellung / Artikel</span><span>Käufer</span><span>Bestelldatum</span><span>Betrag</span><span>Status</span></div><div class="ocv2-order-list">${!state.sourceReady && !state.loading && !state.demoMode ? '<div class="ocv2-empty"><strong>Bestellungen laden oder Demo ausprobieren</strong><span>Die Demo funktioniert ohne Verkäufe und verändert keine Daten.</span><button type="button" data-ocv2-demo-start>Demo ausprobieren →</button></div>' :
            !rows.length ? `<div class="ocv2-empty"><strong>${state.loading ? "Bestellungen werden geladen…" : "Keine passenden Bestellungen"}</strong>
            <span>${state.loading ? "eBay wird gelesen." : "Im gewählten Zeitraum liegen keine passenden Aufträge vor."}</span>${!state.loading && !state.demoMode && !state.query && state.filter==="all" ? '<button type="button" data-ocv2-demo-start>Mit Beispielbestellungen testen →</button>' : ""}</div>` :
            rows.map(rowMarkup).join("")}</div></section>
        <section class="ocv2-detail-card ${selected ? "ocv3-drawer-open" : "ocv3-drawer-closed"}" id="ocv2Details"
          ${selected ? 'role="dialog" aria-modal="true" aria-labelledby="ocv3DrawerLabel"' : 'aria-hidden="true"'}>
          ${selected ? `<button type="button" class="ocv3-drawer-backdrop" data-ocv3-drawer-close
              aria-label="Bestelldetails schließen"></button>
            <div class="ocv3-drawer-content" tabindex="-1">
              <div class="ocv3-drawer-top"><div><small>BESTELLDETAILS</small>
                <strong id="ocv3DrawerLabel">${h(selected.id)}</strong></div>
                <button type="button" data-ocv3-drawer-close class="ocv3-drawer-close" aria-label="Schließen">✕</button></div>
              ${detailsMarkup(selected)}
            </div>` : ""}
        </section></div></div>`;
  host.insertAdjacentHTML("beforeend", demoModalMarkup());
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
    state.financeCostHints = obj(finance.value.financeCostHints);
    state.invoices = obj(finance.value.invoices);
    state.revision = Number.isSafeInteger(finance.value.revision) ? finance.value.revision : null;
    state.financeReady = finance.value.persistent === true && state.revision !== null;
    if (!state.financeReady) state.warning += " Der dauerhafte Finance-Speicher ist nicht verfügbar; internes Speichern bleibt gesperrt.";
  } else {
    state.financeReady = false; state.revision = null; state.operations = {}; state.invoices = {}; state.financeCostHints = {};
    state.warning += " Interne Bestelldaten konnten nicht geladen werden; Speichern ist aus Sicherheitsgründen gesperrt.";
  }
  if (product.status === "fulfilled") {
    state.products = Array.isArray(product.value.products) ? product.value.products : [];
  } else {
    state.products = [];
    state.warning += " Company OS konnte nicht geladen werden; Produktverknüpfungen sind vorübergehend nicht verfügbar.";
  }
  if (!state.demoMode && state.selectedId && !state.orders.some((order) => order.id === state.selectedId)) state.selectedId = "";
  state.loading = false; render();
}
async function save(form) {
  const id = form.dataset.orderId;
  if (state.demoMode) {
    if (!DEMO.orders.some((order) => order.id === id)) return;
    DEMO.operations[id] = { ...opFor(id), ...normalizeOperationInput(Object.fromEntries(new FormData(form).entries())) };
    delete state.drafts[id];
    DEMO.history.unshift("Bestellung " + id + " · Angaben in der Demo übernommen");
    state.saveNotice = "Demo aktualisiert. Es wurden keine echten Daten gespeichert.";
    state.error = ""; state.warning = "";
    render();
    return;
  }
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
function openDemo() {
  if (!state.demoMode && Object.keys(state.drafts).some((id) => !id.startsWith("DEMO-"))) {
    state.warning = "Bitte ungespeicherte echte Bestelländerungen zuerst speichern oder die Seite neu laden."; render(); return;
  }
  state.demoMode = true; state.demoModal = ""; state.demoNotice = ""; state.query = ""; state.filter = "all";
  state.selectedId = ""; state.activeSection = "overview";
  state.error = ""; state.warning = ""; state.saveNotice = ""; render();
}
function closeDemo() {
  if (!state.demoMode) return;
  state.demoMode = false;
  state.demoModal = "";
  state.demoNotice = "";
  for (const id of Object.keys(state.drafts)) if (id.startsWith("DEMO-")) delete state.drafts[id];
  state.selectedId = ""; state.activeSection = "overview";
  state.filter = "all"; state.query = ""; state.error = ""; state.warning = "";
  state.saveNotice = "Demo beendet. Es wurden keine echten eBay- oder Finanzdaten geändert.";
  render();
}
function closeOrderDrawer() {
  const previousId = state.selectedId;
  state.selectedId = "";
  state.activeSection = "overview";
  state.saveNotice = "";
  render();
  const source = [...(root()?.querySelectorAll("[data-order-open]") || [])].find((button) => button.dataset.orderOpen === previousId);
  source?.focus();
}
function changeSection(name) {
  if (!SECTION_TABS.some(([id]) => id === name)) return;
  state.activeSection = name; render();
}
function choosePhase(next) {
  const order = ordersNow().find((entry) => entry.id === state.selectedId);
  const allowed = phaseOptions.some(([id]) => id === next);
  if (!order || !allowed || state.saving) return;
  if (!paymentConfirmed(order) && ["PROCESSING","SUPPLIER_ORDERED","SHIPPED","COMPLETED"].includes(next)) {
    state.warning = "eBay meldet noch keine vollständige Zahlung. Bearbeitung beim Lieferanten erst nach Zahlungsprüfung fortsetzen.";
    render(); return;
  }
  state.warning = "";
  if (state.demoMode) {
    DEMO.operations[order.id] = { ...opFor(order.id), workflowStatus: next };
    DEMO.history.unshift("Bestellung " + order.id + " · Schritt: " + (phaseOptions.find(([id]) => id===next)?.[1] || next));
    state.saveNotice = "Demo-Schritt geändert – kein echter Bestellstatus aktualisiert.";
  } else {
    state.drafts[order.id] = { ...opFor(order.id), ...obj(state.drafts[order.id]), workflowStatus: next };
    state.saveNotice = "Interner Status vorgemerkt. Zum Übernehmen bitte »Interne Angaben sichern« wählen.";
  }
  if (next === "SUPPLIER_ORDERED" || next === "PROCESSING") state.activeSection = "supplier";
  else if (next === "SHIPPED") state.activeSection = "shipping";
  else if (next === "COMPLETED") state.activeSection = "finance";
  render();
}
function updateLiveProfit(form) {
  const order = ordersNow().find((entry) => entry.id === form.dataset.orderId);
  const indicator = form.querySelector(".ocv2-profit");
  if (!order || !indicator) return;
  const operation = { ...opFor(order.id), ...obj(state.drafts[order.id]) };
  const profit = actualOrderProfit(order, operation);
  const strong = indicator.querySelector("strong");
  const label = indicator.querySelector("[data-ocv2-profit-label]");
  const help = indicator.querySelector("[data-ocv2-profit-help]");
  if (strong) strong.textContent = profit === null ? "Noch nicht berechenbar" : money(profit);
  if (label) label.textContent = profit === null
    ? "Gewinn noch nicht berechenbar" : "Vorschau nach deinen Änderungen";
  if (help) help.textContent = "Änderungen noch nicht gespeichert. Bitte Ist-Kosten vor dem Sichern prüfen.";
  indicator.classList.toggle("is-open", profit === null);
  indicator.classList.toggle("is-loss", profit !== null && profit < 0);
  indicator.classList.add("is-provisional");
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
    if (event.target.closest("[data-ocv3-drawer-close]")) return closeOrderDrawer();
    if (event.target.closest("[data-demo-modal-close]")) return closeDemoModal();
    if (event.target.closest("[data-demo-invoice-check]") && state.demoMode && state.demoModal === "invoice") {
      const order = DEMO.orders.find((item) => item.id === state.selectedId);
      if (!order) return;
      demoInvoiceChecks.add(order.id);
      DEMO.history.unshift("Demo-Rechnungsangaben für " + order.id + " geprüft (kein Beleg erstellt)");
      state.demoNotice = "Demo-Rechnungsangaben geprüft. Es wurde keine echte Rechnung erstellt.";
      return render();
    }
    if (event.target.closest("#ocv2DemoToggle")) return state.demoMode ? closeDemo() : openDemo();
    if (event.target.closest("[data-ocv2-demo-start]")) return openDemo();
    const tab = event.target.closest("[data-ocv2-section]");
    if (tab) return changeSection(tab.dataset.ocv2Section);
    const phase = event.target.closest("[data-ocv2-phase]");
    if (phase) return choosePhase(phase.dataset.ocv2Phase);
    if (event.target.closest("#ocv2Refresh")) return state.demoMode ? closeDemo() : refresh();
    const choose = event.target.closest("[data-order-open]");
    if (choose) { state.selectedId = choose.dataset.orderOpen; state.activeSection = "overview"; state.saveNotice = ""; render(); root()?.querySelector(".ocv3-drawer-content")?.focus(); return; }
    const filter = event.target.closest("[data-ocv2-filter]");
    if (filter) { state.filter = filter.dataset.ocv2Filter; return render(); }
    if (event.target.closest("[data-order-invoice]")) {
      if (state.demoMode) return openDemoModal("invoice");
      if (window.ElyonSellerFinance?.openInvoices) window.ElyonSellerFinance.openInvoices();
      else goToTab("financeTab");
    }
    if (event.target.closest("[data-order-shipping]")) {
      if (state.demoMode) return openDemoModal("shipping");
      goToTab("automationTab");
    }
  });
  host.addEventListener("input", (event) => {
    if (event.target.closest("#ocv2OrderForm")) {
      const form = event.target.closest("#ocv2OrderForm");
      state.drafts[form.dataset.orderId] = Object.fromEntries(new FormData(form).entries());
      updateLiveProfit(form);
      return;
    }
    if (event.target.id !== "ocv2Search") return;
    const value = event.target.value, pos = event.target.selectionStart;
    state.query = value;
    const list = host.querySelector(".ocv2-order-list");
    if (!list) return;
    const rows = visibleOrders(ordersNow(), operationsNow(), { query: value, filter: state.filter });
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
    if (event.target.id === "ocv2DemoShippingForm") {
      event.preventDefault();
      return submitDemoShipping(event.target);
    }
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
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.demoMode && state.demoModal) {
      event.preventDefault();
      closeDemoModal();
    } else if (event.key === "Escape" && state.selectedId) {
      event.preventDefault();
      closeOrderDrawer();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && document.getElementById("ordersTab")?.classList.contains("active") &&
      Date.now() - Date.parse(state.refreshedAt || 0) > 5 * 60 * 1000) void refresh();
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
else mount();
