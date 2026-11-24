import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {buildProductDocument} from '../lib/product-document-core.js';
import {applyProductValidationAction} from '../lib/product-document-validation.js';
import {prepareDocumentExportReview} from '../lib/product-document-export.js';
import {verifyDocumentExportPreview} from '../lib/product-document-export-client.js';
import {mockPreview} from './fixtures/document-export-preview-v3-3.mjs';
import {MEDIA_CONTRACT,MEDIA_TYPES,MEDIA_LANGUAGES,MEDIA_STATUSES,mediaHash,mapMediaMetadata,prepareBlockedDocumentMediaReview} from '../lib/product-document-media-contract.js';
import {validateDocumentMediaCandidate,fixtureDeliveryBinding,prepareDocumentMediaOperation,buildDocumentMediaRequest,buildDocumentStatusRequest,createDocumentMediaSimulationSession,normalizeDocumentMediaResponse,simulateDocumentMediaSubmission,reconcileDocumentMediaOperation,compareMediaRevision} from '../lib/product-document-media-simulation.js';
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


const scope={sellerAccess:true,authenticated:false,blockers:['individual_seller_identity_unverified','workspace_binding_unverified','ebay_account_binding_unverified']};
const ts=Date.parse('2026-11-24T12:00:00.000Z'),iso=n=>new Date(n).toISOString();
const simScope={userId:'fixture:operator',workspaceId:'fixture:workspace',ebayAccountId:'fixture:account',environment:'production',marketplace:'EBAY_DE'};
function fixtureCandidate(patch={}){
 const bytes=pdf(),contentSha256=createHash('sha256').update(bytes).digest('hex');
 const c={simulation:true,documentId:'fixture:doc',documentRevision:1,evidenceRevision:1,fileId:'fixture:file',fileRevision:1,contentSha256,documentType:'USER_GUIDE_OR_MANUAL',languages:['GERMAN','ENGLISH'],nickname:'Fixture only',associations:[{productId:'fixture:product',variantKeys:['fixture:variant']}],validUntil:null,scope:simScope,file:{stored:true,testOnly:true,mimeType:'application/pdf',sizeBytes:bytes.length,sha256:contentSha256},...patch};
 const data={simulation:true,documentId:c.documentId,documentRevision:c.documentRevision,evidenceRevision:c.evidenceRevision,fileRevision:c.fileRevision,contentSha256:c.contentSha256,documentType:c.documentType,languages:c.languages,associations:c.associations,checkedAt:iso(ts)};
 c.manifest={data,sha256:mediaHash(data)};
 c.delivery={testOnly:true,fileId:c.fileId,fileRevision:c.fileRevision,contentSha256:c.contentSha256,url:'https://fixture.invalid/document.pdf',purpose:'ebay_document_create',operationBinding:fixtureDeliveryBinding(c),issuedAt:iso(ts),expiresAt:iso(ts+3600000),revocable:true,accessControlled:true};
 return c;
}
const observation=(plan,c,{create=true,status='SUBMITTED',httpStatus=create?201:200,at=ts,docId='fixture:remote1',body,location}={})=>({operationId:plan.operationId,bindingSha256:plan.bindingSha256,scope:c.scope,observedAt:iso(at),httpStatus,body:body??{documentId:docId,documentStatus:status,documentType:c.documentType,languages:c.languages,...(create?{}:{documentMetadata:{fileName:'fixture.pdf',fileSize:String(c.file.sizeBytes),fileType:'pdf'}})},location:location===undefined?(create?MEDIA_CONTRACT.origin+MEDIA_CONTRACT.statusPath.replace('{document_id}',encodeURIComponent(docId)):null):location});
test('V3.4 official contract and API/XLSX differences, no sandbox; explicit Portuguese correction and OTHER blocker',()=>{
 assert.equal(MEDIA_CONTRACT.createMethod,'POST');assert.equal(MEDIA_CONTRACT.statusMethod,'GET');assert.equal(MEDIA_CONTRACT.sandboxSupported,false);assert.equal(MEDIA_CONTRACT.maxFileBytes,10485760);
 assert.deepEqual(MEDIA_STATUSES,['SUBMITTED','ACCEPTED','REJECTED','PENDING_UPLOAD','EXPIRED']);assert.ok(MEDIA_TYPES.includes('CHILDRENS_PRODUCT_CERTIFICATE'));assert.ok(MEDIA_LANGUAGES.includes('PORTUGUESE'));
 const r={documentTypes:['USER_GUIDE_OR_MANUAL'],languages:['PORTUGESE','PORTUGUESE','GERMAN','OTHER']};
 assert.deepEqual(mapMediaMetadata('USER_GUIDE_OR_MANUAL','PORTUGESE',['GERMAN'],'',r).languages,['PORTUGUESE','GERMAN']);
 assert.ok(mapMediaMetadata('USER_GUIDE_OR_MANUAL','PORTUGESE',['PORTUGUESE'],'',r).blockers.includes('MEDIA_LANGUAGE_DUPLICATE'));
 assert.ok(mapMediaMetadata('USER_GUIDE_OR_MANUAL','OTHER',[],'Tamil',r).blockers.includes('MEDIA_OTHER_LANGUAGE_REVIEW_REQUIRED'));
 assert.ok(mapMediaMetadata('CHILDRENS_PRODUCT_CERTIFICATE','GERMAN',[],'',r).blockers.includes('MEDIA_DOCUMENT_TYPE_UNSUPPORTED'));
});
test('V3.4 authoritative V3.3 manifest binds current revisions, evidence, associations and never produces URL or GPSR ID',async()=>{
 const d=note(note(note(inspect(make()),'provenance'),'applicability'),'content'),s=state(d),ex=await review(s);
 const result=prepareBlockedDocumentMediaReview(d,ex,catalog,scope,now);
 assert.equal(result.status,'UPLOAD_BLOCKED');assert.equal(result.externalStatus,'NOT_SUBMITTED');assert.equal(result.candidate.documentRevision,d.version);
 assert.equal(result.candidate.inspectedSha256,createHash('sha256').update(pdf()).digest('hex'));assert.equal(result.candidate.contentSha256,null);assert.equal(result.candidate.documentUrl,null);
 assert.equal(result.candidate.fileId,null);assert.equal(result.candidate.scope.ebayAccountId,null);assert.equal(result.candidate.scope.environment,null);assert.equal(result.transport.request,null);assert.equal(result.gpsrCandidate.eligible,false);assert.deepEqual(result.gpsrCandidate.regulatoryDocumentIds,[]);
 assert.ok(result.blockers.includes('DOCUMENT_DELIVERY_UNVERIFIED'));assert.ok(result.blockers.includes('MEDIA_SCOPE_UNVERIFIED'));assert.ok(result.blockers.includes('PRODUCTION_LEDGER_UNVERIFIED'));
 assert.doesNotMatch(JSON.stringify(result),/source\.invalid|fixture:remote|Manufacturer reference/);
 assert.throws(()=>prepareBlockedDocumentMediaReview(d,ex,catalog,{sellerAccess:false,authenticated:false},now),e=>e.status===403);
 for(const change of [m=>m.rows[0].documentRevision++,m=>m.rows[0].evidenceRevision++,m=>m.rows[0].inspectedSha256='f'.repeat(64),m=>m.rows[0].documentUrl='https://source.invalid',m=>m.rows[0].ebayDocumentId='fixture:remote',m=>m.executionAuthorized=true]){
  const bad=structuredClone(ex);change(bad.manifest);bad.manifestSha256=mediaHash(bad.manifest);assert.throws(()=>prepareBlockedDocumentMediaReview(d,bad,catalog,scope,now));
 }
 assert.throws(()=>prepareBlockedDocumentMediaReview(d,{...ex,manifestSha256:'f'.repeat(64)},catalog,scope,now));
 assert.throws(()=>prepareBlockedDocumentMediaReview(d,ex,catalog,scope,iso(Date.parse(now)+900001)),e=>e.code==='export_review_stale');
});
test('V3.4 fixture candidate exact file and delivery binding, URL, manifest, revision and size constraints',()=>{
 const c=fixtureCandidate();assert.equal(validateDocumentMediaCandidate(c,ts),true);
 const p=prepareDocumentMediaOperation(c,ts);assert.deepEqual(buildDocumentMediaRequest(p),{method:'POST',path:MEDIA_CONTRACT.createPath,body:{documentUrl:c.delivery.url,documentType:c.documentType,languages:c.languages}});
 assert.throws(()=>buildDocumentMediaRequest({...p}),/unrecognized_fixture_plan/);
 for(const mutate of [x=>x.documentRevision=0,x=>x.file.stored=false,x=>x.file.sizeBytes=10485761,x=>x.file.sha256='f'.repeat(64),x=>x.delivery.url='https://source.invalid/a.pdf',x=>x.delivery.url='',x=>x.delivery.expiresAt=iso(ts),x=>x.delivery.operationBinding='f'.repeat(64),x=>x.delivery.accessControlled=false,x=>x.manifest.sha256='f'.repeat(64),x=>x.scope.environment='sandbox',x=>x.languages=['GERMAN','GERMAN'],x=>x.documentType='INVALID',x=>x.documentId='real-id',x=>x.sourceUrl='https://source.invalid',x=>x.file.testOnly=false]){
  const b=structuredClone(c);mutate(b);assert.throws(()=>prepareDocumentMediaOperation(b,ts));
 }
 assert.throws(()=>prepareDocumentMediaOperation(c,ts+900001),/fixture_manifest_invalid/);
});
test('V3.4 simulated create 201 SUBMITTED then explicit GET processing/accepted; no genuine external ID',()=>{
 const c=fixtureCandidate(),p=prepareDocumentMediaOperation(c,ts),session=createDocumentMediaSimulationSession();
 const start=simulateDocumentMediaSubmission(session,p,observation(p,c),ts);
 assert.equal(start.status,'PROCESSING');assert.equal(start.documentStatus,'SUBMITTED');assert.equal(start.fixtureReference,'fixture:remote1');assert.equal(start.ebayDocumentId,null);
 assert.deepEqual(start.history,['PREPARED','SIMULATED_SUBMISSION','MAYBE_SUBMITTED','PROCESSING']);
 const request=buildDocumentStatusRequest(session,p);assert.equal(request.path,MEDIA_CONTRACT.statusPath.replace('{document_id}','fixture%3Aremote1'));assert.equal(request.body,null);
 const processing=reconcileDocumentMediaOperation(session,p,observation(p,c,{create:false,at:ts+1000}),ts+1000);assert.equal(processing.status,'PROCESSING');
 const accepted=reconcileDocumentMediaOperation(session,p,observation(p,c,{create:false,status:'ACCEPTED',at:ts+2000}),ts+2000);
 assert.equal(accepted.status,'SIMULATED_ACCEPTED');assert.equal(accepted.externalStatusVerified,false);assert.equal(accepted.ebayDocumentId,null);assert.equal(accepted.gpsrCompliant,false);assert.equal(accepted.executionAuthorized,false);
 const conflict=reconcileDocumentMediaOperation(session,p,observation(p,c,{create:false,status:'REJECTED',at:ts+3000}),ts+3000);assert.equal(conflict.status,'RECONCILIATION_REQUIRED');assert.equal(conflict.terminalStatus,'SIMULATED_ACCEPTED');
 const again=reconcileDocumentMediaOperation(session,p,observation(p,c,{create:false,status:'REJECTED',at:ts+4000}),ts+4000);assert.equal(again.status,'RECONCILIATION_REQUIRED');
});
test('V3.4 strict response normalization: bad schema, missing ID, wrong location, unknown state, warnings/errors and stale observation',()=>{
 const c=fixtureCandidate(),p=prepareDocumentMediaOperation(c,ts);
 for(const mutate of [x=>delete x.body.documentId,x=>x.body.documentId='real-id',x=>x.location='https://evil.invalid',x=>x.body.documentStatus='PROCESSING',x=>x.body.documentStatus='ACCEPTED',x=>x.body.languages=['FRENCH'],x=>x.body.documentType='SAFETY_DATA_SHEET',x=>x.body.errors=[{errorId:190051,domain:'API_MEDIA'}],x=>x.operationId='other',x=>x.bindingSha256='bad',x=>x.scope={...x.scope,ebayAccountId:'fixture:other'},x=>x.scope={...x.scope,environment:'sandbox'},x=>x.observedAt=iso(ts-900001),x=>x.httpStatus=500,x=>x.body=null]){
  const o=observation(p,c);mutate(o);assert.equal(normalizeDocumentMediaResponse(p,o,ts).status,'UNKNOWN_OUTCOME');
 }
 const warning=observation(p,c);warning.body.warnings=[{errorId:190050,domain:'API_MEDIA'}];assert.deepEqual(normalizeDocumentMediaResponse(p,warning,ts).warnings,[190050]);
 const error=observation(p,c,{httpStatus:400,body:{errors:[{errorId:190051,domain:'API_MEDIA'}]}});assert.deepEqual(normalizeDocumentMediaResponse(p,error,ts).errors,[190051]);
 const session=createDocumentMediaSimulationSession();simulateDocumentMediaSubmission(session,p,observation(p,c),ts);
 const stale=reconcileDocumentMediaOperation(session,p,observation(p,c,{create:false,status:'ACCEPTED',at:ts}),ts+1000);assert.equal(stale.status,'UNKNOWN_OUTCOME');assert.equal(stale.fixtureReference,'fixture:remote1');
 const wrong=reconcileDocumentMediaOperation(session,p,observation(p,c,{create:false,status:'ACCEPTED',at:ts+2000,docId:'fixture:wrong'}),ts+2000);assert.equal(wrong.status,'UNKNOWN_OUTCOME');assert.equal(wrong.fixtureReference,'fixture:remote1');
 const missing=reconcileDocumentMediaOperation(session,p,observation(p,c,{create:false,httpStatus:404,at:ts+3000,body:{errors:[{errorId:190052,domain:'API_MEDIA'}]}}),ts+3000);assert.equal(missing.status,'RECONCILIATION_REQUIRED');assert.equal(missing.reason,'DOCUMENT_NOT_FOUND');
 const rejected=reconcileDocumentMediaOperation(session,p,observation(p,c,{create:false,status:'REJECTED',at:ts+4000}),ts+4000);assert.equal(rejected.status,'SIMULATED_REJECTED');
});
test('V3.4 lost response, duplicate and concurrent attempts remain reserved without known ID or automatic retry',async()=>{
 const c=fixtureCandidate(),p=prepareDocumentMediaOperation(c,ts),s=createDocumentMediaSimulationSession();
 const [lost,dup]=await Promise.all([Promise.resolve().then(()=>simulateDocumentMediaSubmission(s,p,null,ts)),Promise.resolve().then(()=>simulateDocumentMediaSubmission(s,p,observation(p,c),ts))]);
 assert.equal(lost.status,'UNKNOWN_OUTCOME');assert.equal(dup.status,'DUPLICATE_OPERATION');assert.equal(lost.retryAllowed,false);
 assert.throws(()=>buildDocumentStatusRequest(s,p),/known_fixture_reference_required/);
 assert.equal(reconcileDocumentMediaOperation(s,p,observation(p,c,{create:false,at:ts+1000}),ts+1000).reason,'NO_KNOWN_DOCUMENT_ID_NO_SEARCH');
 const renamed=fixtureCandidate({documentRevision:2,nickname:'Renamed'}),newPlan=prepareDocumentMediaOperation(renamed,ts);
 assert.equal(newPlan.operationKey,p.operationKey);assert.equal(simulateDocumentMediaSubmission(s,newPlan,null,ts).status,'DUPLICATE_OPERATION');
 const differentType=fixtureCandidate({documentRevision:2,documentType:'SAFETY_DATA_SHEET'}),other=prepareDocumentMediaOperation(differentType,ts);
 assert.notEqual(other.operationKey,p.operationKey);assert.equal(simulateDocumentMediaSubmission(s,other,null,ts).reason,'UNRESOLVED_PREVIOUS_OPERATION');
 const changed=compareMediaRevision(s,p,renamed,ts);assert.equal(changed.status,'RECONCILIATION_REQUIRED');assert.equal(changed.operation.status,'UNKNOWN_OUTCOME');
 assert.equal(simulateDocumentMediaSubmission(s,other,null,ts).status,'UPLOAD_BLOCKED');
});
test('V3.4 revision supersession: preserve historical fixture reference, no automatic reuse, distinguish file/type/language from associations',()=>{
 const c=fixtureCandidate(),p=prepareDocumentMediaOperation(c,ts);
 for(const [patch,reason] of [[{documentRevision:2,nickname:'New'},'REASSOCIATION_REVIEW_REQUIRED'],[{documentRevision:2,associations:[{productId:'fixture:other',variantKeys:[]}]},'REASSOCIATION_REVIEW_REQUIRED'],[{documentRevision:2,fileRevision:2},'NEW_MEDIA_REVIEW_REQUIRED'],[{documentType:'SAFETY_DATA_SHEET'},'NEW_MEDIA_REVIEW_REQUIRED'],[{languages:['FRENCH']},'NEW_MEDIA_REVIEW_REQUIRED'],[{archivedAt:iso(ts)},'DOCUMENT_ARCHIVED_OR_EXPIRED'],[{scope:{...c.scope,ebayAccountId:'fixture:new'}},'SCOPE_CHANGED']]){
  const s=createDocumentMediaSimulationSession();simulateDocumentMediaSubmission(s,p,observation(p,c),ts);reconcileDocumentMediaOperation(s,p,observation(p,c,{create:false,status:'ACCEPTED',at:ts+1000}),ts+1000);
  const result=compareMediaRevision(s,p,{...c,...patch},ts+2000);assert.equal(result.status,'SUPERSEDED');assert.equal(result.reason,reason);assert.equal(result.operation.fixtureReference,'fixture:remote1');assert.equal(result.operation.ebayDocumentId,null);
 }
 const s=createDocumentMediaSimulationSession();simulateDocumentMediaSubmission(s,p,observation(p,c),ts);compareMediaRevision(s,p,{...c,documentRevision:2},ts+1000);
 const later=reconcileDocumentMediaOperation(s,p,observation(p,c,{create:false,status:'ACCEPTED',at:ts+2000}),ts+2000);assert.equal(later.status,'SUPERSEDED');assert.equal(later.terminalStatus,'SIMULATED_ACCEPTED');
});
test('V3.4 actual readiness API is auth-protected, strict, reads only and ignores no fake evidence or IDs',async()=>{
 const env={ELYON_SELLER_ACCESS_TOKEN:'fixture-v34',UPSTASH_REDIS_REST_URL:'https://redis.invalid',UPSTASH_REDIS_REST_TOKEN:'fixture',ELYON_COMPANY_OS_URL:'https://company.invalid',ELYON_COMPANY_OS_SYNC_CODE:'fixture-sync'};
 const before=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]])),fetchBefore=globalThis.fetch;
 let store=state(make()),calls=[],changed=false;
 const invoke=async(body,auth=true,action='document-media-review')=>{const res={setHeader(){},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};await handler({method:'POST',query:{action},headers:auth?{authorization:'Bearer fixture-v34'}:{},body},res);return res;};
 try{
  Object.assign(process.env,env);
  globalThis.fetch=async(url,opts)=>{
   const u=new URL(url);calls.push(u.hostname+u.search);
   if(u.hostname==='redis.invalid'){assert.equal(JSON.parse(opts.body)[0],'GET');return {ok:true,json:async()=>({result:JSON.stringify(store)})};}
   assert.equal(u.hostname,'company.invalid');
   if(u.searchParams.get('documentCatalog')==='1')return {ok:true,json:async()=>catalog};
   assert.equal(u.searchParams.get('documentExportPreview'),'1');const req=JSON.parse(opts.body);assert.doesNotMatch(opts.body,/sourceUrl|documentUrl|private\.pdf|evidence|associations/);
   if(changed)store={...store,revision:store.revision+1};return {ok:true,text:async()=>JSON.stringify(mockPreview(req,reference))};
  };
  assert.equal((await invoke(select(store),false)).code,403);assert.deepEqual(calls,[]);
  assert.equal((await invoke({...select(store),ebayDocumentId:'fixture:fake'})).code,422);assert.deepEqual(calls,[]);
  const ok=await invoke(select(store));assert.equal(ok.code,200);assert.equal(ok.data.status,'UPLOAD_BLOCKED');assert.equal(ok.data.ebayDocumentId,null);assert.equal(calls.length,4);
  assert.equal((await invoke(select(store),true,'document-media-upload')).code,405);
  assert.equal((await invoke(select(store),true,'document-media-simulate')).code,405);
  changed=true;assert.equal((await invoke(select(store))).code,409);
  assert.ok(calls.every(x=>x.startsWith('redis.invalid')||x.startsWith('company.invalid')));
 }finally{globalThis.fetch=fetchBefore;for(const [k,v] of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
 const api=await readFile(new URL('../api/document-studio.js',import.meta.url),'utf8');assert.doesNotMatch(api,/product-document-media-simulation|callEbayJson|ebayUserSession/);
});
