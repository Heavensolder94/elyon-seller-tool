import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncAmazonPriceReference } from "../lib/amazon-price-reference-sync.js";
import { reconcileElyonDraftRecords } from "../lib/ebay-draft-registry.js";
import { buildPendingCompanyReview } from "../api/products/review-intake.js";

const sku="AMZ-B0BWND9WBR";
const date="2026-11-17T12:00:00.000Z";
const draft={
  sku, title:"Dreamzie Kissenbezug 80x80",
  price:20.99, amazonReferencePrice:12.91, amazonReferenceCapturedAt:date,
  images:["https://example.test/image.jpg"],status:"UNPUBLISHED",
};

test("Amazon retail reference is carried into pending Company OS review, never buyPrice",()=>{
  const {product}=buildPendingCompanyReview(draft);
  assert.equal(product.meta.amazonReferencePrice,12.91);
  assert.equal(product.meta.amazonReferenceRole,"retail_research_price_not_verified_supplier_cost");
  assert.equal(product.meta.ebayReferencePrice,20.99);
  assert.equal(product.buyPrice,null);
  assert.equal(product.costPrice,null);
  assert.equal(product.shippingCost,null);
  assert.equal(product.supplierContractVerified,false);
});

test("registered eBay Feed records expose original Amazon reference but preserve eBay VK separately",()=>{
  const record={
    sku,state:"draft",environment:"production",
    visibilityMode:"seller_hub_feed",externalDraftStatus:"confirmed",
    externalTaskId:"task-dreamzie",draftPrice:20.99,
    draftTitle:draft.title,amazonReferencePrice:12.91,amazonReferenceCapturedAt:date,
  };
  const result=reconcileElyonDraftRecords([record],{environment:"production",inventoryItems:[],activeListings:[]});
  assert.equal(result.drafts.length,1);
  assert.equal(result.drafts[0].price,20.99);
  assert.equal(result.drafts[0].amazonReferencePrice,12.91);
  assert.equal(result.drafts[0].amazonReferenceCapturedAt,date);
});

test("existing Dreamzie Company OS review gets reference-only workflow update",async()=>{
  const requests=[];
  const result=await syncAmazonPriceReference({
    sku,amazonReferencePrice:12.91,amazonReferenceCapturedAt:date,
    env:{ELYON_COMPANY_OS_SYNC_CODE:"unit-test-secret",ELYON_COMPANY_OS_URL:"https://company.example.test"},
    getMaster:async()=>({records:[{identity:{supplierSku:sku,articleNumber:"ELY-001234"},workflow:{stage:"product_review"}}]}),
    fetchImpl:async(url,request)=>{
      requests.push({url:String(url),request,body:JSON.parse(request.body)});
      return{ok:true,status:200,json:async()=>({ok:true,transition:"set_amazon_reference"})};
    }
  });
  assert.equal(result.synced,true);
  assert.equal(result.state,"reference_recorded");
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,"https://company.example.test/api/company-os-workflow");
  assert.equal(requests[0].body.transition,"set_amazon_reference");
  assert.equal(requests[0].body.sku,sku);
  assert.equal(requests[0].body.amazonReferencePrice,12.91);
  assert.equal(requests[0].body.amazonReferenceCapturedAt,date);
  assert.equal(requests[0].body.product,undefined);
  assert.equal(requests[0].body.buyPrice,undefined);
  assert.equal(requests[0].body.costPrice,undefined);
});

test("no match, two matches, invalid price, or missing seller shared code do not write",async()=>{
  const calls=[];
  const kwargs={sku,amazonReferencePrice:12.91,env:{ELYON_COMPANY_OS_SYNC_CODE:"unit-test-secret"},
    fetchImpl:async()=>{calls.push(1);throw Error("should not write")}};
  const miss=await syncAmazonPriceReference({...kwargs,getMaster:async()=>({records:[]})});
  assert.equal(miss.state,"awaiting_review");
  const two=await syncAmazonPriceReference({...kwargs,getMaster:async()=>({records:[
    {identity:{supplierSku:sku},workflow:{stage:"product_review"}},
    {identity:{supplierSku:sku},workflow:{stage:"product_review"}},
  ]})});
  assert.equal(two.state,"ambiguous");
  const empty=await syncAmazonPriceReference({...kwargs,amazonReferencePrice:null});
  assert.equal(empty.state,"reference_missing");
  const unconfigured=await syncAmazonPriceReference({...kwargs,env:{}});
  assert.equal(unconfigured.state,"connection_unavailable");
  assert.equal(calls.length,0);
});

test("eBay action transfers only confirmed Feed price observations, never changes listing price",()=>{
  const src=fs.readFileSync(new URL("../api/ebay/extension-action.js",import.meta.url),"utf8");
  assert.match(src,/amazonReferencePrice: payload\.amazonReferencePrice/);
  assert.match(src,/task\.draftVisible === true/);
  assert.match(src,/amazonReferenceSync = await syncAmazonPriceReference/);
  assert.match(src,/syncAmazonPriceReference\(\{/);
  assert.match(src,/amazonReferencePrice: registration\.amazonReferencePrice/);
  assert.doesNotMatch(src,/payload\.price\s*=\s*payload\.amazonReferencePrice/);
});
