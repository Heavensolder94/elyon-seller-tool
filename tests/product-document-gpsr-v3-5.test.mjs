import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProductDocument} from '../lib/product-document-core.js';
import {buildGpsrDocumentReview,validateGpsrDocumentRequest,gpsrDigest} from '../lib/product-document-gpsr.js';
import handler from '../api/document-studio.js';
const now=new Date('2026-11-24T12:00:00Z');
const target={productId:'p12345678',masterId:'p12345678',companyOsProductId:'c12345678',articleNumber:'ELY-000001',sku:'ELY-000001',supplierProductId:'supplier123',listingId:null,offerId:null,variants:[{key:'sku:ELY-000001-01',sku:'ELY-000001-01',supplierVariantId:'red',listingId:null,offerId:null},{key:'supplier:blue',sku:null,supplierVariantId:'blue',listingId:null,offerId:null}]};
const reference={templateId:'ebay.de.document-url',registryVersion:'1.0.0',templateVersion:'1.0',sha256:'a'.repeat(64),documentTypes:['USER_GUIDE_OR_MANUAL'],languages:['GERMAN','ENGLISH','OTHER']};
const catalog={ok:true,schemaVersion:'elyon-product-document-catalog-v3.1',source:'company_os_canonical_projection',executionAuthorized:false,uploadVerified:false,reference,products:[target],generatedAt:now.toISOString()};
const input={productId:target.productId,articleNumber:target.articleNumber};
const make=(variantKeys=[],patch={})=>buildProductDocument({id:'product_doc_0001',kind:'product_document',title:'private title',version:0,productDocument:{internalType:'user_manual',origin:'manufacturer',primaryLanguage:'GERMAN',additionalLanguages:['ENGLISH'],ebayDocumentType:'USER_GUIDE_OR_MANUAL',sourceReference:'private source',externalDocumentUrl:'https://source.invalid/private.pdf',associations:[{productId:target.productId,articleNumber:target.articleNumber,variantKeys}],...patch}},null,catalog,now.toISOString());
const state=(...documents)=>({revision:7,documents,customTemplates:[],customBlocks:[]});
test('V3.5 compact projection with exact product pre-listing and typed supplier-only variants, no private fields or new IDs',()=>{
 const doc=make(target.variants.map(v=>v.key)),r=buildGpsrDocumentReview(state(doc),input,catalog,now);
 assert.equal(r.snapshotSha256,gpsrDigest(r.snapshot));assert.equal(r.snapshot.target.listingId,null);
 const d=r.snapshot.documents[0];assert.equal(d.association.status,'MATCH');assert.equal(d.association.variants[1].sku,null);assert.equal(d.variantApplicability,'EXPLICIT_VARIANTS_REVIEW_ONLY');
 assert.equal(d.documentRevision,doc.version);assert.equal(d.contentSha256,null);assert.equal(d.ebayDocumentId,null);assert.equal(d.eligible,false);assert.deepEqual(r.snapshot.regulatoryDocumentIds,[]);assert.equal(r.snapshot.executionAuthorized,false);
 assert.doesNotMatch(JSON.stringify(r),/private title|private source|source\.invalid|externalDocumentUrl|fileId|notes/);
 const p=buildGpsrDocumentReview(state(make()),input,catalog,now).snapshot.documents[0];assert.equal(p.variantApplicability,'UNVERIFIED');assert.ok(p.blockers.includes('VARIANT_APPLICABILITY_UNVERIFIED'));
});
test('V3.5 stale/removed variant, archive, expired, absent and forged stored acceptance remain blocked',()=>{
 const doc=make(target.variants.map(v=>v.key));const changed={...catalog,products:[{...target,variants:[target.variants[0]]}]};
 assert.equal(buildGpsrDocumentReview(state(doc),input,changed,now).snapshot.documents[0].association.status,'REVIEW_REQUIRED');
 const archived={...doc,archivedAt:now.toISOString()};assert.equal(buildGpsrDocumentReview(state(archived),input,catalog,now).snapshot.documents[0].reviewStatus,'ARCHIVED');
 const expired={...doc,productDocument:{...doc.productDocument,validUntil:'2025-01-01'}};assert.equal(buildGpsrDocumentReview(state(expired),input,catalog,now).snapshot.documents[0].validity,'EXPIRED');
 const fake={...doc,productDocument:{...doc.productDocument,ebayDocumentId:'fixture:remote',eligible:true,environment:'sandbox',validation:{...doc.productDocument.validation,privateFile:{sha256:'b'.repeat(64)}}}};
 const r=buildGpsrDocumentReview(state(fake),input,catalog,now);assert.equal(r.snapshot.documents[0].ebayDocumentId,null);assert.equal(r.snapshot.documents[0].fileRevision,null);
 assert.deepEqual(buildGpsrDocumentReview(state(),input,catalog,now).snapshot.documents,[]);
 assert.throws(()=>buildGpsrDocumentReview(state(doc),{...input,productId:'other'},catalog,now));
 assert.throws(()=>validateGpsrDocumentRequest({...input,ebayDocumentId:'fake'}));
});
test('V3.5 actual existing route protected bridge-only, bounded request, fresh readback, no writes or eBay calls',async()=>{
 const env={ELYON_BRIDGE_SECRET:'fixture-bridge',UPSTASH_REDIS_REST_URL:'https://redis.invalid',UPSTASH_REDIS_REST_TOKEN:'fixture',ELYON_COMPANY_OS_URL:'https://company.invalid',ELYON_COMPANY_OS_SYNC_CODE:'fixture-sync'};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]])),original=globalThis.fetch;let reads=0,calls=[],drift=false;
 const invoke=async(body,secret='fixture-bridge')=>{const res={setHeader(){},status(n){this.code=n;return this;},json(d){this.data=d;return this;}};await handler({method:'POST',query:{action:'gpsr-document-review'},headers:{'x-elyon-bridge-secret':secret},body},res);return res;};
 try{Object.assign(process.env,env);
 globalThis.fetch=async(url,opts)=>{const u=new URL(url);calls.push(u.hostname);if(u.hostname==='redis.invalid'){assert.equal(JSON.parse(opts.body)[0],'GET');reads++;return {ok:true,json:async()=>({result:JSON.stringify({...state(make()),revision:drift?reads:7})})};}assert.equal(u.hostname,'company.invalid');assert.equal(u.searchParams.get('documentCatalog'),'1');assert.equal(opts.redirect,'error');return {ok:true,json:async()=>catalog};};
 assert.equal((await invoke(input,'wrong')).code,403);assert.deepEqual(calls,[]);
 assert.equal((await invoke({...input,regulatoryDocumentIds:['fake']})).code,422);assert.deepEqual(calls,[]);
 const r=await invoke(input);assert.equal(r.code,200);assert.equal(r.data.snapshot.documents.length,1);assert.deepEqual(calls,['redis.invalid','company.invalid','redis.invalid']);
 drift=true;assert.equal((await invoke(input)).code,409);
 }finally{globalThis.fetch=original;for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
