import {createHash} from 'node:crypto';
import {ebayApiRoot,ebayVerificationSession,callEbayJson,configuredEbayScopes} from './ebay-production.js';
import {getTokenStoreDescription} from './ebay-token-store.js';
import {getProductMasterRedisConfig} from './product-master-store.js';

export const VERIFICATION_SCHEMA='elyon-commerce-readiness-v2.5';
const OFF=Object.freeze({executionAuthorized:false,operationalEnabled:false,uploadVerified:false,releaseEligible:false,evidenceAuthenticated:false,scopeAuthenticated:false,confirmationAllowed:false,reservationAllowed:false,retryAllowed:false,causalityVerified:false});
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const digits=v=>typeof v==='string'&&/^\d{1,120}$/.test(v);
const sku=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/.test(v);
const money=v=>typeof v==='string'&&/^\d{1,7}(?:\.\d{1,2})?$/.test(v)&&Number(v)>0?Number(v).toFixed(2):null;
const qty=v=>Number.isSafeInteger(v)&&v>=0&&v<=999999999?v:null;
const prefix='https://api.ebay.com/oauth/api_scope';
const identityScope=prefix+'/commerce.identity.readonly';
const inventoryScope=prefix+'/sell.inventory';
const readScope=prefix+'/sell.inventory.readonly';
export function inspectStoredTarget(data){
 if(data?.ok!==true||data.schemaVersion!=='elyon-price-stock-proposal-v2.2'||data.scopeAuthenticated!==false||
  ['executionAuthorized','operationalEnabled','uploadVerified','releaseEligible','evidenceAuthenticated'].some(k=>data[k]!==false)||
  !Array.isArray(data.proposals)||data.proposals.length!==1)return null;
 const p=data.proposals[0],t=p?.target;
 if(p?.storedInventoryTarget!==true||!digest(p.productRevision)||!digest(data.economicsRulesSha256)||
  !Number.isSafeInteger(data.ruleRevision)||typeof data.validationRuleVersion!=='string'||!t||
  t.environment!=='production'||t.marketplace!=='EBAY_DE'||t.currency!=='EUR'||!sku(t.sku)||!digits(t.offerId)||!digits(t.listingId))return null;
 return {sku:t.sku,offerId:t.offerId,listingId:t.listingId,environment:t.environment,marketplace:t.marketplace,currency:t.currency};
}
export function inspectInventoryReadback(target,offer,item,offers){
 const blockers=[];
 const exact=o=>o?.offerId===target.offerId&&o.sku===target.sku&&o.listing?.listingId===target.listingId&&
  o.marketplaceId===target.marketplace&&o.format==='FIXED_PRICE'&&o.status==='PUBLISHED'&&o.listing?.listingStatus==='ACTIVE'&&o.pricingSummary?.price?.currency==='EUR';
 if(!exact(offer))return {status:'IDENTITY_OR_STATUS_CONFLICT',observation:null,blockers:['offer_identity_or_status_mismatch']};
 const price=money(offer.pricingSummary.price.value),quantity=qty(offer.availableQuantity);
 if(price===null||quantity===null)return {status:'DATA_MISSING',observation:null,blockers:['explicit_offer_price_or_quantity_missing']};
 const inventoryQuantity=item?.sku===target.sku?qty(item.availability?.shipToLocationAvailability?.quantity):null;
 if(inventoryQuantity===null)blockers.push('global_inventory_quantity_missing');
 if(Array.isArray(item?.groupIds)&&item.groupIds.length||item?.inventoryItemGroupKey)blockers.push('variant_group_unverified');
 const list=offers?.offers;
 const complete=Array.isArray(list)&&list.length<=25&&!offers.next&&Number.isSafeInteger(offers.total)&&offers.total===list.length;
 if(!complete)blockers.push('offer_set_incomplete');
 else if(list.length!==1||!exact(list[0])||money(list[0].pricingSummary.price.value)!==price||qty(list[0].availableQuantity)!==quantity)blockers.push('multiple_or_conflicting_offers');
 return {status:blockers.length?'PARTIAL_READBACK':'MATCHED_READBACK',observation:{...target,price,quantity,inventoryQuantity,
  effectiveQuantityUpperBound:inventoryQuantity===null?null:Math.min(quantity,inventoryQuantity),status:'PUBLISHED',listingStatus:'ACTIVE',format:'FIXED_PRICE',origin:'inventory'},blockers};
}
function safeScopeReport(scopes){
 const s=new Set(Array.isArray(scopes)?scopes:[]);
 return {reported:s.size>0,inventoryRead:s.size?s.has(inventoryScope)||s.has(readScope):null,
  inventoryWrite:s.size?s.has(inventoryScope):null,identityRead:s.size?s.has(identityScope):null};
}
export function describeOperationalReadiness(data,{env=process.env}={}){
 const target=inspectStoredTarget(data);
 const store=getTokenStoreDescription('production'),pm=getProductMasterRedisConfig(env);
 return {schemaVersion:VERIFICATION_SCHEMA,checkedAt:new Date().toISOString(),status:'BLOCKED',
  targetEligible:Boolean(target),readbackRequested:false,account:{observed:false,bound:false},scope:{reported:false,inventoryRead:null,inventoryWrite:null,identityRead:null},
  infrastructure:{tokenStore:store.source??'unconfigured',tokenStoreConfigured:store.hasCredentials===true,
   productMasterStore:pm.source,productMasterConfigured:Boolean(pm.url&&pm.token),deploymentEnvironment:env.VERCEL_ENV==='production'?'production':env.VERCEL_ENV==='preview'?'preview':'other',
   configuredEbayEnvironment:env.EBAY_ENV==='production'?'production':env.EBAY_ENV==='sandbox'?'sandbox':'unverified',redisVerified:false,
   oauthAppConfigured:Boolean(env.EBAY_CLIENT_ID&&env.EBAY_CLIENT_SECRET),requestedInventoryScope:configuredEbayScopes().includes(inventoryScope)},
  offer:{status:'NOT_REQUESTED',observation:null},supplier:{status:'UNVERIFIED'},economics:{status:'CANONICAL_PREVIEW_ONLY',ruleRevision:data?.ruleRevision??null},
  blockers:['individual_owner_identity_unverified','workspace_binding_unverified','ebay_account_binding_unverified','granted_oauth_scopes_unverified',
   'authoritative_supplier_missing','productive_redis_unverified','retention_and_approval_unverified','write_verification_not_authorized',
   ...(!target?['no_single_exact_stored_inventory_target']:[])],...OFF};
}
// Only reachable on an explicit authenticated review action after canonical
// Company OS response. This is a diagnostic read, NOT an Evidence Provider
// capable of issuing a binding. No browser-controlled URLs or account IDs.
export async function verifyOperationalReadback(data){
 const report=describeOperationalReadiness(data);report.readbackRequested=true;
 const target=inspectStoredTarget(data);
 if(!target){report.offer.status='NO_ELIGIBLE_TARGET';return report;}
 // Existing V2.2 contract is production-only. Do not call production from
 // preview, or infer environment from a fallback token.
 if(process.env.VERCEL_ENV!=='production'||process.env.EBAY_ENV!=='production'){
  report.blockers.push('explicit_production_environment_required');return report;
 }
 let session;
 try{session=await ebayVerificationSession('production');}catch{report.blockers.push('environment_bound_session_unavailable');return report;}
 report.scope=safeScopeReport(session.scopes);
 if(report.scope.reported)report.blockers=report.blockers.filter(x=>x!=='granted_oauth_scopes_unverified');
 const root=ebayApiRoot('production'),headers={Authorization:'Bearer '+session.accessToken,Accept:'application/json','X-EBAY-C-MARKETPLACE-ID':'EBAY_DE'};
 const get=url=>callEbayJson(url,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(5000)});
 // Scope response may omit scopes; actual successful GET is proof only of
 // that specific read, never write permission. Don't request new scopes.
 const [offer,item,offers,identity]=await Promise.allSettled([
  get(root+'/sell/inventory/v1/offer/'+encodeURIComponent(target.offerId)),
  get(root+'/sell/inventory/v1/inventory_item/'+encodeURIComponent(target.sku)),
  get(root+'/sell/inventory/v1/offer?sku='+encodeURIComponent(target.sku)+'&limit=25&offset=0'),
  report.scope.identityRead===true?get('https://apiz.ebay.com/commerce/identity/v1/user'):Promise.resolve(null)
 ]);
 const value=r=>r.status==='fulfilled'?r.value:null;
 const userId=value(identity)?.userId;
 if(typeof userId==='string'&&userId.length>0&&userId.length<=200){
  report.account={observed:true,bound:false,reference:hash(['ebay','production',userId])};
 }
 if(offer.status!=='fulfilled'){report.offer.status='READ_UNAVAILABLE';report.blockers.push('offer_read_unavailable');return report;}
 const result=inspectInventoryReadback(target,value(offer),value(item),value(offers));
 report.offer={...result,checkedAt:new Date().toISOString(),source:'ebay_inventory_get_offer',accountBound:false};
 report.blockers.push(...result.blockers);
 const observed=result.observation,p=data.proposals[0];
 if(observed){
  report.offer.matchesBrowserObservation=money(p.current?.price)===observed.price&&typeof p.current?.quantity==='string'&&/^\d{1,9}$/.test(p.current.quantity)&&Number(p.current.quantity)===observed.quantity;
  if(!report.offer.matchesBrowserObservation)report.blockers.push('offer_changed_revalidation_required');
 }
 return report;
}
