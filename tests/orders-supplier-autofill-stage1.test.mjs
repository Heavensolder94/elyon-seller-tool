import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {supplierSuggestionForOrder,normalizeOperationInput,estimatedOrderCosts,actualOrderProfit} from "../seller-orders-v2-core.js";

const order={id:"12-12345-67890",currency:"EUR",total:49.99,lines:[
  {sku:"ELY-000001",quantity:2,total:49.99}
]};
const product={id:"company-1",articleNumber:"ELY-000001",supplierSku:"SUP-RED",
  supplier:{name:"Temu",productUrl:"https://example.com/item/123"},pricing:{buyPrice:8,shippingCost:2,estimatedFees:3}};
test("unique Company OS match yields supplier identity, line reference and preview only",()=>{
  const result=supplierSuggestionForOrder(order,[product]);
  assert.equal(result.supplierName,"Temu");
  assert.equal(result.references[0].supplierSku,"SUP-RED");
  assert.equal(result.references[0].quantity,2);
  assert.equal(result.productUrl,"https://example.com/item/123");
  assert.equal(result.source,"company_os_suggestion");
  assert.equal(estimatedOrderCosts(order,[product]).purchase,16);
  assert.equal(actualOrderProfit(order,{purchaseCost:null,shippingCost:null,feeCost:null}),null);
});
test("missing, duplicate or conflicting supplier lines never guess",()=>{
  assert.equal(supplierSuggestionForOrder(order,[]),null);
  assert.equal(supplierSuggestionForOrder(order,[product,{...product,id:"company-2"}]),null);
  assert.equal(supplierSuggestionForOrder({...order,lines:[...order.lines,{sku:"ELY-000002",quantity:1}]},[product]),null);
  const second={...product,id:"company-2",articleNumber:"ELY-000002",supplier:{name:"AliExpress"}};
  assert.equal(supplierSuggestionForOrder({...order,lines:[...order.lines,{sku:"ELY-000002",quantity:1}]},[product,second]),null);
});
test("manual saved data persists, estimated supplier price never becomes actual cost",()=>{
  const submitted=normalizeOperationInput({workflowStatus:"PROCESSING",supplierName:"Manuell geprüft",
    supplierProductRef:"CUSTOM-11",supplierOrderId:"SUP-ORDER-9",purchaseCost:"",shippingCost:"",feeCost:""});
  assert.equal(submitted.supplierName,"Manuell geprüft");
  assert.equal(submitted.supplierProductRef,"CUSTOM-11");
  assert.equal(submitted.supplierOrderId,"SUP-ORDER-9");
  assert.equal(submitted.purchaseCost,null);
  assert.equal(submitted.shippingCost,null);
  assert.equal(submitted.feeCost,null);
});
test("supplier fields prefill from suggestion and remain subject to explicit save",async()=>{
  const ui=await readFile(new URL("../seller-orders-v2.js",import.meta.url),"utf8");
  assert.match(ui,/supplierSuggestionForOrder\(order,productsNow\(\)\)/);
  assert.match(ui,/op\.supplierName \|\| suggestedSupplierName/);
  assert.match(ui,/op\.supplierProductRef \|\| suggestedProductRef/);
  assert.match(ui,/name="supplierProductRef"/);
  assert.match(ui,/data-order-receipt-upload/);
  assert.match(ui,/Interne Angaben sichern/);
  assert.match(ui,/KEINE GÜLTIGE RECHNUNG/);
  assert.doesNotMatch(ui,/purchaseCost: estimated\.purchase/);
});
