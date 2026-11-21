import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {issueNovaPairToken,verifyNovaPairToken,parseNovaOrderCapture,novaInboxView,NOVA_PAIR_TTL_SECONDS}
  from "../lib/nova-supplier-sync.js";

const capture=(extra={})=>({schema:"elyon-supplier-order-capture/v1",
  supplierId:"temu",supplierName:"Temu",supplierOrderId:"PO-123456789",supplierSku:"S-11",
  source:"elyon_nova_direct_sync",verified:false,...extra});
test("Nova token is cryptographically scoped and expires without sharing SellerTool unlock secret",()=>{
  const prior=process.env.ELYON_SELLER_ACCESS_TOKEN;
  try{
    process.env.ELYON_SELLER_ACCESS_TOKEN="test-unlock-secret-avoid-in-extension";
    const now=Date.parse("2026-11-21T10:00:00Z");
    const {token,expiresAt}=issueNovaPairToken(now);
    assert.ok(token.startsWith("nv1."));
    assert.equal(token.includes("test-unlock-secret-avoid-in-extension"),false);
    assert.equal(verifyNovaPairToken(token,now),true);
    assert.equal(verifyNovaPairToken(token,now+NOVA_PAIR_TTL_SECONDS*1000+1000),false);
    assert.equal(verifyNovaPairToken(token.slice(0,-1)+"X",now),false);
    assert.equal(verifyNovaPairToken("test-unlock-secret-avoid-in-extension",now),false);
    assert.equal(Date.parse(expiresAt),now+NOVA_PAIR_TTL_SECONDS*1000);
  }finally{
    if(prior===undefined)delete process.env.ELYON_SELLER_ACCESS_TOKEN;
    else process.env.ELYON_SELLER_ACCESS_TOKEN=prior;
  }
});
test("supplier capture stores only source reference, never buyer address or actual accounting",()=>{
  const record=parseNovaOrderCapture(capture({buyerName:"PRIVATE",buyerAddress:"STREET",trackingNumber:"secret",
    purchaseCost:10,customerEmail:"x@y.z"}));
  assert.equal(record.kind,"nova_supplier_order");
  assert.equal(record.verified,false);
  assert.equal(record.reviewStatus,"pending");
  assert.equal(record.supplierOrderId,"PO-123456789");
  for(const field of ["buyerName","buyerAddress","customerEmail","purchaseCost","trackingNumber","orderId"])
    assert.equal(Object.hasOwn(record,field),false,field);
  assert.equal(parseNovaOrderCapture(capture()).id,record.id);
  assert.notEqual(parseNovaOrderCapture(capture({supplierOrderId:"PO-999999999"})).id,record.id);
});
test("unknown or edited Nova payloads fail closed",()=>{
  for(const data of [
    capture({source:"elyon_nova_manual_capture"}),
    capture({verified:true}),
    capture({supplierId:"fake"}),
    capture({supplierName:"AliExpress"}),
    capture({supplierOrderId:"x"}),
    capture({supplierSku:"bad\ncontrol"}),
    capture({schema:"other"}),
  ])assert.throws(()=>parseNovaOrderCapture(data));
});
test("inbox flags linked orders but cannot mutate order operations",()=>{
  const item=parseNovaOrderCapture(capture());
  const state={imports:[item],orderOperations:{
    "12-34567-89012":{supplierName:"Temu",supplierOrderId:"PO-123456789"},
    "12-34567-89013":{supplierName:"Amazon",supplierOrderId:"PO-123456789"}
  }};
  const result=novaInboxView(state);
  assert.equal(result.length,1);
  assert.deepEqual(result[0].linkedOrders,["12-34567-89012"]);
  assert.equal(result[0].source,"elyon_nova_manual_capture");
  assert.equal(result[0].verified,false);
});
test("only paired Nova token can POST; reading requires SellerTool login; writes only finance imports",async()=>{
  const inbox=await readFile(new URL("../api/orders/nova-inbox.js",import.meta.url),"utf8");
  const pairing=await readFile(new URL("../api/orders/nova-pairing.js",import.meta.url),"utf8");
  const ui=await readFile(new URL("../seller-orders-v2.js",import.meta.url),"utf8");
  assert.match(inbox,/verifyNovaPairToken\(bearer\)/);
  assert.match(inbox,/if\(!requireSellerAccess\(req,res\)\)return/);
  assert.match(inbox,/parseNovaOrderCapture\(req.body\)/);
  assert.match(inbox,/writeFinanceState\(\{imports:\[record\]\}/);
  assert.match(inbox,/previous\.supplierSku!==record\.supplierSku/);
  assert.doesNotMatch(inbox,/createEbayShippingFulfillment|issue-kleinunternehmer-invoice|reserveFinanceInvoiceNumber/);
  assert.match(pairing,/requireSellerAccess\(req,res/);
  assert.match(pairing,/issueNovaPairToken\(\)/);
  assert.match(ui,/data-nova-pairing/);
  assert.match(ui,/data-nova-inbox-refresh/);
  assert.match(ui,/data-nova-link-id/);
  assert.match(ui,/applyNovaSupplierOrder\(item\)/);
  assert.match(ui,/window\.confirm\("Lieferantenauftrag/);
  assert.match(ui,/Interne Angaben sichern/);
});
