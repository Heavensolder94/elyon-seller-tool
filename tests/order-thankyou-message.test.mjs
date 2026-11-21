import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { DEFAULT_ORDER_THANK_YOU,validateThankYouTemplate,renderOrderThankYou } from "../seller-order-message-core.js";
import { signedAttachmentQuery,verifyAttachmentQuery,attachmentUrl,verifiedInvoicePdf,messageDeliveryEnabled } from "../lib/order-message-attachment.js";
import { createKleinunternehmerInvoicePdf } from "../lib/kleinunternehmer-invoice-pdf.js";

test("template includes default placeholders and renders actual invoice/order names",()=>{
  const expected=renderOrderThankYou(DEFAULT_ORDER_THANK_YOU,{
    buyerName:"Erika Beispiel",orderId:"12-12345-67890",
    invoiceNumber:"ELYON-2026-000001",shopName:"ELYON"});
  assert.equal(expected.ok,true);
  for(const term of ["Erika Beispiel","12-12345-67890","ELYON-2026-000001","ELYON"])
    assert.ok(expected.text.includes(term));
  assert.ok(!expected.text.includes("{"));
  assert.equal(expected.text.length<2000,true);
});

test("unknown variables, ad links and HTML are rejected and existing template remains user-editable",()=>{
  assert.equal(validateThankYouTemplate("Hallo {Unbekannt} und danke für Ihre Bestellung.").ok,false);
  assert.equal(validateThankYouTemplate("Besuchen Sie https://example.com als Dankeschön für den Einkauf!").ok,false);
  assert.equal(validateThankYouTemplate("Hallo <b>Freunde</b>, danke für Ihren Einkauf und auf Wiedersehen!").ok,false);
  assert.equal(validateThankYouTemplate("Danke für den Einkauf bei {Shopname}, Bestellung {Bestellnummer}.").ok,true);
  assert.equal(renderOrderThankYou(DEFAULT_ORDER_THANK_YOU,{
    buyerName:"A",orderId:"",invoiceNumber:"x"}).ok,false);
});

test("signed PDF links expire and cannot be altered or forged",()=>{
  const old=process.env.ELYON_SELLER_ACCESS_TOKEN;
  process.env.ELYON_SELLER_ACCESS_TOKEN="not-production-testing-secret-123456789";
  try {
    const invoiceHash="a".repeat(64);
    const now=Date.UTC(2026,10,21,10,0,0);
    const query=signedAttachmentQuery({orderId:"12-12345-67890",invoiceHash,now,ttlSeconds:300});
    assert.equal(verifyAttachmentQuery(query,invoiceHash,{now}),true);
    assert.equal(verifyAttachmentQuery(query,invoiceHash,{now:now+310000}),false);
    assert.equal(verifyAttachmentQuery({...query,orderId:"12-12345-67891"},invoiceHash,{now}),false);
    assert.equal(verifyAttachmentQuery({...query,sig:"f".repeat(64)},invoiceHash,{now}),false);
    assert.equal(verifyAttachmentQuery(query,"b".repeat(64),{now}),false);
    assert.match(attachmentUrl({orderId:"12-12345-67890",invoiceHash,baseUrl:"https://elyon.example.org"}),/^https:\/\/elyon\.example\.org/);
    assert.throws(()=>attachmentUrl({orderId:"12-12345-67890",invoiceHash,baseUrl:"http://localhost:8080"}));
  } finally {
    if(old===undefined)delete process.env.ELYON_SELLER_ACCESS_TOKEN;
    else process.env.ELYON_SELLER_ACCESS_TOKEN=old;
  }
});

test("PDF integrity is tied to the immutable invoice and exact order identity",()=>{
  const invoice={
    taxMode:"small_business",currency:"EUR",invoiceNumber:"ELYON-2026-001",
    orderId:"12-12345-67890",issuedAt:"2026-11-21T10:00:00.000Z",
    orderedAt:"2026-11-21T09:30:00.000Z",
    seller:{name:"ELYON Muster",brand:"ELYON",addressLine1:"Musterstraße 1",
      postalCode:"12345",city:"Berlin",country:"DE",taxId:"12/345/67890"},
    buyer:{name:"Erika Beispiel",addressLine1:"Musterweg 2",postalCode:"12345",
      city:"Berlin",country:"DE"},lineItems:[{title:"Test",quantity:1,total:19,sku:"ELY-000001"}],
    shipping:0,discount:0,total:19,
    note:"Für diesen Umsatz gilt die Steuerbefreiung für Kleinunternehmer gemäß § 19 UStG."
  };
  const pdf=createKleinunternehmerInvoicePdf(invoice);
  const archived={
    immutable:true,orderId:invoice.orderId,invoiceNumber:invoice.invoiceNumber,
    invoice,snapshotHash:crypto.createHash("sha256").update(JSON.stringify(invoice)).digest("hex"),
    pdfArchiveBase64:pdf.toString("base64"),pdfSizeBytes:pdf.length,
    pdfSha256:crypto.createHash("sha256").update(pdf).digest("hex")
  };
  assert.ok(verifiedInvoicePdf(archived,invoice.orderId).equals(pdf));
  assert.throws(()=>verifiedInvoicePdf({...archived,pdfSha256:"a".repeat(64)},invoice.orderId));
  assert.throws(()=>verifiedInvoicePdf(archived,"12-12345-67891"));
  assert.throws(()=>verifiedInvoicePdf({...archived,invoice:{...invoice,total:1}},invoice.orderId));
});

test("real send stays opt-in and no invoice message can be sent on the sample path",async()=>{
  const files=await Promise.all([
    readFile(new URL("../api/orders/customer-message.js",import.meta.url),"utf8"),
    readFile(new URL("../api/orders/message-attachment.js",import.meta.url),"utf8"),
    readFile(new URL("../seller-order-invoices.js",import.meta.url),"utf8"),
    readFile(new URL("../scripts/prepare-vercel.mjs",import.meta.url),"utf8"),
    readFile(new URL("../lib/ebay-production.js",import.meta.url),"utf8"),
  ]);
  const [api,attachment,ui,bundle,ebay]=files;
  assert.match(api,/body\.confirmation!=="SEND_ORDER_INVOICE_MESSAGE"/);
  assert.match(api,/if\(!messageDeliveryEnabled\(\)\)/);
  assert.match(api,/status:"sending"/);
  assert.match(api,/status:"unknown"/);
  assert.match(api,/message_already_attempted/);
  assert.match(api,/paymentConfirmed\(verified\)/);
  assert.match(api,/buyer\?\.username/);
  assert.match(api,/messageMedia:\[\{mediaName:/);
  assert.match(api,/commerce\/message\/v1\/send_message/);
  assert.match(attachment,/verifyAttachmentQuery/);
  assert.match(attachment,/no-referrer/);
  assert.match(ui,/data-eoi-template-save/);
  assert.match(ui,/data-eoi-message-demo/);
  assert.match(ui,/data-eoi-message-send/);
  assert.match(ui,/window\.confirm\('ECHTE eBay-Nachricht/);
  assert.match(bundle,/seller-order-message-core\.js/);
  assert.match(ebay,/commerce\.message/);
});
test("send feature is disabled by default",()=>{
  const a=process.env.ELYON_EBAY_MESSAGE_SEND_ENABLED;
  const b=process.env.ELYON_MESSAGE_ATTACHMENT_BASE_URL;
  delete process.env.ELYON_EBAY_MESSAGE_SEND_ENABLED;
  delete process.env.ELYON_MESSAGE_ATTACHMENT_BASE_URL;
  try {assert.equal(messageDeliveryEnabled(),false);}
  finally{
    if(a===undefined)delete process.env.ELYON_EBAY_MESSAGE_SEND_ENABLED;else process.env.ELYON_EBAY_MESSAGE_SEND_ENABLED=a;
    if(b===undefined)delete process.env.ELYON_MESSAGE_ATTACHMENT_BASE_URL;else process.env.ELYON_MESSAGE_ATTACHMENT_BASE_URL=b;
  }
});
