import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  normalizeEbayOrder, orderCompletionChecklist, normalizeOperationInput, paymentConfirmed
} from "../seller-orders-v2-core.js";
import { normalizeFulfillmentInput } from "../lib/ebay-production.js";

const base = (status = "PAID", shipping = "NOT_STARTED") => normalizeEbayOrder({
  orderId:"12-12345-67890", creationDate:"2026-11-21T09:00:00Z",
  orderPaymentStatus:status, orderFulfillmentStatus:shipping,
  pricingSummary:{total:{currency:"EUR",value:"35.00"}},
  lineItems:[{lineItemId:"a",sku:"ELY-000001",quantity:1,title:"Beispiel"}],
});
const op = {
  workflowStatus:"PROCESSING", supplierName:"Lieferant", supplierOrderId:"SUP-123",
  carrier:"DHL", trackingNumber:"TRACK-123", purchaseCost:14, shippingCost:3, feeCost:4
};
const invoice = {immutable:true,invoiceNumber:"ELYON-2026-0001"};

test("completion checklist distinguishes mandatory evidence from recommended cost accounting",()=>{
  const empty=orderCompletionChecklist(base(), {}, null);
  assert.equal(empty.ready,false);
  assert.ok(empty.blockers.some(x=>x.key==="supplierOrder"));
  assert.ok(empty.blockers.some(x=>x.key==="invoice"));
  assert.ok(empty.blockers.some(x=>x.key==="ebayShipping"));
  const ready=orderCompletionChecklist(base("PAID","FULFILLED"),op,invoice);
  assert.equal(ready.ready,true);
  assert.equal(ready.blockers.length,0);
  assert.ok(ready.checks.every(x=>x.done));
  const noCosts=orderCompletionChecklist(base("PAID","FULFILLED"),
    {...op,purchaseCost:null,shippingCost:null,feeCost:null},invoice);
  assert.equal(noCosts.ready,true);
  assert.equal(noCosts.checks.find(x=>x.key==="costs").done,false);
  assert.equal(noCosts.checks.find(x=>x.key==="costs").required,false);
});

test("unpaid, unshipped, invoiceless or undocumented supplier orders cannot be marked complete",()=>{
  const variants=[
    [base("NOT_PAID","FULFILLED"),op,invoice,"payment"],
    [base("PAID","NOT_STARTED"),op,invoice,"ebayShipping"],
    [base("PAID","FULFILLED"),{...op,supplierOrderId:""},invoice,"supplierOrder"],
    [base("PAID","FULFILLED"),{...op,trackingNumber:""},invoice,"carrier"],
    [base("PAID","FULFILLED"),op,null,"invoice"],
  ];
  for(const [order,operation,document,key] of variants){
    const result=orderCompletionChecklist(order,operation,document);
    assert.equal(result.ready,false,key);
    assert.ok(result.blockers.some(x=>x.key===key),key);
  }
});

test("hyphenated eBay order IDs are valid shipment IDs, but invalid input is rejected",()=>{
  const valid=normalizeFulfillmentInput({orderId:"12-12345-67890",carrier:"DHL",trackingNumber:"T-11"});
  assert.equal(valid.orderId,"12-12345-67890");
  assert.throws(()=>normalizeFulfillmentInput({orderId:"DEMO-1001",trackingNumber:"X"}));
  assert.throws(()=>normalizeFulfillmentInput({orderId:"12-AB-12345",trackingNumber:"X"}));
});

test("server gate independently re-reads eBay and persisted invoice before a final closure",async()=>{
  const s=await readFile(new URL("../api/orders/operations.js",import.meta.url),"utf8");
  assert.match(s,/operation\.workflowStatus === "COMPLETED"/);
  assert.match(s,/ebayUserSession\("production"\)/);
  assert.match(s,/orderCompletionChecklist\(normalizeEbayOrder\(fresh\), operation, verifiedInvoice\)/);
  assert.match(s,/order_completion_blocked/);
  assert.match(s,/finance\.revision !== body\.expectedRevision/);
  assert.match(s,/writeFinanceState/);
});

test("shipment requires confirmation, saved supplier and tracking, fresh eBay payment and correct ID",async()=>{
  const s=await readFile(new URL("../api/orders/shipping.js",import.meta.url),"utf8");
  assert.match(s,/requireSellerAccess/);
  assert.match(s,/req\.method !== "POST"/);
  assert.match(s,/body\.confirmation !== "CONFIRM_EBAY_SHIPPING"/);
  assert.match(s,/supplier_reference_required/);
  assert.match(s,/shipping_data_not_saved/);
  assert.match(s,/finance_conflict/);
  assert.match(s,/order_identity_mismatch/);
  assert.match(s,/paymentConfirmed\(order\)/);
  assert.match(s,/createEbayShippingFulfillment\(/);
});

test("the existing invoice engine is reused and no invoice is auto-issued",async()=>{
  const s=await readFile(new URL("../seller-orders-v2.js",import.meta.url),"utf8");
  assert.match(s,/await import\("\/seller-order-invoices\.js"\)/);
  assert.match(s,/window\.ElyonOrderInvoices\.create\(\{ id: order\.id \}\)/);
  assert.match(s,/if \(event\.target\.closest\("\[data-order-invoice\]"\)\) return void openOrderInvoice/);
  assert.match(s,/if \(state\.demoMode\) return openDemoModal\("invoice"\)/);
  assert.match(s,/checklistMarkup\(order, op\)/);
  assert.match(s,/data-ocv4-complete/);
  assert.match(s,/data-order-ebay-shipping/);
  assert.match(s,/window\.confirm\("ECHTE eBay-Versandmeldung/);
  assert.match(s,/if \(state\.demoMode\) return openDemoModal\("shipping"\)/);
  assert.doesNotMatch(s,/goToTab\("automationTab"\)/);
});

test("client cannot complete an unpaid order, and demo remains isolated",async()=>{
  const s=await readFile(new URL("../seller-orders-v2.js",import.meta.url),"utf8");
  assert.match(s,/next === "COMPLETED"/);
  assert.match(s,/!assessment\.ready/);
  assert.match(s,/DEMO\.operations\[order\.id\] =/);
  assert.match(s,/order\.fulfillmentStatus = "FULFILLED"; \/\/ demo-only/);
  assert.match(s,/const ordersNow = \(\) => state\.demoMode \? DEMO\.orders/);
  assert.match(s,/state\.actionBusy = true/);
});
