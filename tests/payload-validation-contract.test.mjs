import test from 'node:test';
import assert from 'node:assert/strict';
import {payloadValidationSummary,payloadValidationReviewText} from '../lib/product-master-consumer.js';
const sku='ELY-000123',h='a'.repeat(64);
const fixture=()=>({transportReadiness:{
 selectedSkus:[sku],selectedVariantKeys:[],approvalPreparation:{requestPlanSha256:h},
 payloadValidation:{schemaVersion:'elyon-payload-validation-v4.4.3',ruleRevision:'4.4.3.1',contract:{api:'Sell Inventory API',version:'1.18.5',source:'sell_inventory_v1_oas3.json',sourceSha256:'a99b7026ba541ff9d3fc6548e901f7005dbcc1602f638fe4d4aa2f95e4266b7e',operations:['createOrReplaceInventoryItem','createOrReplaceInventoryItemGroup','createOffer']},transport:'INVENTORY',scope:'EXACT_CANONICAL_JSON',payloadSha256:h,validationSha256:'b'.repeat(64),status:'UNVERIFIED',issues:[{status:'UNVERIFIED',level:'RELEASE',code:'LIVE_PROVIDER_NOT_VERIFIED',field:'transport',sku:null,variantKey:null,description:'No productive provider verification in this phase',missingEvidence:'controlled_live_acceptance',blocking:true,nextAction:'VERIFY_EVIDENCE'}],blocking:true,nextAction:'REVIEW_VALIDATION_ISSUES',officialFullSchemaValidated:false,executionAuthorized:false,publishAuthorized:false,feedAuthorized:false,externalStateVerified:false,uploadVerified:false,automaticRetryAllowed:false}
}});
test('optional V4.4.3 review is backward compatible and read-only',()=>{
 assert.equal(payloadValidationSummary({transportReadiness:{}}),null);
 const result=payloadValidationSummary(fixture());
 assert.equal(result.status,'UNVERIFIED');assert.equal(result.executionAuthorized,false);
 assert.match(payloadValidationReviewText(result),/LIVE_PROVIDER_NOT_VERIFIED/);
 assert.match(payloadValidationReviewText(result),/Keine produktive Freigabe/);
});
test('consumer rejects a changed payload hash, authority, revision, SKU or false validation status',()=>{
 for(const mutate of [
  x=>x.payloadSha256='c'.repeat(64),
  x=>x.executionAuthorized=true,
  x=>x.contract.sourceSha256='c'.repeat(64),
  x=>x.ruleRevision='4.4.3.2',
  x=>x.issues[0].sku='foreign',
  x=>x.status='VALIDATED',
  x=>x.issues=[],
  x=>x.issues[0].blocking=false
 ]){
  const r=fixture();mutate(r.transportReadiness.payloadValidation);
  assert.throws(()=>payloadValidationSummary(r),{code:'invalid_payload_validation_contract'});
 }
});
