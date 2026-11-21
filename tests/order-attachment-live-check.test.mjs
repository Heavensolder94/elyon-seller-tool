import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { makeProbeAttachmentUrl, verifyProbeAttachmentQuery, getProbePdf, PROBE_ORDER_ID } from "../lib/order-message-attachment-probe.js";
import attachmentHandler from "../api/orders/message-attachment.js";
import checkHandler from "../api/orders/attachment-check.js";

function response() {
  return {
    code:200,headers:{},body:null,
    setHeader(key,value){this.headers[key.toLowerCase()]=value;return this;},
    status(code){this.code=code;return this;},
    end(value){this.body=value??null;return this;},
    json(value){this.body=value;return this;},
  };
}

async function attachment(url) {
  const res=response();
  await attachmentHandler({method:"GET",query:Object.fromEntries(url.searchParams)},res);
  return res;
}

test("signed probe gets only a visibly invalid synthetic PDF through the actual attachment handler",async()=>{
  const old=process.env.ELYON_SELLER_ACCESS_TOKEN;
  process.env.ELYON_SELLER_ACCESS_TOKEN="unit-test-only-secret-key-12345678901234567890";
  try {
    const signed=makeProbeAttachmentUrl("https://elyonsellertool.vercel.app");
    assert.equal(signed.pathname,"/api/orders/message-attachment");
    assert.equal(signed.searchParams.get("orderId"),PROBE_ORDER_ID);
    assert.equal(signed.searchParams.get("probe"),"1");
    assert.equal(verifyProbeAttachmentQuery(Object.fromEntries(signed.searchParams)),true);
    const result=await attachment(signed);
    assert.equal(result.code,200);
    assert.equal(result.headers["content-type"],"application/pdf");
    assert.equal(result.headers["referrer-policy"],"no-referrer");
    assert.equal(result.headers["cache-control"],"no-store, private, max-age=0");
    assert.match(result.body.toString("latin1"),/^%PDF-1\.4/);
    assert.ok(result.body.equals(getProbePdf()));
    assert.ok(result.body.toString("latin1").includes(
      Buffer.from("MUSTER - NICHT ZUR VERWENDUNG","latin1").toString("hex").toUpperCase()
    ));
  } finally {
    if(old===undefined)delete process.env.ELYON_SELLER_ACCESS_TOKEN;
    else process.env.ELYON_SELLER_ACCESS_TOKEN=old;
  }
});

test("missing, tampered, and expired HMAC signatures cannot retrieve the test PDF",async()=>{
  const old=process.env.ELYON_SELLER_ACCESS_TOKEN;
  process.env.ELYON_SELLER_ACCESS_TOKEN="unit-test-only-secret-key-12345678901234567890";
  try {
    const valid=makeProbeAttachmentUrl("https://elyonsellertool.vercel.app");
    const missing=new URL(valid);missing.searchParams.delete("sig");
    const altered=new URL(valid);altered.searchParams.set("sig","0".repeat(64));
    const wrongOrder=new URL(valid);wrongOrder.searchParams.set("orderId","ANOTHER-PROBE");
    const expired=makeProbeAttachmentUrl("https://elyonsellertool.vercel.app",{now:Date.now()-300000});
    for(const url of [missing,altered,wrongOrder,expired]) {
      const r=await attachment(url);
      assert.equal(r.code,404,url.searchParams.get("orderId"));
      assert.equal(r.body,null);
    }
  } finally {
    if(old===undefined)delete process.env.ELYON_SELLER_ACCESS_TOKEN;
    else process.env.ELYON_SELLER_ACCESS_TOKEN=old;
  }
});

test("read-only authenticated check verifies live path, content, and fail-closed behavior without sending",async()=>{
  const secret="unit-test-only-secret-key-12345678901234567890";
  const original={
    token:process.env.ELYON_SELLER_ACCESS_TOKEN,
    base:process.env.ELYON_MESSAGE_ATTACHMENT_BASE_URL,
    enabled:process.env.ELYON_EBAY_MESSAGE_SEND_ENABLED,
    fetch:globalThis.fetch,
  };
  process.env.ELYON_SELLER_ACCESS_TOKEN=secret;
  process.env.ELYON_MESSAGE_ATTACHMENT_BASE_URL="https://elyonsellertool.vercel.app";
  delete process.env.ELYON_EBAY_MESSAGE_SEND_ENABLED;
  globalThis.fetch=async url=>{
    const simulated=await attachment(new URL(url));
    return new Response(simulated.body,{
      status:simulated.code,headers:simulated.headers,
    });
  };
  try {
    const unauthorized=response();
    await checkHandler({method:"GET",headers:{}},unauthorized);
    assert.equal(unauthorized.code,403);
    assert.equal(unauthorized.body.error,"seller_access_denied");
    const authorized=response();
    await checkHandler({method:"GET",headers:{authorization:"Bearer "+secret}},authorized);
    assert.equal(authorized.code,200);
    assert.equal(authorized.body.ok,true);
    assert.equal(authorized.body.signedPdfRetrieved,true);
    assert.equal(authorized.body.contentVerified,true);
    assert.equal(authorized.body.missingSignatureBlocked,true);
    assert.equal(authorized.body.alteredSignatureBlocked,true);
    assert.equal(authorized.body.expiredSignatureBlocked,true);
    assert.equal(authorized.body.messageSendingEnabled,false);
    assert.equal(authorized.body.ebayMessageSent,false);
    assert.equal(authorized.body.realInvoiceIssued,false);
    assert.equal(JSON.stringify(authorized.body).includes("sig="),false);
  } finally {
    globalThis.fetch=original.fetch;
    for(const [key,val] of [
      ["ELYON_SELLER_ACCESS_TOKEN",original.token],
      ["ELYON_MESSAGE_ATTACHMENT_BASE_URL",original.base],
      ["ELYON_EBAY_MESSAGE_SEND_ENABLED",original.enabled],
    ]) if(val===undefined)delete process.env[key];else process.env[key]=val;
  }
});

test("real invoice PDFs remain guarded by immutable Finance records, never by demo signature",async()=>{
  const source=await readFile(new URL("../api/orders/message-attachment.js",import.meta.url),"utf8");
  const check=await readFile(new URL("../api/orders/attachment-check.js",import.meta.url),"utf8");
  assert.match(source,/if\(text\(req\.query\?\.probe\)==="1"\)/);
  assert.match(source,/if\(!record \|\| !verifyAttachmentQuery\(req\.query,record\.snapshotHash\)\)/);
  assert.match(source,/verifiedInvoicePdf\(record,orderId\)/);
  assert.match(check,/requireSellerAccess\(req,res\)/);
  assert.match(check,/ebayMessageSent:false/);
  assert.match(check,/realInvoiceIssued:false/);
  assert.doesNotMatch(check,/commerce\/message\/v1\/send_message/);
});
