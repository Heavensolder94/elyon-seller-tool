// Isolated adapter contract, NOT a live provider. No production env flag
// can enable it. Production route deliberately rejects store/download.
// A future provider must be independently approved, scoped and verified.
import {randomUUID} from 'node:crypto';
import {decodePdfInput,inspectPdfBytes,sha256Bytes} from './product-document-file-validation.js';
import {validationState} from './product-document-validation.js';
const adapters=new WeakSet();
const fail=(message,status=422)=>{throw Object.assign(Error(message),{status});};
export const privateStorageAvailability=()=>({available:false,provider:null,status:'BLOCKED_NO_VERIFIED_STORAGE',publicDeliveryAllowed:false});
export function createIsolatedProductFileAdapter({fault=null}={}){
 const objects=new Map();
 const adapter=Object.freeze({
  name:'isolated-test-adapter',testOnly:true,
  async putImmutable(key,bytes){
   if(fault==='write_before')fail('Isolated write failure.',503);
   if(objects.has(key))fail('Object already exists.',409);
   objects.set(key,Buffer.from(bytes));
   if(fault==='write_after')fail('Isolated response loss.',503);
   return {key,private:true};
  },
  async get(key){if(fault==='read')fail('Isolated read failure.',503);return objects.has(key)?Buffer.from(objects.get(key)):null;},
  // Diagnostic only; no destructive API even for orphan candidates.
  inspectKeys(){return [...objects.keys()];}
 });
 adapters.add(adapter);return adapter;
}
function assertAdapter(adapter){if(!adapters.has(adapter))fail('Private Storage nicht verifiziert.',503);}
function exactDocument(state,id,version){
 const matches=(state?.documents||[]).filter(d=>d.id===id);
 if(matches.length!==1||matches[0].kind!=='product_document')fail('Produktdokument nicht gefunden.',404);
 const doc=matches[0];
 if(doc.archivedAt||!Number.isSafeInteger(version)||doc.version!==version)fail('Dokument archiviert oder Revision veraltet.',409);
 return doc;
}
const safeId=id=>typeof id==='string'&&/^[-_A-Za-z0-9]{8,100}$/.test(id);
function objectKey(docId,fileId,rev){if(!safeId(docId)||!safeId(fileId)||!Number.isSafeInteger(rev)||rev<1)fail('Ungültige private Dateireferenz.');return 'product-documents/'+docId+'/'+rev+'/'+fileId+'.pdf';}
export async function stageTestProductFile({state,id,expectedRevision,expectedDocumentVersion,input,adapter,compareSet,authorized,now=new Date().toISOString()}){
 if(authorized!==true)fail('Seller-Zugriff erforderlich.',403);
 assertAdapter(adapter);
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision!==state?.revision)fail('Studio-Revision veraltet.',409);
 const previous=exactDocument(state,id,expectedDocumentVersion);
 const {filename,bytes}=decodePdfInput(input),proof=inspectPdfBytes(bytes,filename,now);
 const v=validationState(previous),fileRevision=(v.privateFile?.fileRevision??0)+1,fileId=randomUUID(),key=objectKey(id,fileId,fileRevision);
 // Write a fresh immutable object; never overwrite/delete the old reference.
 let write,readback;
 try{write=await adapter.putImmutable(key,bytes);}catch{return {status:'STORAGE_WRITE_OUTCOME_UNKNOWN',orphanCandidate:key,stateCommitted:false};}
 if(write?.key!==key||write.private!==true)return {status:'STORAGE_WRITE_UNCONFIRMED',orphanCandidate:key,stateCommitted:false};
 try{readback=await adapter.get(key);}catch{return {status:'STORAGE_READBACK_FAILED',orphanCandidate:key,stateCommitted:false};}
 if(!Buffer.isBuffer(readback)||readback.length!==bytes.length||sha256Bytes(readback)!==proof.sha256)return {status:'STORAGE_READBACK_FAILED',orphanCandidate:key,stateCommitted:false};
 const next={...previous,version:previous.version+1,updatedAt:now,productDocument:{...previous.productDocument}};
 v.evidenceRevision++;
 if(v.inspection)v.inspectionHistory=[...v.inspectionHistory,v.inspection].slice(-3);
 v.inspectionSequence++;
 v.inspection={...proof,inspectionRevision:v.inspectionSequence,documentRevision:next.version,stored:true,testOnly:true};
 v.privateFile={fileId,reference:key,adapter:adapter.name,testOnly:true,mimeType:proof.mimeType,sizeBytes:proof.sizeBytes,sha256:proof.sha256,filename,validatedAt:now,fileRevision,documentRevision:next.version};
 next.productDocument.validation=v;
 const proposed={...state,revision:state.revision+1,documents:state.documents.map(d=>d.id===id?next:d)};
 // On conflict or uncertain response the new object may be orphaned. Do not
 // delete it or the old file before authoritative reconciliation.
 try{
  if(await compareSet(proposed,expectedRevision)!==true)return {status:'CAS_CONFLICT',orphanCandidate:key,stateCommitted:false};
 }catch{return {status:'CAS_OUTCOME_UNKNOWN',orphanCandidate:key,stateCommitted:null};}
 return {status:'TEST_COMMITTED',stateCommitted:true,state:proposed};
}
export async function readTestProductFile({state,id,expectedDocumentVersion,fileId,fileRevision,adapter,authorized}){
 if(authorized!==true)fail('Seller-Zugriff erforderlich.',403);
 assertAdapter(adapter);
 const doc=exactDocument(state,id,expectedDocumentVersion),v=validationState(doc),file=v.privateFile;
 if(!file||file.testOnly!==true||file.adapter!==adapter.name||file.fileId!==fileId||file.fileRevision!==fileRevision||file.reference!==objectKey(id,fileId,fileRevision)||file.documentRevision>doc.version)fail('Dateireferenz oder Revision stimmt nicht.',404);
 const bytes=await adapter.get(file.reference);
 if(!Buffer.isBuffer(bytes)||bytes.length!==file.sizeBytes||sha256Bytes(bytes)!==file.sha256)fail('Private Datei fehlt oder ist verändert.',409);
 const filename=encodeURIComponent(file.filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
 return {bytes,headers:{'Content-Type':'application/pdf','Content-Disposition':"attachment; filename=\"product-document.pdf\"; filename*=UTF-8''"+filename,'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"},testOnly:true};
}
