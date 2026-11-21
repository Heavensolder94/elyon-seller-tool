import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("step 11 builds order-specific nonbinding preview inline, not a second page",async()=>{
  const ui=await readFile(new URL("../seller-order-invoices.js",import.meta.url),"utf8");
  assert.match(ui,/data-eoi-preview/);
  assert.match(ui,/invoicePreviewId === order\.id/);
  assert.match(ui,/Unverbindliche Rechnungsvorschau/);
  assert.match(ui,/linesMarkup\(order\)/);
  assert.match(ui,/keine Rechnungsnummer reserviert/);
  assert.match(ui,/function preflightMarkup/);
  assert.match(ui,/data-eoi-preflight/);
  assert.match(ui,/invoicePreflight\.get\(currentId\)\?\.ready===true/);
  assert.match(ui,/invoicePreflight\.get\(orderId\)\?\.ready!==true/);
  assert.match(ui,/\/api\/orders\/invoice-send-check\?orderId=/);
  assert.match(ui,/credentials:'same-origin'/);
});

test("step 11 retains server-only invoice issue and explicit real send confirmation",async()=>{
  const ui=await readFile(new URL("../seller-order-invoices.js",import.meta.url),"utf8");
  const api=await readFile(new URL("../api/orders/customer-message.js",import.meta.url),"utf8");
  assert.match(ui,/issue-kleinunternehmer-invoice/);
  assert.match(ui,/window\.confirm\('ECHTE eBay-Nachricht/);
  assert.match(api,/body\.confirmation!=="SEND_ORDER_INVOICE_MESSAGE"/);
  assert.match(api,/if\(!messageDeliveryEnabled\(\)\)/);
  assert.match(api,/message_already_attempted/);
  assert.match(api,/status:"unknown"/);
});
