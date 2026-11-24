// V3.3 read-only review. The browser supplies IDs and expected revisions only.
import {createHash,randomUUID} from 'node:crypto';
import {PRODUCT_DOCUMENT_KIND,PRODUCT_DOCUMENT_SCHEMA,documentCommerceCandidate,productDocumentReview,validateDocumentCatalog} from './product-document-core.js';
import {validationState,validationOverview,activeReviewNotes,evidenceBasis,revalidateDocumentAssociations,currentProductInspection} from './product-document-validation.js';
export const EXPORT_REVIEW_SCHEMA='elyon-document-export-review-v3.3';
const off={executionAuthorized:false,operationalEnabled:false,uploadVerified:false,releaseEligible:false,privateFileAvailable:false,gpsrCompliant:false,ebayDocumentId:null,artifact:null,artifactSha256:null,downloadAvailable:false};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const fail=(message,status=422,code='invalid_export_selection')=>{throw Object.assign(Error(message),{status,code});};
const arr=v=>Array.isArray(v)?v:[];
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function validateExportSelection(input){
 if(!exact(input,['expectedRevision','documents'])||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||!Array.isArray(input.documents)||input.documents.length<1||input.documents.length>80)fail('Bitte 1–80 gespeicherte Produktdokumente mit Revision auswählen.');
 const seen=new Set();
 for(const d of input.documents){
  if(!exact(d,['id','version'])||typeof d.id!=='string'||!/^[-_A-Za-z0-9]{8,100}$/.test(d.id)||!Number.isSafeInteger(d.version)||d.version<1||seen.has(d.id))fail('Dokument-ID oder Revision ungültig oder doppelt.');
  seen.add(d.id);
 }
 return input;
}
export function resolveExportSelection(state,selection){
 if(state.revision!==selection.expectedRevision)fail('Dokumentenbestand geändert. Bitte neu laden.',409,'revision_conflict');
 return selection.documents.map(selected=>{
  const matches=arr(state.documents).filter(d=>d.id===selected.id);
  if(matches.length!==1||matches[0].kind!==PRODUCT_DOCUMENT_KIND)fail('Ausgewähltes Produktdokument fehlt oder ist nicht eindeutig.',409,'document_identity_conflict');
  if(matches[0].version!==selected.version)fail('Dokumentenrevision geändert. Bitte neu laden.',409,'revision_conflict');
  return matches[0];
 });
}
function inspectRecord(doc,catalog,now){
 const c=documentCommerceCandidate(doc),p=doc.productDocument,v=validationState(doc),overview=validationOverview(doc,new Date(now)),review=productDocumentReview(doc,new Date(now));
 const check=revalidateDocumentAssociations(c.associations,catalog,now),notes=activeReviewNotes(doc),blockers=new Set(review.missing);
 if(p.schemaVersion!==PRODUCT_DOCUMENT_SCHEMA)blockers.add('DOCUMENT_SCHEMA_UNSUPPORTED');
 if(doc.archivedAt)blockers.add('DOCUMENT_ARCHIVED');
 if(p.reviewDecision==='rejected')blockers.add('DOCUMENT_REJECTED');
 if(overview.validity==='EXPIRED')blockers.add('DOCUMENT_EXPIRED');
 if(overview.validity==='NOT_YET_VALID')blockers.add('DOCUMENT_NOT_YET_VALID');
 if(check.status!=='MATCH')blockers.add(check.status==='MISSING'?'PRODUCT_ASSOCIATION_MISSING':'PRODUCT_ASSOCIATION_CONFLICT');
 if(!p.referenceProfile||p.referenceProfile.sha256!==catalog.reference.sha256||p.referenceProfile.registryVersion!==catalog.reference.registryVersion||p.referenceProfile.templateVersion!==catalog.reference.templateVersion)blockers.add('DOCUMENT_TEMPLATE_REFERENCE_CHANGED');
 if(v.associationCheck?.status!=='MATCH'||check.status!=='MATCH')blockers.add('ASSOCIATION_EVIDENCE_RECHECK_REQUIRED');
 if(c.sourceUrl)blockers.add('SOURCE_URL_NOT_DELIVERY');
 if(!v.inspection)blockers.add('BYTE_INSPECTION_MISSING');
 // Only server-produced, actual current V3.2 inspection evidence; no source URL
 // or manually claimed checksum can ever be promoted into a deliverable file.
 const i=v.inspection;
 const inspected=Boolean(currentProductInspection(doc));
 if(i&&!inspected)blockers.add('INSPECTION_EVIDENCE_INVALID');
 if(inspected)blockers.add('INSPECTED_BYTES_NOT_STORED');
 if(v.notes.length!==notes.length)blockers.add('HISTORICAL_REVIEW_NOTES_NOT_CURRENT');
 if(!notes.some(n=>n.kind==='provenance'&&n.decision==='reviewed'))blockers.add('PROVENANCE_REVIEW_MISSING');
 if(!notes.some(n=>n.kind==='applicability'&&n.decision==='reviewed')||check.status!=='MATCH')blockers.add('APPLICABILITY_REVIEW_MISSING_OR_STALE');
 if(!notes.some(n=>n.kind==='content'&&n.decision==='reviewed'&&n.inspectionSha256===i?.sha256&&n.inspectionRevision===i?.inspectionRevision&&inspected))blockers.add('CONTENT_REVIEW_MISSING_OR_STALE');
 if(notes.some(n=>n.decision==='concern'))blockers.add('MANUAL_CONCERN_RECORDED');
 // These cannot be satisfied in V3.3, regardless of stored/client claims.
 for(const b of ['PRIVATE_FILE_UNAVAILABLE','DOCUMENT_DELIVERY_UNVERIFIED','PROVENANCE_UNVERIFIED','REGULATORY_SUITABILITY_NOT_VERIFIED'])blockers.add(b);
 return {documentId:doc.id,documentRevision:doc.version,evidenceRevision:v.evidenceRevision,inspectionRevision:inspected?i.inspectionRevision:null,inspectedSha256:inspected?i.sha256:null,evidenceBasisSha256:evidenceBasis(doc),fileRevision:null,documentType:c.documentType,primaryLanguage:c.primaryLanguage,additionalLanguages:c.additionalLanguages,otherLanguageText:c.otherLanguageText,nickname:c.nickname,validFrom:c.validFrom,validUntil:c.validUntil,sourceReferencePresent:Boolean(c.sourceUrl),documentUrl:null,deliveryReference:null,associations:c.associations,associationCheck:check,reviewStatus:review.status,review:{...overview,activeNoteCount:notes.length},missingEvidence:[...blockers],validationStatus:'BLOCKED',futureMediaStatus:'NOT_SUBMITTED',ebayDocumentId:null,executionAuthorized:false};
}
export async function prepareDocumentExportReview(state,input,catalog,bridge,now=new Date().toISOString()){
 const selection=validateExportSelection(input),docs=resolveExportSelection(state,selection);
 validateDocumentCatalog(catalog);
 const records=docs.map(doc=>inspectRecord(doc,catalog,now));
 const request={documents:records.map(r=>({documentId:r.documentId,documentRevision:r.documentRevision,documentType:r.documentType,primaryLanguage:r.primaryLanguage,additionalLanguages:r.additionalLanguages,otherLanguageText:r.otherLanguageText,nickname:r.nickname}))};
 const result=await bridge(request,catalog.reference);
 const rows=records.map((r,i)=>({...r,row:result.rows[i].row,missingEvidence:[...new Set([...r.missingEvidence,...result.rows[i].blockers])]}));
 // Same inspected bytes can indicate duplicate or inconsistent metadata;
 // keep both records visible and require explicit removal/review, never merge.
 for(const row of rows){
  if(!row.inspectedSha256)continue;
  const duplicates=rows.filter(other=>other!==row&&other.inspectedSha256===row.inspectedSha256);
  if(duplicates.length){
   row.missingEvidence.push('DUPLICATE_INSPECTED_CONTENT_REVIEW_REQUIRED');
   if(duplicates.some(other=>other.documentType!==row.documentType))row.missingEvidence.push('CONFLICTING_DOCUMENT_TYPE_FOR_INSPECTED_CONTENT');
  }
 }
 const manifest={schemaVersion:EXPORT_REVIEW_SCHEMA,reviewId:'review:'+randomUUID(),stage:'A_METADATA_PREVIEW',status:'BLOCKED',studioRevision:state.revision,createdAt:now,template:result.profile,bridgeRequestSha256:result.requestSha256,rows,validation:result.validation,...off};
 return {ok:true,schemaVersion:EXPORT_REVIEW_SCHEMA,stage:manifest.stage,status:'BLOCKED',manifest,manifestSha256:hash(manifest),preview:{header:result.profile.header,headerRow:result.profile.headerRow,rows:result.rows.map(r=>({documentId:r.documentId,documentRevision:r.documentRevision,row:r.row,values:r.values,declaredLanguages:r.declaredLanguages}))},...off};
}
