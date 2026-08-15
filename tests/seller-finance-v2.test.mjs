import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFinanceTransaction } from "../seller-finance-core.js";
import {
  resolveFinancePeriod,
  filterFinanceTransactions,
  buildFinanceDataQuality,
  buildOrderProfitability,
  buildProductProfitability,
  reconcilePayouts,
  buildMonthCloseReadiness,
} from "../seller-finance.js";

const tx = (input) => normalizeFinanceTransaction(input, input.source || "ebay_finances_api");

test("Finance V2 resolves month, previous month and quarter periods", () => {
  const now = new Date("2026-08-15T12:00:00+02:00");
  const month = resolveFinancePeriod("month", now);
  const previous = resolveFinancePeriod("previous_month", now);
  const quarter = resolveFinancePeriod("quarter", now);
  assert.match(month.label, /August 2026/i);
  assert.equal(month.start.slice(0, 7), "2026-08");
  assert.equal(previous.start.slice(0, 7), "2026-07");
  assert.equal(quarter.label, "Q3 2026");
  assert.equal(quarter.start.slice(0, 7), "2026-07");
});

test("Finance V2 filters transactions to the selected period", () => {
  const rows = [
    tx({ transactionId: "jul", transactionType: "SALE", transactionDate: "2026-07-31T10:00:00Z", amount: 10 }),
    tx({ transactionId: "aug", transactionType: "SALE", transactionDate: "2026-08-01T10:00:00Z", amount: 20 }),
  ];
  const period = resolveFinancePeriod("month", new Date("2026-08-15T12:00:00Z"));
  const filtered = filterFinanceTransactions(rows, period);
  assert.deepEqual(filtered.map((row) => row.transactionId), ["aug"]);
});

test("Finance V2 reports missing supplier costs, foreign currency and review work", () => {
  const rows = [
    tx({ transactionId: "sale-1", orderId: "o-1", transactionType: "SALE", amount: 30, currency: "EUR", status: "approved" }),
    tx({ transactionId: "sale-2", orderId: "o-2", transactionType: "SALE", amount: 40, currency: "USD", status: "needs_review" }),
    tx({ transactionId: "supplier-1", orderId: "o-1", transactionType: "SUPPLIER_PURCHASE", category: "supplier_expense", amount: -10, currency: "EUR", status: "approved" }),
  ];
  const quality = buildFinanceDataQuality(rows, []);
  assert.equal(quality.missingSupplierCount, 1);
  assert.equal(quality.foreignCurrencyCount, 1);
  assert.equal(quality.unapprovedCount, 1);
  assert.equal(quality.ready, false);
});

test("Finance V2 calculates order profitability from real transaction categories", () => {
  const rows = [
    tx({ transactionId: "sale", orderId: "o-1", itemId: "sku-1", transactionType: "SALE", amount: 30, status: "approved" }),
    tx({ transactionId: "fee", orderId: "o-1", itemId: "sku-1", transactionType: "NON_SALE_CHARGE", feeType: "FINAL_VALUE_FEE", amount: -4, status: "approved" }),
    tx({ transactionId: "ad", orderId: "o-1", itemId: "sku-1", transactionType: "NON_SALE_CHARGE", feeType: "AD_FEE", amount: -1, status: "approved" }),
    tx({ transactionId: "supplier", orderId: "o-1", itemId: "sku-1", transactionType: "SUPPLIER_PURCHASE", category: "supplier_expense", amount: -10, status: "approved" }),
  ];
  const [order] = buildOrderProfitability(rows);
  assert.equal(order.revenue, 30);
  assert.equal(order.supplier, 10);
  assert.equal(order.ebayFees, 4);
  assert.equal(order.advertising, 1);
  assert.equal(order.profit, 15);
  assert.equal(order.complete, true);
  assert.equal(Number(order.marginPercent.toFixed(1)), 50);
});

test("Finance V2 aggregates product profitability by item id", () => {
  const rows = [
    tx({ transactionId: "sale-a", orderId: "o-a", itemId: "sku-1", title: "Produkt A", transactionType: "SALE", amount: 25, status: "approved" }),
    tx({ transactionId: "supplier-a", orderId: "o-a", itemId: "sku-1", transactionType: "SUPPLIER_PURCHASE", category: "supplier_expense", amount: -8, status: "approved" }),
    tx({ transactionId: "sale-b", orderId: "o-b", itemId: "sku-1", title: "Produkt A", transactionType: "SALE", amount: 25, status: "approved" }),
    tx({ transactionId: "supplier-b", orderId: "o-b", itemId: "sku-1", transactionType: "SUPPLIER_PURCHASE", category: "supplier_expense", amount: -8, status: "approved" }),
  ];
  const [product] = buildProductProfitability(rows);
  assert.equal(product.itemId, "sku-1");
  assert.equal(product.orderCount, 2);
  assert.equal(product.revenue, 50);
  assert.equal(product.costs, 16);
  assert.equal(product.profit, 34);
});

test("Finance V2 reconciles eBay payouts without supplier costs", () => {
  const rows = [
    tx({ transactionId: "sale", orderId: "o-1", transactionType: "SALE", amount: 30, status: "approved", source: "ebay_finances_api" }),
    tx({ transactionId: "fee", orderId: "o-1", transactionType: "NON_SALE_CHARGE", feeType: "FINAL_VALUE_FEE", amount: -4, status: "approved", source: "ebay_finances_api" }),
    tx({ transactionId: "ad", orderId: "o-1", transactionType: "NON_SALE_CHARGE", feeType: "AD_FEE", amount: -1, status: "approved", source: "ebay_finances_api" }),
    tx({ transactionId: "supplier", orderId: "o-1", transactionType: "SUPPLIER_PURCHASE", category: "supplier_expense", amount: -10, status: "approved", source: "elyon_supplier_manual" }),
    tx({ transactionId: "payout", transactionType: "PAYOUT", amount: 25, status: "approved", source: "ebay_finances_api" }),
  ];
  const result = reconcilePayouts(rows);
  assert.equal(result.expected, 25);
  assert.equal(result.payouts, 25);
  assert.equal(result.difference, 0);
  assert.equal(result.balanced, true);
});

test("Finance V2 month close blocks missing documents and then becomes ready", () => {
  const rows = [
    tx({ transactionId: "sale", orderId: "o-1", transactionType: "SALE", amount: 30, status: "approved" }),
    tx({ transactionId: "supplier", orderId: "o-1", transactionType: "SUPPLIER_PURCHASE", category: "supplier_expense", amount: -10, status: "approved" }),
  ];
  const blocked = buildMonthCloseReadiness(rows, []);
  assert.equal(blocked.ready, false);
  assert.match(blocked.blockers.join(" "), /ohne Beleg/i);
  rows[1].documentIds = ["doc-1"];
  const ready = buildMonthCloseReadiness(rows, [{ id: "doc-1" }]);
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.blockers, []);
});
