import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildProductDocument,productDocumentReview,documentCommerceCandidate,PRODUCT_DOCUMENT_TYPES,validateDocumentCatalog} from '../lib/product-document-core.js';
import {applyStudioChange,normalizeStudioState,documentSummary,STUDIO_DOCUMENT_TYPES} from '../lib/document-studio-core.js';
import {loadDocumentCatalog} from '../lib/product-document-catalog-client.js';
import handler from '../api/document-studio.js';
const now='2026-11-24T12:00:00Z';
const product=(id,a,variants=[])=>({productId:id,masterId:id,companyOsProductId:'00009',articleNumber:a,sku:a,supplierProductId:'00008',listingId:null,offerId:null,title:'Fixture',variants:variants.map(sku=>({sku,supplierVariantId:'00007',listingId:null,offerId:null}))});
const a=product('00001','ELY-000001',['ELY-000001-01','ELY-000001-02']),b=product('00002','ELY-000002');
const catalog={ok:true,schemaVersion:'elyon-product-document-catalog-v3.1',source:'company_os_canonical_projection',executionAuthorized:false,uploadVerified:false,reference:{templateId:'ebay.de.document-url',registryVersion:'1.0.0',templateVersion:'1.0',sha256:'a'.repeat(64),documentTypes:['USER_GUIDE_OR_MANUAL','DECLARATION_OF_CONFORMITY'],languages:['GERMAN','ENGLISH','OTHER']},products:[a,b]};
const assoc=(p=a,variantSkus=[])=>({productId:p.productId,articleNumber:p.articleNumber,variantSkus});
const payload=(patch={},top={})=>({id:'product_doc_00001',kind:'product_document',title:'Fixture Anleitung',version:0,productDocument:{internalType:'user_manual',origin:'manufacturer',primaryLanguage:'GERMAN',additionalLanguages:['ENGLISH'],ebayDocumentType:'USER_GUIDE_OR_MANUAL',sourceReference:'Fixture reference',externalDocumentUrl:'https://example.invalid/manual.pdf',associations:[assoc()],...patch},...top});
const make=(patch={},top={},c=catalog,previous=null)=>buildProductDocument(payload(patch,top),previous,c,now);
test('V3.1 metadata only: exact stored reference, leading zero IDs, pre-listing association, no fabricated file or eBay proof',()=>{
 const d=make({declaredMimeType:'application/pdf',declaredFileSize:100,manufacturerReference:'Declared maker'}),p=d.productDocument;
 assert.equal(p.associations[0].productId,'00001');assert.equal(p.associations[0].supplierProductId,'00008');assert.equal(p.associations[0].listingId,null);
 assert.equal(p.associations[0].scope,'product');assert.deepEqual(p.associations[0].variants,[]);
 assert.equal(p.declaredFileSize,100);assert.equal(p.fileReference,null);assert.equal(p.fileSize,null);assert.equal(p.mimeType,null);assert.equal(p.contentSha256,null);
 assert.equal(p.sourceVerified,false);assert.equal(p.ebayDocumentId,null);assert.equal(p.executionAuthorized,false);assert.equal(p.ebayStatus,'UPLOAD_BLOCKED');
 const review=productDocumentReview(d,new Date(now));assert.equal(review.status,'METADATA_COMPLETE');assert.equal(review.fileVerified,false);assert.equal(review.regulatoryVerified,false);
 const candidate=documentCommerceCandidate(d);assert.equal(candidate.documentUrl,null);assert.equal(candidate.sourceUrl,'https://example.invalid/manual.pdf');assert.equal(candidate.gpsrCompliant,false);assert.equal(candidate.executionAuthorized,false);
 assert.equal(documentSummary(d).productDocument.associations[0].articleNumber,'ELY-000001');assert.doesNotMatch(JSON.stringify(documentSummary(d)),/example.invalid|Declared maker/);
});
test('V3.1 statuses distinguish missing source, reference, association and language; internal/rejected/outdated/archive never verified',()=>{
 for(const [patch,status] of [[{associations:[]},'PRODUCT_ASSOCIATION_MISSING'],[{origin:'unknown'},'SOURCE_MISSING'],[{sourceReference:''},'SOURCE_MISSING'],[{externalDocumentUrl:''},'FILE_REFERENCE_MISSING'],[{primaryLanguage:null},'REVIEW_REQUIRED'],[{origin:'elyon_internal'},'REVIEW_REQUIRED'],[{primaryLanguage:'OTHER'},'REVIEW_REQUIRED'],[{reviewDecision:'rejected'},'REJECTED'],[{validUntil:'2026-01-01'},'OUTDATED']]){
  const review=productDocumentReview(make(patch),new Date(now));assert.equal(review.status,status);assert.equal(review.executionAuthorized,false);
 }
 assert.equal(productDocumentReview({...make(),archivedAt:now},new Date(now)).status,'ARCHIVED');
 assert.equal(make({ebayDocumentType:null}).productDocument.ebayDocumentType,null);
 assert.equal(make({primaryLanguage:'OTHER',otherLanguageText:'Türkisch'}).productDocument.otherLanguageText,'Türkisch');
 assert.equal(Object.keys(PRODUCT_DOCUMENT_TYPES).length,10);
});
test('V3.1 strict field validation rejects type/language/status/ID/hash/file/URL fabrication',()=>{
 for(const patch of [{internalType:'letter'},{ebayDocumentType:'FAKE'},{primaryLanguage:'KLINGON'},{additionalLanguages:['GERMAN']},{additionalLanguages:['ENGLISH','ENGLISH']},{otherLanguageText:'Extra'},{origin:'verified'},{reviewDecision:'VERIFIED'},{status:'VERIFIED'},{sourceVerified:true},{ebayDocumentId:'fake'},{contentSha256:'a'.repeat(64)},{fileReference:'private.pdf'},{fileSize:10},{executionAuthorized:true},{validFrom:'2026-02-30'},{validFrom:'2027-01-01',validUntil:'2026-01-01'},{declaredFileSize:'5'},{declaredMimeType:'data:pdf'},{externalDocumentUrl:'file:///tmp/a.pdf'},{externalDocumentUrl:'http://example.invalid/a'},{externalDocumentUrl:'https://user:secret@example.invalid/a'},{externalDocumentUrl:'https://example.invalid/a?token=secret'},{externalDocumentUrl:'https://127.0.0.1/a'},{externalDocumentUrl:'data:application/pdf;base64,AAAA'}])assert.throws(()=>make(patch),e=>e.status===422,JSON.stringify(patch));
 assert.throws(()=>make({},{title:''}),e=>e.status===422);
 assert.throws(()=>validateDocumentCatalog({...catalog,executionAuthorized:true}),e=>e.status===503);
});
test('V3.1 exact explicit multi-product and variant associations; duplicate or ambiguous identities fail closed',()=>{
 const p=make({associations:[assoc(a,['ELY-000001-01','ELY-000001-02']),assoc(b)]}).productDocument;
 assert.equal(p.associations[0].scope,'variants');assert.deepEqual(p.associations[0].variants.map(v=>v.sku),['ELY-000001-01','ELY-000001-02']);assert.equal(p.associations[0].variants[0].supplierVariantId,'00007');assert.equal(p.associations[1].scope,'product');
 for(const associations of [[assoc(),assoc()],[{...assoc(),productId:'00000'}],[{...assoc(),articleNumber:b.articleNumber}],[{...assoc(),productId:1}],[{...assoc(),variantSkus:['ELY-000002-01']}],[{...assoc(),variantSkus:['ELY-000001-01','ELY-000001-01']}],[{...assoc(),variantSkus:['ELY-000001-99']}],[{...assoc(),listingId:'forged'}]])assert.throws(()=>make({associations}),e=>e.status===422);
 assert.throws(()=>make({}, {},{...catalog,products:[a,{...a}]}),/mehrdeutig/);
 assert.throws(()=>make({associations:[assoc(a,['ELY-000001-01'])]}, {},{...catalog,products:[{...a,variants:[a.variants[0],a.variants[0]]}]}),/mehrdeutig/);
});
test('V3.1 same studio state, revisions, archive, legacy business documents/templates/blocks preserved',()=>{
 const old={id:'business_00001',kind:'letter',title:'Alt',sourceOrderId:'000012',contentHtml:'<p>Alt</p>',version:7,archivedAt:null};
 const legacy={version:1,revision:8,documents:[old],customTemplates:[{id:'tpl_legacy_00001',kind:'letter'}],customBlocks:[{id:'block_legacy_00001',title:'Alt'}]};
 const initial=JSON.stringify(legacy),saved=applyStudioChange(legacy,'save-product',payload(),null,{catalog});
 assert.equal(JSON.stringify(legacy),initial);assert.equal(saved.revision,9);assert.deepEqual(saved.documents[1],old);assert.deepEqual(saved.customTemplates,legacy.customTemplates);assert.deepEqual(saved.customBlocks,legacy.customBlocks);
 assert.ok(STUDIO_DOCUMENT_TYPES.includes('contract'));assert.equal(STUDIO_DOCUMENT_TYPES.includes('product_document'),false);
 const updated=applyStudioChange(saved,'save-product',payload({associations:[assoc(b)]},{version:1}),null,{catalog});
 assert.equal(updated.documents[0].version,2);assert.equal(updated.documents[0].createdAt,saved.documents[0].createdAt);assert.equal(updated.documents[0].productDocument.associations[0].productId,b.productId);
 assert.throws(()=>applyStudioChange(updated,'save-product',payload(),null,{catalog}),e=>e.status===409);
 assert.throws(()=>applyStudioChange(updated,'save',{...old,id:payload().id}),e=>e.status===409);
 assert.throws(()=>applyStudioChange(updated,'save-product',payload({}, {id:old.id,version:7}),null,{catalog}),e=>e.status===409);
 const archive=applyStudioChange(updated,'archive',null,payload().id);assert.equal(productDocumentReview(archive.documents[0]).status,'ARCHIVED');
 assert.throws(()=>applyStudioChange(archive,'save-product',payload({}, {version:3}),null,{catalog}),e=>e.status===409);
 const restored=applyStudioChange(archive,'restore',null,payload().id);assert.equal(restored.documents[0].version,4);
 assert.equal(restored.documents[1].sourceOrderId,'000012');
 const cap=normalizeStudioState({...legacy,documents:Array.from({length:80},(_,i)=>({...old,id:'business_'+i}))});
 assert.throws(()=>applyStudioChange(cap,'save-product',payload(),null,{catalog}),/80 Dokumente/);
});
test('V3.1 catalog bridge fixed HTTPS route, server-side sync secret, no redirect or URL fetch',async()=>{
 const calls=[];const env={ELYON_COMPANY_OS_URL:'https://company.invalid',ELYON_COMPANY_OS_SYNC_CODE:'fixture-sync'};
 const result=await loadDocumentCatalog({env,fetchImpl:async(url,opts)=>{calls.push({url:String(url),opts});return {ok:true,json:async()=>catalog};}});
 assert.equal(result,catalog);assert.equal(calls.length,1);assert.equal(calls[0].url,'https://company.invalid/api/product-master-v2?documentCatalog=1');
 assert.equal(calls[0].opts.redirect,'error');assert.equal(calls[0].opts.headers['X-Elyon-Sync-Code'],'fixture-sync');
 await assert.rejects(()=>loadDocumentCatalog({env:{...env,ELYON_COMPANY_OS_URL:'http://company.invalid'},fetchImpl:()=>{throw Error('must not call');}}),e=>e.status===503);
 await assert.rejects(()=>loadDocumentCatalog({env,fetchImpl:async()=>({ok:true,json:async()=>({...catalog,uploadVerified:true})})}),e=>e.status===503);
});
test('V3.1 actual existing API route: seller auth, mocked CAS concurrency, archive version, no document network calls',async()=>{
 const env={ELYON_SELLER_ACCESS_TOKEN:'fixture-studio-access',UPSTASH_REDIS_REST_URL:'https://redis.invalid',UPSTASH_REDIS_REST_TOKEN:'fixture-redis',ELYON_COMPANY_OS_URL:'https://company.invalid',ELYON_COMPANY_OS_SYNC_CODE:'fixture-sync'};
 const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));const originalFetch=globalThis.fetch;
 let stored=null,commands=[],company=0,casConflict=false;
 const invoke=async(action,body,auth=true,query={})=>{const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};
  await handler({method:body===undefined?'GET':'POST',query:{action,...query},headers:auth?{authorization:'Bearer fixture-studio-access'}:{},body},res);return res;};
 try{
  Object.assign(process.env,env);
  globalThis.fetch=async(url,opts)=>{
   const host=new URL(url).hostname;
   if(host==='company.invalid'){company++;assert.equal(opts.method,'GET');return {ok:true,json:async()=>catalog};}
   assert.equal(host,'redis.invalid');const cmd=JSON.parse(opts.body);commands.push(cmd[0]);assert.equal(cmd[0]==='GET'?cmd[1]:cmd[3],'elyon-seller-tool:document-studio:v1');
   if(cmd[0]==='GET')return {ok:true,json:async()=>({result:stored?JSON.stringify(stored):null})};
   assert.equal(cmd[0],'EVAL');assert.match(cmd[1],/redis.call\('SET'/);
   const pass=!casConflict&&(stored?.revision||0)===cmd[4];if(pass)stored=JSON.parse(cmd[5]);
   return {ok:true,json:async()=>({result:pass?1:0})};
  };
  assert.equal((await invoke('product-catalog',undefined,false)).code,403);assert.equal(company,0);assert.deepEqual(commands,[]);
  const cat=await invoke('product-catalog');assert.equal(cat.code,200);assert.equal(cat.headers['Cache-Control'],'no-store');assert.ok(cat.data.internalTypes.user_manual);assert.equal(company,1);
  const saved=await invoke('save-product',{expectedRevision:0,document:payload()});assert.equal(saved.code,200);assert.equal(saved.data.document.version,1);assert.equal(saved.data.revision,1);
  assert.equal((await invoke('save-product',{expectedRevision:0,document:payload()})).code,409);
  assert.equal((await invoke('save-product',{expectedRevision:1,document:payload({sourceVerified:true},{version:1})})).code,422);
  assert.equal(stored.revision,1);
  casConflict=true;assert.equal((await invoke('save-product',{expectedRevision:1,document:payload({associations:[assoc(b)]},{version:1})})).code,409);casConflict=false;assert.equal(stored.revision,1);
  assert.equal((await invoke('archive',{expectedRevision:1,id:payload().id,expectedDocumentVersion:0})).code,409);
  const archived=await invoke('archive',{expectedRevision:1,id:payload().id,expectedDocumentVersion:1});assert.equal(archived.code,200);assert.equal(archived.data.document.review.status,'ARCHIVED');
  const listed=await invoke('list');assert.equal(listed.data.documents[0].productDocument.review.status,'ARCHIVED');assert.doesNotMatch(JSON.stringify(listed.data),/example.invalid/);
  const get=await invoke('get',undefined,true,{id:payload().id});assert.equal(get.data.document.productDocument.externalDocumentUrl,'https://example.invalid/manual.pdf');
  assert.equal((await invoke('get',undefined,false,{id:payload().id})).code,403);
 }finally{globalThis.fetch=originalFetch;for(const [k,v] of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
test('V3.1 UI integration uses existing studio, explicit product controls, no new tab/URL retrieval, legacy export and order path retained',async()=>{
 const ui=await readFile(new URL('../seller-document-studio.js',import.meta.url),'utf8');
 const core=await readFile(new URL('../lib/product-document-core.js',import.meta.url),'utf8');
 for(const pattern of [/data-eds-action="new-product"/,/edsDocumentFilter/,/edsProductType/,/edsProductLanguage/,/edsProductAssociations/,/variants.multiple=true/,/Keine Auswahl = Produktbezug/,/api\("save-product"/,/if\(productMode\(\)\)return saveProduct\(\)/,/function openFromOrder/,/function printDocument/,/function exportDocx/,/function archiveOrRestore/])assert.match(ui,pattern);
 assert.doesNotMatch(core,/\bfetch\s*\(|createDocumentFromUrl\s*\(|writeFile\s*\(/);
});
