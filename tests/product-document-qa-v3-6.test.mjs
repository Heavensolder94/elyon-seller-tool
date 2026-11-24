import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import handler from '../api/document-studio.js';
import {buildProductDocument,documentCommerceCandidate,productDocumentReview} from '../lib/product-document-core.js';
import {applyProductValidationAction,currentProductInspection,validationOverview,invalidateArchivedValidation} from '../lib/product-document-validation.js';
import {prepareDocumentExportReview} from '../lib/product-document-export.js';
import {verifyDocumentExportPreview} from '../lib/product-document-export-client.js';
import {mockPreview} from './fixtures/document-export-preview-v3-3.mjs';
import {prepareBlockedDocumentMediaReview} from '../lib/product-document-media-contract.js';
import {buildGpsrDocumentReview} from '../lib/product-document-gpsr.js';
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


const now='2026-11-24T12:00:00.000Z',clock=new Date(now);
const a={productId:'product_123456',masterId:'product_123456',companyOsProductId:'company_123456',articleNumber:'ELY-000001',sku:'ELY-000001',supplierProductId:'supplier_product',listingId:null,offerId:null,variants:[{key:'sku:ELY-000001-01',sku:'ELY-000001-01',supplierVariantId:'red',listingId:null,offerId:null},{key:'supplier:blue',sku:null,supplierVariantId:'blue',listingId:null,offerId:null}]};
const reference={templateId:'ebay.de.document-url',registryVersion:'1.0.0',templateVersion:'1.0',sha256:'0dd7a11a7192da4ef59904329582c01d592b4e168b06a93457577eacc220c69c',documentTypes:['USER_GUIDE_OR_MANUAL','DECLARATION_OF_CONFORMITY'],languages:['GERMAN','ENGLISH','OTHER','FRENCH','ITALIAN','SPANISH','PORTUGUESE','DUTCH','POLISH']};
const catalog={ok:true,schemaVersion:'elyon-product-document-catalog-v3.1',source:'company_os_canonical_projection',executionAuthorized:false,uploadVerified:false,reference,products:[a],generatedAt:now};
const make=(i=1,patch={},previous=null)=>buildProductDocument({id:'product_doc_'+String(i).padStart(5,'0'),kind:'product_document',title:'Fixture '+i,version:previous?.version??0,productDocument:{internalType:'user_manual',origin:'manufacturer',primaryLanguage:'GERMAN',additionalLanguages:['ENGLISH'],ebayDocumentType:'USER_GUIDE_OR_MANUAL',sourceReference:'Fixture manufacturer',externalDocumentUrl:'https://source.invalid/private.pdf',associations:[{productId:a.productId,articleNumber:a.articleNumber,variantKeys:a.variants.map(v=>v.key)}],...patch}},previous,catalog,now);
const state=(...documents)=>({revision:7,documents,customTemplates:[],customBlocks:[]});
const select=s=>({expectedRevision:s.revision,documents:s.documents.map(d=>({id:d.id,version:d.version}))});
const bridge=async(req,ref)=>verifyDocumentExportPreview(mockPreview(req,ref),req,ref);
const review=(s,c=catalog)=>prepareDocumentExportReview(s,select(s),c,bridge,now);
const act=(d,action,extra)=>applyProductValidationAction(d,action,{version:d.version,...extra},catalog,now);
const inspect=d=>act(d,'validate-product-file',{file:input()});
const note=(d,kind)=>act(d,'add-product-review',{kind,decision:'reviewed',reference:'Fixture note',note:'Manual only'});
const gpsr=(s,c=catalog)=>buildGpsrDocumentReview(s,{productId:a.productId,articleNumber:a.articleNumber},c,clock);
const scope={sellerAccess:true,authenticated:false,blockers:['individual_seller_identity_unverified','workspace_binding_unverified','ebay_account_binding_unverified']};
test('V3.6 actual PDF evidence consistently bound in Studio, XLSX, Media and GPSR; malformed persisted evidence fails closed',async()=>{
 const d=note(note(note(inspect(make()),'provenance'),'applicability'),'content');
 const digest=createHash('sha256').update(pdf()).digest('hex');
 assert.equal(currentProductInspection(d).sha256,digest);
 const r=await review(state(d)),m=prepareBlockedDocumentMediaReview(d,r,catalog,scope,now),g=gpsr(state(d)).snapshot.documents[0];
 assert.equal(validationOverview(d,clock).fileStatus,'LIMITED_STRUCTURE_PASSED_NOT_STORED');
 assert.equal(r.manifest.rows[0].inspectedSha256,digest);assert.equal(g.inspectedSha256,digest);
 assert.equal(g.inspectionRevision,1);assert.equal(g.fileRevision,null);assert.equal(g.contentSha256,null);assert.equal(g.ebayDocumentId,null);assert.equal(g.eligible,false);
 assert.doesNotMatch(JSON.stringify(m),/source\.invalid/);
 for(const patch of [{validationProfile:'unsupported'},{fullIntegrityVerified:true},{malwareScanned:true},{contentVerified:true},{mimeType:'image/png'},{sizeBytes:0},{sizeBytes:2097153},{sha256:'fake'},{stored:true},{testOnly:true},{inspectionRevision:99},{documentRevision:d.version+1}]){
  const x=structuredClone(d);Object.assign(x.productDocument.validation.inspection,patch);
  assert.equal(currentProductInspection(x),null);assert.equal(documentCommerceCandidate(x).inspectedSha256,null);assert.ok(productDocumentReview(x,clock).missing.includes('INSPECTION_EVIDENCE_INVALID'));assert.equal(validationOverview(x,clock).inspectionEvidenceInvalid,true);assert.equal(validationOverview(x,clock).contentStatus,'UNREVIEWED');
  assert.throws(()=>note(x,'content'));
  const row=(await review(state(x))).manifest.rows[0];assert.equal(row.inspectedSha256,null);assert.ok(row.missingEvidence.includes('INSPECTION_EVIDENCE_INVALID'));
  const y=gpsr(state(x)).snapshot.documents[0];assert.equal(y.inspectedSha256,null);assert.ok(y.blockers.includes('INSPECTION_EVIDENCE_INVALID'));
 }
});
test('V3.6 shared cross-repository protocol scenarios generated by real Seller producer; fixture-only transport',async()=>{
 const start=performance.now(),base=make(),d=note(note(note(inspect(base),'provenance'),'applicability'),'content'),second=make(2,{primaryLanguage:'FRENCH',additionalLanguages:['GERMAN'],validUntil:'2025-01-01'}),edited=make(1,{primaryLanguage:'ENGLISH',additionalLanguages:['GERMAN']},d),archived=invalidateArchivedValidation({...d,version:d.version+1,archivedAt:now});
 const staleCatalog={...catalog,products:[{...a,variants:[a.variants[0]]}]};
 const cases={empty:gpsr(state()),metadata:gpsr(state(base)),inspected:gpsr(state(d)),batch:gpsr(state(d,second)),removedVariant:gpsr(state(d),staleCatalog),edited:gpsr(state(edited)),archived:gpsr(state(archived))};
 assert.equal(cases.empty.snapshot.documents.length,0);
 assert.equal(cases.metadata.snapshot.documents[0].technicalStatus,'REFERENCE_ONLY');
 assert.equal(cases.removedVariant.snapshot.documents[0].association.status,'REVIEW_REQUIRED');
 assert.equal(cases.edited.snapshot.documents[0].inspectedSha256,null);
 assert.equal(cases.archived.snapshot.documents[0].reviewStatus,'ARCHIVED');
 for(const [name,result] of Object.entries(cases)){
  assert.deepEqual(result.snapshot.regulatoryDocumentIds,[]);assert.equal(result.snapshot.executionAuthorized,false);
  assert.doesNotMatch(JSON.stringify(result),/source\.invalid|Fixture manufacturer|Fixture note/);
  // Public CI log contains synthetic data only. Read this exact JSON in Company
  // OS V3.6 contract tests, not a separately invented response.
  console.log('V36_SHARED_'+name+' '+JSON.stringify(result));
 }
 const multi=await review(state(d,second));assert.equal(multi.preview.rows.length,2);assert.equal(multi.artifact,null);assert.equal(multi.downloadAvailable,false);assert.ok(multi.preview.rows.every(r=>r.values[0]===''));
 await assert.rejects(prepareDocumentExportReview(state(d),{expectedRevision:7,documents:[{id:d.id,version:d.version-1}]},catalog,bridge,now));
 console.log('V36_FIXTURE_METRICS '+JSON.stringify({elapsedMs:Number((performance.now()-start).toFixed(2)),gpsrBytes:Object.fromEntries(Object.entries(cases).map(([k,v])=>[k,Buffer.byteLength(JSON.stringify(v))])),rssBytes:process.memoryUsage().rss}));
});

test('V3.6 actual GPSR route fails closed on malformed Redis result/state instead of reporting no documents',async()=>{
 const env={ELYON_BRIDGE_SECRET:'fixture-bridge',UPSTASH_REDIS_REST_URL:'https://redis.invalid',UPSTASH_REDIS_REST_TOKEN:'fixture',ELYON_COMPANY_OS_URL:'https://company.invalid',ELYON_COMPANY_OS_SYNC_CODE:'fixture-sync'};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]])),original=globalThis.fetch;
 let response,called=0;
 const invoke=async()=>{const res={setHeader(){},status(n){this.code=n;return this;},json(d){this.data=d;return this;}};await handler({method:'POST',query:{action:'gpsr-document-review'},headers:{'x-elyon-bridge-secret':'fixture-bridge'},body:{productId:a.productId,articleNumber:a.articleNumber}},res);return res;};
 try{Object.assign(process.env,env);
 globalThis.fetch=async(url,o)=>{const u=new URL(url);if(u.hostname==='redis.invalid'){assert.equal(JSON.parse(o.body)[0],'GET');return {ok:true,json:async()=>{if(response===undefined)throw Error('invalid JSON');return response;}};}assert.equal(u.hostname,'company.invalid');called++;return {ok:true,json:async()=>catalog};};
 for(const bad of [undefined,{}, {result:false},{result:''},{result:'null'},{result:'{}'},{result:JSON.stringify({revision:-1,documents:[]})},{result:JSON.stringify(state(make(),make()))},{result:JSON.stringify(state(...Array.from({length:81},(_,i)=>make(i+1))))}]){
  response=bad;const r=await invoke();assert.equal(r.code,503);assert.equal(r.data.snapshot,undefined);
 }
 assert.equal(called,0);
 response={result:null};const empty=await invoke();assert.equal(empty.code,200);assert.deepEqual(empty.data.snapshot.documents,[]);
 // Supported legacy envelope without explicit revision remains readable.
 response={result:JSON.stringify({documents:[]})};assert.equal((await invoke()).code,200);
 }finally{globalThis.fetch=original;for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
