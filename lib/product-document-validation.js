// Server-owned V3.2 metadata; review notes are seller assertions, not verification.
import {createHash} from 'node:crypto';
import {inspectPdfInput,MAX_PRODUCT_PDF_BYTES} from './product-document-file-validation.js';
export const V32_SCHEMA='elyon-product-document-validation-v3.2';
export const PRODUCT_VALIDATION_ACTIONS=Object.freeze(['validate-product-file','revalidate-product','add-product-review']);
const arr=x=>Array.isArray(x)?x:[];
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
const fail=(message,status=422)=>{throw Object.assign(Error(message),{status});};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const identityFields=['productId','masterId','companyOsProductId','articleNumber','sku','supplierProductId'];
const channelFields=['listingId','offerId'];
const variantFields=['key','sku','supplierVariantId'];
const equal=(a,b,fields)=>fields.every(k=>(a?.[k]??null)===(b?.[k]??null));
const clean=(x,max)=>typeof x==='string'&&x.trim()&&x.length<=max&&!/[\x00-\x1f\x7f]/.test(x)?x.trim():null;
const selection=a=>({productId:a.productId,articleNumber:a.articleNumber,variantKeys:arr(a.variants).map(v=>v.key)});
export function sameSelection(a,s){return a.productId===s.productId&&a.articleNumber===s.articleNumber&&Array.isArray(s.variantKeys)&&s.variantKeys.length===arr(a.variants).length&&new Set(s.variantKeys).size===s.variantKeys.length&&arr(a.variants).every(v=>s.variantKeys.includes(v.key));}

export function revalidateDocumentAssociations(associations,catalog,now=new Date().toISOString()){
 const products=arr(catalog?.products), rows=arr(associations), seen=new Set(), results=[];
 for(const a of rows){
  const matches=products.filter(p=>p?.productId===a.productId), articles=products.filter(p=>p?.articleNumber===a.articleNumber);
  const company=a.companyOsProductId?products.filter(p=>p?.companyOsProductId===a.companyOsProductId):[];
  let status='MATCH',variantResults=[];
  if(seen.has(a.productId)||matches.length>1||articles.length>1||company.length>1)status='AMBIGUOUS_PRODUCT';
  else if(matches.length!==1||articles.length!==1||matches[0]!==articles[0])status=matches.length||articles.length?'PRODUCT_IDENTITY_CHANGED':'PRODUCT_MISSING_OR_EXCLUDED';
  else{
   const current=matches[0];
   if(!equal(a,current,identityFields))status='PRODUCT_IDENTITY_CHANGED';
   else if(!equal(a,current,channelFields))status='CHANNEL_CHANGED';
   const keys=new Set();
   for(const old of arr(a.variants)){
    const found=arr(current.variants).filter(v=>v.key===old.key);
    let vStatus='MATCH';
    if(keys.has(old.key)||found.length>1)vStatus='AMBIGUOUS_VARIANT';
    else if(!found.length)vStatus='VARIANT_MISSING_OR_EXCLUDED';
    else if(!equal(old,found[0],variantFields))vStatus='VARIANT_IDENTITY_CHANGED';
    else if(!equal(old,found[0],channelFields))vStatus='CHANNEL_CHANGED';
    keys.add(old.key);variantResults.push({key:old.key,status:vStatus});
   }
   if(status==='MATCH'&&variantResults.some(v=>v.status!=='MATCH'))status='VARIANT_CHANGED';
  }
  seen.add(a.productId);results.push({productId:a.productId,articleNumber:a.articleNumber,status,variants:variantResults});
 }
 return {status:!rows.length?'MISSING':results.every(r=>r.status==='MATCH')?'MATCH':'REVIEW_REQUIRED',checkedAt:now,catalogGeneratedAt:typeof catalog?.generatedAt==='string'?catalog.generatedAt.slice(0,80):null,results};
}
export function validationState(doc){
 const p=obj(doc?.productDocument),v=obj(p.validation);
 return {schemaVersion:V32_SCHEMA,evidenceRevision:Number.isSafeInteger(v.evidenceRevision)&&v.evidenceRevision>0?v.evidenceRevision:0,inspection:obj(v.inspection).sha256?v.inspection:null,inspectionHistory:arr(v.inspectionHistory).slice(-3),inspectionSequence:Number.isSafeInteger(v.inspectionSequence)?v.inspectionSequence:(v.inspection?.inspectionRevision??0),associationCheck:v.associationCheck||null,notes:arr(v.notes).slice(-8),privateFile:v.privateFile||null};
}
// Shared conservative evidence predicate. This checks metadata consistency,
// not authenticity, malware safety or a durable stored file.
export function currentProductInspection(doc){
 const v=validationState(doc),i=v.inspection;
 return i&&i.testOnly!==true&&i.technicalStatus==='LIMITED_STRUCTURE_PASSED'&&i.signatureChecked===true&&i.xrefChecked===true&&i.encryptionMarkersChecked===true&&i.stored===false&&i.mimeType==='application/pdf'&&Number.isSafeInteger(i.sizeBytes)&&i.sizeBytes>0&&i.sizeBytes<=MAX_PRODUCT_PDF_BYTES&&typeof i.sha256==='string'&&/^[a-f0-9]{64}$/.test(i.sha256)&&Number.isSafeInteger(i.inspectionRevision)&&i.inspectionRevision>0&&i.inspectionRevision===v.inspectionSequence&&Number.isSafeInteger(i.documentRevision)&&i.documentRevision>0&&i.documentRevision<=doc.version&&v.evidenceRevision>0?i:null;
}
export function evidenceBasis(doc){
 const p=obj(doc.productDocument),v=validationState(doc);
 return hash({id:doc.id,evidenceRevision:v.evidenceRevision,origin:p.origin,sourceReference:p.sourceReference,externalDocumentUrl:p.externalDocumentUrl,manufacturerReference:p.manufacturerReference,supplierReference:p.supplierReference,modelReference:p.modelReference||'',productVersionReference:p.productVersionReference||'',internalType:p.internalType,ebayDocumentType:p.ebayDocumentType,primaryLanguage:p.primaryLanguage,additionalLanguages:p.additionalLanguages,validFrom:p.validFrom,validUntil:p.validUntil,associations:p.associations,inspectionSha256:v.inspection?.sha256??null,inspectionRevision:v.inspection?.inspectionRevision??null,privateFileId:v.privateFile?.fileId??null,fileRevision:v.privateFile?.fileRevision??null});
}
export function activeReviewNotes(doc){
 if(doc.archivedAt)return [];
 const v=validationState(doc),basis=evidenceBasis(doc);
 return v.notes.filter(n=>n.evidenceBasis===basis&&n.evidenceRevision===v.evidenceRevision&&n.appliedDocumentRevision<=doc.version);
}
export function validationOverview(doc,now=new Date()){
 const p=obj(doc.productDocument),v=validationState(doc),i=currentProductInspection(doc),active=activeReviewNotes(doc),today=now.toISOString().slice(0,10);
 const noteState=type=>type==='content'&&!i?'UNREVIEWED':active.some(n=>n.kind===type&&n.decision==='concern')?'CONCERN_RECORDED':active.some(n=>n.kind===type&&n.decision==='reviewed')?'MANUAL_NOTE_RECORDED':'UNREVIEWED';
 const validity=doc.archivedAt?'ARCHIVED':p.validFrom&&p.validFrom>today?'NOT_YET_VALID':p.validUntil&&p.validUntil<today?'EXPIRED':p.validFrom||p.validUntil?'WITHIN_DECLARED_PERIOD':'UNSPECIFIED';
 return {schemaVersion:V32_SCHEMA,fileStatus:i?'LIMITED_STRUCTURE_PASSED_NOT_STORED':p.externalDocumentUrl?'REFERENCE_ONLY':'FILE_MISSING',inspectionEvidenceInvalid:Boolean(v.inspection&&!i),privateFileAvailable:false,storageStatus:'BLOCKED_NO_VERIFIED_STORAGE',inspectionRevision:i?.inspectionRevision??null,inspectedAt:i?.validatedAt??null,inspectedMimeType:i?.mimeType??null,inspectedSizeBytes:i?.sizeBytes??null,associationStatus:v.associationCheck?.status|| (arr(p.associations).length?'RECHECK_REQUIRED':'MISSING'),associationCheckedAt:v.associationCheck?.checkedAt??null,provenanceStatus:noteState('provenance'),applicabilityStatus:noteState('applicability'),contentStatus:noteState('content'),regulatoryStatus:'NOT_VERIFIED',validity,activeNoteCount:active.length,historicalNoteCount:v.notes.length-active.length,sourceVerified:false,contentVerified:false,regulatoryVerified:false,executionAuthorized:false,ebayStatus:'UPLOAD_BLOCKED'};
}
export function keepValidationOnSave(doc,previous,catalog,now){
 const v=validationState(previous);
 // A metadata save never manufactures new proof or silently copies a file to a
 // different document. Previously inspected bytes become historical on changes
 // to the source, association or metadata; an explicitly fresh inspection is required.
 return {...v,evidenceRevision:v.evidenceRevision+1,inspection:null,inspectionHistory:v.inspection?[...v.inspectionHistory,v.inspection].slice(-3):v.inspectionHistory,associationCheck:revalidateDocumentAssociations(doc.productDocument.associations,catalog,now)};
}
export function applyProductValidationAction(doc,action,input,catalog,now=new Date().toISOString()){
 if(!doc||doc.kind!=='product_document')fail('Produktdokument nicht gefunden.',404);
 if(doc.archivedAt)fail('Archiviertes Produktdokument zuerst wiederherstellen.',409);
 if(!input||typeof input!=='object'||Array.isArray(input)||input.version!==doc.version)fail('Dokumentenrevision veraltet. Bitte neu öffnen.',409);
 const allowed=action==='validate-product-file'?['version','file']:action==='revalidate-product'?['version']:['version','kind','decision','reference','note'];
 if(Object.keys(input).some(k=>!allowed.includes(k)))fail('Unzulässige Prüffelder.');
 const v=validationState(doc),next={...doc,version:doc.version+1,updatedAt:now,productDocument:{...doc.productDocument}},p=next.productDocument;
 if(action==='validate-product-file'){
  const inspected=inspectPdfInput(input.file,now);
  if(v.inspection)v.inspectionHistory=[...v.inspectionHistory,v.inspection].slice(-3);
  v.inspectionSequence++;
  v.inspection={...inspected,inspectionRevision:v.inspectionSequence,documentRevision:next.version,stored:false};
  v.evidenceRevision++;
 }else if(action==='revalidate-product'){
  const check=revalidateDocumentAssociations(p.associations,catalog,now);
  // No change of association snapshots. Any changed finding invalidates notes.
  if(hash(v.associationCheck?.results??null)!==hash(check.results)||v.associationCheck?.status!==check.status)v.evidenceRevision++;
  v.associationCheck=check;
 }else if(action==='add-product-review'){
  if(!['provenance','applicability','content'].includes(input.kind)||!['reviewed','concern'].includes(input.decision))fail('Unzulässige Prüfentscheidung.');
  const reference=clean(input.reference,300),note=clean(input.note,600);
  if(!reference||!note)fail('Prüfvermerk und Nachweisreferenz erforderlich.');
  if(input.kind==='content'&&!currentProductInspection(doc))fail('Zuerst konkrete PDF-Dateibytes prüfen.');
  if(input.kind==='applicability'&&v.associationCheck?.status!=='MATCH'&&input.decision==='reviewed')fail('Zuerst eindeutige Produktzuordnung erneut prüfen.');
  next.productDocument.validation=v;
  v.notes=[...v.notes,{kind:input.kind,decision:input.decision,reference,note,recordedAt:now,actorScope:'shared_seller_access',individualIdentityVerified:false,reviewedDocumentRevision:doc.version,appliedDocumentRevision:next.version,evidenceRevision:v.evidenceRevision,evidenceBasis:evidenceBasis(next),inspectionSha256:v.inspection?.sha256??null,inspectionRevision:v.inspection?.inspectionRevision??null}].slice(-8);
 }else fail('Unbekannte Prüfaktion.',400);
 p.validation=v;
 return next;
}
export function invalidateArchivedValidation(doc){
 const v=validationState(doc);
 return {...doc,productDocument:{...doc.productDocument,validation:{...v,evidenceRevision:v.evidenceRevision+1}}};
}
