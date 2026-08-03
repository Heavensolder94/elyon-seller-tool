import test from "node:test";
import assert from "node:assert/strict";
import {
  parseEbayCsv,
  normalizeFinanceTransaction,
  normalizeEbayApiTransactions,
  mergeTransactions,
  calculateMetrics,
  exportDatevPreparation,
  buildEurSummary,
} from "../seller-finance-core.js";

test("parses German eBay CSV and classifies ad fees", () => {
  const csv = [
    "Transaktions-ID;Bestellnummer;Datum;Transaktionstyp;Gebührentyp;Betrag;Währung;Beschreibung",
    "sale-1;12-345;01.08.2026;SALE;;29,99;EUR;Dokumentenclip",
    "ad-1;12-345;01.08.2026;NON_SALE_CHARGE;AD_FEE;-1,50;EUR;Promoted Listings",
  ].join("\n");
  const result = parseEbayCsv(csv);
  assert.equal(result.transactions.length, 2);
  assert.equal(result.transactions[0].category, "revenue");
  assert.equal(result.transactions[0].amount, 29.99);
  assert.equal(result.transactions[1].category, "advertising_expense");
  assert.equal(result.transactions[1].amount, -1.5);
});

test("payout is a transfer and never counted as second revenue", () => {
  const sale = normalizeFinanceTransaction({ transactionId: "sale", transactionType: "SALE", amount: 40 });
  const payout = normalizeFinanceTransaction({ transactionId: "payout", transactionType: "PAYOUT", amount: 35 });
  const metrics = calculateMetrics([sale, payout]);
  assert.equal(metrics.revenue, 40);
  assert.equal(metrics.payouts, 35);
});

test("deduplicates by transaction type and transaction id", () => {
  const first = normalizeFinanceTransaction({ transactionId: "x1", transactionType: "SALE", amount: 20, title: "Alt" });
  const second = normalizeFinanceTransaction({ transactionId: "x1", transactionType: "SALE", amount: 20, title: "Neu" });
  const merged = mergeTransactions([first], [second]);
  assert.equal(merged.transactions.length, 1);
  assert.equal(merged.duplicates, 1);
  assert.equal(merged.transactions[0].title, "Neu");
});

test("normalizes marketplace fees from eBay order line items", () => {
  const rows = normalizeEbayApiTransactions({
    transactions: [{
      transactionId: "sale-42",
      transactionType: "SALE",
      orderId: "order-42",
      transactionDate: "2026-08-01T10:00:00.000Z",
      amount: { value: "29.99", currency: "EUR" },
      orderLineItems: [{
        lineItemId: "li-42",
        legacyItemId: "item-42",
        marketplaceFees: [
          { feeType: "FINAL_VALUE_FEE", amount: { value: "4.20", currency: "EUR" } },
          { feeType: "AD_FEE", amount: { value: "1.50", currency: "EUR" } },
        ],
      }],
    }],
  });
  assert.equal(rows.length, 3);
  assert.equal(rows.filter((row) => row.category === "ebay_fee").length, 1);
  assert.equal(rows.filter((row) => row.category === "advertising_expense").length, 1);
});

test("calculates actual profit after fees, ads and supplier cost", () => {
  const transactions = [
    normalizeFinanceTransaction({ transactionId: "s", transactionType: "SALE", amount: 39.99 }),
    normalizeFinanceTransaction({ transactionId: "f", transactionType: "NON_SALE_CHARGE", feeType: "FINAL_VALUE_FEE", amount: -5.1 }),
    normalizeFinanceTransaction({ transactionId: "a", transactionType: "NON_SALE_CHARGE", feeType: "AD_FEE", amount: -2 }),
    normalizeFinanceTransaction({ transactionId: "p", transactionType: "SUPPLIER_PURCHASE", category: "supplier_expense", amount: -19 }),
  ];
  const metrics = calculateMetrics(transactions);
  assert.equal(metrics.revenue, 39.99);
  assert.equal(metrics.ebayFees, 5.1);
  assert.equal(metrics.advertising, 2);
  assert.equal(metrics.supplier, 19);
  assert.equal(Number(metrics.profit.toFixed(2)), 13.89);
});

test("creates DATEV preparation and EÜR working summary without filing", () => {
  const transactions = [normalizeFinanceTransaction({ transactionId: "s", transactionType: "SALE", orderId: "o-1", amount: 10, status: "approved" })];
  const datev = exportDatevPreparation(transactions, { revenueAccount: "Erlöse", defaultTaxCode: "" });
  assert.match(datev, /DATEV|Umsatz/);
  assert.match(datev, /o-1/);
  const eur = buildEurSummary(transactions);
  assert.equal(eur.operatingIncome, 10);
  assert.equal(eur.surplus, 10);
  assert.match(eur.disclaimer, /keine Steuererklärung/i);
});
