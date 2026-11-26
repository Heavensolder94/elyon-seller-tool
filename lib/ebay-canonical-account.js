// Same-token, immutable account verification for canonical Inventory registration.
import {createHash} from 'node:crypto';
import {readEnvironmentBoundToken} from './ebay-token-store.js';
import {refreshEbayAccessToken,ebayApiRoot,CANONICAL_ACCOUNT_SCOPES} from './ebay-production.js';
import {registerCanonicalInventoryIdentity} from './ebay-draft-registry.js';

// Separate reviewed release: a shared bridge secret cannot activate production.
const CANONICAL_REGISTRATION_RELEASED=true; // V4.5 reviewed canonical-only release; legacy writers remain closed.
export function canonicalRegistrationReleased(env=process.env){
 return CANONICAL_REGISTRATION_RELEASED&&env.VERCEL_ENV==='production'&&env.EBAY_ENV==='production'&&env.ELYON_CANONICAL_DRAFT_V45==='1';
}
const fail=(code='canonical_registry_account_unverified',status=409)=>{throw Object.assign(Error(code),{code,status});};
export function parseCanonicalEbayAccountIdentity(xml){
 if(typeof xml!=='string'||xml.length>1000000||/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(xml))fail();
 const root=xml.trim().replace(/^<\?xml[^?]*\?>\s*/,'');
 if(!/^<GetUserResponse(?:\s[^<>]*)?>[\s\S]*<\/GetUserResponse>$/.test(root))fail();
 const tag=(source,name)=>{const matches=[...source.matchAll(new RegExp('<'+name+'(?:\\s[^<>]*)?>([^<>]*)<\\/'+name+'>','g'))];return matches.length===1?matches[0][1].trim():null;};
 if(tag(root,'Ack')!=='Success')fail();
 const users=[...root.matchAll(/<User(?:\s[^<>]*)?>([\s\S]*?)<\/User>/g)];
 if(users.length!==1)fail();
 const value=tag(users[0][1],'EIASToken');
 if(typeof value!=='string'||value.length<8||value.length>500||!/^[A-Za-z0-9+/=_-]+$/.test(value))fail();
 return createHash('sha256').update('elyon:ebay:eias:v1:'+value).digest('hex');
}
async function readBounded(response,max){
 if(!response.ok)fail('canonical_registry_provider_read_unverified');
 const length=response.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>max))fail('canonical_registry_provider_read_unverified');
 if(!response.body?.getReader)fail('canonical_registry_provider_read_unverified');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();fail('canonical_registry_provider_read_unverified');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
 return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size));
}
async function observeCanonicalAccount(accountId,{readToken,refreshToken,fetchImpl}){
  const token=await readToken('production');
  if(!token?.refresh_token||token.environment!=='production')fail('canonical_registry_environment_token_missing');
  const refreshed=await refreshToken('production',token.refresh_token,{verificationOnly:true,canonicalAccount:true});
  if(typeof refreshed?.access_token!=='string'||!refreshed.access_token.trim())fail('canonical_registry_access_token_missing');
  if(!CANONICAL_ACCOUNT_SCOPES.every(scope=>String(refreshed.scope??'').split(/\s+/).includes(scope)))fail('canonical_registry_scope_unverified');
  const root=ebayApiRoot('production'),access=refreshed.access_token;
  const xml=await readBounded(await fetchImpl(root+'/ws/api.dll',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'text/xml; charset=utf-8','X-EBAY-API-CALL-NAME':'GetUser','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-SITEID':'77','X-EBAY-API-IAF-TOKEN':access},body:'<?xml version="1.0" encoding="utf-8"?><GetUserRequest xmlns="urn:ebay:apis:eBLBaseComponents"><DetailLevel>ReturnSummary</DetailLevel></GetUserRequest>'}),1000000);
  if(parseCanonicalEbayAccountIdentity(xml)!==accountId)fail('canonical_registry_account_mismatch');
  const current=await readToken('production');
  if(current?.environment!=='production'||current.refresh_token!==token.refresh_token)fail('canonical_registry_token_changed');
  return {token,root,access};
}
// Read-only same-account preflight; no offer creation, no registration.
export function createCanonicalAccountPreflight(deps={}){
 if(['readToken','refreshToken','fetchImpl'].some(k=>typeof deps[k]!=='function'))fail();
 return async accountId=>{
  if(!/^[a-f0-9]{64}$/.test(accountId??''))fail();
  await observeCanonicalAccount(accountId,deps);
  return {accountVerified:true,accountId,registrationReleased:true,published:false};
 };
}
export async function inspectCanonicalProductionRegistration(body){
 if(!canonicalRegistrationReleased())fail('canonical_production_registry_release_blocked');
 if(!body||Object.keys(body).some(k=>!['action','environment','accountId'].includes(k))||body.action!=='canonical_registration_preflight'||body.environment!=='production')fail('canonical_registry_identity_unverified');
 return createCanonicalAccountPreflight({readToken:readEnvironmentBoundToken,refreshToken:refreshEbayAccessToken,fetchImpl:globalThis.fetch})(body.accountId);
}
export function createCanonicalInventoryRegistration({readToken,refreshToken,fetchImpl,persist}={}){
 if([readToken,refreshToken,fetchImpl,persist].some(f=>typeof f!=='function'))fail();
 return async body=>{
  const fields=['action','environment','accountId','sourceProductId','offers','simulation','externalStateVerified','published'];
  if(!body||Object.keys(body).some(k=>!fields.includes(k))||body.action!=='register_canonical_inventory'||body.environment!=='production'||body.simulation!==false||body.externalStateVerified!==true||body.published!==false||!/^[a-f0-9]{64}$/.test(body.accountId??'')||typeof body.sourceProductId!=='string'||!body.sourceProductId||body.sourceProductId!==body.sourceProductId.trim()||body.sourceProductId.length>180||/[\x00-\x1f\x7f]/.test(body.sourceProductId)||!Array.isArray(body.offers)||body.offers.length!==1)fail('canonical_registry_identity_unverified');
  const offer=body.offers[0];
  if(!offer||Object.keys(offer).some(k=>!['offerId','sku'].includes(k))||!/^[A-Za-z0-9_-]{1,120}$/.test(offer.offerId??'')||!/^ELY-\d{6,}$/.test(offer.sku??''))fail('canonical_registry_identity_unverified');
  const {token,root,access}=await observeCanonicalAccount(body.accountId,{readToken,refreshToken,fetchImpl});
  let data;
  try{data=JSON.parse(await readBounded(await fetchImpl(root+'/sell/inventory/v1/offer/'+encodeURIComponent(offer.offerId),{method:'GET',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+access,Accept:'application/json','X-EBAY-C-MARKETPLACE-ID':'EBAY_DE'}}),1024*1024));}catch{fail('canonical_registry_provider_read_unverified');}
  if(data?.offerId!==offer.offerId||data.sku!==offer.sku||data.marketplaceId!=='EBAY_DE'||data.status!=='UNPUBLISHED'||data.listingId||data.listing?.listingId)fail('canonical_registry_offer_unverified');
  const current=await readToken('production');
  if(current?.environment!=='production'||current.refresh_token!==token.refresh_token)fail('canonical_registry_token_changed');
  const result=await persist({...offer,sourceProductId:body.sourceProductId,accountId:body.accountId,environment:'production'});
  if(result?.persisted!==true||result.accountVerified!==true||result.accountId!==body.accountId||result.count!==1)fail('canonical_registry_persistence_unconfirmed',503);
  return result;
 };
}
export async function registerCanonicalProductionInventory(body){
 if(!canonicalRegistrationReleased())fail('canonical_production_registry_release_blocked');
 return createCanonicalInventoryRegistration({readToken:readEnvironmentBoundToken,refreshToken:refreshEbayAccessToken,fetchImpl:globalThis.fetch,persist:registerCanonicalInventoryIdentity})(body);
}
