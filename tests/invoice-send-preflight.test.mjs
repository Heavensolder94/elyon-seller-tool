import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("invoice send preflight is read-only, seller protected and requires production evidence", async () => {
  const api = await readFile(new URL("../api/orders/invoice-send-check.js",import.meta.url),"utf8");
  assert.match(api,/requireSellerAccess\(req, res\)/);
  assert.match(api,/req\.method !== "GET"/);
  assert.match(api,/messageDeliveryEnabled\(\)/);
  assert.match(api,/store\.persistent === true/);
  assert.match(api,/verifiedInvoicePdf\(record, orderId\)/);
  assert.match(api,/paymentConfirmed\(normalized\)/);
  assert.match(api,/raw\?\.buyer\?\.username/);
  assert.match(api,/messageScopeVerified = summarizeEbayIntrospection\(data\)\.messageScopeGranted === true/);
  assert.match(api,/bytes\.equals\(pdf\)/);
  assert.match(api,/noPreviousSendAttempt/);
  assert.match(api,/Object\.values\(checks\)\.every\(Boolean\)/);
  assert.match(api,/realInvoiceIssued:false/);
  assert.match(api,/ebayMessageSent:false/);
  assert.doesNotMatch(api,/writeFinanceState|reserveFinanceInvoiceNumber|send_message|SEND_ORDER_INVOICE_MESSAGE/);
  assert.doesNotMatch(api,/signedUrl:|accessToken:/);
});

test("preflight fails closed for demo IDs and unissued invoices before eBay lookup", async () => {
  const api = await readFile(new URL("../api/orders/invoice-send-check.js",import.meta.url),"utf8");
  assert.match(api,/!\/\^DEMO-\/i\.test/);
  assert.match(api,/if \(checks\.invoicePdfVerified\)/);
  assert.match(api,/record\?\.immutable === true/);
  assert.match(api,/readyToSend:false/);
});
