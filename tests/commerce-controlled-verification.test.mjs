import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectStoredTarget,inspectInventoryReadback,describeOperationalReadiness,verifyOperationalReadback} from '../lib/commerce-controlled-verification.js';
import {readEnvironmentBoundToken} from '../lib/ebay-token-store.js';
import {ebayVerificationSession} from '../lib/ebay-production.js';
const digest='a'.repeat(64),off={executionAuthorized:false,operationalEnabled:false,uploadVerified:false,releaseEligible:false,evidenceAuthenticated:false,scopeAuthenticated:false};
const target={sku:'ELY-000123',offerId:'000456',listingId:'000123',environment:'production',marketplace:'EBAY_DE',currency:'EUR'};
const p={target,storedInventoryTarget:true,productRevision:digest,current:{price:'20.00',quantity:'3'}};
const data={ok:true,schemaVersion:'elyon-price-stock-proposal-v2.2',...off,ruleRevision:2,economicsRulesSha256:digest,validationRuleVersion:'1',proposals:[p]};
const offer={offerId:target.offerId,sku:target.sku,marketplaceId:'EBAY_DE',format:'FIXED_PRICE',status:'PUBLISHED',listing:{listingId:target.listingId,listingStatus:'ACTIVE'},availableQuantity:0,pricingSummary:{price:{value:'20.00',currency:'EUR'}}};
const item={sku:target.sku,availability:{shipToLocationAvailability:{quantity:6}}};
const offers={total:1,offers:[offer]};
test('V2.5 only one canonical exact stored nonvariant reference accepted; client flags are not authority',()=>{
 assert.deepEqual(inspectStoredTarget(data),target);
 for(const patch of [{storedInventoryTarget:false},{productRevision:null},{target:{...target,environment:'sandbox'}},{target:{...target,marketplace:'EBAY_US'}},{target:{...target,offerId:456}}])assert.equal(inspectStoredTarget({...data,proposals:[{...p,...patch}]}),null);
 assert.equal(inspectStoredTarget({...data,executionAuthorized:true}),null);
 assert.equal(inspectStoredTarget({...data,proposals:[p,p]}),null);
 const result=describeOperationalReadiness(data);
 assert.equal(result.status,'BLOCKED');assert.equal(result.readbackRequested,false);assert.equal(result.account.bound,false);
 for(const key of Object.keys(off))assert.equal(result[key],false);
 assert.equal(result.confirmationAllowed,false);
 assert.equal(result.reservationAllowed,false);
});
test('V2.5 readback uses exact identifiers and explicit quantity, not global quantity or default price',()=>{
 const a=inspectInventoryReadback(target,offer,item,offers);
 assert.equal(a.status,'MATCHED_READBACK');assert.equal(a.observation.quantity,0);assert.equal(a.observation.inventoryQuantity,6);assert.equal(a.observation.effectiveQuantityUpperBound,0);
 for(const patch of [{offerId:'999'},{sku:'wrong'},{marketplaceId:'EBAY_US'},{status:'UNPUBLISHED'},{format:'AUCTION'},{listing:{listingId:'999',listingStatus:'ACTIVE'}},{pricingSummary:{price:{value:'20',currency:'USD'}}}])assert.equal(inspectInventoryReadback(target,{...offer,...patch},item,offers).observation,null);
 for(const patch of [{availableQuantity:undefined},{availableQuantity:-1},{availableQuantity:'0'},{pricingSummary:{price:{value:'',currency:'EUR'}}}])assert.equal(inspectInventoryReadback(target,{...offer,...patch},item,offers).status,'DATA_MISSING');
 assert.equal(inspectInventoryReadback(target,offer,null,offers).observation.inventoryQuantity,null);
 assert.equal(inspectInventoryReadback(target,offer,item,{total:2,offers:[offer]}).status,'PARTIAL_READBACK');
 assert.ok(inspectInventoryReadback(target,offer,item,{total:2,offers:[offer,{...offer,offerId:'002'}]}).blockers.includes('multiple_or_conflicting_offers'));
 assert.ok(inspectInventoryReadback(target,offer,{...item,groupIds:['g']},offers).blockers.includes('variant_group_unverified'));
});
test('V2.5 missing target makes no calls; preview environment cannot reach production',async()=>{
 const previous=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{
  const a=await verifyOperationalReadback({...data,proposals:[]});assert.equal(a.offer.status,'NO_ELIGIBLE_TARGET');
  const b=await verifyOperationalReadback(data);assert.ok(b.blockers.includes('explicit_production_environment_required'));assert.equal(b.executionAuthorized,false);
 }finally{if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous;}
});
test('V2.5 environment-bound token rejects fallback, mismatched environment, missing metadata; refresh does not expand scopes',async()=>{
 const names=['EBAY_TOKEN_STORE_URL','EBAY_TOKEN_STORE_TOKEN','EBAY_TOKEN_STORE_MODE','EBAY_TOKEN_STORE_KEY','EBAY_REFRESH_TOKEN','EBAY_CLIENT_ID','EBAY_CLIENT_SECRET','EBAY_REFRESH_SCOPES'];
 const prev=Object.fromEntries(names.map(k=>[k,process.env[k]])),oldFetch=globalThis.fetch;
 try{
  Object.assign(process.env,{EBAY_TOKEN_STORE_URL:'https://fixture.invalid',EBAY_TOKEN_STORE_TOKEN:'fixture',EBAY_TOKEN_STORE_MODE:'upstash',EBAY_TOKEN_STORE_KEY:'fixture-legacy',EBAY_REFRESH_TOKEN:'unscoped',EBAY_CLIENT_ID:'fixture',EBAY_CLIENT_SECRET:'fixture',EBAY_REFRESH_SCOPES:'should-not-be-sent'});
  let stored={refresh_token:'fixture',environment:'sandbox'},calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({result:JSON.stringify(stored)})};};
  assert.equal(await readEnvironmentBoundToken('production'),null);assert.equal(calls.length,1);assert.match(calls[0].url,/fixture-legacy%3Aproduction$/);
  stored={refresh_token:'fixture'};assert.equal(await readEnvironmentBoundToken('production'),null);
  stored=null;await assert.rejects(ebayVerificationSession('production'),/Environment-bound token missing/);
  stored={refresh_token:'fixture',environment:'production'};
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url.includes('fixture.invalid')?{result:JSON.stringify(stored)}:{access_token:'fixture',scope:''}};};
  const session=await ebayVerificationSession('production');assert.deepEqual(session.scopes,[]);assert.equal(session.environment,'production');
  const refresh=calls.at(-1);assert.match(refresh.url,/api\.ebay\.com\/identity\/v1\/oauth2\/token$/);assert.equal(refresh.options.body.has('scope'),false);
 }finally{globalThis.fetch=oldFetch;for(const k of names){if(prev[k]===undefined)delete process.env[k];else process.env[k]=prev[k];}}
});
test('V2.5 no new execution routes or ledger write adapter',async()=>{
 const api=await readFile(new URL('../api/price-stock-preview.js',import.meta.url),'utf8');
 const ui=await readFile(new URL('../seller-price-stock-review.js',import.meta.url),'utf8');
 const provider=await readFile(new URL('../lib/commerce-controlled-verification.js',import.meta.url),'utf8');
 assert.match(api,/verifyReadback\?await verifyOperationalReadback\(data\)/);assert.match(api,/requireSellerAccess/);
 assert.match(ui,/Angebot lesend verifizieren/);assert.match(ui,/confirmation\.disabled=true/);
 assert.doesNotMatch(provider,/createSimulationLedger|bulk_update_price_quantity|ReviseInventoryStatus|writeToken\(/);
 assert.match(provider,/method:'GET'/);
});

test('V2.5 mocked server readback: fixed hosts, token scope, separate quantity and account observation, no authority',async()=>{
 const keys=['VERCEL_ENV','EBAY_ENV','EBAY_TOKEN_STORE_URL','EBAY_TOKEN_STORE_TOKEN','EBAY_TOKEN_STORE_MODE','EBAY_CLIENT_ID','EBAY_CLIENT_SECRET'];
 const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]])),old=globalThis.fetch;
 try{
  Object.assign(process.env,{VERCEL_ENV:'production',EBAY_ENV:'production',EBAY_TOKEN_STORE_URL:'https://fixture.invalid',EBAY_TOKEN_STORE_TOKEN:'fixture',EBAY_TOKEN_STORE_MODE:'upstash',EBAY_CLIENT_ID:'fixture',EBAY_CLIENT_SECRET:'fixture'});
  const calls=[];let userId='fixture-account-a';
  globalThis.fetch=async(url,options={})=>{
   calls.push({url,method:options.method??'GET'});
   if(url.startsWith('https://fixture.invalid/'))return {ok:true,json:async()=>({result:JSON.stringify({environment:'production',refresh_token:'fixture'})})};
   if(url.endsWith('/identity/v1/oauth2/token'))return {ok:true,json:async()=>({access_token:'fixture-access',scope:'https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/commerce.identity.readonly'})};
   const body=url.includes('apiz.ebay.com')?{userId}:url.includes('/inventory_item/')?item:url.includes('/offer?')?offers:url.endsWith('/offer/000456')?offer:null;
   assert.ok(body,'unexpected URL');assert.equal(options.method,'GET');return {ok:true,text:async()=>JSON.stringify(body)};
  };
  const result=await verifyOperationalReadback(data);assert.equal(result.offer.status,'MATCHED_READBACK');assert.equal(result.offer.observation.quantity,0);
  assert.equal(result.offer.matchesBrowserObservation,false);assert.ok(result.blockers.includes('offer_changed_revalidation_required'));
  assert.equal(result.scope.inventoryRead,true);assert.equal(result.account.observed,true);assert.equal(result.account.bound,false);
  assert.equal(result.executionAuthorized,false);assert.equal(result.evidenceAuthenticated,false);assert.equal(calls.length,6);
  assert.doesNotMatch(JSON.stringify(result),/fixture-access|fixture-account-a/);
  userId='fixture-account-b';const changed=await verifyOperationalReadback(data);assert.notEqual(result.account.reference,changed.account.reference);assert.equal(changed.confirmationAllowed,false);
 }finally{globalThis.fetch=old;for(const k of keys){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];}}
});
