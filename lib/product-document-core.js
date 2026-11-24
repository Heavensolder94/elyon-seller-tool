// V3.1 metadata contract with additive V3.2 validation evidence.
import {normalizeDocumentSourceUrl} from './product-document-file-validation.js';
import {sameSelection, revalidateDocumentAssociations, keepValidationOnSave, validationOverview, validationState, currentProductInspection} from './product-document-validation.js';
export const PRODUCT_DOCUMENT_KIND='product_document';
export const PRODUCT_DOCUMENT_SCHEMA='elyon-product-document-v3.1';
export const PRODUCT_DOCUMENT_TYPES=Object.freeze({
 user_manual:'Anleitung / Benutzerhandbuch',instructions_for_use:'Gebrauchsanweisung',installation_instructions:'Installationsanleitung',
 safety_information:'Sicherheitsinformationen',safety_data_sheet:'Sicherheitsdatenblatt',declaration_of_conformity:'Konformitätserklärung',
 certificate_of_conformity:'Konformitätszertifikat',manufacturer_document:'Herstellerdokument',test_report:'Prüfbericht',other_safety_document:'Sonstiges Sicherheitsdokument'
});
export const DOCUMENT_ORIGINS=Object.freeze({manufacturer:'Hersteller',supplier:'Lieferant',authorized_distributor:'Autorisierter Distributor',official_external:'Offizielle externe Quelle',manual:'Manuell bereitgestellt',elyon_internal:'Intern erstellt (kein Herstellernachweis)',unknown:'Unbekannt'});
const regulatory=new Set(['safety_information','safety_data_sheet','declaration_of_conformity','certificate_of_conformity','test_report','other_safety_document']);
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const arr=v=>Array.isArray(v)?v:[];
const fail=(message,status=422)=>{throw Object.assign(Error(message),{status});};
function string(v,max,{required=false}={}){
 if(v===undefined||v===null||v===''){if(required)fail('Pflichtfeld fehlt.');return '';}
 if(typeof v!=='string'||v.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v))fail('Ungültiger Textwert.');
 const s=v.trim();if(required&&!s)fail('Pflichtfeld fehlt.');return s;
}
const id=v=>typeof v==='string'&&v.length>0&&v.length<=220&&v.trim()===v&&!/[\x00-\x1f\x7f]/.test(v)?v:null;
function exactKeys(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))fail('Unzulässige Metadatenfelder.');}
function date(v){const s=string(v,10);if(!s)return null;if(!/^\d{4}-\d\d-\d\d$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)fail('Ungültiges Gültigkeitsdatum.');return s;}
function externalUrl(v){return normalizeDocumentSourceUrl(string(v,2048));}
function enumValue(v,values,optional=false){if(optional&&(v===null||v===undefined||v===''))return null;if(typeof v!=='string'||!values.includes(v))fail('Unbekannter Dokumenten- oder Sprachwert.');return v;}
export function validateDocumentCatalog(catalog){
 const c=obj(catalog),r=obj(c.reference);
 const validList=v=>Array.isArray(v)&&v.length>0&&v.length<=50&&v.every(x=>typeof x==='string'&&/^[A-Z][A-Z_]{1,79}$/.test(x))&&new Set(v).size===v.length;
 if(c.ok!==true||c.schemaVersion!=='elyon-product-document-catalog-v3.1'||c.source!=='company_os_canonical_projection'||c.executionAuthorized!==false||c.uploadVerified!==false||r.templateId!=='ebay.de.document-url'||!validList(r.documentTypes)||!validList(r.languages)||!r.languages.includes('OTHER')||typeof r.sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.sha256)||!id(r.registryVersion)||!id(r.templateVersion)||!Array.isArray(c.products)||c.products.length>1000)fail('Kanonischer Dokumentenkatalog nicht verfügbar.',503);
 return c;
}
function resolveAssociations(input,catalog,previous=[]){
 if(input===undefined)input=[];
 if(!Array.isArray(input)||input.length>12)fail('Maximal 12 ausdrücklich zugeordnete Produkte.');
 const seen=new Set(),rows=[];
 for(const selected of input){
  exactKeys(selected,['productId','articleNumber','variantKeys']);
  if(!id(selected.productId)||!id(selected.articleNumber)||!/^ELY-\d{6,}$/.test(selected.articleNumber))fail('Produktidentität fehlt.');
  const historical=arr(previous).find(a=>a.productId===selected.productId&&a.articleNumber===selected.articleNumber);
  if(historical&&sameSelection(historical,selected)){
   if(seen.has(historical.productId))fail('Doppelte Produktzuordnung.');seen.add(historical.productId);rows.push(historical);continue;
  }
  if(historical&&revalidateDocumentAssociations([historical],catalog).status!=='MATCH')fail('Historische Identität geändert. Alte Zuordnung separat entfernen und ausdrücklich neu zuordnen.',409);
  if(arr(previous).some(a=>a.productId===selected.productId||a.articleNumber===selected.articleNumber)&&!historical)fail('Historische Produktidentität geändert. Alte Zuordnung separat entfernen.',409);
  const matches=catalog.products.filter(p=>p?.productId===selected.productId), articleMatches=catalog.products.filter(p=>p?.articleNumber===selected.articleNumber);
  if(matches.length!==1||articleMatches.length!==1||matches[0]!==articleMatches[0])fail('Produktidentität fehlt oder ist mehrdeutig.');
  const p=matches[0];if(seen.has(p.productId))fail('Doppelte Produktzuordnung.');seen.add(p.productId);
  if(!Array.isArray(selected.variantKeys)||selected.variantKeys.length>30||new Set(selected.variantKeys).size!==selected.variantKeys.length)fail('Ungültige oder doppelte Variantenreferenzen.');
  const variants=selected.variantKeys.map(key=>{
   if(typeof key!=='string'||key.length>229||!(/^(sku|supplier):/.test(key)))fail('Unzulässige Variantenreferenz.');
   const m=arr(p.variants).filter(v=>v?.key===key);if(m.length!==1)fail('Variante fehlt oder ist mehrdeutig.');
   const v=m[0],sku=id(v.sku),supplierVariantId=id(v.supplierVariantId);
   if(key.startsWith('sku:')&&(!sku||key!=='sku:'+sku||!sku.startsWith(p.articleNumber+'-')||!/^ELY-\d{6,}-\d{2,}$/.test(sku)))fail('Unzulässige Varianten-SKU.');
   if(key.startsWith('supplier:')&&(!supplierVariantId||sku!==null||key!=='supplier:'+supplierVariantId))fail('Unzulässige Lieferantenvariantenreferenz.');
   return {key,sku,supplierVariantId,listingId:id(v.listingId),offerId:id(v.offerId)};
  });
  rows.push({productId:p.productId,masterId:id(p.masterId),companyOsProductId:id(p.companyOsProductId),articleNumber:p.articleNumber,sku:p.articleNumber,supplierProductId:id(p.supplierProductId),listingId:id(p.listingId),offerId:id(p.offerId),scope:variants.length?'variants':'product',variants});
 }
 return rows;
}
export function productDocumentReview(doc,now=new Date()){
 const p=obj(doc.productDocument),missing=[];
 if(!arr(p.associations).length)missing.push('PRODUCT_ASSOCIATION_MISSING');
 if(!p.origin||p.origin==='unknown'||!p.sourceReference)missing.push('SOURCE_MISSING');
 if(!p.externalDocumentUrl)missing.push('FILE_REFERENCE_MISSING');
 if(!p.primaryLanguage)missing.push('LANGUAGE_MISSING');
 if([p.primaryLanguage,...arr(p.additionalLanguages)].includes('OTHER')&&!p.otherLanguageText)missing.push('OTHER_LANGUAGE_UNSPECIFIED');
 if(p.origin==='elyon_internal')missing.push('INTERNAL_NOT_MANUFACTURER_EVIDENCE');
 missing.push('FILE_NOT_VERIFIED','PROVENANCE_NOT_VERIFIED','CONTENT_NOT_VERIFIED','REGULATORY_SUITABILITY_NOT_VERIFIED');
 const validation=validationOverview(doc,now);
 if(validation.inspectionEvidenceInvalid)missing.push('INSPECTION_EVIDENCE_INVALID');
 if(validation.associationStatus==='REVIEW_REQUIRED')missing.push('ASSOCIATION_CHANGED');
 const concern=[validation.provenanceStatus,validation.applicabilityStatus,validation.contentStatus].includes('CONCERN_RECORDED');
 if(concern)missing.push('MANUAL_CONCERN_RECORDED');
 if(validation.validity==='NOT_YET_VALID')missing.push('NOT_YET_VALID');
 let status=missing.includes('PRODUCT_ASSOCIATION_MISSING')?'PRODUCT_ASSOCIATION_MISSING':missing.includes('SOURCE_MISSING')?'SOURCE_MISSING':missing.includes('FILE_REFERENCE_MISSING')?'FILE_REFERENCE_MISSING':missing.includes('LANGUAGE_MISSING')||missing.includes('OTHER_LANGUAGE_UNSPECIFIED')||p.origin==='elyon_internal'?'REVIEW_REQUIRED':'METADATA_COMPLETE';
 if((validation.associationStatus==='REVIEW_REQUIRED'||concern||validation.inspectionEvidenceInvalid)&&status==='METADATA_COMPLETE')status='REVIEW_REQUIRED';
 if(validation.validity==='NOT_YET_VALID')status='NOT_YET_VALID';
 if(p.validUntil&&p.validUntil<now.toISOString().slice(0,10))status='OUTDATED';
 if(p.reviewDecision==='rejected')status='REJECTED';
 if(doc.archivedAt)status='ARCHIVED';
 return {status,missing,validation,metadataComplete:!missing.some(x=>['PRODUCT_ASSOCIATION_MISSING','SOURCE_MISSING','FILE_REFERENCE_MISSING','LANGUAGE_MISSING','OTHER_LANGUAGE_UNSPECIFIED'].includes(x)),fileVerified:false,sourceVerified:false,contentVerified:false,regulatoryVerified:false,executionAuthorized:false,ebayStatus:'UPLOAD_BLOCKED',ebayDocumentId:null};
}
export function buildProductDocument(input,previous,catalog,now=new Date().toISOString()){
 exactKeys(input,['id','kind','title','version','productDocument']);
 if(input.kind!==PRODUCT_DOCUMENT_KIND||typeof input.id!=='string'||!/^[-_A-Za-z0-9]{8,100}$/.test(input.id))fail('Ungültige Dokument-ID oder Art.');
 if(previous&&previous.kind!==PRODUCT_DOCUMENT_KIND)fail('Geschäftsdokumente können nicht in Produktdokumente umgewandelt werden.',409);
 if(previous?.archivedAt)fail('Archiviertes Dokument zuerst wiederherstellen.',409);
 if(!Number.isSafeInteger(input.version)||input.version!==(previous?.version??0))fail('Dokumentenrevision veraltet. Bitte neu öffnen.',409);
 const title=string(input.title,120,{required:true}),c=validateDocumentCatalog(catalog),p=input.productDocument;
 exactKeys(p,['internalType','ebayDocumentType','description','primaryLanguage','additionalLanguages','otherLanguageText','associations','manufacturerReference','supplierReference','origin','sourceReference','externalDocumentUrl','declaredMimeType','declaredFileSize','validFrom','validUntil','reviewDecision','modelReference','productVersionReference']);
 const internalType=enumValue(p.internalType,Object.keys(PRODUCT_DOCUMENT_TYPES)), origin=enumValue(p.origin,Object.keys(DOCUMENT_ORIGINS));
 const primaryLanguage=enumValue(p.primaryLanguage,c.reference.languages,true);
 const additional=p.additionalLanguages??[];if(!Array.isArray(additional)||additional.length>8||new Set(additional).size!==additional.length||additional.includes(primaryLanguage))fail('Doppelte oder zu viele Sprachen.');
 const additionalLanguages=additional.map(x=>enumValue(x,c.reference.languages));
 const otherLanguageText=string(p.otherLanguageText,120);
 if(otherLanguageText&&![primaryLanguage,...additionalLanguages].includes('OTHER'))fail('Andere Sprache erst auswählen.');
 const validFrom=date(p.validFrom),validUntil=date(p.validUntil);
 if(validFrom&&validUntil&&validFrom>validUntil)fail('Gültigkeitszeitraum widersprüchlich.');
 const declaredMimeType=string(p.declaredMimeType,100)||null;
 if(declaredMimeType&&!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(declaredMimeType))fail('Ungültiger MIME-Typ.');
 const declaredFileSize=p.declaredFileSize??null;
 if(declaredFileSize!==null&&(!Number.isSafeInteger(declaredFileSize)||declaredFileSize<0||declaredFileSize>1e10))fail('Ungültige angegebene Dateigröße.');
 const metadata={schemaVersion:PRODUCT_DOCUMENT_SCHEMA,internalType,category:regulatory.has(internalType)?'regulatory':'product_information',ebayDocumentType:enumValue(p.ebayDocumentType,c.reference.documentTypes,true),description:string(p.description,2000),primaryLanguage,additionalLanguages,otherLanguageText,
  associations:resolveAssociations(p.associations,c,previous?.productDocument?.associations),modelReference:string(p.modelReference,220),productVersionReference:string(p.productVersionReference,220),manufacturerReference:string(p.manufacturerReference,220),supplierReference:string(p.supplierReference,220),origin,sourceReference:string(p.sourceReference,500),externalDocumentUrl:externalUrl(p.externalDocumentUrl),
  fileReference:null,mimeType:null,fileSize:null,contentSha256:null,declaredMimeType,declaredFileSize,validFrom,validUntil,reviewDecision:enumValue(p.reviewDecision??'pending',['pending','rejected']),
  referenceProfile:{templateId:c.reference.templateId,registryVersion:c.reference.registryVersion,templateVersion:c.reference.templateVersion,sha256:c.reference.sha256},
  associationBasis:'canonical_product_master_snapshot',associationCheckedAt:now,sourceVerified:false,contentVerified:false,regulatoryVerified:false,fileVerified:false,ebayStatus:'UPLOAD_BLOCKED',ebayDocumentId:null,executionAuthorized:false};
 const doc={id:input.id,kind:PRODUCT_DOCUMENT_KIND,title,createdAt:previous?.createdAt||now,updatedAt:now,version:(previous?.version??0)+1,archivedAt:null,productDocument:metadata};
 metadata.validation=keepValidationOnSave(doc,previous,c,now);
 return doc;
}
export function productDocumentSummary(doc){
 const p=obj(doc.productDocument);
 return {internalType:p.internalType,internalTypeLabel:PRODUCT_DOCUMENT_TYPES[p.internalType]||'Produktdokument',ebayDocumentType:p.ebayDocumentType,primaryLanguage:p.primaryLanguage,validFrom:p.validFrom??null,validUntil:p.validUntil??null,associations:arr(p.associations).map(a=>({productId:a.productId,masterId:a.masterId??null,companyOsProductId:a.companyOsProductId??null,articleNumber:a.articleNumber,scope:a.scope,variants:arr(a.variants).map(v=>({key:v.key,sku:v.sku,supplierVariantId:v.supplierVariantId}))})),review:productDocumentReview(doc)};
}
// Future export contract: a reference is not a deliverable document URL.
export function documentCommerceCandidate(doc){
 const p=obj(doc.productDocument),v=validationState(doc),inspection=currentProductInspection(doc);
 return {validationSchema:v.schemaVersion,fileRevision:null,inspectedSha256:inspection?.sha256??null,inspectionRevision:inspection?.inspectionRevision??null,privateFileAvailable:false,validFrom:p.validFrom??null,validUntil:p.validUntil??null,review:validationOverview(doc),schemaVersion:PRODUCT_DOCUMENT_SCHEMA,templateId:'ebay.de.document-url',documentId:doc.id,documentRevision:doc.version,nickname:doc.title,documentType:p.ebayDocumentType??null,primaryLanguage:p.primaryLanguage??null,additionalLanguages:arr(p.additionalLanguages),otherLanguageText:p.otherLanguageText??'',sourceUrl:p.externalDocumentUrl??null,documentUrl:null,associations:arr(p.associations),executionAuthorized:false,uploadVerified:false,ebayDocumentId:null,gpsrCompliant:false};
}
