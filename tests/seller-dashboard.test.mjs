import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRevenueBuckets,
  buildSellerDashboardMetrics,
  buildSellerTasks,
  normalizeEbayOrder,
  normalizeSellerProduct,
} from "../seller-dashboard-v2.js";

const readyProduct = {
  id: "seller-1",
  source: "elyon_company_os",
  title: "Testprodukt A",
  pricing: {
    buyPrice: 10,
    salePrice: 25,
    profit: 6,
    marginPercent: 24,
  },
  readiness: {
    state: "ready_for_manual_listing",
    score: 100,
    blockers: [],
  },
  listing: {
    status: "live",
    ebayItemId: "111",
  },
};

const blockedProduct = {
  id: "seller-2",
  source: "elyon_company_os",
  title: "Testprodukt B",
  pricing: {
    buyPrice: 9,
    salePrice: 15,
    profit: 2,
    marginPercent: 13.3,
  },
  readiness: {
    state: "blocked",
    score: 70,
    blockers: ["Rücksendeadresse fehlt", "Mindestmarge nicht erreicht"],
  },
  listing: {
    status: "draft",
  },
};

const openOrder = {
  orderId: "ORDER-1",
  creationDate: "2026-07-26T10:00:00.000Z",
  orderFulfillmentStatus: "NOT_STARTED",
  orderPaymentStatus: "PAID",
  pricingSummary: {
    total: { value: "50.00", currency: "EUR" },
  },
  lineItems: [
    {
      legacyItemId: "111",
      title: "Testprodukt A",
      quantity: 2,
      lineItemCost: { value: "50.00", currency: "EUR" },
    },
  ],
};

const fulfilledOrder = {
  orderId: "ORDER-2",
  creationDate: "2026-07-25T10:00:00.000Z",
  orderFulfillmentStatus: "FULFILLED",
  orderPaymentStatus: "PAID",
  pricingSummary: {
    total: { value: "25.00", currency: "EUR" },
  },
  lineItems: [
    {
      legacyItemId: "111",
      title: "Testprodukt A",
      quantity: 1,
      lineItemCost: { value: "25.00", currency: "EUR" },
    },
  ],
};

test("normalizes Company OS product readiness and listing status", () => {
  const product = normalizeSellerProduct(readyProduct);
  assert.equal(product.isReady, true);
  assert.equal(product.isLive, true);
  assert.equal(product.ebayItemId, "111");
  assert.equal(product.profit, 6);
  assert.equal(product.margin, 24);
});

test("normalizes eBay orders without exposing raw credentials", () => {
  const order = normalizeEbayOrder(openOrder);
  assert.equal(order.id, "ORDER-1");
  assert.equal(order.total, 50);
  assert.equal(order.quantity, 2);
  assert.equal(order.isFulfilled, false);
  assert.equal(order.lineItems[0].itemId, "111");
  assert.equal(order.lineItems[0].lineTotal, 50);
});

test("builds honest seller metrics from product master and eBay orders", () => {
  const metrics = buildSellerDashboardMetrics({
    products: [readyProduct, blockedProduct],
    orders: [openOrder, fulfilledOrder],
    days: 30,
    ebayConnected: true,
  });

  assert.equal(metrics.revenue, 75);
  assert.equal(metrics.orderCount, 2);
  assert.equal(metrics.openOrders.length, 1);
  assert.equal(metrics.fulfilledOrders.length, 1);
  assert.equal(metrics.readyProducts.length, 1);
  assert.equal(metrics.blockedProducts.length, 1);
  assert.equal(metrics.liveProducts.length, 1);
  assert.equal(metrics.estimatedOrderProfit, 18);
  assert.equal(metrics.matchedLineItems, 2);
  assert.equal(metrics.totalLineItems, 2);
  assert.equal(metrics.topProducts[0].revenue, 75);
  assert.equal(metrics.topProducts[0].quantity, 3);
});

test("does not multiply eBay lineItemCost by quantity twice", () => {
  const metrics = buildSellerDashboardMetrics({
    products: [readyProduct],
    orders: [openOrder],
    days: 30,
    ebayConnected: true,
  });
  assert.equal(metrics.revenue, 50);
  assert.equal(metrics.topProducts[0].revenue, 50);
  assert.equal(metrics.topProducts[0].quantity, 2);
});

test("creates revenue buckets without demo values", () => {
  const normalized = [openOrder, fulfilledOrder].map(normalizeEbayOrder);
  const buckets = buildRevenueBuckets(normalized, 7, new Date("2026-07-27T12:00:00.000Z"));
  assert.equal(buckets.length, 7);
  assert.equal(buckets.reduce((sum, bucket) => sum + bucket.revenue, 0), 75);
  assert.equal(buckets.reduce((sum, bucket) => sum + bucket.orders, 0), 2);
});

test("prioritizes connection, open order and blocker actions", () => {
  const metrics = buildSellerDashboardMetrics({
    products: [readyProduct, blockedProduct],
    orders: [openOrder],
    days: 30,
    ebayConnected: false,
  });
  const tasks = buildSellerTasks(metrics, {});

  assert.match(tasks[0].title, /eBay-Verbindung/);
  assert.ok(tasks.some((task) => /Bestellung/.test(task.title)));
  assert.ok(tasks.some((task) => /blockiert/.test(task.title)));
  assert.ok(tasks.some((task) => /listingbereit/.test(task.title)));
});

test("shows a useful first-product task for an empty Seller Tool", () => {
  const metrics = buildSellerDashboardMetrics({ products: [], orders: [], days: 30, ebayConnected: true });
  const tasks = buildSellerTasks(metrics, {});
  assert.ok(tasks.some((task) => task.title === "Noch kein Seller-Produkt"));
  assert.equal(metrics.revenue, 0);
  assert.equal(metrics.estimatedOrderProfit, 0);
});
