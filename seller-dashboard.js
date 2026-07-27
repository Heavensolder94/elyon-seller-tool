const CURRENCY = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const INTEGER = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const DATE = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const DATE_TIME = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const DASHBOARD_ID = "elyonSellerDashboard";
const STYLE_ID = "elyonSellerDashboardStyles";
const ROLE_BANNER_ID = "elyonSellerRoleBanner";
const RANGE_KEY = "elyonSellerDashboardRange";
const SELECTED_PRODUCT_KEY = "elyonSelectedSellerProductId";
const WORKING_PRODUCTS_KEY = "elyonProducts";

const state = {
  range: readStoredRange(),
  loading: false,
  refreshedAt: null,
  productsResponse: null,
  ordersResponse: null,
  ebayStatus: null,
  errors: {},
};

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function currency(value) {
  return CURRENCY.format(finite(value));
}

function integer(value) {
  return INTEGER.format(finite(value));
}

function percent(value) {
  return `${DECIMAL.format(finite(value))} %`;
}

function validDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function dateLabel(value, includeTime = false) {
  const date = validDate(value);
  if (!date) return "–";
  return includeTime ? DATE_TIME.format(date) : DATE.format(date);
}

function readStoredRange() {
  try {
    const value = Number(localStorage.getItem(RANGE_KEY));
    return [7, 30, 90].includes(value) ? value : 30;
  } catch {
    return 30;
  }
}

function writeStoredRange(value) {
  try {
    localStorage.setItem(RANGE_KEY, String(value));
  } catch {}
}

function readWorkingCopies() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WORKING_PRODUCTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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

export function normalizeSellerProduct(product = {}) {
  const pricing = product.pricing || {};
  const listing = product.listing || {};
  const readiness = product.readiness || {};
  const logistics = product.logistics || {};
  const supplier = product.supplier || {};
  const status = text(listing.status || product.listingStatus || product.status || "draft").toLowerCase();
  const blockers = array(readiness.blockers).map(text).filter(Boolean);
  const itemIds = productItemIds(product);
  const margin = finite(pricing.marginPercent ?? product.marginPercent ?? product.margin);
  const profit = finite(pricing.profit ?? pricing.realisticProfit ?? product.profit);
  const salePrice = finite(pricing.salePrice ?? product.salePrice ?? product.sellPrice);
  const buyPrice = finite(pricing.buyPrice ?? product.buyPrice ?? product.purchasePrice);

  return {
    id: text(product.id || product.sellerToolMasterProductId || product.companyOsProductId),
    companyOsProductId: text(product.companyOsProductId || product.raw?.companyOsProductId),
    title: text(product.title || listing.title || product.name) || "Unbenanntes Produkt",
    source: text(product.source || "elyon_company_os"),
    supplier: text(supplier.name || product.supplierName || product.supplier) || "Lieferant offen",
    supplierUrl: text(supplier.url || product.supplierUrl || product.supplierLink),
    status,
    itemIds,
    ebayItemId: itemIds[0] || "",
    readinessState: text(readiness.state || "not_ready").toLowerCase(),
    readinessScore: finite(readiness.score),
    blockers,
    isReady: text(readiness.state).toLowerCase() === "ready_for_manual_listing" && blockers.length === 0,
    isLive: ["live", "active", "published"].includes(status),
    isListed: ["live", "active", "published", "manually_listed", "listed"].includes(status) || itemIds.length > 0,
    isDraft: ["draft", "entwurf", "ready_for_manual_listing", "not_listed"].includes(status) && itemIds.length === 0,
    isEnded: ["ended", "beendet", "inactive", "paused"].includes(status),
    salePrice,
    buyPrice,
    profit,
    margin,
    deliveryTime: text(logistics.deliveryTime || product.deliveryTime),
    returnAddress: text(logistics.returnAddress || product.returnAddress),
    updatedAt: product.updatedAt || product.receivedAt || product.createdAt || null,
    images: array(product.images),
    raw: product,
  };
}

function orderLineItems(order = {}) {
  return array(order.lineItems || order.items).map((item) => ({
    itemId: text(item.legacyItemId || item.itemId || item.legacyItemID || item.sku || item.lineItemId),
    title: text(item.title || item.lineItemTitle || item.sku) || "eBay-Artikel",
    quantity: Math.max(1, finite(item.quantity, 1)),
    total: finite(item.lineItemCost?.value ?? item.total?.value ?? item.price?.value ?? item.price),
    raw: item,
  }));
}

export function normalizeEbayOrder(order = {}) {
  const pricing = order.pricingSummary || {};
  const total = finite(pricing.total?.value ?? order.total?.value ?? order.total ?? order.orderTotal?.value);
  const subtotal = finite(pricing.priceSubtotal?.value ?? pricing.subtotal?.value ?? order.subtotal?.value);
  const shipping = finite(pricing.deliveryCost?.value ?? pricing.shippingCost?.value ?? order.shippingCost?.value);
  const fulfillmentStatus = text(order.orderFulfillmentStatus || order.fulfillmentStatus || order.status || "UNKNOWN").toUpperCase();
  const paymentStatus = text(order.orderPaymentStatus || order.paymentStatus || "UNKNOWN").toUpperCase();
  const createdAt = order.creationDate || order.createdAt || order.orderDate || null;
  const lineItems = orderLineItems(order);

  return {
    id: text(order.orderId || order.legacyOrderId || order.id) || "Unbekannte Bestellung",
    createdAt,
    total,
    subtotal,
    shipping,
    currency: text(pricing.total?.currency || order.total?.currency || "EUR"),
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

function estimateOrderProfit(orders, products) {
  const profitByItemId = new Map();
  for (const product of products) {
    for (const itemId of product.itemIds) {
      if (itemId) profitByItemId.set(itemId, product.profit);
    }
  }

  let estimatedProfit = 0;
  let matchedLineItems = 0;
  let totalLineItems = 0;
  for (const order of orders) {
    if (order.isCancelled) continue;
    for (const item of order.lineItems) {
      totalLineItems += 1;
      if (!profitByItemId.has(item.itemId)) continue;
      estimatedProfit += finite(profitByItemId.get(item.itemId)) * item.quantity;
      matchedLineItems += 1;
    }
  }

  return { estimatedProfit, matchedLineItems, totalLineItems };
}

function buildRevenueByProduct(orders, products) {
  const productByItemId = new Map();
  for (const product of products) {
    for (const itemId of product.itemIds) {
      if (itemId) productByItemId.set(itemId, product);
    }
  }

  const rows = new Map();
  for (const order of orders) {
    if (order.isCancelled) continue;
    for (const item of order.lineItems) {
      const product = productByItemId.get(item.itemId);
      if (!product) continue;
      const current = rows.get(product.id) || { product, revenue: 0, quantity: 0, estimatedProfit: 0 };
      current.revenue += item.total > 0 ? item.total * item.quantity : product.salePrice * item.quantity;
      current.quantity += item.quantity;
      current.estimatedProfit += product.profit * item.quantity;
      rows.set(product.id, current);
    }
  }

  const sold = [...rows.values()].sort((a, b) => b.revenue - a.revenue);
  if (sold.length) return sold.slice(0, 5);

  return [...products]
    .filter((product) => product.profit > 0 || product.margin > 0)
    .sort((a, b) => b.profit - a.profit || b.margin - a.margin)
    .slice(0, 5)
    .map((product) => ({ product, revenue: 0, quantity: 0, estimatedProfit: product.profit }));
}

function bucketSizeForRange(days) {
  if (days <= 7) return 1;
  if (days <= 30) return 2;
  return 7;
}

export function buildRevenueBuckets(orders, days = 30, now = new Date()) {
  const bucketSize = bucketSizeForRange(days);
  const bucketCount = Math.ceil(days / bucketSize);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);

  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = new Date(start);
    bucketStart.setDate(bucketStart.getDate() + index * bucketSize);
    const bucketEnd = new Date(bucketStart);
    bucketEnd.setDate(bucketEnd.getDate() + bucketSize - 1);
    return { start: bucketStart, end: bucketEnd, revenue: 0, orders: 0 };
  });

  for (const order of orders) {
    const created = validDate(order.createdAt);
    if (!created || order.isCancelled || created < start || created > now) continue;
    const dayIndex = Math.floor((created.getTime() - start.getTime()) / 86400000);
    const index = Math.min(bucketCount - 1, Math.max(0, Math.floor(dayIndex / bucketSize)));
    buckets[index].revenue += order.total;
    buckets[index].orders += 1;
  }

  return buckets.map((bucket) => ({
    ...bucket,
    label: bucketSize === 1
      ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(bucket.start)
      : `${new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(bucket.start)}–${new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(bucket.end)}`,
  }));
}

export function buildSellerDashboardMetrics({ products = [], orders = [], days = 30, ebayConnected = false } = {}) {
  const normalizedProducts = products.map(normalizeSellerProduct);
  const normalizedOrders = orders.map(normalizeEbayOrder);
  const activeOrders = normalizedOrders.filter((order) => !order.isCancelled);
  const revenue = activeOrders.reduce((sum, order) => sum + order.total, 0);
  const openOrders = activeOrders.filter((order) => !order.isFulfilled);
  const fulfilledOrders = activeOrders.filter((order) => order.isFulfilled);
  const readyProducts = normalizedProducts.filter((product) => product.isReady);
  const blockedProducts = normalizedProducts.filter((product) => !product.isReady);
  const liveProducts = normalizedProducts.filter((product) => product.isLive);
  const listedProducts = normalizedProducts.filter((product) => product.isListed);
  const draftProducts = normalizedProducts.filter((product) => product.isDraft);
  const endedProducts = normalizedProducts.filter((product) => product.isEnded);
  const margins = normalizedProducts.map((product) => product.margin).filter((value) => value > 0);
  const averageMargin = margins.length ? margins.reduce((sum, value) => sum + value, 0) / margins.length : 0;
  const listedProfitPerSale = listedProducts.reduce((sum, product) => sum + Math.max(0, product.profit), 0);
  const profitCoverage = estimateOrderProfit(activeOrders, normalizedProducts);
  const topProducts = buildRevenueByProduct(activeOrders, normalizedProducts);
  const buckets = buildRevenueBuckets(activeOrders, days);
  const workingCopies = readWorkingCopies();

  return {
    days,
    ebayConnected,
    products: normalizedProducts,
    orders: normalizedOrders,
    activeOrders,
    revenue,
    orderCount: activeOrders.length,
    openOrders,
    fulfilledOrders,
    readyProducts,
    blockedProducts,
    liveProducts,
    listedProducts,
    draftProducts,
    endedProducts,
    averageMargin,
    listedProfitPerSale,
    estimatedOrderProfit: profitCoverage.estimatedProfit,
    matchedLineItems: profitCoverage.matchedLineItems,
    totalLineItems: profitCoverage.totalLineItems,
    topProducts,
    buckets,
    workingCopies: workingCopies.length,
  };
}

export function buildSellerTasks(metrics, errors = {}) {
  const tasks = [];
  const push = (priority, title, detail, tab, type = "info") => tasks.push({ priority, title, detail, tab, type });

  if (errors.products) {
    push(100, "Product Master nicht erreichbar", errors.products, "settingsTab", "danger");
  }
  if (!metrics.ebayConnected) {
    push(95, "eBay-Verbindung prüfen", "Ohne aktive eBay-Verbindung können keine echten Bestellungen geladen werden.", "settingsTab", "danger");
  }
  if (errors.orders) {
    push(90, "Bestellungen konnten nicht geladen werden", errors.orders, "ordersTab", "warning");
  }
  if (metrics.openOrders.length) {
    push(85, `${metrics.openOrders.length} Bestellung${metrics.openOrders.length === 1 ? "" : "en"} offen`, "Versand, Tracking und Bearbeitungsstatus prüfen.", "ordersTab", "warning");
  }
  if (metrics.blockedProducts.length) {
    push(75, `${metrics.blockedProducts.length} Produkt${metrics.blockedProducts.length === 1 ? "" : "e"} blockiert`, "Die fehlenden Daten oder Company-OS-Freigaben prüfen.", "productListTab", "warning");
  }
  if (metrics.readyProducts.length) {
    push(65, `${metrics.readyProducts.length} Produkt${metrics.readyProducts.length === 1 ? " ist" : "e sind"} listingbereit`, "Listing-Paket kontrollieren und anschließend manuell bei eBay einstellen.", "ebayListingTab", "success");
  }
  if (metrics.draftProducts.length) {
    push(55, `${metrics.draftProducts.length} Listing-Entwurf${metrics.draftProducts.length === 1 ? "" : "e"}`, "Noch ohne dokumentierte eBay-Artikelnummer.", "ebayListingTab", "info");
  }
  if (!metrics.products.length && !errors.products) {
    push(70, "Noch kein Seller-Produkt", "Ein final freigegebenes Produkt aus Company OS übernehmen.", "productListTab", "info");
  }
  if (!metrics.orderCount && metrics.ebayConnected && !errors.orders) {
    push(20, "Noch keine Verkäufe im Zeitraum", `Für die letzten ${metrics.days} Tage wurden keine eBay-Bestellungen gefunden.`, "ordersTab", "neutral");
  }
  if (!tasks.length) {
    push(10, "Keine dringenden Aufgaben", "Der aktuelle Seller-Ablauf enthält keine offenen Warnungen.", "dashboardTab", "success");
  }

  return tasks.sort((a, b) => b.priority - a.priority).slice(0, 7);
}

function topBlockers(products) {
  const counts = new Map();
  for (const product of products) {
    for (const blocker of product.blockers) {
      counts.set(blocker, (counts.get(blocker) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
}

function openTab(tabId) {
  if (!tabId || tabId === "dashboardTab") return;
  try {
    if (typeof window.showTab === "function") {
      window.showTab(tabId);
      return;
    }
  } catch {}
  const menu = document.getElementById("mainMenu");
  if (menu) {
    menu.value = tabId;
    menu.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${DASHBOARD_ID}{display:grid;gap:16px}
    .seller-dash-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap;padding:22px;border-radius:26px;background:linear-gradient(145deg,rgba(15,23,42,.96),rgba(30,41,59,.78));border:1px solid rgba(96,165,250,.2);box-shadow:0 22px 70px rgba(0,0,0,.2)}
    .seller-dash-hero h2{margin:4px 0 7px;font-size:clamp(25px,4vw,38px);letter-spacing:-.045em}.seller-dash-hero p{margin:0;max-width:760px;color:#cbd5e1;line-height:1.55;font-size:13px}
    .seller-dash-actions{display:flex;gap:9px;flex-wrap:wrap;align-items:center}.seller-dash-actions button{padding:10px 12px;font-size:12px;border-radius:13px}.seller-dash-range{display:flex;gap:5px;padding:4px;border-radius:14px;background:rgba(2,6,23,.48);border:1px solid rgba(148,163,184,.14)}.seller-dash-range button{background:transparent;border:0}.seller-dash-range button.active{background:linear-gradient(135deg,#2563eb,#7c3aed)}
    .seller-dash-badges{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.seller-dash-badge{display:inline-flex;gap:7px;align-items:center;padding:7px 10px;border-radius:999px;font-size:11px;font-weight:850;border:1px solid rgba(148,163,184,.15);background:rgba(255,255,255,.05);color:#cbd5e1}.seller-dash-badge.good{color:#bbf7d0;border-color:rgba(34,197,94,.25);background:rgba(34,197,94,.09)}.seller-dash-badge.warn{color:#fde68a;border-color:rgba(250,204,21,.25);background:rgba(250,204,21,.08)}.seller-dash-badge.bad{color:#fecaca;border-color:rgba(239,68,68,.25);background:rgba(239,68,68,.08)}
    .seller-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}.seller-kpi{position:relative;overflow:hidden;padding:17px;border-radius:20px;background:rgba(15,23,42,.78);border:1px solid rgba(148,163,184,.13);min-height:126px}.seller-kpi:after{content:"";position:absolute;right:-30px;bottom:-42px;width:100px;height:100px;border-radius:999px;background:rgba(59,130,246,.08)}.seller-kpi small{display:block;color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.07em}.seller-kpi strong{display:block;margin:9px 0 6px;font-size:clamp(23px,2.5vw,32px);letter-spacing:-.045em}.seller-kpi span{display:block;color:#cbd5e1;font-size:11px;line-height:1.4}.seller-kpi.good strong{color:#86efac}.seller-kpi.warn strong{color:#fde68a}.seller-kpi.bad strong{color:#fca5a5}
    .seller-dash-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(320px,.75fr);gap:16px}.seller-panel{padding:18px;border-radius:22px;background:rgba(15,23,42,.74);border:1px solid rgba(148,163,184,.13);min-width:0}.seller-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}.seller-panel-head h3{margin:0 0 5px;color:#e2e8f0}.seller-panel-head p{margin:0;color:#94a3b8;font-size:12px;line-height:1.4}.seller-panel-head button{padding:8px 10px;font-size:11px;border-radius:11px}
    .seller-chart{height:240px;display:flex;align-items:flex-end;gap:7px;padding:18px 10px 4px;border-radius:18px;background:rgba(2,6,23,.4);border:1px solid rgba(148,163,184,.1);overflow-x:auto}.seller-chart-column{height:100%;min-width:24px;flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px}.seller-chart-bar{width:min(34px,76%);min-height:3px;border-radius:8px 8px 3px 3px;background:linear-gradient(180deg,#60a5fa,#7c3aed);box-shadow:0 7px 20px rgba(59,130,246,.16)}.seller-chart-column small{font-size:9px;color:#94a3b8;white-space:nowrap;transform:rotate(-35deg);transform-origin:center;margin:7px 0 4px}.seller-chart-empty{margin:auto;color:#94a3b8;text-align:center;font-size:12px;line-height:1.5}
    .seller-task-list,.seller-order-list,.seller-product-list,.seller-quality-list,.seller-status-list{display:grid;gap:9px}.seller-task,.seller-order,.seller-product-row,.seller-quality-row,.seller-status-row{padding:12px 13px;border-radius:15px;background:rgba(2,6,23,.38);border:1px solid rgba(148,163,184,.1)}.seller-task{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:10px;align-items:start}.seller-task-dot{width:9px;height:9px;border-radius:999px;margin-top:4px;background:#60a5fa}.seller-task.danger .seller-task-dot{background:#ef4444}.seller-task.warning .seller-task-dot{background:#facc15}.seller-task.success .seller-task-dot{background:#22c55e}.seller-task strong,.seller-order strong,.seller-product-row strong{display:block;font-size:13px;color:#f8fafc}.seller-task p,.seller-order p,.seller-product-row p,.seller-quality-row p{margin:4px 0 0;color:#94a3b8;font-size:11px;line-height:1.45}.seller-task button{padding:7px 9px;font-size:10px;border-radius:10px}
    .seller-two-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.seller-order,.seller-product-row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.seller-order-meta,.seller-product-meta{text-align:right;flex:0 0 auto}.seller-order-meta span,.seller-product-meta span{display:block;font-weight:850;font-size:12px;color:#e2e8f0}.seller-order-meta small,.seller-product-meta small{display:block;margin-top:4px;color:#94a3b8;font-size:10px}
    .seller-pipeline{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.seller-pipeline-step{padding:13px 10px;border-radius:16px;background:rgba(2,6,23,.38);border:1px solid rgba(148,163,184,.1);text-align:center}.seller-pipeline-step strong{display:block;font-size:24px;letter-spacing:-.04em}.seller-pipeline-step span{display:block;margin-top:5px;color:#94a3b8;font-size:10px;line-height:1.3}
    .seller-quality-row,.seller-status-row{display:flex;justify-content:space-between;gap:12px;align-items:center}.seller-quality-row span,.seller-status-row span{color:#cbd5e1;font-size:11px}.seller-quality-row strong,.seller-status-row strong{font-size:12px;text-align:right}.seller-status-good{color:#86efac}.seller-status-warn{color:#fde68a}.seller-status-bad{color:#fca5a5}
    .seller-empty{padding:18px;border-radius:16px;border:1px dashed rgba(148,163,184,.2);color:#94a3b8;text-align:center;font-size:12px;line-height:1.5}.seller-refresh-note{font-size:10px;color:#64748b;margin-top:10px;text-align:right}
    @media(max-width:1180px){.seller-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.seller-dash-grid{grid-template-columns:1fr}.seller-two-grid{grid-template-columns:1fr}}
    @media(max-width:720px){.seller-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.seller-pipeline{grid-template-columns:repeat(2,minmax(0,1fr))}.seller-dash-actions{width:100%}.seller-dash-range{width:100%;display:grid;grid-template-columns:repeat(3,1fr)}.seller-chart{height:210px}.seller-task{grid-template-columns:10px minmax(0,1fr)}.seller-task button{grid-column:2;justify-self:start}}
    @media(max-width:430px){.seller-kpis{grid-template-columns:1fr}.seller-pipeline{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function chartHtml(buckets) {
  const max = Math.max(0, ...buckets.map((bucket) => bucket.revenue));
  if (!max) {
    return '<div class="seller-chart-empty">Noch kein eBay-Umsatz im gewählten Zeitraum.<br>Das Diagramm füllt sich automatisch mit echten Bestellungen.</div>';
  }
  return buckets.map((bucket) => {
    const height = Math.max(3, Math.round((bucket.revenue / max) * 190));
    return `<div class="seller-chart-column" title="${escapeHtml(bucket.label)}: ${escapeHtml(currency(bucket.revenue))} · ${bucket.orders} Bestellung(en)"><div class="seller-chart-bar" style="height:${height}px"></div><small>${escapeHtml(bucket.label)}</small></div>`;
  }).join("");
}

function taskHtml(tasks) {
  return tasks.map((task) => `
    <article class="seller-task ${escapeHtml(task.type)}">
      <span class="seller-task-dot"></span>
      <div><strong>${escapeHtml(task.title)}</strong><p>${escapeHtml(task.detail)}</p></div>
      ${task.tab && task.tab !== "dashboardTab" ? `<button type="button" class="secondary" data-seller-open-tab="${escapeHtml(task.tab)}">Öffnen</button>` : ""}
    </article>
  `).join("");
}

function recentOrdersHtml(orders) {
  const recent = [...orders]
    .filter((order) => !order.isCancelled)
    .sort((a, b) => (validDate(b.createdAt)?.getTime() || 0) - (validDate(a.createdAt)?.getTime() || 0))
    .slice(0, 6);
  if (!recent.length) return '<div class="seller-empty">Noch keine echten eBay-Bestellungen im gewählten Zeitraum.</div>';
  return recent.map((order) => `
    <article class="seller-order">
      <div><strong>${escapeHtml(order.buyer)}</strong><p>${escapeHtml(order.id)} · ${order.quantity} Artikel · ${escapeHtml(dateLabel(order.createdAt, true))}</p></div>
      <div class="seller-order-meta"><span>${escapeHtml(currency(order.total))}</span><small>${escapeHtml(order.isFulfilled ? "Versendet" : "Offen")}</small></div>
    </article>
  `).join("");
}

function topProductsHtml(rows) {
  if (!rows.length) return '<div class="seller-empty">Noch keine Produktdaten für eine Auswertung vorhanden.</div>';
  return rows.map((row, index) => {
    const sold = row.quantity > 0;
    return `
      <article class="seller-product-row">
        <div><strong>${index + 1}. ${escapeHtml(row.product.title)}</strong><p>${escapeHtml(row.product.supplier)} · ${percent(row.product.margin)} Marge · ${currency(row.product.profit)} kalkulierter Gewinn je Verkauf</p></div>
        <div class="seller-product-meta"><span>${sold ? currency(row.revenue) : currency(row.product.salePrice)}</span><small>${sold ? `${integer(row.quantity)} verkauft` : "VK-Preis"}</small></div>
      </article>
    `;
  }).join("");
}

function dataQualityHtml(metrics) {
  const blockers = topBlockers(metrics.products);
  if (!blockers.length) return '<div class="seller-empty">Keine Produktblocker im aktuellen Product Master.</div>';
  return blockers.map(([label, count]) => `
    <div class="seller-quality-row"><span>${escapeHtml(label)}</span><strong>${integer(count)}×</strong></div>
  `).join("");
}

function dashboardHtml(metrics, tasks) {
  const productsStorage = state.productsResponse?.storage?.configured === true;
  const orderError = state.errors.orders;
  const profitCoverage = metrics.totalLineItems
    ? `${metrics.matchedLineItems}/${metrics.totalLineItems} Order-Positionen zugeordnet`
    : "Noch keine Order-Positionen";
  const refreshLabel = state.refreshedAt ? dateLabel(state.refreshedAt, true) : "noch nicht geladen";
  const statusProduct = state.errors.products ? "Fehler" : productsStorage ? "Verbunden" : "Unbekannt";
  const statusOrders = orderError ? "Nicht verfügbar" : metrics.ebayConnected ? "Live" : "Nicht verbunden";

  return `
    <section id="${DASHBOARD_ID}">
      <header class="seller-dash-hero" id="${ROLE_BANNER_ID}">
        <div>
          <div class="badge">Elyon Seller Cockpit</div>
          <h2>Dein Verkaufsbetrieb auf einen Blick</h2>
          <p>Company OS liefert geprüfte Produkte und Listing-Pakete. Hier siehst du den echten Seller-Stand: Produkte, Listings, eBay-Bestellungen, Umsatz, kalkulierten Gewinn, Blocker und die nächsten Arbeitsschritte.</p>
          <div class="seller-dash-badges">
            <span class="seller-dash-badge ${metrics.ebayConnected ? "good" : "bad"}">eBay ${metrics.ebayConnected ? "verbunden" : "nicht verbunden"}</span>
            <span class="seller-dash-badge ${productsStorage ? "good" : state.errors.products ? "bad" : "warn"}">Product Master ${escapeHtml(statusProduct)}</span>
            <span class="seller-dash-badge ${orderError ? "warn" : "good"}">Orders ${escapeHtml(statusOrders)}</span>
            <span class="seller-dash-badge">Letzte Aktualisierung ${escapeHtml(refreshLabel)}</span>
          </div>
        </div>
        <div class="seller-dash-actions">
          <div class="seller-dash-range" aria-label="Auswertungszeitraum">
            ${[7, 30, 90].map((days) => `<button type="button" data-seller-range="${days}" class="${state.range === days ? "active" : ""}">${days} Tage</button>`).join("")}
          </div>
          <button type="button" id="sellerDashboardRefresh" class="secondary">${state.loading ? "Lädt …" : "Aktualisieren"}</button>
        </div>
      </header>

      <section class="seller-kpis" aria-label="Seller Kennzahlen">
        <article class="seller-kpi ${metrics.revenue > 0 ? "good" : ""}"><small>eBay-Umsatz · ${metrics.days} Tage</small><strong>${currency(metrics.revenue)}</strong><span>Nur echte geladene eBay-Bestellungen</span></article>
        <article class="seller-kpi"><small>Bestellungen</small><strong>${integer(metrics.orderCount)}</strong><span>${integer(metrics.fulfilledOrders.length)} abgeschlossen</span></article>
        <article class="seller-kpi ${metrics.openOrders.length ? "warn" : ""}"><small>Offene Bestellungen</small><strong>${integer(metrics.openOrders.length)}</strong><span>Versand oder Bearbeitung offen</span></article>
        <article class="seller-kpi ${metrics.liveProducts.length ? "good" : ""}"><small>Aktive Listings</small><strong>${integer(metrics.liveProducts.length)}</strong><span>${integer(metrics.listedProducts.length)} insgesamt dokumentiert</span></article>
        <article class="seller-kpi ${metrics.readyProducts.length ? "good" : metrics.blockedProducts.length ? "warn" : ""}"><small>Listingbereit</small><strong>${integer(metrics.readyProducts.length)}</strong><span>${integer(metrics.blockedProducts.length)} Produktblocker</span></article>
        <article class="seller-kpi ${metrics.estimatedOrderProfit > 0 ? "good" : ""}"><small>Geschätzter Order-Gewinn</small><strong>${currency(metrics.estimatedOrderProfit)}</strong><span>${escapeHtml(profitCoverage)} · keine Steuer-/Buchhaltungszahl</span></article>
      </section>

      <section class="seller-dash-grid">
        <article class="seller-panel">
          <div class="seller-panel-head"><div><h3>Umsatzentwicklung</h3><p>Echte eBay-Bestellungen im gewählten Zeitraum.</p></div><strong>${currency(metrics.revenue)}</strong></div>
          <div class="seller-chart">${chartHtml(metrics.buckets)}</div>
        </article>
        <article class="seller-panel">
          <div class="seller-panel-head"><div><h3>Nächste Aufgaben</h3><p>Nach Priorität aus dem aktuellen Seller-Stand.</p></div></div>
          <div class="seller-task-list">${taskHtml(tasks)}</div>
        </article>
      </section>

      <section class="seller-two-grid">
        <article class="seller-panel">
          <div class="seller-panel-head"><div><h3>Neueste Bestellungen</h3><p>Die aktuellsten eBay-Orders aus den letzten ${metrics.days} Tagen.</p></div><button type="button" class="secondary" data-seller-open-tab="ordersTab">Alle öffnen</button></div>
          <div class="seller-order-list">${recentOrdersHtml(metrics.orders)}</div>
        </article>
        <article class="seller-panel">
          <div class="seller-panel-head"><div><h3>Produktleistung</h3><p>Nach echtem Umsatz; ohne Verkäufe nach kalkuliertem Gewinn.</p></div><button type="button" class="secondary" data-seller-open-tab="productListTab">Produkte öffnen</button></div>
          <div class="seller-product-list">${topProductsHtml(metrics.topProducts)}</div>
        </article>
      </section>

      <section class="seller-two-grid">
        <article class="seller-panel">
          <div class="seller-panel-head"><div><h3>Seller-Pipeline</h3><p>Vom Company-OS-Produkt bis zum abgeschlossenen Verkauf.</p></div></div>
          <div class="seller-pipeline">
            <div class="seller-pipeline-step"><strong>${integer(metrics.products.length)}</strong><span>Product Master</span></div>
            <div class="seller-pipeline-step"><strong>${integer(metrics.readyProducts.length)}</strong><span>listingbereit</span></div>
            <div class="seller-pipeline-step"><strong>${integer(metrics.liveProducts.length)}</strong><span>live</span></div>
            <div class="seller-pipeline-step"><strong>${integer(metrics.openOrders.length)}</strong><span>Orders offen</span></div>
            <div class="seller-pipeline-step"><strong>${integer(metrics.fulfilledOrders.length)}</strong><span>abgeschlossen</span></div>
          </div>
          <div class="seller-refresh-note">${integer(metrics.workingCopies)} lokale Arbeitskopie(n) · Ø Marge ${percent(metrics.averageMargin)} · kalkulierter Gewinn aller dokumentierten Listings je Einzelverkauf ${currency(metrics.listedProfitPerSale)}</div>
        </article>
        <article class="seller-panel">
          <div class="seller-panel-head"><div><h3>Datenqualität und Blocker</h3><p>Die häufigsten Gründe, warum Produkte noch nicht listingbereit sind.</p></div></div>
          <div class="seller-quality-list">${dataQualityHtml(metrics)}</div>
        </article>
      </section>

      <section class="seller-panel">
        <div class="seller-panel-head"><div><h3>System- und Datenstatus</h3><p>Welche Informationen tatsächlich live verbunden sind.</p></div></div>
        <div class="seller-status-list">
          <div class="seller-status-row"><span>eBay OAuth</span><strong class="${metrics.ebayConnected ? "seller-status-good" : "seller-status-bad"}">${metrics.ebayConnected ? "verbunden" : "nicht verbunden"}</strong></div>
          <div class="seller-status-row"><span>Server Product Master</span><strong class="${productsStorage ? "seller-status-good" : "seller-status-warn"}">${escapeHtml(statusProduct)}</strong></div>
          <div class="seller-status-row"><span>Company-OS-Produkte</span><strong>${integer(metrics.products.filter((product) => product.source === "elyon_company_os" || product.raw?.approval?.companyOsApproved === true).length)}</strong></div>
          <div class="seller-status-row"><span>eBay Orders API</span><strong class="${orderError ? "seller-status-warn" : metrics.ebayConnected ? "seller-status-good" : "seller-status-bad"}">${escapeHtml(statusOrders)}</strong></div>
          <div class="seller-status-row"><span>Automatisches Einstellen</span><strong class="seller-status-good">deaktiviert</strong></div>
          <div class="seller-status-row"><span>Automatische Lieferantenbestellung</span><strong class="seller-status-good">deaktiviert</strong></div>
        </div>
      </section>
    </section>
  `;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
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

function readableError(error, fallback) {
  if (error?.status === 403) return "Seller-Sitzung fehlt oder ist abgelaufen. Bitte erneut anmelden.";
  return text(error?.message) || fallback;
}

function ensureDashboardHost() {
  const host = document.getElementById("dashboardTab");
  if (!host) return null;
  installStyles();
  return host;
}

function render() {
  const host = ensureDashboardHost();
  if (!host) return;
  const products = array(state.productsResponse?.products);
  const orders = array(state.ordersResponse?.orders);
  const metrics = buildSellerDashboardMetrics({
    products,
    orders,
    days: state.range,
    ebayConnected: state.ebayStatus?.connected === true,
  });
  const tasks = buildSellerTasks(metrics, state.errors);
  host.innerHTML = dashboardHtml(metrics, tasks);

  host.querySelectorAll("[data-seller-range]").forEach((button) => {
    button.addEventListener("click", () => {
      const days = Number(button.dataset.sellerRange);
      if (![7, 30, 90].includes(days) || days === state.range) return;
      state.range = days;
      writeStoredRange(days);
      refreshDashboard();
    });
  });
  host.querySelectorAll("[data-seller-open-tab]").forEach((button) => {
    button.addEventListener("click", () => openTab(button.dataset.sellerOpenTab));
  });
  document.getElementById("sellerDashboardRefresh")?.addEventListener("click", () => refreshDashboard());
}

export async function refreshDashboard() {
  if (state.loading) return;
  state.loading = true;
  state.errors = {};
  render();

  const [productsResult, statusResult, ordersResult] = await Promise.allSettled([
    fetchJson("/api/products"),
    fetchJson("/api/ebay/status"),
    fetchJson(`/api/ebay/orders?days=${state.range}&status=all&environment=production`),
  ]);

  if (productsResult.status === "fulfilled") state.productsResponse = productsResult.value;
  else {
    state.productsResponse = null;
    state.errors.products = readableError(productsResult.reason, "Product Master konnte nicht geladen werden.");
  }

  if (statusResult.status === "fulfilled") state.ebayStatus = statusResult.value;
  else {
    state.ebayStatus = { connected: false };
    state.errors.ebay = readableError(statusResult.reason, "eBay-Status konnte nicht geladen werden.");
  }

  if (ordersResult.status === "fulfilled") state.ordersResponse = ordersResult.value;
  else {
    state.ordersResponse = null;
    state.errors.orders = readableError(ordersResult.reason, "eBay-Bestellungen konnten nicht geladen werden.");
  }

  state.refreshedAt = new Date();
  state.loading = false;
  render();
}

function install() {
  if (!ensureDashboardHost()) return false;
  render();
  window.setTimeout(() => refreshDashboard(), 120);
  return true;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.ElyonSellerDashboard = { refresh: refreshDashboard, render };
  window.addEventListener("elyon:seller-authenticated", () => window.setTimeout(() => refreshDashboard(), 100));
  window.addEventListener("elyon:seller-product-selected", () => window.setTimeout(() => refreshDashboard(), 100));
  window.addEventListener("storage", (event) => {
    if ([WORKING_PRODUCTS_KEY, SELECTED_PRODUCT_KEY].includes(event.key)) render();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (!install()) {
        window.setTimeout(install, 400);
        window.setTimeout(install, 1200);
      }
    }, { once: true });
  } else if (!install()) {
    window.setTimeout(install, 400);
    window.setTimeout(install, 1200);
  }
}
