// TEST ONLY. No production route imports this module. No network, credentials,
// provider callbacks, Redis, or production IDs. Session reservation is local
// and deliberately not evidence of distributed durability.
import {randomUUID} from 'node:crypto';
import {MEDIA_SCHEMA,MEDIA_CONTRACT,MEDIA_OFF,MEDIA_TYPES,MEDIA_LANGUAGES,MEDIA_STATUSES,mediaHash} from './product-document-media-contract.js';
const plans=new WeakMap(),sessions=new WeakMap();
const off={...MEDIA_OFF,simulation:true,persistent:false,externalStatusVerified:false};
const fail=code=>{throw Object.assign(Error(code),{code});};
const check=(ok,code)=>{if(!ok)fail(code);};
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>obj(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const id=v=>typeof v==='string'&&/^fixture:[A-Za-z0-9_-]{1,100}$/.test(v);
const rev=v=>Number.isSafeInteger(v)&&v>0;
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const clone=v=>JSON.parse(JSON.stringify(v));
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const same=(a,b)=>mediaHash(a)===mediaHash(b);
const sorted=v=>[...v].sort();
const scopeValid=s=>exact(s,['userId','workspaceId','ebayAccountId','environment','marketplace'])&&[s.userId,s.workspaceId,s.ebayAccountId].every(id)&&s.environment==='production'&&s.marketplace==='EBAY_DE';
const fields=['simulation','documentId','documentRevision','evidenceRevision','fileId','fileRevision','contentSha256','documentType','languages','nickname','associations','validUntil','scope','delivery','manifest','file'];
const deliveryFields=['fileId','fileRevision','contentSha256','url','purpose','operationBinding','issuedAt','expiresAt','revocable','accessControlled','testOnly'];
const bindingData=c=>({documentId:c.documentId,documentRevision:c.documentRevision,evidenceRevision:c.evidenceRevision,fileId:c.fileId,fileRevision:c.fileRevision,contentSha256:c.contentSha256,documentType:c.documentType,languages:c.languages,nickname:c.nickname,associations:c.associations,validUntil:c.validUntil,scope:c.scope,manifestSha256:c.manifest.sha256});
export function fixtureDeliveryBinding(c){return mediaHash(bindingData(c));}
export function validateDocumentMediaCandidate(c,now=Date.now()){
 check(exact(c,fields)&&c.simulation===true&&id(c.documentId)&&rev(c.documentRevision)&&rev(c.evidenceRevision)&&id(c.fileId)&&rev(c.fileRevision)&&sha(c.contentSha256),'fixture_candidate_invalid');
 check(scopeValid(c.scope),'fixture_scope_invalid');
 check(MEDIA_TYPES.includes(c.documentType)&&Array.isArray(c.languages)&&c.languages.length>0&&c.languages.length<=9&&new Set(c.languages).size===c.languages.length&&c.languages.every(l=>MEDIA_LANGUAGES.includes(l)&&l!=='OTHER'),'fixture_metadata_invalid');
 check(typeof c.nickname==='string'&&c.nickname.length<=120&&Array.isArray(c.associations)&&c.associations.length>0&&c.associations.length<=12&&c.associations.every(a=>exact(a,['productId','variantKeys'])&&id(a.productId)&&Array.isArray(a.variantKeys)&&a.variantKeys.length<=30&&a.variantKeys.every(id)&&new Set(a.variantKeys).size===a.variantKeys.length)&&new Set(c.associations.map(a=>a.productId)).size===c.associations.length,'fixture_association_invalid');
 check(c.validUntil===null||iso(c.validUntil)&&Date.parse(c.validUntil)>now,'fixture_document_expired');
 const file=c.file;
 check(exact(file,['stored','testOnly','mimeType','sizeBytes','sha256'])&&file.stored===true&&file.testOnly===true&&file.mimeType==='application/pdf'&&rev(file.sizeBytes)&&file.sizeBytes<=Math.min(MEDIA_CONTRACT.maxFileBytes,2*1024*1024)&&file.sha256===c.contentSha256,'fixture_file_invalid');
 const m=c.manifest;
 check(exact(m,['data','sha256'])&&sha(m.sha256)&&m.sha256===mediaHash(m.data)&&exact(m.data,['simulation','documentId','documentRevision','evidenceRevision','fileRevision','contentSha256','documentType','languages','associations','checkedAt'])&&m.data.simulation===true&&['documentId','documentRevision','evidenceRevision','fileRevision','contentSha256','documentType'].every(k=>m.data[k]===c[k])&&same(m.data.languages,c.languages)&&same(m.data.associations,c.associations)&&iso(m.data.checkedAt)&&now>=Date.parse(m.data.checkedAt)&&now-Date.parse(m.data.checkedAt)<=900000,'fixture_manifest_invalid');
 const d=c.delivery;
 check(exact(d,deliveryFields)&&d.testOnly===true&&d.fileId===c.fileId&&d.fileRevision===c.fileRevision&&d.contentSha256===c.contentSha256&&d.purpose==='ebay_document_create'&&d.operationBinding===fixtureDeliveryBinding(c)&&d.revocable===true&&d.accessControlled===true&&iso(d.issuedAt)&&iso(d.expiresAt)&&Date.parse(d.issuedAt)<=now&&Date.parse(d.expiresAt)>now&&Date.parse(d.expiresAt)-Date.parse(d.issuedAt)<=3600000,'fixture_delivery_invalid');
 // Reserved non-resolving hostname only. No actual signing or retrieval.
 check(typeof d.url==='string'&&/^https:\/\/fixture\.invalid\/[A-Za-z0-9_-]+\.pdf$/.test(d.url),'fixture_url_invalid');
 return true;
}
export function prepareDocumentMediaOperation(candidate,now=Date.now()){
 validateDocumentMediaCandidate(candidate,now);
 const c=freeze(clone(candidate));
 const request=freeze({method:MEDIA_CONTRACT.createMethod,path:MEDIA_CONTRACT.createPath,body:{documentUrl:c.delivery.url,documentType:c.documentType,languages:c.languages}});
 // Same purpose/content/type/languages/account is reserved even if metadata,
 // file ID or document ID changes. A new file hash/type/language is a new key,
 // but an unresolved previous operation for the document still blocks it.
 const operationKey=mediaHash({account:c.scope.ebayAccountId,environment:c.scope.environment,purpose:c.delivery.purpose,contentSha256:c.contentSha256,documentType:c.documentType,languages:sorted(c.languages)});
 const bindingSha256=fixtureDeliveryBinding(c);
 const plan=freeze({schemaVersion:MEDIA_SCHEMA,operationId:'sim:'+randomUUID(),operationKey,bindingSha256,requestSha256:mediaHash(request),request,status:'PREPARED',...off});
 plans.set(plan,c);return plan;
}
export function buildDocumentMediaRequest(plan){check(plans.has(plan),'unrecognized_fixture_plan');return clone(plan.request);}
export function buildDocumentStatusRequest(session,plan){const s=sessionFor(session),o=s.byId.get(plan.operationId);check(plans.has(plan)&&o&&o.fixtureReference&&o.bindingSha256===plan.bindingSha256,'known_fixture_reference_required');return {method:MEDIA_CONTRACT.statusMethod,path:MEDIA_CONTRACT.statusPath.replace('{document_id}',encodeURIComponent(o.fixtureReference)),body:null,...off};}
export function createDocumentMediaSimulationSession(){
 const session=Object.freeze({simulation:true,persistent:false});
 sessions.set(session,{byKey:new Map(),byId:new Map()});return session;
}
const observedFields=['operationId','bindingSha256','scope','observedAt','httpStatus','body','location'];
const codes=v=>Array.isArray(v)&&v.length<=20&&v.every(e=>obj(e)&&Number.isSafeInteger(e.errorId)&&e.errorId>0&&typeof e.domain==='string'&&e.domain.length<=80);
const results=(status,reason,extra={})=>freeze({status,reason,fixtureReference:null,documentStatus:null,httpStatus:null,errors:[],warnings:[],...extra,...off});
function normalize(plan,observation,prior,now,create){
 const c=plans.get(plan);
 if(!c||!exact(observation,observedFields)||observation.operationId!==plan.operationId||observation.bindingSha256!==plan.bindingSha256||!same(observation.scope,c.scope)||!iso(observation.observedAt)||Date.parse(observation.observedAt)>now||now-Date.parse(observation.observedAt)>900000||prior&&Date.parse(observation.observedAt)<=Date.parse(prior.observedAt))return results('UNKNOWN_OUTCOME','OBSERVATION_BINDING_OR_TIME_INVALID');
 const {body,httpStatus,location}=observation;
 const errorCodes=body?.errors??[],warnings=body?.warnings??[];
 if(!Number.isSafeInteger(httpStatus)||!obj(body)||!codes(errorCodes)||!codes(warnings))return results('UNKNOWN_OUTCOME','INVALID_RESPONSE_SCHEMA');
 const base={httpStatus,errors:errorCodes.map(e=>e.errorId),warnings:warnings.map(e=>e.errorId),observedAt:observation.observedAt};
 if(httpStatus!==(create?201:200)){
  // Even 400/404 is not proof of non-submission for a possibly sent request.
  return results(create?'UNKNOWN_OUTCOME':'RECONCILIATION_REQUIRED',!create&&httpStatus===404?'DOCUMENT_NOT_FOUND':'HTTP_RESPONSE_NOT_SUCCESS',base);
 }
 const allowed=['documentId','documentStatus','documentType','languages','documentMetadata','errors','warnings'];
 if(Object.keys(body).some(k=>!allowed.includes(k))||errorCodes.length||!id(body.documentId)||!MEDIA_STATUSES.includes(body.documentStatus)||body.documentType!==c.documentType||!Array.isArray(body.languages)||!same(sorted(body.languages),sorted(c.languages))||new Set(body.languages).size!==body.languages.length)return results('UNKNOWN_OUTCOME','CONTRADICTORY_RESPONSE',base);
 const expectedLocation=MEDIA_CONTRACT.origin+MEDIA_CONTRACT.statusPath.replace('{document_id}',encodeURIComponent(body.documentId));
 if(create&&location!==expectedLocation||!create&&location!==null&&location!==expectedLocation||!create&&body.documentId!==prior?.fixtureReference)return results('UNKNOWN_OUTCOME','REFERENCE_MISMATCH',base);
 if(body.documentMetadata!==undefined){
  const m=body.documentMetadata;
  if(!obj(m)||Object.keys(m).some(k=>!['fileName','fileSize','fileType'].includes(k))||m.fileType!=='pdf'||m.fileSize!==String(c.file.sizeBytes)||typeof m.fileName!=='string'||!m.fileName.endsWith('.pdf'))return results('UNKNOWN_OUTCOME','FILE_METADATA_MISMATCH',base);
 }
 const s=body.documentStatus;
 // A create-from-URL response is documented as initially SUBMITTED. Only
 // a later independently bound getDocument observation can be accepted.
 if(create&&s!=='SUBMITTED')return results('UNKNOWN_OUTCOME','UNEXPECTED_INITIAL_STATUS',base);
 const state=s==='SUBMITTED'?'PROCESSING':s==='ACCEPTED'?'SIMULATED_ACCEPTED':s==='REJECTED'?'SIMULATED_REJECTED':'RECONCILIATION_REQUIRED';
 return results(state,'FIXTURE_OBSERVATION',{...base,fixtureReference:body.documentId,documentStatus:s});
}
export function normalizeDocumentMediaResponse(plan,observation,now=Date.now()){return normalize(plan,observation,null,now,true);}
export function normalizeDocumentStatusResponse(plan,observation,prior,now=Date.now()){return normalize(plan,observation,prior,now,false);}
function sessionFor(session){const s=sessions.get(session);check(s,'invalid_simulation_session');return s;}
function recordView(o){return freeze(clone(o));}
export function simulateDocumentMediaSubmission(session,plan,observation,now=Date.now()){
 const s=sessionFor(session),c=plans.get(plan);check(c,'unrecognized_fixture_plan');
 const existing=s.byKey.get(plan.operationKey);
 if(existing)return results('DUPLICATE_OPERATION','RESERVATION_EXISTS',{operation:recordView(existing)});
 const unresolved=[...s.byId.values()].find(o=>o.documentId===c.documentId&&o.accountId===c.scope.ebayAccountId&&o.environment===c.scope.environment&&!['SIMULATED_ACCEPTED','SIMULATED_REJECTED','SUPERSEDED','NOT_SUBMITTED'].includes(o.status));
 if(unresolved)return results('UPLOAD_BLOCKED','UNRESOLVED_PREVIOUS_OPERATION',{operation:recordView(unresolved)});
 check(s.byId.size<100,'simulation_capacity');
 validateDocumentMediaCandidate(c,now);
 const o={operationId:plan.operationId,operationKey:plan.operationKey,bindingSha256:plan.bindingSha256,requestSha256:plan.requestSha256,documentId:c.documentId,documentRevision:c.documentRevision,evidenceRevision:c.evidenceRevision,fileId:c.fileId,fileRevision:c.fileRevision,contentSha256:c.contentSha256,documentType:c.documentType,languages:c.languages,accountId:c.scope.ebayAccountId,workspaceId:c.scope.workspaceId,environment:c.scope.environment,marketplace:c.scope.marketplace,associations:c.associations,status:'MAYBE_SUBMITTED',fixtureReference:null,observedAt:new Date(now).toISOString(),history:['PREPARED','SIMULATED_SUBMISSION','MAYBE_SUBMITTED'],...off};
 s.byKey.set(plan.operationKey,o);s.byId.set(plan.operationId,o);
 // Reserve/checkpoint synchronously before consuming response data.
 let normalized=observation===null?results('UNKNOWN_OUTCOME','RESPONSE_LOST'):normalizeDocumentMediaResponse(plan,observation,now);
 if(normalized.observedAt&&Date.parse(normalized.observedAt)<now)normalized=results('UNKNOWN_OUTCOME','OBSERVATION_BEFORE_SEND');
 if(normalized.fixtureReference&&[...s.byId.values()].some(x=>x!==o&&x.accountId===o.accountId&&x.environment===o.environment&&x.fixtureReference===normalized.fixtureReference))normalized=results('UNKNOWN_OUTCOME','DUPLICATE_EXTERNAL_REFERENCE');
 Object.assign(o,{status:normalized.status,reason:normalized.reason,fixtureReference:normalized.fixtureReference,documentStatus:normalized.documentStatus,observedAt:normalized.observedAt??o.observedAt,httpStatus:normalized.httpStatus,errors:normalized.errors,warnings:normalized.warnings});o.history.push(o.status);
 return recordView(o);
}
export function reconcileDocumentMediaOperation(session,plan,observation,now=Date.now()){
 const s=sessionFor(session),o=s.byId.get(plan.operationId);check(plans.has(plan)&&o&&o.bindingSha256===plan.bindingSha256,'operation_binding_mismatch');
 if(!o.fixtureReference)return results('RECONCILIATION_REQUIRED','NO_KNOWN_DOCUMENT_ID_NO_SEARCH',{operation:recordView(o)});
 if(o.status==='SUPERSEDED')return results('SUPERSEDED','HISTORICAL_REFERENCE',{operation:recordView(o)});
 const n=normalizeDocumentStatusResponse(plan,observation,o,now);
 // Preserve accepted/rejected observation as history on contradictory readback;
 // never expose it as current accepted or replace a known ID.
 if(o.terminalStatus&&n.status!==o.terminalStatus){o.status='RECONCILIATION_REQUIRED';o.reason='TERMINAL_STATUS_CONFLICT';}
 else {o.status=n.status;o.reason=n.reason;if(n.documentStatus)o.documentStatus=n.documentStatus;if(['SIMULATED_ACCEPTED','SIMULATED_REJECTED'].includes(n.status)){o.terminalStatus=n.status;if(o.bindingSuperseded)o.status='SUPERSEDED';}}
 if(n.observedAt&&Date.parse(n.observedAt)>Date.parse(o.observedAt))o.observedAt=n.observedAt;
 o.httpStatus=n.httpStatus;o.errors=n.errors;o.warnings=n.warnings;o.history.push(o.status);if(o.history.length>30)o.history=o.history.slice(-30);
 return recordView(o);
}
export function compareMediaRevision(session,plan,current,now=Date.now()){
 const s=sessionFor(session),o=s.byId.get(plan.operationId),c=plans.get(plan);check(o&&c,'operation_binding_mismatch');
 const exactScope=same(current.scope,c.scope),sameFile=['fileId','fileRevision','contentSha256','documentType'].every(k=>current[k]===c[k])&&same(sorted(current.languages||[]),sorted(c.languages));
 const sameBinding=exactScope&&sameFile&&current.documentId===c.documentId&&current.documentRevision===c.documentRevision&&current.evidenceRevision===c.evidenceRevision&&same(current.associations,c.associations)&&current.nickname===c.nickname;
 const expired=current.archivedAt||current.validUntil&&(!Number.isFinite(Date.parse(current.validUntil))||Date.parse(current.validUntil)<=now);
 const changedValidity=current.validUntil!==c.validUntil;
 const unknown=!['SIMULATED_ACCEPTED','SIMULATED_REJECTED','SUPERSEDED'].includes(o.status);
 if(!sameBinding||expired||changedValidity){
  // Uncertain sends stay reserved forever; superseding must not unblock them.
  o.bindingSuperseded=true;
  if(!unknown)o.status='SUPERSEDED';
  o.history.push(unknown?'REVISION_CHANGED_UNRESOLVED':'SUPERSEDED');
  return results(unknown?'RECONCILIATION_REQUIRED':'SUPERSEDED',!exactScope?'SCOPE_CHANGED':!sameFile?'NEW_MEDIA_REVIEW_REQUIRED':expired?'DOCUMENT_ARCHIVED_OR_EXPIRED':'REASSOCIATION_REVIEW_REQUIRED',{operation:recordView(o)});
 }
 return results(o.status,'BINDING_UNCHANGED',{operation:recordView(o)});
}
