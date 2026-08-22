import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRevenueBuckets,
  buildSellerDashboardMetrics,
  buildSellerTasks,
  AUTO_REFRESH_INTERVAL_MS,
  FOCUS_REFRESH_COOLDOWN_MS,
  normalizeEbayListing,
  normalizeEbayOrder,
  normalizeSellerProduct,
} from "../seller-dashboard-v2.js";

test("uses a bounded automatic refresh interval", () => {
  assert.equal(AUTO_REFRESH_INTERVAL_MS, 5 * 60 * 1000);
  assert.equal(FOCUS_REFRESH_COOLDOWN_MS, 60 * 1000);
});

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

const unpublishedOffer = {
  offerId: "offer-draft",
  sku: "sku-draft",
  status: "UNPUBLISHED",
  price: 19.99,
  quantity: 2,
  marketplaceId: "EBAY_DE",
};

const publishedOffer = {
  offerId: "offer-live",
  sku: "sku-live",
  status: "PUBLISHED",
  listingId: "111",
  price: 25,
  quantity: 3,
  marketplaceId: "EBAY_DE",
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
      sku: "ELY-001274",
      offerId: "offer-1274",
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

test("normalizes Company OS product readiness without making it listing source of truth", () => {
  const product = normalizeSellerProduct(readyProduct);
  assert.equal(product.isReady, true);
  assert.equal(product.isLive, true);
  assert.equal(product.ebayItemId, "111");
  assert.equal(product.profit, 6);
  assert.equal(product.margin, 24);
});

test("normalizes eBay Inventory offers into published and unpublished listing states", () => {
  const draft = normalizeEbayListing(unpublishedOffer);
  const active = normalizeEbayListing(publishedOffer);
  assert.equal(draft.isDraft, true);
  assert.equal(draft.isPublished, false);
  assert.equal(active.isDraft, false);
  assert.equal(active.isPublished, true);
  assert.equal(active.listingId, "111");
});

test("normalizes eBay orders without exposing raw credentials", () => {
  const order = normalizeEbayOrder(openOrder);
  assert.equal(order.id, "ORDER-1");
  assert.equal(order.total, 50);
  assert.equal(order.quantity, 2);
  assert.equal(order.isFulfilled, false);
  assert.equal(order.lineItems[0].itemId, "111");
  assert.equal(order.lineItems[0].lineTotal, 50);
  assert.equal(order.lineItems[0].productReference.articleNumber, "ELY-001274");
  assert.equal(order.lineItems[0].productReference.sku, "ELY-001274");
  assert.equal(order.lineItems[0].productReference.offerId, "offer-1274");
  assert.equal(order.lineItems[0].productReference.listingId, "111");
});

test("builds honest seller metrics from Product Master, eBay listings and eBay orders", () => {
  const metrics = buildSellerDashboardMetrics({
    products: [readyProduct, blockedProduct],
    listings: [unpublishedOffer, publishedOffer],
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
  assert.equal(metrics.draftProducts.length, 1);
  assert.equal(metrics.liveProducts.length, 1);
  assert.equal(metrics.estimatedOrderProfit, 18);
  assert.equal(metrics.matchedLineItems, 2);
  assert.equal(metrics.totalLineItems, 2);
  assert.equal(metrics.topProducts[0].revenue, 75);
  assert.equal(metrics.topProducts[0].quantity, 3);
});

test("Product Master draft/live flags never create eBay listing counts", () => {
  const metrics = buildSellerDashboardMetrics({
    products: [readyProduct, blockedProduct],
    listings: [],
    orders: [],
    ebayConnected: true,
  });
  assert.equal(metrics.draftProducts.length, 0);
  assert.equal(metrics.liveProducts.length, 0);
});

test("counts eBay listing state even without a Product Master match", () => {
  const metrics = buildSellerDashboardMetrics({
    products: [],
    listings: [unpublishedOffer, publishedOffer],
    orders: [],
    ebayConnected: true,
  });
  assert.equal(metrics.draftProducts.length, 1);
  assert.equal(metrics.liveProducts.length, 1);
});

test("does not multiply eBay lineItemCost by quantity twice", () => {
  const metrics = buildSellerDashboardMetrics({
    products: [readyProduct],
    listings: [publishedOffer],
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
    listings: [unpublishedOffer],
    orders: [openOrder],
    days: 30,
    ebayConnected: false,
  });
  const tasks = buildSellerTasks(metrics, {});

  assert.match(tasks[0].title, /eBay-Verbindung/);
  assert.ok(tasks.some((task) => /Bestellung/.test(task.title)));
  assert.ok(tasks.some((task) => /blockiert/.test(task.title)));
  assert.ok(tasks.some((task) => /listingbereit/.test(task.title)));
  assert.ok(tasks.some((task) => /Listing-Entwurf/.test(task.title)));
});

test("shows a useful first-product task for an empty Seller Tool", () => {
  const metrics = buildSellerDashboardMetrics({ products: [], listings: [], orders: [], days: 30, ebayConnected: true });
  const tasks = buildSellerTasks(metrics, {});
  assert.ok(tasks.some((task) => task.title === "Noch kein Seller-Produkt"));
  assert.equal(metrics.revenue, 0);
  assert.equal(metrics.estimatedOrderProfit, 0);
});
