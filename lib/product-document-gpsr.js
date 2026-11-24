// V3.5 protected, read-only projection. No file references, URLs, review text,
// tokens, actual IDs or release authority cross this boundary.
import {createHash} from 'node:crypto';
import {PRODUCT_DOCUMENT_KIND,documentCommerceCandidate,productDocumentReview,validateDocumentCatalog} from './product-document-core.js';
import {validationState,revalidateDocumentAssociations} from './product-document-validation.js';
import {mapMediaMetadata} from './product-document-media-contract.js';
export const GPSR_DOCUMENT_SCHEMA='elyon-gpsr-document-review-v3.5';
export const GPSR_OFF=Object.freeze({eligible:false,executionAuthorized:false,operationalEnabled:false,uploadVerified:false,releaseEligible:false,gpsrCompliant:false,evidenceAuthenticated:false});
const arr=x=>Array.isArray(x)?x:[];
const id=x=>typeof x==='string'&&x.length>0&&x.length<=220&&x===x.trim()&&!/[\x00-\x1f\x7f]/.test(x);
const article=x=>typeof x==='string'&&/^ELY-\d{6,}$/.test(x)&&x.length<=80;
const rev=x=>Number.isSafeInteger(x)&&x>=0;
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const error=(code,status=422)=>{throw Object.assign(Error(code),{code,status});};
export const gpsrDigest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const IDENTITY_FIELDS=Object.freeze(['productId','masterId','companyOsProductId','articleNumber','sku','supplierProductId','listingId','offerId']);
const VARIANT_FIELDS=['key','sku','supplierVariantId','listingId','offerId'];
const project=(value,fields)=>Object.fromEntries(fields.map(k=>[k,value[k]??null]));
export const projectGpsrTarget=p=>({...project(p,IDENTITY_FIELDS),variants:arr(p.variants).map(v=>project(v,VARIANT_FIELDS))});
export function validateGpsrDocumentRequest(input){
 if(!exact(input,['productId','articleNumber'])||!id(input.productId)||!article(input.articleNumber))error('invalid_gpsr_document_target');
 return input;
}
export function buildGpsrDocumentReview(state,input,catalog,now=new Date()){
 validateGpsrDocumentRequest(input);validateDocumentCatalog(catalog);
 const matches=catalog.products.filter(p=>p.productId===input.productId||p.articleNumber===input.articleNumber);
 if(matches.length!==1||matches[0].productId!==input.productId||matches[0].articleNumber!==input.articleNumber)error('gpsr_document_target_conflict',409);
 const target=projectGpsrTarget(matches[0]),documents=[];
 if(!rev(state.revision)||arr(state.documents).length>80)error('invalid_document_state',503);
 const docIds=new Set();
 for(const doc of arr(state.documents)){
  if(doc.kind!==PRODUCT_DOCUMENT_KIND)continue;
  const p=doc.productDocument||{},c=documentCommerceCandidate(doc),v=validationState(doc);
  const links=arr(c.associations).filter(a=>a.productId===target.productId||a.articleNumber===target.articleNumber||target.companyOsProductId&&a.companyOsProductId===target.companyOsProductId);
  if(!links.length)continue;
  if(!id(doc.id)||!rev(doc.version)||doc.version===0||docIds.has(doc.id)||!rev(v.evidenceRevision))error('invalid_document_identity',503);
  docIds.add(doc.id);
  const r=productDocumentReview(doc,now),check=revalidateDocumentAssociations(c.associations,catalog,now.toISOString()),metadata=mapMediaMetadata(c.documentType,c.primaryLanguage,c.additionalLanguages,c.otherLanguageText,catalog.reference);
  const matched=links.length===1&&links[0].productId===target.productId&&links[0].articleNumber===target.articleNumber&&check.status==='MATCH';
  const a=links[0],inspection=v.inspection,inspected=Boolean(inspection&&inspection.testOnly!==true&&inspection.technicalStatus==='LIMITED_STRUCTURE_PASSED'&&inspection.signatureChecked===true&&inspection.xrefChecked===true&&inspection.encryptionMarkersChecked===true&&inspection.stored===false&&sha(inspection.sha256)&&rev(inspection.inspectionRevision)&&inspection.inspectionRevision>0&&inspection.inspectionRevision===v.inspectionSequence&&rev(inspection.documentRevision)&&inspection.documentRevision>0&&inspection.documentRevision<=doc.version&&v.evidenceRevision>0);
  const variantKeys=arr(a.variants).map(x=>x.key);
  const blockers=new Set([...r.missing,...metadata.blockers,'PRIVATE_FILE_UNAVAILABLE','DOCUMENT_DELIVERY_UNVERIFIED','AUTHENTICITY_UNVERIFIED','MEDIA_ACCEPTANCE_UNVERIFIED','EBAY_ACCOUNT_UNVERIFIED','ENVIRONMENT_UNVERIFIED','MARKETPLACE_DOCUMENT_POLICY_UNVERIFIED','OPERATIVE_APPROVAL_MISSING']);
  if(!matched)blockers.add('PRODUCT_OR_VARIANT_IDENTITY_CHANGED');
  if(a.scope!=='variants'&&target.variants.length)blockers.add('VARIANT_APPLICABILITY_UNVERIFIED');
  if(!inspected)blockers.add('BYTE_INSPECTION_MISSING');
  if(r.status==='ARCHIVED'||r.status==='REJECTED'||r.status==='OUTDATED'||r.status==='NOT_YET_VALID')blockers.add('DOCUMENT_'+r.status);
  if(v.associationCheck?.status!=='MATCH')blockers.add('ASSOCIATION_EVIDENCE_RECHECK_REQUIRED');
  if(r.validation.applicabilityStatus!=='MANUAL_NOTE_RECORDED')blockers.add('APPLICABILITY_REVIEW_MISSING');
  if(r.validation.provenanceStatus!=='MANUAL_NOTE_RECORDED')blockers.add('PROVENANCE_REVIEW_MISSING');
  if(r.validation.contentStatus!=='MANUAL_NOTE_RECORDED'||!inspected)blockers.add('CONTENT_REVIEW_MISSING');
  if(p.referenceProfile?.sha256!==catalog.reference.sha256||p.referenceProfile?.templateVersion!==catalog.reference.templateVersion||p.referenceProfile?.registryVersion!==catalog.reference.registryVersion)blockers.add('DOCUMENT_TEMPLATE_REFERENCE_CHANGED');
  documents.push({documentId:doc.id,documentRevision:doc.version,evidenceRevision:v.evidenceRevision,fileRevision:null,contentSha256:null,inspectionRevision:inspected?inspection.inspectionRevision:null,inspectedSha256:inspected?inspection.sha256:null,documentType:metadata.documentType,languages:metadata.languages,association:{...project(a,IDENTITY_FIELDS),scope:a.scope,variants:arr(a.variants).map(x=>project(x,VARIANT_FIELDS)),status:matched?'MATCH':'REVIEW_REQUIRED'},variantApplicability:matched&&a.scope==='variants'&&variantKeys.length?'EXPLICIT_VARIANTS_REVIEW_ONLY':target.variants.length?'UNVERIFIED':'PRODUCT_REVIEW_ONLY',validFrom:c.validFrom,validUntil:c.validUntil,validity:r.validation.validity,reviewStatus:r.status,technicalStatus:inspected?'LIMITED_STRUCTURE_PASSED_NOT_STORED':r.validation.fileStatus==='REFERENCE_ONLY'?'REFERENCE_ONLY':'FILE_MISSING',provenanceStatus:r.validation.provenanceStatus,applicabilityStatus:r.validation.applicabilityStatus,contentStatus:r.validation.contentStatus,mediaStatus:'NOT_SUBMITTED',ebayDocumentId:null,ebayAccountId:null,environment:null,blockers:[...blockers],...GPSR_OFF});
 }
 // Identical inspected bytes across records are not proof of applicability.
 for(const d of documents)if(d.inspectedSha256&&documents.some(x=>x!==d&&x.inspectedSha256===d.inspectedSha256))d.blockers.push('DUPLICATE_INSPECTED_CONTENT_REVIEW_REQUIRED');
 const snapshot={schemaVersion:GPSR_DOCUMENT_SCHEMA,source:'seller_tool_document_studio',studioRevision:state.revision,checkedAt:now.toISOString(),marketplace:'EBAY_DE',target,template:{templateId:catalog.reference.templateId,registryVersion:catalog.reference.registryVersion,templateVersion:catalog.reference.templateVersion,sha256:catalog.reference.sha256},documents,regulatoryDocumentIds:[],...GPSR_OFF};
 const result={ok:true,snapshot,snapshotSha256:gpsrDigest(snapshot)};
 if(Buffer.byteLength(JSON.stringify(result),'utf8')>512*1024)error('gpsr_document_review_too_large',503);
 return result;
}
