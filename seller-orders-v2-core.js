// ELYON Orders Center V2 — pure, testable projections. No eBay write actions.
const text = (value) => String(value ?? "").trim();
const asNumber = (value) => value === null || value === undefined || value === "" ? null :
  (Number.isFinite(Number(value)) ? Number(value) : null);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const ELYON_SKU = /^ELY-\d{6,}(?:-\d{2,})?$/i;

export function escapeHtml(value) {
  return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function normalizeEbayOrder(raw = {}) {
  const source = object(raw);
  const id = text(source.orderId || source.legacyOrderId || source.id);
  const money = object(object(source.pricingSummary).total);
  const lines = (Array.isArray(source.lineItems) ? source.lineItems : []).map((line) => ({
    id: text(line.lineItemId),
    title: text(line.title || "eBay-Artikel"),
    sku: text(line.sku),
    listingId: text(line.legacyItemId || line.itemId || line.listingId),
    offerId: text(line.offerId),
    quantity: Math.max(1, Math.floor(Number(line.quantity) || 1)),
    total: asNumber(object(line.lineItemCost).value),
  }));
  const fallbackTotal = lines.reduce((sum, line) => sum + (line.total || 0), 0);
  const ship = object(object((source.fulfillmentStartInstructions || [])[0]).shippingStep).shipTo || {};
  const address = object(object(ship).contactAddress);
  return {
    id,
    createdAt: text(source.creationDate || source.createdAt),
    paymentStatus: text(source.orderPaymentStatus || "UNKNOWN").toUpperCase(),
    fulfillmentStatus: text(source.orderFulfillmentStatus || "UNKNOWN").toUpperCase(),
    cancelStatus: text(object(source.cancelStatus).cancelState).toUpperCase(),
    buyerRef: text(object(source.buyer).username),
    recipient: text(object(ship).fullName),
    shippingAddress: {
      recipient: text(object(ship).fullName),
      street: text(address.addressLine1),
      extra: text(address.addressLine2),
      postalCode: text(address.postalCode),
      city: text(address.city),
      country: text(address.countryCode),
    },
    total: asNumber(money.value) ?? fallbackTotal,
    currency: text(money.currency || "EUR"),
    lines,
  };
}

export function paymentConfirmed(order) {
  return ["PAID", "FULLY_PAID"].includes(text(order.paymentStatus).toUpperCase());
}

export function workflowStatus(order, operation = {}) {
  const status = text(operation.workflowStatus || operation.status).toUpperCase();
  if (text(order.cancelStatus).includes("CANCEL") || status === "CANCELLED") return "cancelled";
  if (status === "ISSUE") return "issue";
  if (status === "COMPLETED") return "completed";
  if (text(order.fulfillmentStatus) === "FULFILLED" || status === "SHIPPED") return "shipped";
  if (status === "SUPPLIER_ORDERED") return "supplier_ordered";
  if (status === "PROCESSING") return "processing";
  if (!paymentConfirmed(order)) return "awaiting_payment";
  return "new";
}

export function productForLine(line, products = []) {
  const keys = [line.sku, line.listingId, line.offerId].map((value) => text(value).toUpperCase()).filter(Boolean);
  const matches = (Array.isArray(products) ? products : []).filter((product) => {
    const listing = object(product.listing);
    const channel = object(object(product.channels).ebay);
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const productKeys = [
      product.articleNumber, product.sku, product.supplierSku, product.id, product.productId,
      listing.offerId, listing.listingId, listing.ebayItemId, channel.offerId, channel.listingId,
      ...variants.flatMap((variant) => [variant.sku, variant.supplierSku]),
    ].map((value) => text(value).toUpperCase()).filter(Boolean);
    return keys.some((key) => productKeys.includes(key) ||
      (/^ELY-\d{6,}-\d{2,}$/.test(key) && productKeys.includes(key.replace(/-\d{2,}$/, ""))));
  });
  return matches.length === 1 ? matches[0] : null; // Never guess on ambiguous matches.
}

export function estimatedOrderCosts(order, products = []) {
  const items = order.lines.map((line) => ({ line, product: productForLine(line, products) }));
  if (!items.length || items.some(({ product }) => !product)) return null;
  const sum = (name) => items.reduce((total, { line, product }) => {
    const value = asNumber(object(product.pricing)[name]);
    return value === null ? NaN : total + value * line.quantity;
  }, 0);
  const purchase = sum("buyPrice"), shipping = sum("shippingCost"), fees = sum("estimatedFees");
  return {
    purchase: Number.isFinite(purchase) ? purchase : null,
    shipping: Number.isFinite(shipping) ? shipping : null,
    fees: Number.isFinite(fees) ? fees : null,
    estimatesOnly: true,
  };
}

// Cross-check only transactions explicitly linked to the exact eBay order.
// Company OS prices are estimates and intentionally do NOT enter this function.
export function financeOrderCostHints(transactions = [], { orderIds = [] } = {}) {
  const allowed = new Set((Array.isArray(orderIds) ? orderIds : []).map(text).filter(Boolean));
  const scopes = { supplier_expense: "purchaseCost", shipping_expense: "shippingCost", ebay_fee: "feeCost" };
  const rows = Object.create(null);
  const dedup = new Set();
  for (const item of Array.isArray(transactions) ? transactions : []) {
    const line = object(item);
    const orderId = text(line.orderId);
    const field = scopes[text(line.category)];
    if (!orderId || !field || (allowed.size && !allowed.has(orderId))) continue;
    if (line.voidedAt || text(line.currency).toUpperCase() !== "EUR") continue;
    const rawAmount = asNumber(line.amount);
    if (rawAmount === null) continue;
    const uniqueId = text(line.dedupeKey || line.transactionId || line.id);
    if (!uniqueId) continue; // Ambiguous records cannot be used as auto-suggestions.
    const identity = [field, orderId, uniqueId].join("|");
    if (dedup.has(identity)) continue;
    dedup.add(identity);
    const byOrder = rows[orderId] ||= Object.create(null);
    const entry = byOrder[field] ||= { value: 0, count: 0, approved: true, source: "finance_transactions" };
    entry.value += Math.abs(rawAmount);
    entry.count += 1;
    if (text(line.status).toLowerCase() !== "approved") entry.approved = false;
  }
  for (const group of Object.values(rows)) for (const entry of Object.values(group)) {
    entry.value = Math.round(entry.value * 100) / 100;
  }
  return rows;
}

// Suggestions are display-only. Never overwrite an already-entered 0 or a manual edit.
export function suggestRecordedCosts(operation = {}, hints = {}) {
  const result = { ...object(operation) };
  const sources = {};
  for (const field of ["purchaseCost", "shippingCost", "feeCost"]) {
    const hint = object(hints)[field];
    if (asNumber(result[field]) !== null || !hint || asNumber(hint.value) === null) continue;
    result[field] = hint.value;
    sources[field] = { source: "finance_transactions", approved: hint.approved === true };
  }
  return { values: result, sources };
}

// Shared readiness rules for the UI and for the server's final completion gate.
// Do not trust client-side status labels: the server rechecks payment/fulfilment with eBay.
export function orderCompletionChecklist(order = {}, operation = {}, invoice = null) {
  const op = object(operation);
  const shipping = text(order.fulfillmentStatus).toUpperCase() === "FULFILLED";
  const invoiceIssued = Boolean(invoice?.issued === true && text(invoice?.invoiceNumber)) ||
    Boolean(invoice?.immutable === true && text(invoice?.invoiceNumber) &&
      text(invoice?.invoice?.invoiceNumber) === text(invoice.invoiceNumber));
  const checks = [
    { key: "payment", title: "eBay-Zahlung bestätigt", done: paymentConfirmed(order), section: "overview", required: true },
    { key: "supplier", title: "Lieferant eingetragen", done: Boolean(text(op.supplierName)), section: "supplier", required: true },
    { key: "supplierOrder", title: "Lieferantenauftrag dokumentiert", done: Boolean(text(op.supplierOrderId)), section: "supplier", required: true },
    { key: "carrier", title: "Versanddienstleister und Tracking erfasst", done: Boolean(text(op.carrier) && text(op.trackingNumber)), section: "shipping", required: true },
    { key: "ebayShipping", title: "Versand bei eBay bestätigt", done: shipping, section: "shipping", required: true },
    { key: "invoice", title: "Rechnung verbindlich ausgestellt", done: invoiceIssued, section: "finance", required: true },
    { key: "costs", title: "Ist-Kosten vollständig dokumentiert", done:
      ["purchaseCost","shippingCost","feeCost"].every((key) => op[key] !== "" && op[key] !== null &&
        op[key] !== undefined && Number.isFinite(Number(op[key])) && Number(op[key]) >= 0),
      section: "finance", required: false },
  ];
  return {
    ready: checks.every((check) => !check.required || check.done),
    checks,
    blockers: checks.filter((check) => check.required && !check.done),
    next: checks.find((check) => check.required && !check.done) || checks.find((check) => !check.done) || null,
  };
}

export function actualOrderProfit(order, operation = {}) {
  const purchase = asNumber(operation.purchaseCost);
  const shipping = asNumber(operation.shippingCost);
  const fees = asNumber(operation.feeCost);
  if ([purchase, shipping, fees].some((value) => value === null)) return null;
  if (order.currency !== "EUR") return null;
  return Number((Number(order.total || 0) - purchase - shipping - fees).toFixed(2));
}

export function summarizeOrders(orders = [], operations = {}) {
  const count = { total: orders.length, new: 0, processing: 0, shipping: 0, issues: 0, shipped: 0, revenue: 0 };
  for (const order of orders) {
    const status = workflowStatus(order, object(operations)[order.id]);
    if (status === "new") count.new += 1;
    if (["processing", "supplier_ordered"].includes(status)) count.processing += 1;
    if (["new", "processing", "supplier_ordered"].includes(status)) count.shipping += 1;
    if (status === "issue" || status === "awaiting_payment") count.issues += 1;
    if (status === "shipped" || status === "completed") count.shipped += 1;
    if (order.currency === "EUR") count.revenue += Number(order.total || 0);
  }
  return count;
}

export function visibleOrders(orders, operations, { query = "", filter = "all" } = {}) {
  const q = text(query).toLowerCase();
  const filtered = (Array.isArray(orders) ? orders : []).filter((order) => {
    const op = object(operations)[order.id] || {};
    const status = workflowStatus(order, op);
    const statusMatches = filter === "all" ||
      (filter === "new" && status === "new") ||
      (filter === "processing" && ["processing", "supplier_ordered"].includes(status)) ||
      (filter === "shipping" && ["new", "processing", "supplier_ordered"].includes(status)) ||
      (filter === "shipped" && ["shipped", "completed"].includes(status)) ||
      (filter === "issues" && ["issue", "awaiting_payment", "cancelled"].includes(status));
    if (!statusMatches) return false;
    const haystack = [order.id, order.buyerRef, order.recipient, op.supplierName, op.supplierOrderId,
      ...order.lines.flatMap((line) => [line.sku, line.title, line.listingId])].join(" ").toLowerCase();
    return !q || haystack.includes(q);
  });
  return filtered.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function normalizeOperationInput(input = {}) {
  const source = object(input);
  const allowed = ["NEW", "PROCESSING", "SUPPLIER_ORDERED", "SHIPPED", "COMPLETED", "ISSUE", "CANCELLED"];
  const status = text(source.workflowStatus).toUpperCase();
  const money = (key) => {
    if (source[key] === "" || source[key] === null || source[key] === undefined) return null;
    const value = Number(source[key]);
    return Number.isFinite(value) && value >= 0 && value <= 1_000_000 ? Math.round(value * 100) / 100 : null;
  };
  return {
    workflowStatus: allowed.includes(status) ? status : "NEW",
    supplierName: text(source.supplierName).slice(0, 160),
    supplierOrderId: text(source.supplierOrderId).slice(0, 160),
    purchaseCost: money("purchaseCost"),
    shippingCost: money("shippingCost"),
    feeCost: money("feeCost"),
    carrier: text(source.carrier).slice(0, 80),
    trackingNumber: text(source.trackingNumber).slice(0, 120),
    note: text(source.note).slice(0, 1600),
  };
}

export { ELYON_SKU };
