const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const whole = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });
const dateTime = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const DASHBOARD_ID = "elyonSellerDashboard";
const DASHBOARD_STYLE_ID = "elyonSellerDashboardStyles";
const ROLE_BANNER_ID = "elyonSellerRoleBanner";
const RANGE_KEY = "elyonSellerDashboardRange";
const WORKING_PRODUCTS_KEY = "elyonProducts";
export const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const FOCUS_REFRESH_COOLDOWN_MS = 60 * 1000;

const runtime = {
  days: readRange(),
  loading: false,
  refreshedAt: null,
  productPayload: null,
  orderPayload: null,
  ebayStatus: null,
  errors: {},
};

let autoRefreshInstalled = false;
let autoRefreshTimer = null;

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const money = (value) => euro.format(number(value));
const count = (value) => whole.format(number(value));
const percent = (value) => `${decimal.format(number(value))} %`;

function escapeHtml(value) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function asDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formattedDate(value) {
  const date = asDate(value);
  return date ? dateTime.format(date) : "–";
}

function readRange() {
  try {
    const value = Number(localStorage.getItem(RANGE_KEY));
    return [7, 30, 90].includes(value) ? value : 30;
  } catch {
    return 30;
  }
}

function storeRange(value) {
  try { localStorage.setItem(RANGE_KEY, String(value)); } catch {}
}

function workingCopyCount() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WORKING_PRODUCTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function productItemIds(product) {
  const listing = product?.listing || {};
  const raw = product?.raw || {};
  return [
    listing.ebayItemId,
    product?.ebayItemId,
    product?.listingId,
    raw?.ebayItemId,
    raw?.listing?.ebayItemId,
  ].map(text).filter(Boolean);
}

function isOnlineListingStatus(status) {
  return ["live", "active", "published", "listed", "manually_listed", "online"].includes(text(status).toLowerCase());
}

export function normalizeSellerProduct(product = {}) {
  const pricing = product.pricing || {};
  const listing = product.listing || {};
  const readiness = product.readiness || {};
  const supplier = product.supplier || {};
  const logistics = product.logistics || {};
  const blockers = list(readiness.blockers).map(text).filter(Boolean);
  const itemIds = productItemIds(product);
  const status = text(listing.status || product.listingStatus || product.status || "draft").toLowerCase();
  const readinessState = text(readiness.state || "not_ready").toLowerCase();

  return {
    id: text(product.id || product.sellerToolMasterProductId || product.companyOsProductId),
    title: text(product.title || listing.title || product.name) || "Unbenanntes Produkt",
    source: text(product.source || "elyon_company_os"),
    supplier: text(supplier.name || product.supplierName || product.supplier) || "Lieferant offen",
    status,
    readinessState,
    readinessScore: number(readiness.score),
    blockers,
    itemIds,
    ebayItemId: itemIds[0] || "",
    salePrice: number(pricing.salePrice ?? product.salePrice ?? product.sellPrice),
    buyPrice: number(pricing.buyPrice ?? product.buyPrice ?? product.purchasePrice),
    profit: number(pricing.profit ?? pricing.realisticProfit ?? product.profit),
    margin: number(pricing.marginPercent ?? product.marginPercent ?? product.margin),
    isReady: readinessState === "ready_for_manual_listing" && blockers.length === 0,
    isLive: itemIds.length > 0 && isOnlineListingStatus(status),
    isListed: itemIds.length > 0 || isOnlineListingStatus(status),
    isDraft: itemIds.length === 0 && ["draft", "entwurf", "ready_for_manual_listing", "not_listed", "seller_draft", "ready_for_manual_ebay_draft"].includes(status),
    isEnded: ["ended", "beendet", "inactive", "paused"].includes(status),
    deliveryTime: text(logistics.deliveryTime || product.deliveryTime),
    returnAddress: text(logistics.returnAddress || product.returnAddress),
    updatedAt: product.updatedAt || product.receivedAt || product.createdAt || null,
    raw: product,
  };
}

function normalizeLineItem(item = {}) {
  return {
    itemId: text(item.legacyItemId || item.itemId || item.legacyItemID || item.sku || item.lineItemId),
    title: text(item.title || item.lineItemTitle || item.sku) || "eBay-Artikel",
    quantity: Math.max(1, number(item.quantity, 1)),
    // eBay Fulfillment API: lineItemCost is already unit price × quantity.
    lineTotal: number(item.lineItemCost?.value ?? item.total?.value ?? item.price?.value ?? item.price),
  };
}

export function normalizeEbayOrder(order = {}) {
  const pricing = order.pricingSummary || {};
  const lineItems = list(order.lineItems || order.items).map(normalizeLineItem);
  const fulfillmentStatus = text(order.orderFulfillmentStatus || order.fulfillmentStatus || order.status || "UNKNOWN").toUpperCase();
  const paymentStatus = text(order.orderPaymentStatus || order.paymentStatus || "UNKNOWN").toUpperCase();
  const total = number(pricing.total?.value ?? order.total?.value ?? order.total ?? order.orderTotal?.value);

  return {
    id: text(order.orderId || order.legacyOrderId || order.id) || "Unbekannte Bestellung",
    createdAt: order.creationDate || order.createdAt || order.orderDate || null,
    total,
    marketplaceFee: number(order.totalMarketplaceFee?.value ?? pricing.marketplaceFee?.value),
    fulfillmentStatus,
    paymentStatus,
    isFulfilled: ["FULFILLED", "SHIPPED", "COMPLETED"].includes(fulfillmentStatus),
    isCancelled: ["CANCELLED", "CANCELED"].includes(fulfillmentStatus) || ["CANCELLED", "CANCELED"].includes(paymentStatus),
    buyer: text(order.buyer?.username || order.buyer?.buyerRegistrationAddress?.fullName || order.buyerUsername) || "eBay-Kunde",
    lineItems,
    quantity: lineItems.reduce((sum, item) => sum + item.quantity, 0),
    raw: order,
  };
}

function buildProfitCoverage(orders, products) {
  const profitByItemId = new Map();
  products.forEach((product) => product.itemIds.forEach((id) => profitByItemId.set(id, product.profit)));
  let estimatedProfit = 0;
  let matched = 0;
  let total = 0;

  orders.filter((order) => !order.isCancelled).forEach((order) => {
    order.lineItems.forEach((item) => {
      total += 1;
      if (!profitByItemId.has(item.itemId)) return;
      estimatedProfit += number(profitByItemId.get(item.itemId)) * item.quantity;
      matched += 1;
    });
  });

  return { estimatedProfit, matched, total };
}

function buildTopProducts(orders, products) {
  const productByItemId = new Map();
  products.forEach((product) => product.itemIds.forEach((id) => productByItemId.set(id, product)));
  const rows = new Map();

  orders.filter((order) => !order.isCancelled).forEach((order) => {
    order.lineItems.forEach((item) => {
      const product = productByItemId.get(item.itemId);
      if (!product) return;
      const current = rows.get(product.id) || { product, revenue: 0, quantity: 0, estimatedProfit: 0 };
      current.revenue += item.lineTotal > 0 ? item.lineTotal : product.salePrice * item.quantity;
      current.quantity += item.quantity;
      current.estimatedProfit += product.profit * item.quantity;
      rows.set(product.id, current);
    });
  });

  const soldRows = [...rows.values()].sort((a, b) => b.revenue - a.revenue);
  if (soldRows.length) return soldRows.slice(0, 5);
  return [...products]
    .filter((product) => product.profit > 0 || product.margin > 0)
    .sort((a, b) => b.profit - a.profit || b.margin - a.margin)
    .slice(0, 5)
    .map((product) => ({ product, revenue: 0, quantity: 0, estimatedProfit: product.profit }));
}

export function buildRevenueBuckets(orders, days = 30, now = new Date()) {
  const bucketDays = days <= 7 ? 1 : days <= 30 ? 2 : 7;
  const bucketCount = Math.ceil(days / bucketDays);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = new Date(start);
    bucketStart.setDate(bucketStart.getDate() + index * bucketDays);
    const bucketEnd = new Date(bucketStart);
    bucketEnd.setDate(bucketEnd.getDate() + bucketDays - 1);
    return { start: bucketStart, end: bucketEnd, revenue: 0, orders: 0 };
  });

  orders.forEach((order) => {
    const created = asDate(order.createdAt);
    if (!created || order.isCancelled || created < start || created > now) return;
    const dayIndex = Math.floor((created.getTime() - start.getTime()) / 86400000);
    const index = Math.min(bucketCount - 1, Math.max(0, Math.floor(dayIndex / bucketDays)));
    buckets[index].revenue += order.total;
    buckets[index].orders += 1;
  });

  return buckets.map((bucket) => ({
    ...bucket,
    label: bucketDays === 1 ? shortDate.format(bucket.start) : `${shortDate.format(bucket.start)}–${shortDate.format(bucket.end)}`,
  }));
}

export function buildSellerDashboardMetrics({ products = [], orders = [], days = 30, ebayConnected = false } = {}) {
  const normalizedProducts = products.map(normalizeSellerProduct);
  const normalizedOrders = orders.map(normalizeEbayOrder);
  const activeOrders = normalizedOrders.filter((order) => !order.isCancelled);
  const listedProducts = normalizedProducts.filter((product) => product.isListed);
  const margins = normalizedProducts.map((product) => product.margin).filter((value) => value > 0);
  const coverage = buildProfitCoverage(activeOrders, normalizedProducts);

  return {
    days,
    ebayConnected,
    products: normalizedProducts,
    orders: normalizedOrders,
    activeOrders,
    revenue: activeOrders.reduce((sum, order) => sum + order.total, 0),
    marketplaceFees: activeOrders.reduce((sum, order) => sum + order.marketplaceFee, 0),
    orderCount: activeOrders.length,
    openOrders: activeOrders.filter((order) => !order.isFulfilled),
    fulfilledOrders: activeOrders.filter((order) => order.isFulfilled),
    readyProducts: normalizedProducts.filter((product) => product.isReady),
    blockedProducts: normalizedProducts.filter((product) => !product.isReady),
    liveProducts: normalizedProducts.filter((product) => product.isLive),
    listedProducts,
    draftProducts: normalizedProducts.filter((product) => product.isDraft),
    endedProducts: normalizedProducts.filter((product) => product.isEnded),
    averageMargin: margins.length ? margins.reduce((sum, value) => sum + value, 0) / margins.length : 0,
    listedProfitPerSale: listedProducts.reduce((sum, product) => sum + Math.max(0, product.profit), 0),
    estimatedOrderProfit: coverage.estimatedProfit,
    matchedLineItems: coverage.matched,
    totalLineItems: coverage.total,
    topProducts: buildTopProducts(activeOrders, normalizedProducts),
    buckets: buildRevenueBuckets(activeOrders, days),
    workingCopies: workingCopyCount(),
  };
}

export function buildSellerTasks(metrics, errors = {}) {
  const tasks = [];
  const add = (priority, title, detail, tab, tone = "info") => tasks.push({ priority, title, detail, tab, tone });

  if (errors.products) add(100, "Product Master nicht erreichbar", errors.products, "settingsTab", "danger");
  if (!metrics.ebayConnected) add(95, "eBay-Verbindung prüfen", "Ohne Verbindung können keine echten Bestellungen geladen werden.", "settingsTab", "danger");
  if (errors.orders) add(90, "Bestellungen konnten nicht geladen werden", errors.orders, "ordersTab", "warning");
  if (metrics.openOrders.length) add(85, `${metrics.openOrders.length} Bestellung${metrics.openOrders.length === 1 ? "" : "en"} offen`, "Versand, Tracking und Bearbeitungsstatus prüfen.", "ordersTab", "warning");
  if (metrics.blockedProducts.length) add(75, `${metrics.blockedProducts.length} Produkt${metrics.blockedProducts.length === 1 ? "" : "e"} blockiert`, "Fehlende Daten oder Company-OS-Freigaben prüfen.", "productListTab", "warning");
  if (metrics.readyProducts.length) add(65, `${metrics.readyProducts.length} Produkt${metrics.readyProducts.length === 1 ? " ist" : "e sind"} listingbereit`, "Paket kontrollieren und anschließend manuell bei eBay einstellen.", "ebayListingTab", "success");
  if (metrics.draftProducts.length) add(55, `${metrics.draftProducts.length} Listing-Entwurf${metrics.draftProducts.length === 1 ? "" : "e"}`, "Passiv vorgemerkt und noch nicht online.", "draftsTab", "info");
  if (!metrics.products.length && !errors.products) add(70, "Noch kein Seller-Produkt", "Ein final freigegebenes Produkt aus Company OS übernehmen.", "productListTab", "info");
  if (!metrics.orderCount && metrics.ebayConnected && !errors.orders) add(20, "Noch keine Verkäufe im Zeitraum", `In den letzten ${metrics.days} Tagen wurden keine eBay-Bestellungen gefunden.`, "ordersTab", "neutral");
  if (!tasks.length) add(10, "Keine dringenden Aufgaben", "Der Seller-Ablauf enthält aktuell keine offenen Warnungen.", "dashboardTab", "success");
  return tasks.sort((a, b) => b.priority - a.priority).slice(0, 7);
}

function blockerRows(products) {
  const counts = new Map();
  products.forEach((product) => product.blockers.forEach((blocker) => counts.set(blocker, (counts.get(blocker) || 0) + 1)));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
}

function installStyles() {
  if (document.getElementById(DASHBOARD_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = DASHBOARD_STYLE_ID;
  style.textContent = `
    #${DASHBOARD_ID}{display:grid;gap:16px}.sd-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap;padding:22px;border-radius:26px;background:linear-gradient(145deg,rgba(15,23,42,.96),rgba(30,41,59,.78));border:1px solid rgba(96,165,250,.2);box-shadow:0 22px 70px rgba(0,0,0,.2)}.sd-hero h2{margin:4px 0 7px;font-size:clamp(25px,4vw,38px);letter-spacing:-.045em}.sd-hero p{margin:0;max-width:760px;color:#cbd5e1;line-height:1.55;font-size:13px}.sd-actions,.sd-badges{display:flex;gap:8px;flex-wrap:wrap}.sd-badges{margin-top:14px}.sd-badge{padding:7px 10px;border-radius:999px;font-size:11px;font-weight:850;background:rgba(255,255,255,.05);border:1px solid rgba(148,163,184,.15);color:#cbd5e1}.sd-badge.good{color:#bbf7d0;border-color:rgba(34,197,94,.25);background:rgba(34,197,94,.09)}.sd-badge.warn{color:#fde68a;border-color:rgba(250,204,21,.25);background:rgba(250,204,21,.08)}.sd-badge.bad{color:#fecaca;border-color:rgba(239,68,68,.25);background:rgba(239,68,68,.08)}.sd-range{display:flex;gap:5px;padding:4px;border-radius:14px;background:rgba(2,6,23,.48);border:1px solid rgba(148,163,184,.14)}.sd-range button,.sd-actions>button{padding:10px 12px;font-size:12px;border-radius:12px}.sd-range button{background:transparent;border:0}.sd-range button.active{background:linear-gradient(135deg,#2563eb,#7c3aed)}
    .sd-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px}.sd-kpi{padding:17px;border-radius:20px;background:rgba(15,23,42,.78);border:1px solid rgba(148,163,184,.13);min-height:126px}.sd-kpi small{display:block;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.07em}.sd-kpi strong{display:block;margin:9px 0 6px;font-size:clamp(23px,2.5vw,32px);letter-spacing:-.045em}.sd-kpi span{display:block;color:#cbd5e1;font-size:11px;line-height:1.4}.sd-kpi.good strong{color:#86efac}.sd-kpi.warn strong{color:#fde68a}.sd-kpi.bad strong{color:#fca5a5}.sd-kpi-open{margin-top:10px;padding:7px 9px!important;font-size:10px!important;border-radius:10px!important}
    .sd-main{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(320px,.75fr);gap:16px}.sd-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.sd-panel{padding:18px;border-radius:22px;background:rgba(15,23,42,.74);border:1px solid rgba(148,163,184,.13);min-width:0}.sd-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}.sd-head h3{margin:0 0 5px;color:#e2e8f0}.sd-head p{margin:0;color:#94a3b8;font-size:12px;line-height:1.4}.sd-head button{padding:8px 10px;font-size:11px;border-radius:11px}
    .sd-chart{height:240px;display:flex;align-items:flex-end;gap:7px;padding:18px 10px 4px;border-radius:18px;background:rgba(2,6,23,.4);border:1px solid rgba(148,163,184,.1);overflow-x:auto}.sd-col{height:100%;min-width:24px;flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px}.sd-bar{width:min(34px,76%);min-height:3px;border-radius:8px 8px 3px 3px;background:linear-gradient(180deg,#60a5fa,#7c3aed)}.sd-col small{font-size:9px;color:#94a3b8;white-space:nowrap;transform:rotate(-35deg);margin:7px 0 4px}.sd-empty{margin:auto;padding:16px;color:#94a3b8;text-align:center;font-size:12px;line-height:1.5;border:1px dashed rgba(148,163,184,.18);border-radius:15px}
    .sd-list{display:grid;gap:9px}.sd-task,.sd-row{padding:12px 13px;border-radius:15px;background:rgba(2,6,23,.38);border:1px solid rgba(148,163,184,.1)}.sd-task{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:10px;align-items:start}.sd-dot{width:9px;height:9px;border-radius:999px;margin-top:4px;background:#60a5fa}.sd-task.danger .sd-dot{background:#ef4444}.sd-task.warning .sd-dot{background:#facc15}.sd-task.success .sd-dot{background:#22c55e}.sd-task strong,.sd-row strong{display:block;font-size:13px;color:#f8fafc}.sd-task p,.sd-row p{margin:4px 0 0;color:#94a3b8;font-size:11px;line-height:1.45}.sd-task button{padding:7px 9px;font-size:10px;border-radius:10px}.sd-row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.sd-meta{text-align:right;flex:0 0 auto}.sd-meta span{display:block;font-weight:850;font-size:12px}.sd-meta small{display:block;margin-top:4px;color:#94a3b8;font-size:10px}
    .sd-pipeline{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}.sd-step{padding:13px 10px;border-radius:16px;background:rgba(2,6,23,.38);border:1px solid rgba(148,163,184,.1);text-align:center}.sd-step strong{display:block;font-size:24px}.sd-step span{display:block;margin-top:5px;color:#94a3b8;font-size:10px}.sd-status{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:11px 12px;border-radius:14px;background:rgba(2,6,23,.38);border:1px solid rgba(148,163,184,.1)}.sd-status span{font-size:11px;color:#cbd5e1}.sd-status strong{font-size:12px;text-align:right}.sd-good{color:#86efac}.sd-warn{color:#fde68a}.sd-bad{color:#fca5a5}.sd-note{font-size:10px;color:#64748b;margin-top:10px;text-align:right}
    @media(max-width:1180px){.sd-main{grid-template-columns:1fr}.sd-two{grid-template-columns:1fr}.sd-pipeline{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:720px){.sd-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.sd-pipeline{grid-template-columns:repeat(2,minmax(0,1fr))}.sd-actions{width:100%}.sd-range{width:100%;display:grid;grid-template-columns:repeat(3,1fr)}.sd-task{grid-template-columns:10px minmax(0,1fr)}.sd-task button{grid-column:2;justify-self:start}}@media(max-width:430px){.sd-kpis{grid-template-columns:1fr}.sd-pipeline{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function chartMarkup(buckets) {
  const maximum = Math.max(0, ...buckets.map((bucket) => bucket.revenue));
  if (!maximum) return '<div class="sd-empty">Noch kein eBay-Umsatz im gewählten Zeitraum.<br>Das Diagramm füllt sich automatisch mit echten Bestellungen.</div>';
  return buckets.map((bucket) => {
    const height = Math.max(3, Math.round((bucket.revenue / maximum) * 190));
    return `<div class="sd-col" title="${escapeHtml(bucket.label)}: ${escapeHtml(money(bucket.revenue))} · ${bucket.orders} Bestellung(en)"><div class="sd-bar" style="height:${height}px"></div><small>${escapeHtml(bucket.label)}</small></div>`;
  }).join("");
}

function tasksMarkup(tasks) {
  return tasks.map((task) => `<article class="sd-task ${escapeHtml(task.tone)}"><span class="sd-dot"></span><div><strong>${escapeHtml(task.title)}</strong><p>${escapeHtml(task.detail)}</p></div>${task.tab && task.tab !== "dashboardTab" ? `<button type="button" class="secondary" data-sd-tab="${escapeHtml(task.tab)}">Öffnen</button>` : ""}</article>`).join("");
}

function ordersMarkup(orders) {
  const recent = [...orders].filter((order) => !order.isCancelled).sort((a, b) => (asDate(b.createdAt)?.getTime() || 0) - (asDate(a.createdAt)?.getTime() || 0)).slice(0, 6);
  if (!recent.length) return '<div class="sd-empty">Noch keine echten eBay-Bestellungen im gewählten Zeitraum.</div>';
  return recent.map((order) => `<article class="sd-row"><div><strong>${escapeHtml(order.buyer)}</strong><p>${escapeHtml(order.id)} · ${order.quantity} Artikel · ${escapeHtml(formattedDate(order.createdAt))}</p></div><div class="sd-meta"><span>${escapeHtml(money(order.total))}</span><small>${order.isFulfilled ? "Versendet" : "Offen"}</small></div></article>`).join("");
}

function productsMarkup(rows) {
  if (!rows.length) return '<div class="sd-empty">Noch keine Produktdaten für eine Auswertung vorhanden.</div>';
  return rows.map((row, index) => `<article class="sd-row"><div><strong>${index + 1}. ${escapeHtml(row.product.title)}</strong><p>${escapeHtml(row.product.supplier)} · ${percent(row.product.margin)} Marge · ${money(row.product.profit)} kalkulierter Gewinn je Verkauf</p></div><div class="sd-meta"><span>${row.quantity ? money(row.revenue) : money(row.product.salePrice)}</span><small>${row.quantity ? `${count(row.quantity)} verkauft` : "VK-Preis"}</small></div></article>`).join("");
}

function blockersMarkup(products) {
  const rows = blockerRows(products);
  if (!rows.length) return '<div class="sd-empty">Keine Produktblocker im aktuellen Product Master.</div>';
  return rows.map(([label, amount]) => `<div class="sd-status"><span>${escapeHtml(label)}</span><strong>${count(amount)}×</strong></div>`).join("");
}

function dashboardMarkup(metrics, tasks) {
  const storageReady = runtime.productPayload?.storage?.configured === true;
  const productState = runtime.errors.products ? "Fehler" : storageReady ? "Verbunden" : "Unbekannt";
  const orderState = runtime.errors.orders ? "Nicht verfügbar" : metrics.ebayConnected ? "Live" : "Nicht verbunden";
  const refreshed = runtime.refreshedAt ? formattedDate(runtime.refreshedAt) : "noch nicht geladen";
  const coverage = metrics.totalLineItems ? `${metrics.matchedLineItems}/${metrics.totalLineItems} Positionen zugeordnet` : "Noch keine Order-Positionen";

  return `<section id="${DASHBOARD_ID}">
    <header class="sd-hero" id="${ROLE_BANNER_ID}"><div><div class="badge">Elyon Seller Cockpit</div><h2>Dein Verkaufsbetrieb auf einen Blick</h2><p>Company OS liefert geprüfte Produkte und Listing-Pakete. Hier siehst du den echten Seller-Stand: Entwürfe, aktive Listings, eBay-Bestellungen, Umsatz, kalkulierten Gewinn, Blocker und die nächsten Schritte.</p><div class="sd-badges"><span class="sd-badge ${metrics.ebayConnected ? "good" : "bad"}">eBay ${metrics.ebayConnected ? "verbunden" : "nicht verbunden"}</span><span class="sd-badge ${storageReady ? "good" : runtime.errors.products ? "bad" : "warn"}">Product Master ${escapeHtml(productState)}</span><span class="sd-badge ${runtime.errors.orders ? "warn" : "good"}">Orders ${escapeHtml(orderState)}</span><span class="sd-badge" title="Wird beim Öffnen und danach alle 5 Minuten aktualisiert">Aktualisiert ${escapeHtml(refreshed)}</span></div></div><div class="sd-actions"><div class="sd-range">${[7,30,90].map((days) => `<button type="button" data-sd-range="${days}" class="${runtime.days === days ? "active" : ""}">${days} Tage</button>`).join("")}</div><button type="button" id="sdRefresh" class="secondary">${runtime.loading ? "Lädt …" : "Aktualisieren"}</button></div></header>
    <section class="sd-kpis">
      <article class="sd-kpi ${metrics.revenue ? "good" : ""}"><small>eBay-Umsatz · ${metrics.days} Tage</small><strong>${money(metrics.revenue)}</strong><span>Nur echte eBay-Bestellungen</span></article>
      <article class="sd-kpi"><small>Bestellungen</small><strong>${count(metrics.orderCount)}</strong><span>${count(metrics.fulfilledOrders.length)} abgeschlossen</span></article>
      <article class="sd-kpi ${metrics.openOrders.length ? "warn" : ""}"><small>Offene Bestellungen</small><strong>${count(metrics.openOrders.length)}</strong><span>Versand oder Bearbeitung offen</span></article>
      <article class="sd-kpi ${metrics.draftProducts.length ? "warn" : ""}"><small>Entwürfe</small><strong>${count(metrics.draftProducts.length)}</strong><span>Passiv · noch nicht online</span><button type="button" class="secondary sd-kpi-open" data-sd-tab="draftsTab">Entwürfe öffnen</button></article>
      <article class="sd-kpi ${metrics.liveProducts.length ? "good" : ""}"><small>Aktive Listings</small><strong>${count(metrics.liveProducts.length)}</strong><span>Online + eBay-Artikelnummer</span><button type="button" class="secondary sd-kpi-open" data-sd-tab="activeListingsTab">Aktive öffnen</button></article>
      <article class="sd-kpi ${metrics.readyProducts.length ? "good" : metrics.blockedProducts.length ? "warn" : ""}"><small>Listingbereit</small><strong>${count(metrics.readyProducts.length)}</strong><span>${count(metrics.blockedProducts.length)} Produktblocker</span></article>
      <article class="sd-kpi ${metrics.estimatedOrderProfit ? "good" : ""}"><small>Geschätzter Order-Gewinn</small><strong>${money(metrics.estimatedOrderProfit)}</strong><span>${escapeHtml(coverage)} · keine Buchhaltungszahl</span></article>
    </section>
    <section class="sd-main"><article class="sd-panel"><div class="sd-head"><div><h3>Umsatzentwicklung</h3><p>Echte eBay-Bestellungen im gewählten Zeitraum.</p></div><strong>${money(metrics.revenue)}</strong></div><div class="sd-chart">${chartMarkup(metrics.buckets)}</div></article><article class="sd-panel"><div class="sd-head"><div><h3>Nächste Aufgaben</h3><p>Automatisch priorisiert.</p></div></div><div class="sd-list">${tasksMarkup(tasks)}</div></article></section>
    <section class="sd-two"><article class="sd-panel"><div class="sd-head"><div><h3>Neueste Bestellungen</h3><p>Aktuelle eBay-Orders.</p></div><button type="button" class="secondary" data-sd-tab="ordersTab">Alle öffnen</button></div><div class="sd-list">${ordersMarkup(metrics.orders)}</div></article><article class="sd-panel"><div class="sd-head"><div><h3>Produktleistung</h3><p>Nach echtem Umsatz, sonst nach kalkuliertem Gewinn.</p></div><button type="button" class="secondary" data-sd-tab="productListTab">Produkte öffnen</button></div><div class="sd-list">${productsMarkup(metrics.topProducts)}</div></article></section>
    <section class="sd-two"><article class="sd-panel"><div class="sd-head"><div><h3>Seller-Pipeline</h3><p>Vom Product Master bis zum abgeschlossenen Verkauf.</p></div></div><div class="sd-pipeline"><div class="sd-step"><strong>${count(metrics.products.length)}</strong><span>Product Master</span></div><div class="sd-step"><strong>${count(metrics.readyProducts.length)}</strong><span>listingbereit</span></div><div class="sd-step"><strong>${count(metrics.draftProducts.length)}</strong><span>Entwürfe</span></div><div class="sd-step"><strong>${count(metrics.liveProducts.length)}</strong><span>aktiv</span></div><div class="sd-step"><strong>${count(metrics.openOrders.length)}</strong><span>Orders offen</span></div><div class="sd-step"><strong>${count(metrics.fulfilledOrders.length)}</strong><span>abgeschlossen</span></div></div><div class="sd-note">${count(metrics.workingCopies)} Arbeitskopie(n) · Ø Marge ${percent(metrics.averageMargin)} · kalkulierter Gewinn aller dokumentierten Listings je Einzelverkauf ${money(metrics.listedProfitPerSale)}</div></article><article class="sd-panel"><div class="sd-head"><div><h3>Datenqualität und Blocker</h3><p>Häufigste Gründe gegen die Listing-Freigabe.</p></div></div><div class="sd-list">${blockersMarkup(metrics.products)}</div></article></section>
    <section class="sd-panel"><div class="sd-head"><div><h3>System- und Datenstatus</h3><p>Welche Informationen tatsächlich live verbunden sind.</p></div></div><div class="sd-list"><div class="sd-status"><span>eBay OAuth</span><strong class="${metrics.ebayConnected ? "sd-good" : "sd-bad"}">${metrics.ebayConnected ? "verbunden" : "nicht verbunden"}</strong></div><div class="sd-status"><span>Server Product Master</span><strong class="${storageReady ? "sd-good" : "sd-warn"}">${escapeHtml(productState)}</strong></div><div class="sd-status"><span>Company-OS-Produkte</span><strong>${count(metrics.products.filter((product) => product.source === "elyon_company_os" || product.raw?.approval?.companyOsApproved === true).length)}</strong></div><div class="sd-status"><span>eBay Orders API</span><strong class="${runtime.errors.orders ? "sd-warn" : metrics.ebayConnected ? "sd-good" : "sd-bad"}">${escapeHtml(orderState)}</strong></div><div class="sd-status"><span>Von eBay gemeldete Marketplace-Gebühren</span><strong>${money(metrics.marketplaceFees)}</strong></div><div class="sd-status"><span>Automatisches Einstellen / Bestellen</span><strong class="sd-good">deaktiviert</strong></div></div></section>
  </section>`;
}

function openTab(tabId) {
  if (!tabId || tabId === "dashboardTab") return;
  try { if (typeof window.showTab === "function") return window.showTab(tabId); } catch {}
  const menu = document.getElementById("mainMenu");
  if (menu) { menu.value = tabId; menu.dispatchEvent(new Event("change", { bubbles: true })); }
}

async function getJson(url) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
  const raw = await response.text();
  let data = {};
  try { data = JSON.parse(raw); } catch { data = { raw }; }
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || data.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function errorText(error, fallback) {
  if (error?.status === 403) return "Seller-Sitzung fehlt oder ist abgelaufen. Bitte erneut anmelden.";
  return text(error?.message) || fallback;
}

function host() {
  const node = document.getElementById("dashboardTab");
  if (node) installStyles();
  return node;
}

function renderDashboard() {
  const node = host();
  if (!node) return;
  const metrics = buildSellerDashboardMetrics({ products: list(runtime.productPayload?.products), orders: list(runtime.orderPayload?.orders), days: runtime.days, ebayConnected: runtime.ebayStatus?.connected === true });
  node.innerHTML = dashboardMarkup(metrics, buildSellerTasks(metrics, runtime.errors));
  node.querySelectorAll("[data-sd-range]").forEach((button) => button.addEventListener("click", () => { const days = Number(button.dataset.sdRange); if (![7,30,90].includes(days) || days === runtime.days) return; runtime.days = days; storeRange(days); refreshDashboard(); }));
  node.querySelectorAll("[data-sd-tab]").forEach((button) => button.addEventListener("click", () => openTab(button.dataset.sdTab)));
  document.getElementById("sdRefresh")?.addEventListener("click", refreshDashboard);
}

function isDashboardVisible() {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function refreshWhenStale() {
  if (!isDashboardVisible() || runtime.loading) return;
  const lastRefresh = runtime.refreshedAt instanceof Date ? runtime.refreshedAt.getTime() : 0;
  if (lastRefresh && Date.now() - lastRefresh < FOCUS_REFRESH_COOLDOWN_MS) return;
  refreshDashboard();
}

function installAutoRefresh() {
  if (autoRefreshInstalled || typeof window === "undefined") return;
  autoRefreshInstalled = true;
  autoRefreshTimer = window.setInterval(() => {
    if (isDashboardVisible()) refreshDashboard();
  }, AUTO_REFRESH_INTERVAL_MS);
  document.addEventListener("visibilitychange", refreshWhenStale);
  window.addEventListener("focus", refreshWhenStale);
}

export async function refreshDashboard() {
  if (runtime.loading) return;
  runtime.loading = true;
  runtime.errors = {};
  renderDashboard();
  const [products, status, orders] = await Promise.allSettled([getJson("/api/products"), getJson("/api/ebay/status"), getJson(`/api/ebay/orders?days=${runtime.days}&status=all&environment=production`)]);
  if (products.status === "fulfilled") runtime.productPayload = products.value; else { runtime.productPayload = null; runtime.errors.products = errorText(products.reason, "Product Master konnte nicht geladen werden."); }
  if (status.status === "fulfilled") runtime.ebayStatus = status.value; else { runtime.ebayStatus = { connected: false }; runtime.errors.ebay = errorText(status.reason, "eBay-Status konnte nicht geladen werden."); }
  if (orders.status === "fulfilled") runtime.orderPayload = orders.value; else { runtime.orderPayload = null; runtime.errors.orders = errorText(orders.reason, "eBay-Bestellungen konnten nicht geladen werden."); }
  runtime.refreshedAt = new Date();
  runtime.loading = false;
  renderDashboard();
}

function install() {
  if (!host()) return false;
  renderDashboard();
  installAutoRefresh();
  window.setTimeout(refreshDashboard, 120);
  return true;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.ElyonSellerDashboard = { refresh: refreshDashboard, render: renderDashboard };
  window.addEventListener("elyon:seller-authenticated", () => window.setTimeout(refreshDashboard, 100));
  window.addEventListener("elyon:seller-product-selected", () => window.setTimeout(refreshDashboard, 100));
  window.addEventListener("storage", (event) => { if (event.key === WORKING_PRODUCTS_KEY) renderDashboard(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { if (!install()) { window.setTimeout(install, 400); window.setTimeout(install, 1200); } }, { once: true });
  else if (!install()) { window.setTimeout(install, 400); window.setTimeout(install, 1200); }
}
