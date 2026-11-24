// Document Media API contract snapshot, distinct from the canonical XLSX enums.
// No HTTP client, OAuth token access or production write functionality.
import {createHash} from 'node:crypto';
import {documentCommerceCandidate} from './product-document-core.js';
import {validationState,evidenceBasis} from './product-document-validation.js';
import {disabledFlags} from './commerce-approval-v2-3.js';
export const MEDIA_SCHEMA='elyon-document-media-v3.4';
export const MEDIA_CONTRACT=Object.freeze({
 version:'v1_beta',createMethod:'POST',createPath:'/commerce/media/v1_beta/document/create_document_from_url',
 statusMethod:'GET',statusPath:'/commerce/media/v1_beta/document/{document_id}',
 origin:'https://api.ebay.com',scope:'https://api.ebay.com/oauth/api_scope/sell.inventory',
 sandboxSupported:false,maxFileBytes:10485760,formats:Object.freeze(['pdf','png','jpg','jpeg']),
 snapshotDate:'2026-11-24',liveVerified:false
});
export const MEDIA_TYPES=Object.freeze(['CERTIFICATE_OF_ANALYSIS','CERTIFICATE_OF_CONFORMITY','DECLARATION_OF_CONFORMITY','INSTRUCTIONS_FOR_USE','OTHER_SAFETY_DOCUMENTS','SAFETY_DATA_SHEET','TROUBLE_SHOOTING_GUIDE','USER_GUIDE_OR_MANUAL','INSTALLATION_INSTRUCTIONS','ACCESSIBILITY_INFORMATION','SAFETY_TEST_LAB_REPORTS','EEK_ENERGY_LABEL','EEK_PRODUCT_INFORMATION_SHEET','GENERAL_CERTIFICATE_OF_CONFORMITY','CHILDRENS_PRODUCT_CERTIFICATE']);
export const MEDIA_LANGUAGES=Object.freeze(['ENGLISH','SPANISH','ITALIAN','GERMAN','POLISH','DUTCH','PORTUGUESE','FRENCH','OTHER']);
export const MEDIA_STATUSES=Object.freeze(['SUBMITTED','ACCEPTED','REJECTED','PENDING_UPLOAD','EXPIRED']);
export const MEDIA_OFF=Object.freeze({...disabledFlags,privateFileAvailable:false,gpsrCompliant:false,ebayDocumentId:null,externalReference:null,liveVerified:false,retryAllowed:false,confirmationAllowed:false});
export const mediaHash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const arr=v=>Array.isArray(v)?v:[];
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const revision=v=>Number.isSafeInteger(v)&&v>0;
const fail=(code,status=422)=>{throw Object.assign(Error(code),{code,status});};
const same=(a,b)=>mediaHash(a)===mediaHash(b);
export function mapMediaMetadata(type,primary,additional,otherText,reference){
 const blockers=[];
 if(!type||!MEDIA_TYPES.includes(type)||!reference?.documentTypes?.includes(type))blockers.push('MEDIA_DOCUMENT_TYPE_UNSUPPORTED');
 const declared=[...(primary?[primary]:[]),...arr(additional)];
 // The API explicitly deprecates PORTUGESE; canonical XLSX may still use it.
 // Preserve original declared value separately; normalize this one documented alias.
 const languages=declared.map(l=>l==='PORTUGESE'?'PORTUGUESE':l);
 if(!primary||declared.some(l=>!reference?.languages?.includes(l))||languages.some(l=>!MEDIA_LANGUAGES.includes(l)))blockers.push('MEDIA_LANGUAGE_UNSUPPORTED');
 if(new Set(languages).size!==languages.length)blockers.push('MEDIA_LANGUAGE_DUPLICATE');
 if(languages.length>9)blockers.push('MEDIA_LANGUAGE_LIMIT');
 // API has no free-text other-language field. Do not silently lose detail.
 if(languages.includes('OTHER')||otherText)blockers.push('MEDIA_OTHER_LANGUAGE_REVIEW_REQUIRED');
 return {documentType:type??null,declaredLanguages:declared,languages,blockers};
}
export function describeMediaReadiness(){
 return {privateStorage:'TEST_ADAPTER',byteInspection:'LIMITED_TECHNICAL_CHECK',authenticity:'OPEN',applicability:'MANUAL_REVIEW_ONLY',delivery:'BLOCKED',operator:'OPEN',workspace:'OPEN',account:'OPEN',scope:'OPEN',sandbox:'DOCUMENTED_UNSUPPORTED',ledger:'FIXTURE_ONLY',idempotency:'FIXTURE_ONLY',upload:'BLOCKED',statusReadback:'FIXTURE_ONLY',reconciliation:'FIXTURE_ONLY',approval:'BLOCKED'};
}
// Only server-generated V3.3 review passed by existing authenticated handler.
// This function produces a blocked description, never a transferable authority.
export function prepareBlockedDocumentMediaReview(doc,exportReview,catalog,scope,now=new Date().toISOString()){
 const c=documentCommerceCandidate(doc),v=validationState(doc),m=exportReview?.manifest;
 if(scope?.sellerAccess!==true||scope.authenticated!==false)fail('seller_access_required',403);
 if(!m||m.schemaVersion!=='elyon-document-export-review-v3.3'||m.stage!=='A_METADATA_PREVIEW'||m.status!=='BLOCKED'||exportReview.manifestSha256!==mediaHash(m)||m.rows?.length!==1||m.executionAuthorized!==false||m.uploadVerified!==false||m.artifact!==null)fail('invalid_export_review');
 const r=m.rows[0];
 if(r.documentId!==doc.id||r.documentRevision!==doc.version||r.evidenceRevision!==v.evidenceRevision||r.evidenceBasisSha256!==evidenceBasis(doc)||!same(r.associations,c.associations)||r.documentType!==c.documentType||r.primaryLanguage!==c.primaryLanguage||!same(r.additionalLanguages,c.additionalLanguages)||r.otherLanguageText!==c.otherLanguageText||r.nickname!==c.nickname||r.documentUrl!==null||r.deliveryReference!==null||r.fileRevision!==null||r.ebayDocumentId!==null||r.executionAuthorized!==false||m.template.originalSha256!==catalog.reference.sha256||m.template.registryVersion!==catalog.reference.registryVersion||m.template.templateVersion!==catalog.reference.templateVersion)fail('export_review_binding_mismatch',409);
 const age=Date.parse(now)-Date.parse(m.createdAt);
 if(!Number.isFinite(age)||age<0||age>15*60000)fail('export_review_stale',409);
 if(r.inspectedSha256!==null&&(!digest(r.inspectedSha256)||r.inspectedSha256!==v.inspection?.sha256||r.inspectionRevision!==v.inspection?.inspectionRevision))fail('inspection_binding_mismatch',409);
 const metadata=mapMediaMetadata(c.documentType,c.primaryLanguage,c.additionalLanguages,c.otherLanguageText,catalog.reference);
 const blockers=[...new Set([...r.missingEvidence,...metadata.blockers,...scope.blockers,'MEDIA_SCOPE_UNVERIFIED','MEDIA_LIVE_TRANSPORT_UNVERIFIED','DOCUMENT_DELIVERY_UNVERIFIED','PRIVATE_FILE_UNAVAILABLE','PRODUCTION_LEDGER_UNVERIFIED','EXPLICIT_APPROVAL_MISSING'])];
 const candidate={schemaVersion:MEDIA_SCHEMA,documentId:doc.id,documentRevision:doc.version,evidenceRevision:v.evidenceRevision,inspectionRevision:r.inspectionRevision,inspectedSha256:r.inspectedSha256,fileId:null,fileRevision:null,contentSha256:null,documentType:metadata.documentType,languages:metadata.languages,declaredLanguages:metadata.declaredLanguages,nickname:c.nickname,origin:doc.productDocument.origin,sourceReferencePresent:Boolean(c.sourceUrl),documentUrl:null,deliveryReference:null,associations:c.associations,associationCheck:r.associationCheck,validity:r.review.validity,validFrom:c.validFrom,validUntil:c.validUntil,scope:{userId:null,workspaceId:null,ebayAccountId:null,environment:null,marketplace:'EBAY_DE',authenticated:false},template:m.template,manifestReviewId:m.reviewId,manifestSha256:exportReview.manifestSha256};
 return {ok:true,schemaVersion:MEDIA_SCHEMA,stage:'BLOCKED_READINESS',status:'UPLOAD_BLOCKED',externalStatus:'NOT_SUBMITTED',documentRevision:doc.version,studioRevision:m.studioRevision,checkedAt:now,candidate,candidateSha256:mediaHash(candidate),technicalFileStatus:r.review.fileStatus,deliveryStatus:'BLOCKED_NO_VERIFIED_STORAGE',blockers,transport:{...MEDIA_CONTRACT,request:null,statusRequest:null},readiness:describeMediaReadiness(),gpsrCandidate:{documentId:doc.id,documentRevision:doc.version,fileRevision:null,contentSha256:null,ebayDocumentId:null,accepted:false,accountId:null,environment:null,associations:c.associations,applicabilityVerified:false,validity:r.review.validity,eligible:false,regulatoryDocumentIds:[],executionAuthorized:false},...MEDIA_OFF};
}
