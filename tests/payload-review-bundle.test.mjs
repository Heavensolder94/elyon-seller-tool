import test from 'node:test';
import assert from 'node:assert/strict';
import {payloadReviewBundleSummary} from '../lib/product-master-consumer.js';
import {payloadReviewBundleText} from '../lib/ebay-payload-review-view.js';
const sku='ELY-000123',h='a'.repeat(64);
const fixture=()=>{
 const identity={productId:'fixture',articleNumber:sku};
 const t={identity,projectionSha256:h,reviewBindingSha256:h,categoryId:'123',selectedSkus:[sku],selectedVariantKeys:[]};
 const missing=code=>({status:'BLOCKED',code,report:null});
 return {projectionSha256:h,categoryId:'123',transportReadiness:t,payloadReviews:{schemaVersion:'elyon-payload-review-bundle-v4.4.3',...identity,projectionSha256:h,reviewBindingSha256:h,categoryId:'123',selectedSkus:[sku],selectedVariantKeys:[],bundleSha256:h,inventory:missing('EXACT_INVENTORY_PLAN_UNAVAILABLE'),feed:missing('EXACT_FEED_JOB_OR_TEMPLATE_UNAVAILABLE'),categoryCsv:missing('EXACT_CATEGORY_CSV_UNAVAILABLE'),executionAuthorized:false,publishAuthorized:false,feedAuthorized:false,automaticRetryAllowed:false,externalStateVerified:false}};
};
test('existing Seller/Jarvis review consumes missing exact payload status without authorization',()=>{
 const review=fixture(),view=payloadReviewBundleSummary(review);
 assert.equal(view.inventory.status,'BLOCKED');assert.match(payloadReviewBundleText(view),/EXACT_FEED_JOB_OR_TEMPLATE_UNAVAILABLE/);
 assert.equal(view.executionAuthorized,false);assert.equal(payloadReviewBundleSummary({}),null);
 for(const mutate of [b=>b.productId='foreign',b=>b.executionAuthorized=true,b=>b.feed.status='VALIDATED',b=>b.selectedSkus=['foreign']]){
  const r=fixture();mutate(r.payloadReviews);assert.throws(()=>payloadReviewBundleSummary(r),{code:'invalid_payload_review_bundle'});
 }
});
