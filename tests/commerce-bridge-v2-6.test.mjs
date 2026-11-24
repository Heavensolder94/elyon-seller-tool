import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertCanonicalPreviewResponse} from '../api/price-stock-preview.js';
const SCHEMA='elyon-price-stock-proposal-v2.2';
const off={executionAuthorized:false,operationalEnabled:false,evidenceAuthenticated:false,uploadVerified:false,releaseEligible:false};
const sha=s=>createHash('sha256').update(s).digest('hex');
function fixture(){
 const target={articleNumber:'ELY-000123',sku:'ELY-000123',listingId:'0001',offerId:'0002',environment:'production',marketplace:'EBAY_DE',currency:'EUR'};
 const c={...target,origin:'inventory',currentPrice:'20.00',currentQuantity:'3',price:null,quantity:'0'};
 const input={schemaVersion:SCHEMA,changes:[c]};
 const checkedAt='2026-11-24T12:00:00.000Z',targetSha256=sha('target');
 const p={...off,schemaVersion:SCHEMA,target,targetSha256,contentSha256:sha('content'),origin:'inventory',ruleRevision:2,checkedAt,current:{price:'20.00',quantity:'3',source:'browser_observation_unverified'},proposed:{price:null,quantity:'0'}};
 const bytes=Buffer.from('offline fixture');
 const data={...off,ok:true,scopeAuthenticated:false,schemaVersion:SCHEMA,ruleRevision:2,economicsRulesSha256:sha('rules'),validationRuleVersion:'1',checkedAt,proposals:[p],status:'EXPORT_READY_OFFLINE',plan:{...off,contentSha256:sha(bytes)},artifact:{...off,status:'EXPORT_READY_OFFLINE',filename:'elyon-price-quantity-OFFLINE-NOT-FOR-UPLOAD.csv',rowCount:1,rowTargets:[targetSha256],sha256:sha(bytes),base64:bytes.toString('base64')}};
 return {input,data};
}
test('canonical bridge accepts matching offline envelope including zero quantity and leading zero identifiers',()=>{
 const {input,data}=fixture();
 assert.doesNotThrow(()=>assertCanonicalPreviewResponse(data,input));
 assert.doesNotThrow(()=>assertCanonicalPreviewResponse({...data,artifact:null,plan:null,status:'REVIEW_REQUIRED'},input));
});
test('canonical bridge fails closed on mismatched targets, values, revisions and incomplete response',()=>{
 for(const mutate of [
  d=>{d.proposals[0].target.offerId='0003';},
  d=>{d.proposals[0].proposed.quantity='1';},
  d=>{d.proposals[0].current.quantity='5';},
  d=>{d.proposals[0].ruleRevision=3;},
  d=>{d.proposals=[];},
  d=>{delete d.proposals[0].current;},
  d=>{d.proposals[0].executionAuthorized=true;},
  d=>{d.plan.operationalEnabled=true;},
  d=>{d.artifact.uploadVerified=true;},
  d=>{d.artifact.rowTargets=[sha('different')];},
  d=>{d.artifact.base64=Buffer.from('changed').toString('base64');},
  d=>{delete d.economicsRulesSha256;}
 ]){
  const {input,data}=fixture();mutate(data);
  assert.throws(()=>assertCanonicalPreviewResponse(data,input));
 }
});
