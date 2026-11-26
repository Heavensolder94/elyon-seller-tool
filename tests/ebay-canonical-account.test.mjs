import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCanonicalEbayAccountIdentity,createCanonicalInventoryRegistration,createCanonicalAccountPreflight,canonicalRegistrationReleased} from '../lib/ebay-canonical-account.js';
import {registerCanonicalInventoryIdentity} from '../lib/ebay-draft-registry.js';
const xml='<GetUserResponse><Ack>Success</Ack><User><EIASToken>fixture-account-identifier</EIASToken></User></GetUserResponse>';
const accountId=parseCanonicalEbayAccountIdentity(xml),sku='ELY-000123',offerId='fixture-offer';
const request={action:'register_canonical_inventory',environment:'production',accountId,sourceProductId:'fixture-product',offers:[{offerId,sku}],simulation:false,externalStateVerified:true,published:false};
test('same-token Seller readback accepts only exact unpublished account identity',async t=>{
 const calls=[];let writes=0,foreign=false,changed=false,readCount=0;
 const register=createCanonicalInventoryRegistration({readToken:async()=>({environment:'production',refresh_token:changed&&++readCount>1?'other':'fixture'}),refreshToken:async()=>({access_token:'fixture-access',scope:'https://api.ebay.com/oauth/api_scope/sell.inventory'}),fetchImpl:async(url,opts)=>{
  calls.push({url,opts});assert.equal(opts.redirect,'error');
  if(url.endsWith('/ws/api.dll')){assert.equal(opts.headers['X-EBAY-API-IAF-TOKEN'],'fixture-access');return new Response(xml);}
  assert.equal(opts.headers.Authorization,'Bearer fixture-access');return Response.json({offerId:foreign?'foreign':offerId,sku,marketplaceId:'EBAY_DE',status:'UNPUBLISHED'});
 },persist:async x=>{writes++;assert.equal(x.accountId,accountId);return {persisted:true,count:1,accountVerified:true,accountId};}});
 assert.equal((await register(request)).persisted,true);assert.equal(writes,1);
 await assert.rejects(register({...request,accountId:'a'.repeat(64)}),{code:'canonical_registry_account_unverified'});
 foreign=true;await assert.rejects(register(request),{code:'canonical_registry_offer_unverified'});
 foreign=false;changed=true;await assert.rejects(register(request),{code:'canonical_registry_account_unverified'});
 assert.equal(writes,1);
 const count=calls.length;await assert.rejects(register({...request,simulation:true}));assert.equal(calls.length,count);
});
test('canonical registry CAS preserves unrelated rows and rejects competing SKU, account, identity and lost acknowledgement',async()=>{
 let raw=null,conflict=false,lost=false;
 const options={env:{UPSTASH_BACKUP_URL:'https://redis.fixture.invalid',UPSTASH_BACKUP_TOKEN:'fixture'},fetchImpl:async(_url,init)=>{
  const a=JSON.parse(init.body);
  if(a[0]==='GET')return Response.json({result:raw});
  assert.equal(a[0],'EVAL');
  if(conflict)return Response.json({result:0});
  assert.equal(a[4]==='1'?raw:null,a[4]==='1'?null:null);
  if(!lost)raw=a[6];
  return Response.json({result:1});
 }};
 const input={offerId,sku,sourceProductId:'fixture-product',accountId,environment:'production'};
 assert.equal((await registerCanonicalInventoryIdentity(input,options)).persisted,true);
 const first=raw;assert.equal(JSON.parse(raw).length,1);
 assert.equal((await registerCanonicalInventoryIdentity(input,options)).persisted,true);assert.equal(raw,first);
 for(const patch of [{accountId:'a'.repeat(64)},{offerId:'different'},{sourceProductId:'other'}])await assert.rejects(registerCanonicalInventoryIdentity({...input,...patch},options),{code:'canonical_registry_identity_conflict'});
 conflict=true;await assert.rejects(registerCanonicalInventoryIdentity(input,options),{code:'registry_concurrent_change'});assert.equal(raw,first);
 conflict=false;lost=true;await assert.rejects(registerCanonicalInventoryIdentity({...input,offerId:'second',sku:'ELY-000124',sourceProductId:'second-product'},options),{code:'registry_persistence_unconfirmed'});
 assert.equal(raw,first);
});

test('V4.5 release requires explicit server configuration and production environment',()=>{
 assert.equal(canonicalRegistrationReleased({VERCEL_ENV:'production',EBAY_ENV:'production'}),false);
 assert.equal(canonicalRegistrationReleased({VERCEL_ENV:'preview',EBAY_ENV:'production',ELYON_CANONICAL_DRAFT_V45:'1'}),false);
 assert.equal(canonicalRegistrationReleased({VERCEL_ENV:'production',EBAY_ENV:'sandbox',ELYON_CANONICAL_DRAFT_V45:'1'}),false);
 assert.equal(canonicalRegistrationReleased({VERCEL_ENV:'production',EBAY_ENV:'production',ELYON_CANONICAL_DRAFT_V45:'1'}),true);
});
test('V4.5 account preflight only observes the exact account, no inventory or registry writes',async()=>{
 const requests=[];
 const preflight=createCanonicalAccountPreflight({readToken:async()=>({environment:'production',refresh_token:'fixture'}),refreshToken:async()=>({access_token:'fixture-access',scope:'https://api.ebay.com/oauth/api_scope/sell.inventory'}),fetchImpl:async(url,opts)=>{requests.push(url);assert.ok(url.endsWith('/ws/api.dll'));assert.equal(opts.headers['X-EBAY-API-CALL-NAME'],'GetUser');return new Response(xml);}});
 assert.deepEqual(await preflight(accountId),{accountVerified:true,accountId,registrationReleased:true,published:false});
 await assert.rejects(preflight('a'.repeat(64)),{code:'canonical_registry_account_unverified'});
 assert.equal(requests.length,2);
});
