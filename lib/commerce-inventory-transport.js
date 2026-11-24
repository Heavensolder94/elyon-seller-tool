// V2.4 data-only Inventory simulation. No URL client, OAuth, fetch or adapter callback.
// Routing authority remains Company OS; V2.3 branded bindings admit inventory only.
import {createHash} from 'node:crypto';
import {assertSimulationBinding,disabledFlags} from './commerce-approval-v2-3.js';
export const TRANSPORT_SCHEMA='elyon-commerce-transport-v2.4';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const requireValue=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
const flags={simulation:true,retryAllowed:false,causalityVerified:false,externalStateVerified:false,...disabledFlags};
const validPrice=v=>typeof v==='string'&&/^\d{1,7}(?:\.\d{1,2})?$/.test(v)&&Number(v)>0;
const validQty=v=>typeof v==='string'&&/^\d{1,9}$/.test(v);
const price=v=>validPrice(v)?Number(v).toFixed(2):null;
const quantity=v=>validQty(v)?String(Number(v)):null;
const desired=t=>({price:t.proposed.price??t.current.price,quantity:t.proposed.quantity??t.current.quantity});
const same=(a,b)=>a.price===b.price&&a.quantity===b.quantity;
const targetKey=t=>hash([t.listingId,t.offerId,t.sku,t.variantId]);
const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
// Pure request representation; this does NOT prove reservation or issue a
// transport plan. Only the existing ledger can bind it to a stored operation.
export function inventoryRequestParts(binding){
 assertSimulationBinding(binding);
 return freeze(binding.targets.map((t,i)=>{
  requireValue(t.origin==='inventory'&&t.currency==='EUR'&&validPrice(t.current.price)&&validQty(t.current.quantity)&&
   (t.proposed.price===null||validPrice(t.proposed.price))&&(t.proposed.quantity===null||validQty(t.proposed.quantity)),'unsupported_inventory_target');
  const offer={offerId:t.offerId};
  if(t.proposed.price!==null)offer.price={currency:'EUR',value:t.proposed.price};
  if(t.proposed.quantity!==null)offer.availableQuantity=Number(t.proposed.quantity);
  const body={requests:[{sku:t.sku,offers:[offer]}]};
  return {id:'part:'+String(i+1).padStart(2,'0'),targetKey:targetKey(t),target:t,desired:desired(t),requestSha256:hash(body),body};
 }));
}
function checkIdentity(t,s,r){
 return r.sku===t.sku&&r.offerId===t.offerId&&r.listingId===t.listingId&&r.variantId===t.variantId&&
  r.ebayAccountId===s.ebayAccountId&&r.environment===s.environment&&r.marketplace===s.marketplace&&r.currency==='EUR'&&r.origin==='inventory'&&r.status==='ACTIVE';
}
function observations(binding,readback,now){
 assertSimulationBinding(binding);
 const scope=binding.scope, rows=Array.isArray(readback?.rows)?readback.rows:[];
 const map=new Map(), bad=new Set();
 if(readback?.simulation!==true||rows.length>50||!Number.isFinite(now))return {map,bad,invalid:true};
 for(const row of rows){
  if(!plain(row)||typeof row.offerId!=='string')return {map,bad,invalid:true};
  if(map.has(row.offerId))bad.add(row.offerId);else map.set(row.offerId,row);
 }
 return {map,bad,invalid:rows.some(r=>!binding.targets.some(t=>t.offerId===r.offerId))};
}
function evaluateObservation(t,binding,observation,now,{preflight=false,notBefore=0}={}){
 if(!observation)return {status:'STATE_UNKNOWN',observed:null};
 if(!checkIdentity(t,binding.scope,observation))return {status:'IDENTITY_CONFLICT',observed:null};
 const at=stamp(observation.checkedAt);
 if(at===null||at>now||at<notBefore||now-at>15*60*1000)return {status:'EVIDENCE_STALE',observed:null};
 const observed={price:price(observation.price),quantity:quantity(observation.quantity)};
 if(observed.price===null||observed.quantity===null)return {status:'STATE_UNKNOWN',observed:null};
 if(preflight){
  const s=observation.supplier,st=stamp(s?.checkedAt);
  if(observation.productRevision!==t.productRevision||observation.stateRevision!==t.stateRevision||
   observation.ruleRevision!==binding.ruleRevision||observation.validationRuleVersion!==binding.validationRuleVersion||
   observation.economicsStatus!=='PASS'||!s||quantity(s.quantity)!==t.supplier.quantity||s.available!==t.supplier.available||
   st===null||st>now||now-st>15*60*1000||!same(observed,t.current))return {status:'REVALIDATION_REQUIRED',observed};
  return {status:'ORIGINAL_STATE_CONFIRMED',observed};
 }
 const goal=desired(t);
 if(same(observed,goal))return {status:'TARGET_STATE_CONFIRMED',observed};
 if(same(observed,t.current))return {status:'ORIGINAL_STATE_CONFIRMED',observed};
 const changed=['price','quantity'].filter(k=>goal[k]!==t.current[k]);
 if(changed.some(k=>observed[k]===goal[k])&&changed.every(k=>observed[k]===goal[k]||observed[k]===t.current[k])&&
   ['price','quantity'].filter(k=>!changed.includes(k)).every(k=>observed[k]===t.current[k]))return {status:'PARTIAL_STATE_CONFIRMED',observed};
 return {status:'DIFFERENT_STATE',observed};
}
export function inspectTransportReadback(binding,readback,{now=Date.now(),preflight=false,notBefore=0}={}){
 const {map,bad,invalid}=observations(binding,readback,now);
 const rows=binding.targets.map(t=>{
  const outcome=invalid||bad.has(t.offerId)?{status:'IDENTITY_CONFLICT',observed:null}:evaluateObservation(t,binding,map.get(t.offerId),now,{preflight,notBefore});
  return {targetKey:targetKey(t),sku:t.sku,offerId:t.offerId,listingId:t.listingId,expected:t.current,desired:desired(t),...outcome};
 });
 return freeze({rows,ok:rows.every(r=>r.status===(preflight?'ORIGINAL_STATE_CONFIRMED':'TARGET_STATE_CONFIRMED')),
  status:preflight?(rows.every(r=>r.status==='ORIGINAL_STATE_CONFIRMED')?'READY_SIMULATION':'REVALIDATION_REQUIRED'):
   rows.every(r=>r.status==='TARGET_STATE_CONFIRMED')?'TARGET_STATE_CONFIRMED':rows.some(r=>r.status==='TARGET_STATE_CONFIRMED')?'PARTIAL_STATE_CONFIRMED':'RECONCILIATION_REQUIRED',...flags});
}

// Strict data-only result envelope. Never preserve external raw bodies,
// messages, tokens or caller-supplied transport identifiers.
function codes(v){
 if(v===undefined)return [];
 if(!Array.isArray(v)||v.length>20||v.some(e=>!plain(e)||!Number.isSafeInteger(e.errorId)||e.errorId<0))return null;
 return v.map(e=>e.errorId);
}
export function normalizeInventoryFixtureResult(binding,partId,fixture){
 const p=inventoryRequestParts(binding).find(x=>x.id===partId);requireValue(p,'unknown_part');
 const base={partId:p.id,targetKey:p.targetKey,sku:p.target.sku,offerId:p.target.offerId,listingId:p.target.listingId,
  desired:p.desired,confirmed:null,externalReference:null,...flags};
 const unknown=reason=>freeze({...base,status:'UNKNOWN_OUTCOME',httpStatus:null,rowStatus:null,errors:[],warnings:[],reason,reconciliationRequired:true});
 if(!plain(fixture)||fixture.simulation!==true||fixture.kind!=='response')return unknown('response_missing_or_interrupted');
 const http=fixture.httpStatus, body=fixture.body;
 if(![200,207].includes(http)||!plain(body)||!Array.isArray(body.responses)||body.responses.length!==1||
    Object.keys(body).some(k=>k!=='responses'))return unknown('response_envelope_unconfirmed');
 const row=body.responses[0];
 if(!plain(row)||row.sku!==p.target.sku||row.offerId!==p.target.offerId||
    (row.listingId!==undefined&&row.listingId!==p.target.listingId))return unknown('response_identity_conflict');
 const errors=codes(row.errors),warnings=codes(row.warnings);
 if(errors===null||warnings===null||!Number.isSafeInteger(row.statusCode))return unknown('response_diagnostics_invalid');
 if(row.statusCode===200&&errors.length===0)return freeze({...base,status:'SUCCEEDED',httpStatus:http,rowStatus:200,errors,warnings,reconciliationRequired:true});
 if(row.statusCode>=400&&row.statusCode<500&&![408,409,425,429].includes(row.statusCode)&&errors.length>0)
  return freeze({...base,status:'FAILED',httpStatus:http,rowStatus:row.statusCode,errors,warnings,reconciliationRequired:true});
 return unknown('response_outcome_unconfirmed');
}
