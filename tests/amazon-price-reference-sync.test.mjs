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

test("existing Dreamzie review is updated directly through Company OS with verified response",async()=>{
  const requests=[];
  const result=await syncAmazonPriceReference({
    sku,amazonReferencePrice:12.91,amazonReferenceCapturedAt:date,
    env:{ELYON_COMPANY_OS_SYNC_CODE:"unit-test-secret",ELYON_COMPANY_OS_URL:"https://company.example.test"},
    fetchImpl:async(url,request)=>{
      const body=JSON.parse(request.body);
      requests.push({url:String(url),request,body});
      return{ok:true,status:200,json:async()=>({ok:true,transition:"set_amazon_reference",
        result:{product:{supplierSku:sku,workflowStage:"product_review",sourceImportId:"seller-ebay-review:"+sku,
          meta:{reviewOnly:true,supplierCostVerified:false,ebaySku:sku,amazonReferencePrice:12.91}}}})};
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

test("Company OS rejects unknown or duplicate review and returns explicit non-success status",async()=>{
  const responses=[
    [{ok:false,status:409,body:{ok:false,error:"amazon_reference_review_not_found"}},"review_not_found"],
    [{ok:false,status:409,body:{ok:false,error:"amazon_reference_ambiguous"}},"ambiguous"],
    [{ok:false,status:403,body:{ok:false,error:"forbidden"}},"authentication_failed"],
    [{ok:true,status:200,body:{ok:true,transition:"set_amazon_reference"}},"confirmation_missing"],
    [{ok:true,status:200,body:{ok:true,transition:"set_amazon_reference",
      result:{product:{supplierSku:"AMZ-B0D63HF7Z4",workflowStage:"product_review",
        meta:{reviewOnly:true,amazonReferencePrice:12.91}}}}},"confirmation_missing"],
  ];
  for(const [response,state] of responses){
    const result=await syncAmazonPriceReference({
      sku,amazonReferencePrice:12.91,
      env:{ELYON_COMPANY_OS_SYNC_CODE:"unit-test-secret"},
      fetchImpl:async()=>({ok:response.ok,status:response.status,json:async()=>response.body}),
    });
    assert.equal(result.synced,false);
    assert.equal(result.state,state);
  }
});

test("malformed SKU, missing price and server sync configuration fail without writing",async()=>{
  const calls=[];
  const kwargs={sku,amazonReferencePrice:12.91,
    env:{ELYON_COMPANY_OS_SYNC_CODE:"unit-test-secret"},
    fetchImpl:async()=>{calls.push(1);throw Error("should not write")}};
  assert.equal((await syncAmazonPriceReference({...kwargs,sku:"ELY-001234"})).state,"invalid_sku");
  assert.equal((await syncAmazonPriceReference({...kwargs,amazonReferencePrice:null})).state,"reference_missing");
  assert.equal((await syncAmazonPriceReference({...kwargs,env:{}})).state,"connection_unavailable");
  assert.equal((await syncAmazonPriceReference({...kwargs,env:{ELYON_COMPANY_OS_SYNC_CODE:"unit-test-secret",
    ELYON_COMPANY_OS_URL:"http://untrusted.example"}})).state,"connection_invalid");
  assert.equal(calls.length,0);
});

test("eBay action transfers only confirmed Feed price observations, never changes listing price",()=>{
  const src=fs.readFileSync(new URL("../api/ebay/extension-action.js",import.meta.url),"utf8");
  assert.match(src,/amazonReferencePrice: payload\.amazonReferencePrice/);
  assert.match(src,/task\.feedConfirmed === true/);
  assert.match(src,/amazonReferenceSync = await syncAmazonPriceReference/);
  assert.match(src,/syncAmazonPriceReference\(\{/);
  assert.match(src,/amazonReferencePrice: registration\.amazonReferencePrice/);
  assert.doesNotMatch(src,/payload\.price\s*=\s*payload\.amazonReferencePrice/);
});
