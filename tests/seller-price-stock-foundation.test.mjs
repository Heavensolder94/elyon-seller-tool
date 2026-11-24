import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createPriceStockIndex,buildPriceStockSnapshot,stock,amount} from "../seller-price-stock-foundation-core.js";
const now=Date.parse("2026-11-24T15:00:00Z"), at="2026-11-24T14:00:00Z";
const p={id:"0001",articleNumber:"ELY-000001",supplierStock:0,supplierAvailable:false,supplierStockCapturedAt:at,
 economicsFacts:{purchase:{amount:"10.25",source:"supplier_invoice",status:"verified",currency:"EUR",capturedAt:at}},
 channels:{ebay:{sku:"ELY-000001",listingId:"000123",offerId:"000456"}},supplier:{id:"0003"}};
const inventory=(sku=p.articleNumber,extra={})=>({sku,offerId:"000456",listingId:"000123",status:"PUBLISHED",
 price:0,quantity:0,priceStockEvidence:{sku,price:"20.00",currency:"EUR",quantity:"3",marketplaceId:"EBAY_DE",source:"ebay_inventory_api"},...extra});
const snapshot=(items=[inventory()])=>({ok:true,source:"ebay_inventory_api",environment:"production",syncedAt:at,items});
function read(product=p,s=snapshot(),products=[product],scope={}){return buildPriceStockSnapshot(product,createPriceStockIndex(products,s,scope),{now});}
test("read-only model preserves strings, stored price provenance, explicit zero and distinct eBay quantity",()=>{
 const m=read();const row=m.rows[0];assert.equal(m.identity.masterId,"0001");assert.equal(row.offer.listingId,"000123");assert.equal(row.offer.offerId,"000456");
 assert.equal(row.supplierPrice.amount,10.25);assert.equal(row.supplierPrice.provenance,"stored_verified");assert.equal(row.supplierPrice.authenticated,false);
 assert.equal(row.supplierStock.quantity,0);assert.equal(row.offer.quantity,3);assert.equal(row.offer.price,20);
 assert.ok(row.statuses.includes("STOCK_REVIEW_REQUIRED"));assert.ok(row.statuses.includes("SUPPLIER_UNAVAILABLE"));
 assert.equal(m.templateId,"ebay.de.price-quantity");assert.equal(m.executionAuthorized,false);assert.equal(m.evidenceAuthenticated,false);
});
test("missing, zero, negative, nonnumeric and stale data remain distinguishable",()=>{
 for(const v of [null,undefined,"",false,"unknown",-1,1.1," 0 ","1e2"])assert.equal(stock(v),null);
 assert.equal(stock("0"),0);assert.equal(stock("004"),4);assert.equal(amount("12,50"),12.5);assert.equal(amount("12 USD"),null);
 const q={id:"0001",articleNumber:p.articleNumber,logistics:{stock:9},channels:p.channels};
 const m=read(q,snapshot([inventory(p.articleNumber,{priceStockEvidence:{sku:p.articleNumber,quantity:null,price:null,marketplaceId:"EBAY_DE"}})]));
 assert.equal(m.rows[0].supplierStock.quantity,null);assert.equal(m.rows[0].supplierStock.available,null);assert.equal(m.rows[0].offer.quantity,null);assert.equal(m.rows[0].offer.price,null);
 const stale=read({...p,supplierStockCapturedAt:"2026-11-20T12:00:00Z"});assert.ok(stale.rows[0].statuses.includes("DATA_STALE"));
});
test("unverified and retail reference prices are not verified purchase costs; currency mismatch flagged",()=>{
 const q={id:"0001",articleNumber:p.articleNumber,channels:p.channels,buyPrice:12,meta:{reviewOnly:true,amazonReferencePrice:12,amazonReferenceCapturedAt:at}};
 const row=read(q).rows[0];assert.equal(row.supplierPrice.amount,null);assert.equal(row.supplierPrice.amazonReference.amount,12);
 const a=read({...q,meta:{},costCurrency:"USD"}).rows[0];assert.equal(a.supplierPrice.provenance,"unverified");assert.ok(a.statuses.includes("PRICE_REVIEW_REQUIRED"));
});
test("duplicate SKU, conflicting listing/offer and missing SKU fail closed",()=>{
 const x={...p,id:"0002"};assert.equal(read(p,snapshot(),[p,x]).rows[0].identityStatus,"IDENTITY_CONFLICT");
 assert.equal(read(p,snapshot([inventory(),inventory()])).rows[0].identityStatus,"IDENTITY_CONFLICT");
 assert.equal(read(p,snapshot([inventory(p.articleNumber,{listingId:"000999"})])).rows[0].identityStatus,"IDENTITY_CONFLICT");
 assert.equal(read(p,snapshot([inventory(p.articleNumber,{offerId:"000999"})])).rows[0].identityStatus,"IDENTITY_CONFLICT");
 const missing={id:"0001",supplierSku:p.articleNumber};assert.equal(read(missing).rows[0].identityStatus,"EVIDENCE_MISSING");
 assert.equal(read(p,snapshot([])).rows[0].identityStatus,"UNKNOWN");
 assert.equal(read(p,null).rows[0].identityStatus,"UNKNOWN");
});
test("Trading retrieval is not proof of Trading origin; inventory corroboration is required",()=>{
 const active={...inventory(),offerId:"",priceStockEvidence:{...inventory().priceStockEvidence,source:"ebay_trading_get_myeBaySelling_active"}};
 const product={...p,channels:{ebay:{sku:p.articleNumber,listingId:"000123"}}};
 const seller={ok:true,source:"ebay_seller_state",environment:"production",syncedAt:at,activeListings:[active],draftItems:[],inventoryOffers:{environment:"production",items:[]}};
 let row=read(product,seller).rows[0];assert.equal(row.offer.origin,"unknown");assert.equal(row.offer.status,"ACTIVE");
 row=read(product,{...seller,inventoryOffers:{environment:"production",items:[inventory()]}}).rows[0];assert.equal(row.offer.origin,"inventory");
 assert.equal(read(p,{...seller,environment:"sandbox"}).rows[0].offer,null);
 assert.equal(read(p,snapshot(),[p],{accountId:"account-1"}).rows[0].offer,null);
 assert.equal(read({...p,channels:{ebay:{...p.channels.ebay,environment:"sandbox"}}}).rows[0].identityStatus,"IDENTITY_CONFLICT");
});
test("variants preserve unavailable and registered active SKU even without supplier combination",()=>{
 const v1="ELY-000001-01",v2="ELY-000001-02";
 const q={id:"0001",articleNumber:p.articleNumber,channels:{ebay:{sku:p.articleNumber,variantSkus:[v1,v2]}},
 variantCombinations:[{sku:v1,supplierSkuId:"00008",supplierPrice:"4.50",currency:"EUR",stock:0,available:false,selections:{Farbe:"Rot"},image:"https://example.invalid/red.png"}]};
 const s=snapshot([inventory(v1,{offerId:"01",priceStockEvidence:{...inventory().priceStockEvidence,sku:v1}}),inventory(v2,{offerId:"02",priceStockEvidence:{...inventory().priceStockEvidence,sku:v2}})]);
 const m=read(q,s);assert.equal(m.rows.length,2);assert.equal(m.rows[0].supplierVariantId,"00008");assert.equal(m.rows[0].supplierStock.quantity,0);
 assert.equal(m.rows[0].supplierPrice.amount,4.5);assert.equal(m.rows[1].supplierStock.quantity,null);assert.equal(m.rows[1].offer.status,"PUBLISHED");
 const foreign={...q,channels:{ebay:{sku:p.articleNumber}},variantCombinations:[{sku:"00008",supplierSkuId:"00008"}]};
 assert.equal(read(foreign,s).rows[0].sku,null);
});
test("drafts and feed records are distinguished; no absence-based ended state",()=>{
 const m=read(p,snapshot([inventory(p.articleNumber,{status:"UNPUBLISHED"})]));assert.equal(m.rows[0].offer.status,"DRAFT");
 const q={id:"0001",articleNumber:p.articleNumber};
 const s={ok:true,source:"ebay_seller_state",environment:"production",syncedAt:at,draftItems:[{sku:p.articleNumber,status:"UNPUBLISHED",source:"elyon_seller_hub_feed",price:20,currency:"EUR",feedStatusCheckedAt:at}]};
 const row=read(q,s).rows[0];assert.equal(row.offer.origin,"seller_hub_feed");assert.equal(row.offer.quantity,null);assert.ok(row.statuses.includes("EVIDENCE_MISSING"));
});
test("saved company OS economics is nonbinding and no new computation",()=>{
 const q={...p,rawServerProduct:{schemaVersion:"elyon-product-master-v2",identity:{articleNumber:p.articleNumber},economics:{currency:"EUR",profit:3,marginPercent:15,salePrice:20,shippingCost:0,fees:2}}};
 const m=read(q);assert.equal(m.economics.profit,3);assert.equal(m.economics.binding,false);assert.equal(m.economics.shippingCost,0);
});
test("UI and build use existing accordion and authenticated snapshots without fetch or storage",async()=>{
 const ui=await readFile(new URL("../seller-price-stock-foundation.js",import.meta.url),"utf8");
 const accordion=await readFile(new URL("../seller-product-board-accordion.js",import.meta.url),"utf8");
 const loader=await readFile(new URL("../seller-runtime-loader.js",import.meta.url),"utf8");
 const build=await readFile(new URL("../scripts/prepare-vercel.mjs",import.meta.url),"utf8");
 assert.match(ui,/Preis & Bestand/);assert.match(ui,/isAuthenticated/);assert.match(ui,/textContent/);assert.doesNotMatch(ui,/\bfetch\s*\(|localStorage|innerHTML|setInterval|MutationObserver/);
 assert.match(accordion,/ElyonPriceStockFoundation\?\.renderCard/);assert.match(loader,/seller-price-stock-foundation\.js/);
 assert.match(build,/seller-price-stock-foundation-core\.js/);
 for(const path of ["../api/ebay/listings.js","../api/ebay/seller-state.js"]){
 const code=await readFile(new URL(path,import.meta.url),"utf8");assert.match(code,/requireSellerAccess/);assert.match(code,/priceStockEvidence/);
 }
});
