import { requireSellerAccess } from '../lib/seller-access.js';
import { resolveAuthenticatedCommerceScope, describeBlockedCommerceReview } from '../lib/commerce-approval-v2-3.js';

import {describeOperationalReadiness,verifyOperationalReadback} from '../lib/commerce-controlled-verification.js';

const SCHEMA='elyon-price-stock-proposal-v2.2';
const KEYS=new Set(['articleNumber','sku','listingId','offerId','price','quantity','environment','marketplace','currency','origin','currentPrice','currentQuantity']);
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
  const approvalReview=describeBlockedCommerceReview(data,resolveAuthenticatedCommerceScope(req));
  const operationalReadiness=verifyReadback?await verifyOperationalReadback(data):describeOperationalReadiness(data);
  return res.status(200).json({...data,approvalReview,operationalReadiness});
 }catch{return res.status(503).json({ok:false,error:'canonical_preview_unavailable',executionAuthorized:false});}
}
