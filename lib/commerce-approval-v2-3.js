import { createHash, randomUUID } from 'node:crypto';
import { isSellerAuthenticated } from './seller-access.js';

export const APPROVAL_SCHEMA='elyon-commerce-approval-v2.3';
export const OPERATION_SCHEMA='elyon-commerce-operation-v2.3';
const OFF=Object.freeze({executionAuthorized:false,operationalEnabled:false,uploadVerified:false,releaseEligible:false,evidenceAuthenticated:false});
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(v);
const requireValue=(ok,code)=>{if(!ok)throw Object.assign(new Error(code),{code});};
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const sorted=v=>[...v].sort();
const cents=v=>{requireValue(typeof v==='string'&&/^\d{1,7}(?:\.\d{1,2})?$/.test(v)&&Number(v)>0,'invalid_price');return Number(v).toFixed(2);};
const quantity=v=>{requireValue(typeof v==='string'&&/^\d{1,9}$/.test(v),'invalid_quantity');return String(Number(v));};
const numericId=v=>typeof v==='string'&&/^\d{1,120}$/.test(v);
const clone=v=>JSON.parse(JSON.stringify(v));
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};

// The existing signed cookie has only scope=seller and expiry. Shared bearer
// and bridge credentials do not establish a person, workspace or eBay account.
export function resolveAuthenticatedCommerceScope(req){
 return freeze({sellerAccess:isSellerAuthenticated(req),authenticated:false,userId:null,workspaceId:null,ebayAccountId:null,
  environment:null,marketplace:null,action:'Revise',blockers:['individual_seller_identity_unverified','workspace_binding_unverified','ebay_account_binding_unverified']});
}

// Only called after the authenticated server-to-server V2.2 preview response
// has been checked. Browser current values remain unverified. Never an approval.
export function describeBlockedCommerceReview(data,scope,now=Date.now()){
 requireValue(scope?.sellerAccess===true&&scope.authenticated===false,'seller_access_required');
 requireValue(data?.ok===true&&data.schemaVersion==='elyon-price-stock-proposal-v2.2'&&
  Array.isArray(data.proposals)&&data.proposals.length>0&&data.proposals.length<=50&&
  Number.isSafeInteger(data.ruleRevision)&&iso(data.checkedAt)&&
  Object.keys(OFF).every(k=>data[k]===false)&&data.scopeAuthenticated===false,'canonical_preview_unverified');
 const rows=data.proposals.map(p=>{
  requireValue(digest(p.targetSha256)&&digest(p.contentSha256)&&p.target&&p.proposed&&p.current,'canonical_preview_invalid');
  return {target:p.target,current:p.current,proposed:p.proposed,targetSha256:p.targetSha256,contentSha256:p.contentSha256,
   productRevision:digest(p.productRevision)?p.productRevision:null,calculation:p.calculation??null,savedGate:p.savedGate??null,
   missing:Array.isArray(p.missing)?p.missing:[],blockers:Array.isArray(p.blockers)?p.blockers:[]};
 }).sort((a,b)=>a.targetSha256.localeCompare(b.targetSha256));
 const blockers=[...new Set([...scope.blockers,'authenticated_offer_readback_missing','authenticated_supplier_readback_missing','production_redis_atomicity_unverified',
  ...rows.flatMap(r=>[...r.missing,...r.blockers]),...(rows.some(r=>!r.productRevision)?['canonical_product_revision_missing']:[]),
  ...(!digest(data.economicsRulesSha256)?['canonical_rules_fingerprint_missing']:[]),...(!id(data.validationRuleVersion)?['validation_rule_version_missing']:[])])];
 const contentSha256=hash(rows.map(r=>[r.targetSha256,r.contentSha256]));
 const evidenceSha256=hash([data.ruleRevision,data.economicsRulesSha256??null,data.validationRuleVersion??null,rows.map(r=>[r.productRevision,r.calculation,r.savedGate,r.missing,r.blockers])]);
 return freeze({schemaVersion:APPROVAL_SCHEMA,id:null,status:'EVIDENCE_REQUIRED',persisted:false,confirmationAllowed:false,reservationAllowed:false,
  scopeAuthenticated:false,scope,templateId:'ebay.de.price-quantity',action:'Revise',createdAt:new Date(now).toISOString(),
  expiresAt:new Date(now+15*60*1000).toISOString(),checkedAt:data.checkedAt,ruleRevision:data.ruleRevision,
  validationRuleVersion:data.validationRuleVersion??null,contentSha256,evidenceSha256,targetsSha256:hash(rows.map(r=>r.targetSha256)),
  productRevisions:rows.map(r=>({targetSha256:r.targetSha256,revision:r.productRevision})),blockers,...OFF});
}

// A separate simulation-only trust boundary. No production HTTP route imports
// this factory. Its caller must supply a real isolated test Redis command.
// No string flag, client request or production credentials can enable execution.
const fixtureBindings=new WeakSet();
export function createSimulationBinding(input){
 const s=input?.scope;
 requireValue(s&&s.simulation===true&&[s.userId,s.workspaceId,s.ebayAccountId].every(v=>id(v)&&v.startsWith('fixture:'))&&
  ['production','sandbox'].includes(s.environment)&&s.marketplace==='EBAY_DE'&&s.action==='Revise','simulation_scope_required');
 const scope={simulation:true,userId:s.userId,workspaceId:s.workspaceId,ebayAccountId:s.ebayAccountId,environment:s.environment,marketplace:s.marketplace,action:'Revise'};
 requireValue(Number.isSafeInteger(input.ruleRevision)&&input.ruleRevision>=0&&id(input.validationRuleVersion)&&digest(input.evidenceSha256),'invalid_fixture_evidence');
 requireValue(iso(input.evidenceCheckedAt),'fixture_evidence_time_missing');
 requireValue(Array.isArray(input.targets)&&input.targets.length>0&&input.targets.length<=50,'invalid_targets');
 const refs=new Set();
 const targets=input.targets.map(t=>{
  requireValue(id(t.productId)&&id(t.sku)&&numericId(t.listingId)&&numericId(t.offerId)&&id(t.productRevision)&&id(t.stateRevision)&&
   t.origin==='inventory'&&t.currency==='EUR'&&t.environment===scope.environment&&t.marketplace===scope.marketplace&&t.ebayAccountId===scope.ebayAccountId&&t.status==='ACTIVE','target_scope_or_identity_conflict');
  requireValue(t.variantId==null||id(t.variantId),'invalid_variant_identity');
  requireValue(t.supplier&&typeof t.supplier.available==='boolean'&&iso(t.supplier.checkedAt)&&iso(t.offerCheckedAt)&&t.economicsStatus==='PASS','fixture_evidence_incomplete');
  const supplier={quantity:quantity(t.supplier.quantity),available:t.supplier.available,checkedAt:t.supplier.checkedAt};
  requireValue(!(supplier.quantity==='0'&&supplier.available),'fixture_supplier_conflict');
  const current={price:cents(t.current?.price),quantity:quantity(t.current?.quantity)};
  const proposed={price:t.proposed?.price==null?null:cents(t.proposed.price),quantity:t.proposed?.quantity==null?null:quantity(t.proposed.quantity)};
  if(proposed.price===current.price)proposed.price=null;
  if(proposed.quantity===current.quantity)proposed.quantity=null;
  requireValue(proposed.price!==null||proposed.quantity!==null,'no_change');
  requireValue(proposed.quantity===null||Number(proposed.quantity)<=Number(current.quantity),'stock_increase_blocked');
  const desiredQty=proposed.quantity??current.quantity;
  requireValue(Number(desiredQty)<=Number(supplier.quantity)&&(desiredQty==='0'||supplier.available),'fixture_supplier_stock_insufficient');
  for(const ref of ['offer:'+t.offerId,'sku:'+t.sku]){requireValue(!refs.has(ref),'duplicate_target');refs.add(ref);}
  // Listing lock is intentionally shared across variants; multiple variants in
  // one batch deduplicate that lock, but concurrent separate batches conflict.
  refs.add('listing:'+t.listingId);
  return {productId:t.productId,sku:t.sku,listingId:t.listingId,offerId:t.offerId,variantId:t.variantId??null,
   productRevision:t.productRevision,stateRevision:t.stateRevision,origin:t.origin,currency:'EUR',current,proposed,supplier,offerCheckedAt:t.offerCheckedAt,economicsStatus:t.economicsStatus};
 }).sort((a,b)=>a.offerId.localeCompare(b.offerId)||a.sku.localeCompare(b.sku));
 const accountHash=hash([scope.ebayAccountId,scope.environment,scope.marketplace,scope.action]);
 const scopeHash=hash(scope),targetRefs=sorted(refs).map(v=>hash([accountHash,v]));
 const targetsSha256=hash(targets.map(t=>[t.productId,t.sku,t.listingId,t.offerId,t.variantId]));
 const normalizedContent=targets.map(t=>[t.listingId,t.offerId,t.sku,t.current,t.proposed,t.stateRevision]);
 const contentSha256=hash(normalizedContent);
 // Account and expected state, not actor, review ID, timestamps or batch order.
 const operationKey=hash([accountHash,normalizedContent]);
 const evidenceSha256=hash([input.evidenceSha256,input.evidenceCheckedAt,targets.map(t=>[t.offerCheckedAt,t.supplier,t.economicsStatus,t.productRevision,t.stateRevision])]);
 const evidenceTimes=[input.evidenceCheckedAt,...targets.flatMap(t=>[t.offerCheckedAt,t.supplier.checkedAt])].map(Date.parse);
 const evidenceOldestMs=Math.min(...evidenceTimes),evidenceNewestMs=Math.max(...evidenceTimes);
 const bindingSha256=hash([scopeHash,targetsSha256,contentSha256,evidenceSha256,input.ruleRevision,input.validationRuleVersion,targets.map(t=>t.productRevision)]);
 const result=freeze({schemaVersion:APPROVAL_SCHEMA,scope,scopeHash,accountHash,targetRefs,targets,targetsSha256,contentSha256,
  evidenceSha256,evidenceOldestMs,evidenceNewestMs,ruleRevision:input.ruleRevision,validationRuleVersion:input.validationRuleVersion,
  operationKey,bindingSha256,templateId:'ebay.de.price-quantity',action:'Revise',simulation:true,...OFF});
 fixtureBindings.add(result);return result;
}
export function assertSimulationBinding(binding){requireValue(fixtureBindings.has(binding),'unrecognized_simulation_binding');return binding;}
export function newReviewId(){return 'review:'+randomUUID();}
export function newOperationId(){return 'sim:'+randomUUID();}
export const disabledFlags=OFF;
