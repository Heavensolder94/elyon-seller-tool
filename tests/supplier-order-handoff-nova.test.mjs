import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {validateSupplierOrderHandoff} from "../seller-supplier-order-import-core.js";
const data={schema:"elyon-supplier-order-capture/v1",supplierId:"temu",supplierName:"Temu",
  supplierOrderId:"PO-123456789",supplierSku:"SUP-11",source:"elyon_nova_manual_capture",verified:false};
const expected={supplierName:"Temu",references:[{supplierSku:"SUP-11"}]};
test("Nova order handoff can only propose supplier data after exact matching",()=>{
 const result=validateSupplierOrderHandoff(JSON.stringify(data),{supplierSuggestion:expected});
 assert.equal(result.ok,true);
 assert.equal(result.values.supplierOrderId,"PO-123456789");
 assert.equal(result.requiresExplicitConfirmation,true);
 assert.equal(Object.hasOwn(result.values,"purchaseCost"),false);
 assert.equal(Object.hasOwn(result.values,"trackingNumber"),false);
});
test("Nova handoff rejects tampering, supplier mismatch and replacement",()=>{
 assert.equal(validateSupplierOrderHandoff("not json").ok,false);
 assert.equal(validateSupplierOrderHandoff({...data,verified:true}).ok,false);
 assert.equal(validateSupplierOrderHandoff({...data,supplierId:"amazon"}).ok,false);
 assert.equal(validateSupplierOrderHandoff({...data,supplierSku:"OTHER"},{supplierSuggestion:expected}).ok,false);
 assert.equal(validateSupplierOrderHandoff(data,{existingOperation:{supplierOrderId:"SUP-OTHER"}}).ok,false);
 assert.equal(validateSupplierOrderHandoff(data,{existingOperation:{supplierName:"Amazon"}}).ok,false);
});
test("SellerTool handoff requires selected eBay order, local user confirmation and existing save",async()=>{
 const ui=await readFile(new URL("../seller-orders-v2.js",import.meta.url),"utf8");
 assert.match(ui,/data-ocv5-supplier-import/);
 assert.match(ui,/validateSupplierOrderHandoff\(json/);
 assert.match(ui,/state\.orders\.find\(item=>item\.id===state\.selectedId\)/);
 assert.match(ui,/window\.confirm\("Lieferantenauftrag/);
 assert.match(ui,/state\.drafts\[selected\.id\]=/);
 assert.match(ui,/Interne Angaben sichern/);
});
