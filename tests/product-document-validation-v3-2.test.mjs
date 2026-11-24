import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {inspectPdfBytes,inspectPdfInput,normalizeDocumentSourceUrl,MAX_PRODUCT_PDF_BYTES} from '../lib/product-document-file-validation.js';
import {applyStudioChange,documentSummary} from '../lib/document-studio-core.js';
import {buildProductDocument,documentCommerceCandidate,productDocumentReview} from '../lib/product-document-core.js';
import {applyProductValidationAction,activeReviewNotes,validationOverview,revalidateDocumentAssociations,validationState} from '../lib/product-document-validation.js';
import {createIsolatedProductFileAdapter,privateStorageAvailability,stageTestProductFile,readTestProductFile} from '../lib/product-document-private-storage.js';
import handler from '../api/document-studio.js';

// Minimal actual PDF bytes with a catalog, page tree, page, content stream,
// classic byte-offset xref and trailer; no document content is executed.
function pdf(text='Hello',trailerExtra=''){
 const stream='BT /F1 12 Tf 20 20 Td ('+text+') Tj ET\n';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>','<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'endstream','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 let data='%PDF-1.4\n',offsets=[0];
 for(const [i,o] of objects.entries()){offsets.push(Buffer.byteLength(data));data+=(i+1)+' 0 obj\n'+o+'\nendobj\n';}
 const start=Buffer.byteLength(data);
 data+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R '+trailerExtra+' >>\nstartxref\n'+start+'\n%%EOF\n';
 return Buffer.from(data);
}
const input=(bytes=pdf(),overrides={})=>({filename:'Anleitung.pdf',mediaType:'application/pdf',base64:bytes.toString('base64'),...overrides});
const now='2026-11-24T12:00:00Z';
const a={productId:'00001',masterId:'00001',companyOsProductId:'00002',articleNumber:'ELY-000001',sku:'ELY-000001',supplierProductId:'00003',listingId:null,offerId:null,title:'Fixture',variants:[{key:'sku:ELY-000001-01',sku:'ELY-000001-01',supplierVariantId:'00004',listingId:null,offerId:null},{key:'supplier:00005',sku:null,supplierVariantId:'00005',listingId:null,offerId:null}]};
const catalog={ok:true,schemaVersion:'elyon-product-document-catalog-v3.1',source:'company_os_canonical_projection',executionAuthorized:false,uploadVerified:false,reference:{templateId:'ebay.de.document-url',registryVersion:'1.0.0',templateVersion:'1.0',sha256:'a'.repeat(64),documentTypes:['USER_GUIDE_OR_MANUAL'],languages:['GERMAN','ENGLISH','OTHER']},products:[a],generatedAt:now};
const draft=(patch={},top={})=>({id:'product_doc_00001',kind:'product_document',title:'Anleitung',version:0,productDocument:{internalType:'user_manual',origin:'manufacturer',primaryLanguage:'GERMAN',ebayDocumentType:'USER_GUIDE_OR_MANUAL',sourceReference:'Manufacturer model ref',manufacturerReference:'Claimed manufacturer',modelReference:'M-001',productVersionReference:'0002',externalDocumentUrl:'https://example.invalid/manual.pdf',associations:[{productId:a.productId,articleNumber:a.articleNumber,variantKeys:a.variants.map(v=>v.key)}],...patch},...top});
const make=(patch={},c=catalog)=>buildProductDocument(draft(patch),null,c,now);
const stateOf=doc=>({version:1,revision:1,documents:[doc],customTemplates:[{id:'tpl_old_0001',kind:'letter'}],customBlocks:[{id:'block_old_0001'}]});
const act=(doc,action,extra={},c=catalog)=>applyProductValidationAction(doc,action,{version:doc.version,...extra},c,now);
const note=(doc,kind='content')=>act(doc,'add-product-review',{kind,decision:'reviewed',reference:'Fixture manual reference',note:'Manuell geprüft'});
test('V3.2 actual PDF bytes and SHA-256; limited structural result is neither full integrity nor malware or legal proof',()=>{
 const bytes=pdf(),p=inspectPdfInput(input(bytes),now);
 assert.equal(p.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(p.sizeBytes,bytes.length);assert.equal(p.mimeType,'application/pdf');
 assert.equal(p.technicalStatus,'LIMITED_STRUCTURE_PASSED');assert.equal(p.fullIntegrityVerified,false);assert.equal(p.malwareScanned,false);assert.equal(p.contentVerified,false);
 assert.notEqual(inspectPdfInput(input(pdf('World'))).sha256,p.sha256);
 assert.equal(inspectPdfInput(input(bytes,{mediaType:''})).mimeType,'application/pdf');
});
test('V3.2 PDF rejection: empty, format, MIME, size, filename, damaged offset, encryption and unsupported structures',()=>{
 const cases=[
  [input(Buffer.alloc(0)),'empty_file'],[input(Buffer.from('hello')),'invalid_pdf_signature'],[input(pdf(),{mediaType:'image/png'}),'mime_mismatch'],
  [input(Buffer.alloc(MAX_PRODUCT_PDF_BYTES+1)),'file_too_large'],[input(pdf(),{filename:'../evil.pdf'}),'invalid_filename'],
  [input(pdf(),{filename:'test.png'}),'invalid_filename'],[input(pdf(),{filename:'bad\r\n.pdf'}),'invalid_filename'],
  [input(pdf(),{base64:'AAAA!==='}),'invalid_base64'],[input(pdf().subarray(0,-12)),'damaged_pdf'],
  [input(pdf('x','/Encrypt 4 0 R')),'encrypted_pdf'],[input(pdf('x','/Encr#79pt 4 0 R')),'encrypted_pdf'],
  [input(pdf('x','/Prev 10')),'unsupported_pdf_structure'],[input(pdf('x','/XRefStm 10')),'unsupported_pdf_structure']
 ];
 for(const [file,code] of cases)assert.throws(()=>inspectPdfInput(file),e=>e.code===code,code);
 // Force first live entry offset to a wrong position, preserving byte length.
 const bad=Buffer.from(pdf().toString('latin1').replace(/(\d{10}) 00000 n /,'9999999999 00000 n '));
 assert.throws(()=>inspectPdfBytes(bad,'x.pdf'),e=>e.code==='damaged_pdf');
 assert.throws(()=>inspectPdfInput(input(pdf(),{sha256:'forged'})),e=>e.code==='invalid_file_input');
});
test('V3.2 URL syntax rejects IP/IPv6/loopback aliases/credentials and private suffixes without fetching',()=>{
 assert.equal(normalizeDocumentSourceUrl('https://manufacturer.example/manual.pdf'),'https://manufacturer.example/manual.pdf');
 for(const url of ['http://manufacturer.example/a','file:///tmp/a','https://127.0.0.1/a','https://2130706433/a','https://0x7f000001/a','https://[::1]/a','https://[::ffff:127.0.0.1]/a','https://192.168.0.1/a','https://localhost/a','https://foo.localhost/a','https://foo.local/a','https://foo.internal/a','https://foo.lan/a','https://foo.home/a','https://foo.example./a','https://user:pass@foo.example/a','https://foo.example:8080/a','https://foo.example/a?token=x','https://foo.example/a#x','https:\\foo.example\\a'])assert.throws(()=>normalizeDocumentSourceUrl(url),e=>e.status===422,url);
});
test('V3.2 revalidation preserves exact pre-listing SKU and supplier-only variant references',()=>{
 const d=make(),rows=d.productDocument.associations;
 assert.equal(rows[0].productId,'00001');assert.equal(rows[0].listingId,null);assert.equal(rows[0].variants[1].sku,null);
 assert.equal(revalidateDocumentAssociations(rows,catalog,now).status,'MATCH');
 const fixtures=[
  [[], 'PRODUCT_MISSING_OR_EXCLUDED'],
  [[{...a,productId:'new-id'}],'PRODUCT_IDENTITY_CHANGED'],
  [[{...a,companyOsProductId:'new-id'}],'PRODUCT_IDENTITY_CHANGED'],
  [[{...a,supplierProductId:'new-id'}],'PRODUCT_IDENTITY_CHANGED'],
  [[a,{...a}],'AMBIGUOUS_PRODUCT'],
  [[{...a,listingId:'0009'}],'CHANNEL_CHANGED'],
  [[{...a,variants:[a.variants[0]]}],'VARIANT_CHANGED'],
  [[{...a,variants:[a.variants[0],{...a.variants[1],supplierVariantId:'new-id'}]}],'VARIANT_CHANGED'],
  [[{...a,variants:[a.variants[0],a.variants[1],a.variants[1]]}],'VARIANT_CHANGED']
 ];
 for(const [products,status] of fixtures){
  const next=act(d,'revalidate-product',{}, {...catalog,products});
  assert.deepEqual(next.productDocument.associations,rows);
  assert.equal(next.productDocument.validation.associationCheck.results[0].status,status);
  assert.equal(validationOverview(next).associationStatus,'REVIEW_REQUIRED');
  assert.equal(next.productDocument.executionAuthorized,false);
 }
 const changed={...catalog,products:[{...a,supplierProductId:'different'}]};
 const resaved=buildProductDocument(draft({}, {version:d.version}),d,changed,now);
 assert.equal(resaved.productDocument.associations[0].supplierProductId,'00003');
 assert.equal(validationOverview(resaved).associationStatus,'REVIEW_REQUIRED');
 assert.throws(()=>buildProductDocument(draft({associations:[{productId:a.productId,articleNumber:a.articleNumber,variantKeys:[a.variants[0].key]}]},{version:d.version}),d,changed,now),e=>e.status===409);
});
test('V3.2 actual byte proof without storage, revision-bound manual notes, replacement and metadata/archive invalidation',()=>{
 const d=make();assert.equal(validationOverview(d).fileStatus,'REFERENCE_ONLY');
 assert.throws(()=>note(d),/Dateibytes/);
 const inspected=act(d,'validate-product-file',{file:input()});
 const v=validationState(inspected);assert.equal(v.inspection.stored,false);assert.equal(v.inspection.inspectionRevision,1);assert.equal(v.inspection.documentRevision,2);
 assert.equal(inspected.productDocument.fileReference,null);assert.equal(inspected.productDocument.contentSha256,null);assert.equal(validationOverview(inspected).privateFileAvailable,false);
 const content=note(inspected),withSource=note(content,'provenance'),withApplicability=note(withSource,'applicability');
 assert.equal(activeReviewNotes(withApplicability).length,3);
 const reviews=validationOverview(withApplicability);
 assert.equal(reviews.contentStatus,'MANUAL_NOTE_RECORDED');assert.equal(reviews.provenanceStatus,'MANUAL_NOTE_RECORDED');assert.equal(reviews.applicabilityStatus,'MANUAL_NOTE_RECORDED');assert.equal(reviews.regulatoryStatus,'NOT_VERIFIED');
 assert.equal(validationState(withApplicability).notes[0].actorScope,'shared_seller_access');assert.equal(validationState(withApplicability).notes[0].individualIdentityVerified,false);
 const replaced=act(withApplicability,'validate-product-file',{file:input(pdf('New'))});
 assert.equal(activeReviewNotes(replaced).length,0);assert.equal(validationState(replaced).inspection.inspectionRevision,2);assert.equal(validationState(replaced).inspectionHistory.length,1);
 const edit=buildProductDocument(draft({sourceReference:'new claim'},{version:replaced.version}),replaced,catalog,now);
 assert.equal(validationState(edit).inspection,null);assert.equal(validationState(edit).inspectionHistory.length,2);
 const third=act(edit,'validate-product-file',{file:input()});assert.equal(validationState(third).inspection.inspectionRevision,3);
 const withNote=note(third);
 const archived=applyStudioChange(stateOf(withNote),'archive',null,withNote.id).documents[0];
 assert.equal(validationOverview(archived).validity,'ARCHIVED');assert.equal(activeReviewNotes(archived).length,0);
 assert.throws(()=>act(archived,'revalidate-product'),e=>e.status===409);
 const restored=applyStudioChange(stateOf(archived),'restore',null,archived.id).documents[0];assert.equal(activeReviewNotes(restored).length,0);
 const candidate=documentCommerceCandidate(restored);assert.equal(candidate.documentUrl,null);assert.equal(candidate.fileRevision,null);assert.equal(candidate.privateFileAvailable,false);assert.equal(candidate.ebayDocumentId,null);assert.equal(candidate.gpsrCompliant,false);
 assert.equal(candidate.inspectedSha256,validationState(restored).inspection.sha256);
 const summary=documentSummary(withNote);assert.doesNotMatch(JSON.stringify(summary),/example.invalid|Fixture manual reference|Manuell geprüft|Claimed manufacturer|base64/);
 assert.equal(productDocumentReview(make({validFrom:'2027-01-01'}),new Date(now)).status,'NOT_YET_VALID');
 assert.equal(validationOverview(make({validUntil:'2026-01-01'}),new Date(now)).validity,'EXPIRED');
});
test('V3.2 review notes and server-owned fields cannot be fabricated; revisions block stale writes',()=>{
 const d=make();
 for(const extra of [{kind:'provenance',decision:'VERIFIED',reference:'r',note:'n'},{kind:'provenance',decision:'reviewed',reference:'r',note:'n',sourceVerified:true},{kind:'provenance',decision:'reviewed',reference:'r',note:'n',actor:'owner'},{kind:'provenance',decision:'reviewed',reference:'r',note:''}])assert.throws(()=>act(d,'add-product-review',extra),e=>e.status===422);
 for(const patch of [{validation:{inspection:{sha256:'fake'}}},{fileId:'fake'},{fileReference:'test'},{ebayDocumentId:'fake'},{sourceVerified:true}])assert.throws(()=>make(patch),e=>e.status===422);
 assert.throws(()=>applyProductValidationAction(d,'validate-product-file',{version:0,file:input()},catalog,now),e=>e.status===409);
 assert.throws(()=>act(d,'validate-product-file',{file:input(),fileId:'forged'}),e=>e.status===422);
 const conflict=act(d,'revalidate-product',{}, {...catalog,products:[]});
 assert.throws(()=>note(conflict,'applicability'),/eindeutige Produktzuordnung/);
 const old=note(d,'provenance');
 const changed=act(old,'revalidate-product',{}, {...catalog,products:[]});
 assert.equal(activeReviewNotes(changed).length,0);
 const concern=act(d,'add-product-review',{kind:'provenance',decision:'concern',reference:'Mismatch',note:'Claim differs'});assert.equal(productDocumentReview(concern,new Date(now)).status,'REVIEW_REQUIRED');
});
test('V3.2 isolated storage contract: immutable replacement, exact private read, missing file, auth, CAS conflict and orphan retention',async()=>{
 const adapter=createIsolatedProductFileAdapter(),initial=stateOf(make());
 assert.equal(privateStorageAvailability().available,false);
 const stage=(state,overrides={})=>stageTestProductFile({state,id:state.documents[0].id,expectedRevision:state.revision,expectedDocumentVersion:state.documents[0].version,input:input(),adapter,authorized:true,compareSet:async()=>true,now,...overrides});
 await assert.rejects(()=>stage(initial,{authorized:false}),e=>e.status===403);
 await assert.rejects(()=>stage(initial,{adapter:{name:'fake'}}),e=>e.status===503);
 await assert.rejects(()=>stage(initial,{expectedRevision:0}),e=>e.status===409);
 const saved=await stage(initial),one=saved.state.documents[0],file=validationState(one).privateFile;
 assert.equal(saved.status,'TEST_COMMITTED');assert.equal(file.fileRevision,1);assert.equal(file.testOnly,true);
 assert.equal(adapter.inspectKeys().length,1);assert.equal(saved.state.customTemplates.length,1);
 const args={state:saved.state,id:one.id,expectedDocumentVersion:one.version,fileId:file.fileId,fileRevision:file.fileRevision,adapter,authorized:true};
 const result=await readTestProductFile(args);assert.deepEqual(result.bytes,pdf());assert.equal(result.headers['Content-Type'],'application/pdf');assert.match(result.headers['Content-Disposition'],/^attachment;/);assert.match(result.headers['Cache-Control'],/private, no-store/);
 await assert.rejects(()=>readTestProductFile({...args,authorized:false}),e=>e.status===403);
 await assert.rejects(()=>readTestProductFile({...args,fileId:'forged_file_id'}),e=>e.status===404);
 await assert.rejects(()=>readTestProductFile({...args,expectedDocumentVersion:1}),e=>e.status===409);
 await assert.rejects(()=>readTestProductFile({...args,adapter:createIsolatedProductFileAdapter()}),e=>e.status===409);
 const conflict=await stage(saved.state,{input:input(pdf('conflict')),compareSet:async()=>false});assert.equal(conflict.status,'CAS_CONFLICT');assert.equal(adapter.inspectKeys().length,2);
 assert.deepEqual((await readTestProductFile(args)).bytes,pdf());
 const uncertain=await stage(saved.state,{input:input(pdf('unknown')),compareSet:async()=>{throw Error('timeout');}});assert.equal(uncertain.status,'CAS_OUTCOME_UNKNOWN');assert.equal(uncertain.stateCommitted,null);assert.equal(adapter.inspectKeys().length,3);
 const next=await stage(saved.state,{input:input(pdf('replacement'))});const two=next.state.documents[0],replacement=validationState(two).privateFile;assert.equal(replacement.fileRevision,2);assert.notEqual(replacement.reference,file.reference);assert.equal(adapter.inspectKeys().length,4);
 await assert.rejects(()=>readTestProductFile({...args,state:next.state,expectedDocumentVersion:two.version}),e=>e.status===404);
 const archived=applyStudioChange(next.state,'archive',null,two.id);
 await assert.rejects(()=>readTestProductFile({...args,state:archived,expectedDocumentVersion:archived.documents[0].version,fileId:replacement.fileId,fileRevision:2}),e=>e.status===409);
 assert.equal(documentCommerceCandidate(two).privateFileAvailable,false);assert.equal(documentCommerceCandidate(two).documentUrl,null);
 for(const [fault,status,count] of [['write_before','STORAGE_WRITE_OUTCOME_UNKNOWN',0],['write_after','STORAGE_WRITE_OUTCOME_UNKNOWN',1],['read','STORAGE_READBACK_FAILED',1]]){
  const broken=createIsolatedProductFileAdapter({fault});const result=await stage(initial,{adapter:broken,compareSet:async()=>{throw Error('CAS must not run');}});assert.equal(result.status,status);assert.equal(result.stateCommitted,false);assert.equal(broken.inspectKeys().length,count);
 }
});
test('V3.2 real document API with fake Redis/canonical read only, authorization, validation CAS, safe summary and blocked storage',async()=>{
 const env={ELYON_SELLER_ACCESS_TOKEN:'fixture-v32',UPSTASH_REDIS_REST_URL:'https://redis.invalid',UPSTASH_REDIS_REST_TOKEN:'fixture-redis',ELYON_COMPANY_OS_URL:'https://company.invalid',ELYON_COMPANY_OS_SYNC_CODE:'fixture-sync'};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]])),originalFetch=globalThis.fetch;
 let store=stateOf(make()),casConflict=false,calls=[];
 const invoke=async(action,body,auth=true,query={})=>{const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};await handler({method:body===undefined?'GET':'POST',query:{action,...query},headers:auth?{authorization:'Bearer fixture-v32'}:{},body},res);return res;};
 try{
  Object.assign(process.env,env);
  globalThis.fetch=async(url,opts)=>{
   const host=new URL(url).hostname;calls.push(host);
   if(host==='company.invalid'){assert.equal(opts.method,'GET');return {ok:true,json:async()=>catalog};}
   assert.equal(host,'redis.invalid');const cmd=JSON.parse(opts.body);assert.equal(cmd[0]==='GET'?cmd[1]:cmd[3],'elyon-seller-tool:document-studio:v1');
   if(cmd[0]==='GET')return {ok:true,json:async()=>({result:JSON.stringify(store)})};
   assert.equal(cmd[0],'EVAL');assert.match(cmd[1],/redis.call\('SET'/);const proposed=JSON.parse(cmd[5]);
   assert.doesNotMatch(cmd[5],/"base64"|"originalBase64"/);const pass=!casConflict&&store.revision===cmd[4];if(pass)store=proposed;
   return {ok:true,json:async()=>({result:pass?1:0})};
  };
  const request=()=>({id:store.documents[0].id,expectedRevision:store.revision,document:{version:store.documents[0].version,file:input()}});
  assert.equal((await invoke('validate-product-file',request(),false)).code,403);assert.deepEqual(calls,[]);
  assert.equal((await invoke('download-product-file',undefined,false)).code,403);
  assert.equal((await invoke('download-product-file')).code,503);assert.equal((await invoke('store-product-file',request())).code,503);assert.deepEqual(calls,[]);
  const checked=await invoke('validate-product-file',request());assert.equal(checked.code,200);assert.equal(checked.data.document.productDocument.validation.inspection.sha256,createHash('sha256').update(pdf()).digest('hex'));assert.equal(store.revision,2);
  const stale=request();stale.expectedRevision=1;assert.equal((await invoke('validate-product-file',stale)).code,409);
  const invalid=request();invalid.document.file=input(Buffer.from('not pdf'));assert.equal((await invoke('validate-product-file',invalid)).code,422);assert.equal(store.revision,2);
  casConflict=true;assert.equal((await invoke('validate-product-file',request())).code,409);casConflict=false;assert.equal(store.revision,2);
  const rechecked=await invoke('revalidate-product',{id:store.documents[0].id,expectedRevision:2,document:{version:store.documents[0].version}});assert.equal(rechecked.code,200);assert.equal(rechecked.data.document.review.validation.associationStatus,'MATCH');
  const noted=await invoke('add-product-review',{id:store.documents[0].id,expectedRevision:3,document:{version:store.documents[0].version,kind:'content',decision:'reviewed',reference:'Sensitive ref',note:'Sensitive note'}});assert.equal(noted.code,200);
  const summary=await invoke('product-summary');assert.equal(summary.code,200);assert.equal(summary.headers['Cache-Control'],'no-store');assert.equal(summary.data.documents.length,1);assert.doesNotMatch(JSON.stringify(summary.data),/Sensitive ref|Sensitive note|example.invalid|sha256|fileId|base64/);
  assert.equal((await invoke('product-summary',undefined,false)).code,403);
  const archived=await invoke('archive',{id:store.documents[0].id,expectedRevision:4,expectedDocumentVersion:store.documents[0].version});assert.equal(archived.code,200);
  assert.deepEqual((await invoke('product-summary')).data.documents,[]);
  assert.ok(calls.every(host=>['redis.invalid','company.invalid'].includes(host)));
 }finally{globalThis.fetch=originalFetch;for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
test('V3.2 Product Board builds one safe local exact-identity index, excludes archived records and deduplicates',async()=>{
 const source=await readFile(new URL('../seller-product-board-accordion.js',import.meta.url),'utf8');
 const anchor='  window.ElyonProductBoardAccordion = {';
 const window={},document={readyState:'loading',addEventListener(){}};
 vm.runInNewContext(source.replace(anchor,'  window.__documentTest = {buildDocumentIndex,documentKey};\n'+anchor),{window,document});
 const {buildDocumentIndex,documentKey}=window.__documentTest;
 const d=make(),summary=documentSummary(d);
 const archived={...summary,id:'archived_0001',archivedAt:now},injected={...summary,productDocument:{...summary.productDocument,externalDocumentUrl:'https://secret.invalid',associations:[...summary.productDocument.associations,...summary.productDocument.associations]}};
 const index=buildDocumentIndex([injected,archived,{kind:'letter',id:'business_0001'}]);
 const key=documentKey('00001','ELY-000001'),rows=index.get(key);assert.equal(rows.length,1);assert.equal(rows[0].scope,'variants');assert.equal(rows[0].variantKeys.length,2);
 assert.equal(index.get(documentKey('1','ELY-000001')),undefined);assert.doesNotMatch(JSON.stringify(rows),/secret.invalid|example.invalid/);
 assert.throws(()=>buildDocumentIndex(Array(81).fill(summary)),/Ungültige/);
 assert.equal((source.match(/fetch\("\/api\/document-studio\?action=product-summary"/g)||[]).length,1);
 assert.match(source,/documentIndex\|\|documentSummaryPending\|\|documentSummaryError/);
 assert.doesNotMatch(source,/setInterval/);
});
