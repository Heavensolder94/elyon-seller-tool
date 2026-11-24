// Fixed existing server-to-server Company OS bridge. No source/document URL,
// file, approval or user-supplied host is transmitted.
import {createHash} from 'node:crypto';
import {DEFAULT_COMPANY_OS_URL} from './product-master-consumer.js';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const exact=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x));
const fail=()=>{throw Error('invalid_document_preview_response');};
const flags=['executionAuthorized','operationalEnabled','uploadVerified','releaseEligible','privateFileAvailable','gpsrCompliant','downloadAvailable'];
const responseKeys=['ok','schemaVersion','stage','status','requestSha256','profile','rows','validation',...flags,'ebayDocumentId','artifact','artifactSha256'];
const headers=['Document url','Document type','Document language 1','Document language 2','Document language 3','Document language 4','Document language others','Document nickname'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const safeCode=v=>typeof v==='string'&&/^[a-zA-Z0-9_]{1,100}$/.test(v);
export function verifyDocumentExportPreview(result,request,reference){
 if(!exact(result,responseKeys)||result.ok!==true||result.schemaVersion!=='elyon-document-xlsx-preview-v3.3'||result.stage!=='A_METADATA_PREVIEW'||result.status!=='BLOCKED'||result.requestSha256!==digest(request)||flags.some(k=>result[k]!==false)||result.ebayDocumentId!==null||result.artifact!==null||result.artifactSha256!==null)fail();
 const p=result.profile;
 if(!exact(p,['templateId','registryVersion','templateVersion','originalSha256','originalSize','header','headerRow','maxRows'])||p.templateId!==reference.templateId||p.registryVersion!==reference.registryVersion||p.templateVersion!==reference.templateVersion||p.originalSha256!==reference.sha256||p.originalSize!==17244||p.headerRow!==3||p.maxRows!==97||!same(p.header,headers))fail();
 if(!Array.isArray(result.rows)||result.rows.length!==request.documents.length)fail();
 for(let i=0;i<result.rows.length;i++){
  const r=result.rows[i],d=request.documents[i];
  if(!exact(r,['documentId','documentRevision','row','values','blockers','declaredLanguages'])||r.documentId!==d.documentId||r.documentRevision!==d.documentRevision||r.row!==i+4||!Array.isArray(r.values)||r.values.length!==8||r.values.some(v=>typeof v!=='string'||v.length>120)||r.values[0]!==''||r.values[1]!==(d.documentType||'')||r.values[6]!==d.otherLanguageText||r.values[7]!==d.nickname||!Array.isArray(r.blockers)||r.blockers.length>20||!r.blockers.every(safeCode)||!['DOCUMENT_DELIVERY_UNVERIFIED','PRIVATE_FILE_UNAVAILABLE','PROVENANCE_UNVERIFIED'].every(b=>r.blockers.includes(b)))fail();
  const langs=[...(d.primaryLanguage?[d.primaryLanguage]:[]),...d.additionalLanguages];
  if(!same(r.declaredLanguages,langs))fail();
  const validSlots=Boolean(d.primaryLanguage&&langs.length<=4&&new Set(langs).size===langs.length&&langs.every(l=>reference.languages.includes(l)));
  if(!same(r.values.slice(2,6),validSlots?[...langs,...Array(4-langs.length).fill('')]:Array(4).fill('')))fail();
 }
 const v=result.validation;
 if(!exact(v,['status','structureStatus','businessStatus','diagnostics'])||!safeCode(v.status)||!safeCode(v.structureStatus)||!safeCode(v.businessStatus)||!Array.isArray(v.diagnostics)||v.diagnostics.length>1000||v.diagnostics.some(d=>!exact(d,['row','field','code','classification','severity'])||!safeCode(d.code)||!safeCode(d.classification)||!safeCode(d.severity)||d.row!==null&&(!Number.isSafeInteger(d.row)||d.row<1||d.row>100)||d.field!==null&&(typeof d.field!=='string'||d.field.length>120)))fail();
 return result;
}
export async function loadDocumentExportPreview(request,reference,{env=process.env,fetchImpl=fetch}={}){
 try{
  const code=String(env.ELYON_COMPANY_OS_SYNC_CODE||env.COMPANY_OS_SYNC_CODE||'').trim();
  if(!code)throw Error();
  const url=new URL('/api/product-master-v2',env.ELYON_COMPANY_OS_URL||env.COMPANY_OS_URL||DEFAULT_COMPANY_OS_URL);
  if(url.protocol!=='https:'||url.username||url.password)throw Error();
  url.searchParams.set('documentExportPreview','1');
  const response=await fetchImpl(url,{method:'POST',redirect:'error',cache:'no-store',headers:{Accept:'application/json','Content-Type':'application/json','X-Elyon-Sync-Code':code},body:JSON.stringify(request),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error();
  const raw=await response.text();
  if(Buffer.byteLength(raw,'utf8')>1024*1024)throw Error();
  return verifyDocumentExportPreview(JSON.parse(raw),request,reference);
 }catch{throw Object.assign(Error('Kanonische XLSX-Vorschau nicht verfügbar oder Antwort ungültig. Kein Export erzeugt.'),{status:503,code:'document_export_bridge_unavailable'});}
}
