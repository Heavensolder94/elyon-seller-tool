import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normalizeEbayOrder, workflowStatus, paymentConfirmed, productForLine,
  estimatedOrderCosts, actualOrderProfit, summarizeOrders, visibleOrders,
  normalizeOperationInput, escapeHtml,
} from "../seller-orders-v2-core.js";

const order = (id, overrides = {}) => normalizeEbayOrder({
  orderId: id, creationDate: "2026-11-20T12:00:00Z",
  orderPaymentStatus: "PAID", orderFulfillmentStatus: "NOT_STARTED",
  pricingSummary: { total: { value: "44.90", currency: "EUR" } },
  lineItems: [
    { lineItemId: "1", title: "Artikel A", sku: "ELY-000001-01", quantity: 2, lineItemCost: { value: "29.90" } },
    { lineItemId: "2", title: "Artikel B", sku: "ELY-000002", quantity: 1, lineItemCost: { value: "15.00" } },
  ], ...overrides,
});

test("multi-item orders count as one order but retain both line items and quantities", () => {
  const item = order("12-11111-11111");
  assert.equal(item.lines.length, 2);
  assert.equal(item.lines.reduce((sum, line) => sum + line.quantity, 0), 3);
  assert.equal(summarizeOrders([item]).total, 1);
});

test("payment status is separate from fulfilment and internal state", () => {
  const awaiting = order("12-11111-11112", { orderPaymentStatus: "NOT_PAID" });
  const shipped = order("12-11111-11113", { orderFulfillmentStatus: "FULFILLED" });
  assert.equal(paymentConfirmed(awaiting), false);
  assert.equal(workflowStatus(awaiting, {}), "awaiting_payment");
  assert.equal(workflowStatus(shipped, {}), "shipped");
  assert.equal(workflowStatus(order("12-11111-11114"), { workflowStatus: "SUPPLIER_ORDERED" }), "supplier_ordered");
  assert.equal(workflowStatus(order("12-11111-11115"), { workflowStatus: "ISSUE" }), "issue");
});

test("actual profit never assumes unknown supplier costs or fees are zero", () => {
  const item = order("12-11111-11111");
  assert.equal(actualOrderProfit(item, {}), null);
  assert.equal(actualOrderProfit(item, { purchaseCost: 10, shippingCost: 2 }), null);
  assert.equal(actualOrderProfit(item, { purchaseCost: 10, shippingCost: 2, feeCost: 3 }), 29.9);
  const foreign = order("12-11111-11116", { pricingSummary: { total: { value: "44.90", currency: "USD" } } });
  assert.equal(actualOrderProfit(foreign, { purchaseCost: 10, shippingCost: 2, feeCost: 3 }), null);
});

test("company OS item matching is identity-based and never selects ambiguous duplicates", () => {
  const products = [
    { id: "p1", articleNumber: "ELY-000001", title: "Produkt A", pricing: { buyPrice: 8, shippingCost: 2, estimatedFees: 1 } },
    { id: "p2", articleNumber: "ELY-000002", title: "Produkt B", pricing: { buyPrice: 5, shippingCost: 0, estimatedFees: 0.5 } },
  ];
  const item = order("12-11111-11111");
  assert.equal(productForLine(item.lines[0], products).id, "p1");
  assert.equal(productForLine(item.lines[1], products).id, "p2");
  assert.deepEqual(estimatedOrderCosts(item, products), { purchase: 21, shipping: 4, fees: 2.5, estimatesOnly: true });
  assert.equal(productForLine(item.lines[0], [...products, { ...products[0], id: "duplicate" }]), null);
});

test("search, filter and summary count actual orders", () => {
  const list = [order("12-11111-11111"), order("12-11111-11112", { orderPaymentStatus: "NOT_PAID" })];
  assert.equal(summarizeOrders(list).total, 2);
  assert.equal(summarizeOrders(list).issues, 1);
  assert.equal(visibleOrders(list, {}, { query: "ELY-000002" }).length, 2);
  assert.equal(visibleOrders(list, {}, { filter: "new" }).length, 1);
  assert.equal(visibleOrders(list, {}, { filter: "issues" }).length, 1);
});

test("operations protect legacy invoice status and limit monetary input", () => {
  const op = normalizeOperationInput({ workflowStatus: "PROCESSING", purchaseCost: "", shippingCost: "-12", feeCost: "3.22", note: "x".repeat(1800) });
  assert.equal(op.workflowStatus, "PROCESSING");
  assert.equal(op.purchaseCost, null);
  assert.equal(op.shippingCost, null);
  assert.equal(op.feeCost, 3.22);
  assert.equal(op.note.length, 1600);
  assert.equal(Object.hasOwn(op, "status"), false);
  assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
});

test("orders route is protected and uses revision-checked Finance-state updates only", async () => {
  const server = await readFile(new URL("../api/orders/operations.js", import.meta.url), "utf8");
  assert.match(server, /requireSellerAccess\(req, res/);
  assert.match(server, /expectedRevision: body\.expectedRevision/);
  assert.match(server, /writeFinanceState\(\{ orderOperations: \{ \[orderId\]: operation \} \}/);
  assert.doesNotMatch(server, /createEbayShippingFulfillment|issueKleinunternehmerInvoice|publishEbayOffer/);
});

test("order list pagination, projection and build are all wired into production output", async () => {
  const [ebay, prepare, ui, css] = await Promise.all([
    readFile(new URL("../internal/ebay/index.js", import.meta.url), "utf8"),
    readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8"),
    readFile(new URL("../seller-orders-v2.js", import.meta.url), "utf8"),
    readFile(new URL("../seller-orders-v2.css", import.meta.url), "utf8"),
  ]);
  assert.match(ebay, /const maxPages = 20/);
  assert.match(ebay, /endpoint\.searchParams\.set\("offset"/);
  assert.match(ebay, /truncated: orders\.length/);
  assert.match(prepare, /seller-orders-v2-core\.js/);
  assert.match(prepare, /seller-orders-v2\.css/);
  assert.match(prepare, /seller-orders-v2\.js/);
  assert.match(ui, /ElyonSellerFinance\.openInvoices/);
  assert.match(ui, /data-order-shipping/);
  assert.match(ui, /normalizeOperationInput\(values\)/);
  assert.match(css, /#ordersTab\.elyon-orders-v2-active > :not\(#elyonOrdersV2Root\)/);
});
