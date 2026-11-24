import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildProductDocument} from '../lib/product-document-core.js';
import {applyProductValidationAction} from '../lib/product-document-validation.js';
import {validateExportSelection,resolveExportSelection,prepareDocumentExportReview} from '../lib/product-document-export.js';
import {verifyDocumentExportPreview,loadDocumentExportPreview} from '../lib/product-document-export-client.js';
import {mockPreview,hash} from './fixtures/document-export-preview-v3-3.mjs';
import handler from '../api/document-studio.js';
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
const a={productId:'00001',masterId:'00001',companyOsProductId:'00002',articleNumber:'ELY-000001',sku:'ELY-000001',supplierProductId:'00003',listingId:null,offerId:null,variants:[{key:'sku:ELY-000001-01',sku:'ELY-000001-01',supplierVariantId:'00004'},{key:'supplier:00005',sku:null,supplierVariantId:'00005'}]};
const b={productId:'00010',masterId:'00010',companyOsProductId:'00020',articleNumber:'ELY-000002',sku:'ELY-000002',supplierProductId:'00030',listingId:null,offerId:null,variants:[]};
const reference={templateId:'ebay.de.document-url',registryVersion:'1.0.0',templateVersion:'1.0',sha256:'0dd7a11a7192da4ef59904329582c01d592b4e168b06a93457577eacc220c69c',documentTypes:['USER_GUIDE_OR_MANUAL','DECLARATION_OF_CONFORMITY'],languages:['GERMAN','ENGLISH','OTHER','FRENCH','ITALIAN','SPANISH']};
const catalog={ok:true,schemaVersion:'elyon-product-document-catalog-v3.1',source:'company_os_canonical_projection',executionAuthorized:false,uploadVerified:false,reference,products:[a,b],generatedAt:now};
const make=(i=1,patch={},top={})=>buildProductDocument({id:'product_doc_'+String(i).padStart(5,'0'),kind:'product_document',title:'Manual '+i,version:0,productDocument:{internalType:'user_manual',origin:'manufacturer',primaryLanguage:'GERMAN',additionalLanguages:['ENGLISH'],ebayDocumentType:'USER_GUIDE_OR_MANUAL',sourceReference:'Manufacturer reference',externalDocumentUrl:'https://source.invalid/private.pdf',associations:[{productId:a.productId,articleNumber:a.articleNumber,variantKeys:a.variants.map(v=>v.key)},{productId:b.productId,articleNumber:b.articleNumber,variantKeys:[]}],...patch},...top},null,catalog,now);
const state=(...documents)=>({revision:7,documents,customTemplates:[],customBlocks:[]});
const select=s=>({expectedRevision:s.revision,documents:s.documents.map(d=>({id:d.id,version:d.version}))});
const bridge=async(req,ref)=>verifyDocumentExportPreview(mockPreview(req,ref),req,ref);
const review=(s,c=catalog)=>prepareDocumentExportReview(s,select(s),c,bridge,now);
const act=(d,action,extra)=>applyProductValidationAction(d,action,{version:d.version,...extra},catalog,now);
const inspect=d=>act(d,'validate-product-file',{file:input()});
const note=(d,kind)=>act(d,'add-product-review',{kind,decision:'reviewed',reference:'Manual review',note:'Inspected manually'});

test('V3.3 selection strict, revision-bound, product-only and all-or-nothing',()=>{
 const d=make(),s=state(d);
 assert.deepEqual(resolveExportSelection(s,validateExportSelection(select(s))),[d]);
 for(const bad of [{...select(s),sourceUrl:'https://fake.invalid'},{expectedRevision:7,documents:[]},{expectedRevision:7,documents:[{id:d.id,version:1},{id:d.id,version:1}]},{expectedRevision:7,documents:[{id:d.id,version:1,ebayDocumentId:'fake'}]},{expectedRevision:7,documents:Array(81).fill({id:d.id,version:1})}])assert.throws(()=>validateExportSelection(bad),e=>e.status===422);
 assert.throws(()=>resolveExportSelection(s,{...select(s),expectedRevision:6}),e=>e.status===409);
 assert.throws(()=>resolveExportSelection(s,{expectedRevision:7,documents:[{id:d.id,version:2}]}),e=>e.status===409);
 assert.throws(()=>resolveExportSelection(state(d,d),select(s)),e=>e.status===409);
 assert.throws(()=>resolveExportSelection(state({...d,kind:'letter'}),select(s)),e=>e.status===409);
});
test('V3.3 manifest includes authoritative identity, inspected SHA, fresh revalidation and never a source URL',async()=>{
 const d=note(note(note(inspect(make()),'provenance'),'applicability'),'content');
 const s=state(d),before=JSON.stringify(s),r=await review(s),row=r.manifest.rows[0];
 assert.equal(JSON.stringify(s),before);assert.equal(r.manifestSha256,hash(r.manifest));assert.equal(row.documentRevision,d.version);
 assert.equal(row.inspectedSha256,createHash('sha256').update(pdf()).digest('hex'));assert.equal(row.inspectionRevision,1);assert.equal(row.evidenceRevision,d.productDocument.validation.evidenceRevision);
 assert.equal(row.associations.length,2);assert.equal(row.associations[0].variants[1].sku,null);assert.equal(row.associationCheck.status,'MATCH');
 assert.equal(r.preview.rows.length,1);assert.equal(r.preview.rows[0].values[0],'');assert.equal(row.documentUrl,null);
 assert.ok(row.missingEvidence.includes('INSPECTED_BYTES_NOT_STORED'));assert.ok(row.missingEvidence.includes('SOURCE_URL_NOT_DELIVERY'));
 assert.ok(row.missingEvidence.includes('DOCUMENT_DELIVERY_UNVERIFIED'));assert.ok(row.missingEvidence.includes('PROVENANCE_UNVERIFIED'));
 assert.ok(!row.missingEvidence.includes('CONTENT_REVIEW_MISSING_OR_STALE'));assert.equal(r.artifact,null);assert.equal(r.artifactSha256,null);assert.equal(r.downloadAvailable,false);
 assert.doesNotMatch(JSON.stringify(r),/source\.invalid|Manufacturer reference|Manual review|Inspected manually/);
 for(const k of ['executionAuthorized','operationalEnabled','uploadVerified','releaseEligible','privateFileAvailable','gpsrCompliant'])assert.equal(r[k],false);
});
test('V3.3 historical, removed, changed and ambiguous identities remain visible, never re-bound',async()=>{
 const d=make();
 const cases=[{...catalog,products:[{...a,supplierProductId:'changed'},b]},{...catalog,products:[{...a,variants:[a.variants[0]]},b]},{...catalog,products:[a,a,b]},{...catalog,products:[b]}];
 for(const c of cases){
  const r=await review(state(d),c),row=r.manifest.rows[0];
  assert.ok(row.missingEvidence.includes('PRODUCT_ASSOCIATION_CONFLICT'));assert.deepEqual(row.associations,d.productDocument.associations);
  assert.equal(row.associationCheck.status,'REVIEW_REQUIRED');assert.equal(r.preview.rows.length,1);
 }
});
test('V3.3 blocked batch retains every archived, rejected, expired, future and incomplete document',async()=>{
 const docs=[make(1),{...make(2),archivedAt:now},make(3,{reviewDecision:'rejected'}),make(4,{validUntil:'2026-01-01'}),make(5,{validFrom:'2027-01-01'}),make(6,{ebayDocumentType:null,primaryLanguage:null,additionalLanguages:[],associations:[]})];
 const r=await review(state(...docs));assert.equal(r.preview.rows.length,docs.length);assert.equal(r.manifest.rows.length,docs.length);
 for(const [i,code] of [[1,'DOCUMENT_ARCHIVED'],[2,'DOCUMENT_REJECTED'],[3,'DOCUMENT_EXPIRED'],[4,'DOCUMENT_NOT_YET_VALID'],[5,'DOCUMENT_TYPE_MISSING'],[5,'PRIMARY_LANGUAGE_MISSING']])assert.ok(r.manifest.rows[i].missingEvidence.includes(code),code);
 assert.equal(r.downloadAvailable,false);assert.ok(r.manifest.rows.every(x=>x.validationStatus==='BLOCKED'));
});
test('V3.3 duplicate actual inspected content retained and conflicting type flagged; replacement invalidates notes',async()=>{
 const first=note(inspect(make(1)),'content'),second=inspect(make(2,{ebayDocumentType:'DECLARATION_OF_CONFORMITY'}));
 const r=await review(state(first,second));assert.equal(r.preview.rows.length,2);
 for(const row of r.manifest.rows){assert.ok(row.missingEvidence.includes('DUPLICATE_INSPECTED_CONTENT_REVIEW_REQUIRED'));assert.ok(row.missingEvidence.includes('CONFLICTING_DOCUMENT_TYPE_FOR_INSPECTED_CONTENT'));}
 const changed=act(first,'validate-product-file',{file:input(pdf('new'))}),x=(await review(state(changed))).manifest.rows[0];assert.ok(x.missingEvidence.includes('HISTORICAL_REVIEW_NOTES_NOT_CURRENT'));assert.ok(x.missingEvidence.includes('CONTENT_REVIEW_MISSING_OR_STALE'));
 const bad=structuredClone(first);bad.productDocument.validation.inspection.testOnly=true;const y=(await review(state(bad))).manifest.rows[0];assert.equal(y.inspectedSha256,null);assert.ok(y.missingEvidence.includes('INSPECTION_EVIDENCE_INVALID'));
});
test('V3.3 bridge response strict: unexpected artifact/hash, flags, identity, source URL, row and header drift rejected',async()=>{
 const req={documents:[{documentId:'product_doc_00001',documentRevision:1,documentType:'USER_GUIDE_OR_MANUAL',primaryLanguage:'GERMAN',additionalLanguages:['ENGLISH'],otherLanguageText:'',nickname:'Manual'}]};
 const good=mockPreview(req,reference);assert.equal(verifyDocumentExportPreview(good,req,reference),good);
 for(const mutate of [r=>r.artifact='fake',r=>r.artifactSha256='f'.repeat(64),r=>r.executionAuthorized=true,r=>r.uploadVerified=true,r=>r.downloadAvailable=true,r=>r.rows[0].documentId='different_doc',r=>r.rows[0].documentRevision++,r=>r.rows[0].values[0]='https://source.invalid',r=>r.rows[0].values[2]='OTHER',r=>r.rows[0].row=5,r=>r.profile.originalSha256='bad',r=>r.profile.header.reverse(),r=>r.requestSha256='bad',r=>r.rows=[],r=>r.rows[0].blockers=[],r=>r.rows[0].privateUrl='secret']){
  const bad=structuredClone(good);mutate(bad);assert.throws(()=>verifyDocumentExportPreview(bad,req,reference),/invalid_document_preview_response/);
 }
 const env={ELYON_COMPANY_OS_URL:'https://company.invalid',ELYON_COMPANY_OS_SYNC_CODE:'secret'};
 const result=await loadDocumentExportPreview(req,reference,{env,fetchImpl:async(url,options)=>{assert.equal(url.href,'https://company.invalid/api/product-master-v2?documentExportPreview=1');assert.equal(options.redirect,'error');assert.equal(options.headers['X-Elyon-Sync-Code'],'secret');assert.deepEqual(JSON.parse(options.body),req);return {ok:true,text:async()=>JSON.stringify(good)};}});
 assert.equal(result.status,'BLOCKED');
 await assert.rejects(()=>loadDocumentExportPreview(req,reference,{env,fetchImpl:async()=>{throw Error('offline');}}),e=>e.status===503);
});
test('V3.3 actual Seller API authenticates, loads state and catalog, verifies bridge, rereads revision, never writes or transfers',async()=>{
 const env={ELYON_SELLER_ACCESS_TOKEN:'fixture-v33',UPSTASH_REDIS_REST_URL:'https://redis.invalid',UPSTASH_REDIS_REST_TOKEN:'fixture',ELYON_COMPANY_OS_URL:'https://company.invalid',ELYON_COMPANY_OS_SYNC_CODE:'fixture-sync'};
 const before=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]])),originalFetch=globalThis.fetch;
 let store=state(make()),calls=[],change=false,bad=false;
 const invoke=async(body,auth=true)=>{const res={setHeader(){},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};await handler({method:'POST',query:{action:'document-export-preview'},headers:auth?{authorization:'Bearer fixture-v33'}:{},body},res);return res;};
 try{
  Object.assign(process.env,env);
  globalThis.fetch=async(url,opts)=>{
   const u=new URL(url);calls.push(u.hostname+u.search);
   if(u.hostname==='redis.invalid'){const cmd=JSON.parse(opts.body);assert.equal(cmd[0],'GET');return {ok:true,json:async()=>({result:JSON.stringify(store)})};}
   assert.equal(u.hostname,'company.invalid');
   if(u.searchParams.get('documentCatalog')==='1')return {ok:true,json:async()=>catalog};
   assert.equal(u.searchParams.get('documentExportPreview'),'1');const request=JSON.parse(opts.body);assert.doesNotMatch(opts.body,/sourceUrl|documentUrl|private\.pdf|evidence|associations/);
   const result=mockPreview(request,reference);if(bad)result.artifactSha256='fake';if(change)store={...store,revision:store.revision+1};return {ok:true,text:async()=>JSON.stringify(result)};
  };
  assert.equal((await invoke(select(store),false)).code,403);assert.deepEqual(calls,[]);
  assert.equal((await invoke({...select(store),documentUrl:'fake'})).code,422);assert.deepEqual(calls,[]);
  const ok=await invoke(select(store));assert.equal(ok.code,200);assert.equal(ok.data.downloadAvailable,false);assert.equal(calls.length,4);
  assert.equal((await invoke({...select(store),expectedRevision:6})).code,409);
  bad=true;assert.equal((await invoke(select(store))).code,503);bad=false;
  change=true;assert.equal((await invoke(select(store))).code,409);
  assert.ok(calls.every(x=>x.startsWith('redis.invalid')||x.startsWith('company.invalid')));
 }finally{globalThis.fetch=originalFetch;for(const [k,v] of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
