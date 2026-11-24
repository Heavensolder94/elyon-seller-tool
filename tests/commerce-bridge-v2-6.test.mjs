import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import handler,{assertCanonicalPreviewResponse} from '../api/price-stock-preview.js';
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

test('HTTP bridge integration: authentication, single explicit readback, no writes, timeout and bad upstream response',async()=>{
 const envKeys=['ELYON_SELLER_ACCESS_TOKEN','ELYON_COMPANY_OS_SYNC_CODE','ELYON_COMPANY_OS_URL','VERCEL_ENV','EBAY_ENV'];
 const saved=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));const originalFetch=globalThis.fetch;
 const {input,data}=fixture();let calls=[],mode='ok';
 const invoke=async(body=input,headers={authorization:'Bearer fixture-access-v26'})=>{
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.code=s;return this;},json(b){this.body=b;return this;}};
  await handler({method:'POST',headers,body},res);return res;
 };
 try{
  Object.assign(process.env,{ELYON_SELLER_ACCESS_TOKEN:'fixture-access-v26',ELYON_COMPANY_OS_SYNC_CODE:'fixture-sync-v26',ELYON_COMPANY_OS_URL:'https://company.invalid',VERCEL_ENV:'preview',EBAY_ENV:'production'});
  globalThis.fetch=async(url,options)=>{
   calls.push({url:String(url),options});
   if(mode==='timeout')throw Error('fixture timeout');
   if(mode==='missing')return {ok:false,status:404};
   if(mode==='invalid')return {ok:true,json:async()=>({...data,proposals:[]})};
   return {ok:true,json:async()=>data};
  };
  assert.equal((await invoke(input,{})).code,403);assert.equal(calls.length,0);
  assert.equal((await invoke({...input,changes:[input.changes[0],input.changes[0]]})).code,400);
  assert.equal((await invoke({...input,verifyReadback:true,changes:[input.changes[0],{...input.changes[0],sku:'ELY-000124',offerId:'0003'}]})).code,400);
  assert.equal((await invoke({...input,accountId:'forged'})).code,400);assert.equal(calls.length,0);
  const result=await invoke();assert.equal(result.code,200);assert.equal(result.headers['Cache-Control'],'no-store');
  assert.equal(result.body.approvalReview.persisted,false);assert.equal(result.body.approvalReview.reservationAllowed,false);
  assert.equal(result.body.operationalReadiness.executionAuthorized,false);assert.equal(result.body.artifact.rowCount,1);
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://company.invalid/api/price-stock-preview');
  assert.equal(calls[0].options.redirect,'error');assert.deepEqual(JSON.parse(calls[0].options.body),input);
  assert.equal(calls[0].options.headers['X-Elyon-Sync-Code'],'fixture-sync-v26');
  assert.doesNotMatch(JSON.stringify(result.body),/fixture-sync-v26|fixture-access-v26/);
  const diagnostic=await invoke({...input,verifyReadback:true});
  assert.equal(diagnostic.code,200);assert.equal(diagnostic.body.operationalReadiness.readbackRequested,true);
  assert.equal(calls.length,2);assert.deepEqual(JSON.parse(calls[1].options.body),input);
  for(const failure of ['timeout','missing','invalid']){mode=failure;const bad=await invoke();assert.equal(bad.code,503);assert.equal(bad.body.ok,false);assert.equal('artifact' in bad.body,false);}
 }finally{globalThis.fetch=originalFetch;for(const k of envKeys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
});
