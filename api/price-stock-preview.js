import {createHash} from 'node:crypto';
import { requireSellerAccess } from '../lib/seller-access.js';
import { resolveAuthenticatedCommerceScope, describeBlockedCommerceReview } from '../lib/commerce-approval-v2-3.js';

import {describeOperationalReadiness,verifyOperationalReadback} from '../lib/commerce-controlled-verification.js';

const SCHEMA='elyon-price-stock-proposal-v2.2';
const KEYS=new Set(['articleNumber','sku','listingId','offerId','price','quantity','environment','marketplace','currency','origin','currentPrice','currentQuantity']);

// Bind the canonical response to this exact request before exposing an
// offline artifact or initiating an optional readback. Never trust nested
// execution flags merely because the top-level envelope is disabled.
export function assertCanonicalPreviewResponse(data,input){
 const fail=()=>{throw Error('canonical_preview_contract_mismatch');};
 const offKeys=['executionAuthorized','operationalEnabled','evidenceAuthenticated','uploadVerified','releaseEligible'];
 const disabled=o=>o&&offKeys.every(k=>o[k]===false);
 const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 if(!disabled(data)||data.scopeAuthenticated!==false||data.ok!==true||data.schemaVersion!==SCHEMA||
    !Array.isArray(data.proposals)||data.proposals.length!==input.changes.length||
    !Number.isSafeInteger(data.ruleRevision)||!digest(data.economicsRulesSha256)||
    typeof data.validationRuleVersion!=='string'||!data.validationRuleVersion||
    !Number.isFinite(Date.parse(data.checkedAt)))fail();
 const targets=new Set();
 for(let i=0;i<input.changes.length;i++){
  const c=input.changes[i],p=data.proposals[i],t=p?.target;
  if(!disabled(p)||p.schemaVersion!==SCHEMA||!t||!p.current||!p.proposed||
     !digest(p.targetSha256)||!digest(p.contentSha256)||targets.has(p.targetSha256)||
     p.ruleRevision!==data.ruleRevision||p.checkedAt!==data.checkedAt||
     p.origin!==(c.origin??'unknown'))fail();
  for(const k of ['articleNumber','sku','listingId','offerId','environment','marketplace','currency'])
   if(t[k] !== (c[k]??null))fail();
  if(p.current.price!==(c.currentPrice??null)||p.current.quantity!==(c.currentQuantity??null)||
     p.current.source!=='browser_observation_unverified')fail();
  const price=c.price!=null&&Number(c.price)!==Number(c.currentPrice)?c.price:null;
  const quantity=c.quantity!=null&&(c.currentQuantity==null||Number(c.quantity)!==Number(c.currentQuantity))?String(Number(c.quantity)):null;
  if(p.proposed.price!==price||p.proposed.quantity!==quantity)fail();
  targets.add(p.targetSha256);
 }
 if(data.plan!=null&&!disabled(data.plan))fail();
 const a=data.artifact;
 if(a!=null){
  if(!disabled(a)||!data.plan||a.status!=='EXPORT_READY_OFFLINE'||data.status!=='EXPORT_READY_OFFLINE'||
     a.filename!=='elyon-price-quantity-OFFLINE-NOT-FOR-UPLOAD.csv'||
     a.rowCount!==input.changes.length||!Array.isArray(a.rowTargets)||a.rowTargets.length!==a.rowCount||
     a.rowTargets.some((x,i)=>x!==data.proposals[i].targetSha256)||
     !digest(a.sha256)||a.sha256!==data.plan.contentSha256||
     typeof a.base64!=='string'||!a.base64.length||a.base64.length>=500000)fail();
  const bytes=Buffer.from(a.base64,'base64');
  if(bytes.toString('base64')!==a.base64||createHash('sha256').update(bytes).digest('hex')!==a.sha256)fail();
 }else if(data.status!=='REVIEW_REQUIRED')fail();
}

export default async function handler(req,res){
 if(!requireSellerAccess(req,res,{maxBodyBytes:64*1024}))return;
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
 res.setHeader('Cache-Control','no-store');
 let input,verifyReadback=false;
 try{input=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(input?.schemaVersion!==SCHEMA||Object.keys(input).some(k=>!['schemaVersion','changes','verifyReadback'].includes(k))||
    !Array.isArray(input.changes)||!input.changes.length||input.changes.length>50||
    input.changes.some(c=>!c||Object.keys(c).some(k=>!KEYS.has(k))))throw Error();
  if(input.verifyReadback!==undefined&&typeof input.verifyReadback!=='boolean')throw Error();
  verifyReadback=input.verifyReadback===true;
  if(verifyReadback&&input.changes.length!==1)throw Error();
  const targets=new Set(),offers=new Set();
  for(const c of input.changes){
   if(Array.isArray(c)||typeof c!=='object'||typeof c.articleNumber!=='string'||typeof c.sku!=='string')throw Error();
   const key=JSON.stringify([c.articleNumber,c.sku]);
   if(targets.has(key)||(c.offerId!=null&&offers.has(c.offerId)))throw Error();
   targets.add(key);if(c.offerId!=null)offers.add(c.offerId);
  }
  input={schemaVersion:input.schemaVersion,changes:input.changes};
 }catch{return res.status(400).json({ok:false,error:'invalid_preview_request'});}
 const syncCode=String(process.env.ELYON_COMPANY_OS_SYNC_CODE||process.env.COMPANY_OS_SYNC_CODE||'').trim();
 if(!syncCode)return res.status(503).json({ok:false,error:'company_os_connection_unavailable'});
 try{
  const url=new URL('/api/price-stock-preview',process.env.ELYON_COMPANY_OS_URL||process.env.COMPANY_OS_URL||'https://elyon-company-os.vercel.app');
  if(url.protocol!=='https:'||url.username||url.password)throw Error();
  const response=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-Elyon-Sync-Code':syncCode},body:JSON.stringify(input),signal:AbortSignal.timeout(20000)});
  if(!response.ok)return res.status(response.status===404?503:response.status).json({ok:false,error:'canonical_preview_unavailable'});
  const data=await response.json();
  if(data.ok!==true||data.schemaVersion!==SCHEMA||data.executionAuthorized!==false||data.operationalEnabled!==false||
    data.evidenceAuthenticated!==false||data.uploadVerified!==false||data.releaseEligible!==false||data.scopeAuthenticated!==false)throw Error();
  assertCanonicalPreviewResponse(data,input);
  const approvalReview=describeBlockedCommerceReview(data,resolveAuthenticatedCommerceScope(req));
  const operationalReadiness=verifyReadback?await verifyOperationalReadback(data):describeOperationalReadiness(data);
  return res.status(200).json({...data,approvalReview,operationalReadiness});
 }catch{return res.status(503).json({ok:false,error:'canonical_preview_unavailable',executionAuthorized:false});}
}
