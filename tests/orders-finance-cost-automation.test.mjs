import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  financeOrderCostHints, suggestRecordedCosts, estimatedOrderCosts,
  normalizeEbayOrder, actualOrderProfit
} from "../seller-orders-v2-core.js";

const order = normalizeEbayOrder({
  orderId: "12-00012-00333", orderPaymentStatus: "PAID",
  pricingSummary: { total: { value: "59.90", currency: "EUR" } },
  lineItems: [{ lineItemId: "1", sku: "ELY-000001", title: "Testartikel", quantity: 1 }],
});

test("only exact order IDs and explicitly categorized EUR expense entries enter cost hints", () => {
  const rows = [
    { id:"one", orderId:order.id, category:"supplier_expense", amount:-24, currency:"EUR", status:"approved" },
    { id:"two", orderId:order.id, category:"shipping_expense", amount:-4, currency:"EUR", status:"approved" },
    { id:"three", orderId:order.id, category:"ebay_fee", amount:-7, currency:"EUR", status:"needs_review" },
    { id:"four", orderId:"12-00012-00334", category:"ebay_fee", amount:-11, currency:"EUR" },
    { id:"five", orderId:order.id, category:"advertising_expense", amount:-9, currency:"EUR" },
    { id:"six", orderId:order.id, category:"revenue", amount:59.90, currency:"EUR" },
    { id:"seven", orderId:order.id, category:"ebay_fee", amount:-10, currency:"USD" },
    { id:"eight", orderId:order.id, category:"supplier_expense", amount:-30, currency:"EUR", voidedAt:"2026-11-01" },
    { orderId:order.id, category:"shipping_expense", amount:-90, currency:"EUR" },
  ];
  const group = financeOrderCostHints(rows, {orderIds:[order.id]});
  assert.deepEqual(Object.keys(group), [order.id]);
  assert.equal(group[order.id].purchaseCost.value, 24);
  assert.equal(group[order.id].purchaseCost.approved, true);
  assert.equal(group[order.id].shippingCost.value, 4);
  assert.equal(group[order.id].feeCost.value, 7);
  assert.equal(group[order.id].feeCost.approved, false);
});

test("duplicate normalized rows do not double count and fees can be split across line items", () => {
  const rows = [
    {id:"fee-a", orderId:order.id, category:"ebay_fee", amount:-1.49, currency:"EUR", status:"approved", dedupeKey:"FEE:A"},
    {id:"fee-copy", orderId:order.id, category:"ebay_fee", amount:-1.49, currency:"EUR", status:"approved", dedupeKey:"FEE:A"},
    {id:"fee-b", orderId:order.id, category:"ebay_fee", amount:-2.55, currency:"EUR", status:"approved", dedupeKey:"FEE:B"},
  ];
  const group = financeOrderCostHints(rows);
  assert.equal(group[order.id].feeCost.value, 4.04);
  assert.equal(group[order.id].feeCost.count, 2);
});

test("existing entered zero or manually confirmed cost is never overwritten", () => {
  const hints = {
    purchaseCost: { value:24, approved:true }, shippingCost: { value:4, approved:false },
    feeCost: { value:7, approved:true },
  };
  const proposal = suggestRecordedCosts({ purchaseCost:0, feeCost:10 }, hints);
  assert.equal(proposal.values.purchaseCost, 0);
  assert.equal(proposal.values.feeCost, 10);
  assert.equal(proposal.values.shippingCost, 4);
  assert.deepEqual(Object.keys(proposal.sources), ["shippingCost"]);
  assert.equal(proposal.sources.shippingCost.approved, false);
});

test("unknown actual costs are not populated by Company OS estimates", () => {
  const products=[{ articleNumber:"ELY-000001", title:"Testartikel",
    pricing:{buyPrice:24,shippingCost:4,estimatedFees:7} }];
  assert.deepEqual(estimatedOrderCosts(order,products), {
    purchase:24, shipping:4, fees:7, estimatesOnly:true
  });
  assert.equal(actualOrderProfit(order, {}), null);
  assert.equal(actualOrderProfit(order, suggestRecordedCosts({},{}).values), null);
  assert.equal(actualOrderProfit(order, {
    purchaseCost:24, shippingCost:4, feeCost:7
  }), 24.9);
});

test("Finance cost hints are read-only GET output and never themselves write to Finance store", async () => {
  const api = await readFile(new URL("../api/orders/operations.js", import.meta.url), "utf8");
  assert.match(api,/financeCostHints: financeOrderCostHints\(state\.transactions\)/);
  assert.match(api,/requireSellerAccess\(req, res/);
  assert.match(api,/if \(req\.method === "GET"\)/);
  assert.match(api,/writeFinanceState\(/);
});

test("demonstration costs are isolated and page distinguishes provisional profit", async () => {
  const ui = await readFile(new URL("../seller-orders-v2.js", import.meta.url), "utf8");
  assert.match(ui,/financeTransactions:\[/);
  assert.match(ui,/DEMO-EBAY-FEE-1/);
  assert.match(ui,/financeHintsNow = \(\) => state\.demoMode \? financeOrderCostHints\(DEMO\.financeTransactions\)/);
  assert.match(ui,/financeCostHints = obj\(finance\.value\.financeCostHints\)/);
  assert.match(ui,/suggestRecordedCosts\(op, costHints\)/);
  assert.match(ui,/Vorläufiges Ergebnis aus Finanzbuchungen/);
  assert.match(ui,/Geschätzter Gewinn aus Company OS/);
  assert.match(ui,/Ergebnis nach gespeicherten Ist-Kosten/);
  assert.match(ui,/autoCost\.sources/);
  assert.match(ui,/noch nicht gespeichert/);
  assert.match(ui,/costHintCount/);
});

test("finance suggestions never manufacture profitability from a partial expense set", () => {
  const hints = financeOrderCostHints([
    {id:"supplier", orderId:order.id, category:"supplier_expense", amount:-24, currency:"EUR"}
  ]);
  const proposal = suggestRecordedCosts({}, hints[order.id]);
  assert.equal(proposal.values.purchaseCost, 24);
  assert.equal(proposal.values.shippingCost, undefined);
  assert.equal(actualOrderProfit(order, proposal.values), null);
});

test("malicious prototype order IDs do not poison cost hint map", () => {
  const hints=financeOrderCostHints([
    {id:"entry", orderId:"__proto__", category:"supplier_expense", amount:-3, currency:"EUR"}
  ]);
  assert.equal(hints.__proto__.purchaseCost.value, 3);
  assert.equal({}.purchaseCost, undefined);
});
