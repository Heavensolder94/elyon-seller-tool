// Read-only V4.4.3 producer/consumer contract. No raw request data or authority.
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const bounded=(x,n)=>typeof x==='string'&&x.length<=n&&!/[\x00-\x1f\x7f]/.test(x);
const list=x=>Array.isArray(x)?x:[];
const eq=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
const flags=['executionAuthorized','publishAuthorized','feedAuthorized','automaticRetryAllowed','externalStateVerified'];
const statuses=['INVALID','BLOCKED','UNSUPPORTED','INCOMPLETE','UNVERIFIED','WARNING','VALIDATED'];
const contracts={INVENTORY:{version:'1.18.5',source:'sell_inventory_v1_oas3.json',sourceSha256:'a99b7026ba541ff9d3fc6548e901f7005dbcc1602f638fe4d4aa2f95e4266b7e'},FEED:{version:'v1.3.1',source:'sell_feed_v1_oas3.json',sourceSha256:'0a2b0e9c8d4359d45e91c9095f303cffc759cfd3ec0fcee41f4b96734da09efb'}};
export function payloadReviewBundleView(bundle,review){
 const t=review?.transportReadiness;
 if(!bundle||!t||bundle.schemaVersion!=='elyon-payload-review-bundle-v4.4.3'||bundle.productId!==t.identity?.productId||bundle.articleNumber!==t.identity?.articleNumber||!hash(bundle.projectionSha256)||bundle.projectionSha256!==review.projectionSha256||bundle.projectionSha256!==t.projectionSha256||bundle.reviewBindingSha256!==t.reviewBindingSha256||bundle.categoryId!==review.categoryId||bundle.categoryId!==t.categoryId||!hash(bundle.bundleSha256)||flags.some(k=>bundle[k]!==false)||!eq(bundle.selectedSkus,t.selectedSkus)||!eq(bundle.selectedVariantKeys,t.selectedVariantKeys)||bundle.selectedSkus.length>250||bundle.selectedVariantKeys.length>250)return null;
 const skus=new Set([bundle.articleNumber,...bundle.selectedSkus,...list(review.variants).map(x=>x?.sku)]),keys=new Set([...bundle.selectedVariantKeys,...list(review.variants).map(x=>x?.key)]);
 const result={schemaVersion:bundle.schemaVersion,productId:bundle.productId,articleNumber:bundle.articleNumber,projectionSha256:bundle.projectionSha256,reviewBindingSha256:bundle.reviewBindingSha256,bundleSha256:bundle.bundleSha256,...Object.fromEntries(flags.map(k=>[k,false]))};
 for(const [key,transport,scope] of [['inventory','INVENTORY','EXACT_CANONICAL_JSON'],['feed','FEED','EXACT_FILE_BYTES'],['categoryCsv','FEED','CATEGORY_CSV_OFFLINE']]){
  const entry=bundle[key],r=entry?.report,contract=contracts[transport];
  if(!entry||!statuses.includes(entry.status))return null;
  if(r===null){
   if(!['BLOCKED','UNSUPPORTED'].includes(entry.status)||!bounded(entry.code,100)||!entry.code)return null;
   result[key]={status:entry.status,code:entry.code,report:null};continue;
  }
  if(entry.code!==null||!r||entry.status!==r.status||r.schemaVersion!=='elyon-payload-validation-v4.4.3'||r.ruleRevision!=='4.4.3.1'||r.transport!==transport||r.scope!==scope||Object.keys(contract).some(k=>r.contract?.[k]!==contract[k])||!hash(r.validationSha256)||!hash(r.payloadSha256)||r.officialFullSchemaValidated!==false||r.uploadVerified!==false||flags.some(k=>r[k]!==false)||r.blocking!==true||r.nextAction!=='REVIEW_VALIDATION_ISSUES'||!Array.isArray(r.issues)||!r.issues.length||r.issues.length>200)return null;
  if(key==='inventory'&&t.approvalPreparation?.requestPlanSha256&&r.payloadSha256!==t.approvalPreparation.requestPlanSha256)return null;
  if(key==='inventory'&&t.payloadValidation&&r.validationSha256!==t.payloadValidation.validationSha256)return null;
  if(key==='categoryCsv'&&review.csv?.previewSha256&&r.payloadSha256!==review.csv.previewSha256)return null;
  if(key!=='inventory'&&!hash(r.bytesSha256)||key==='categoryCsv'&&r.bytesSha256!==r.payloadSha256)return null;
  const issues=[];
  for(const i of r.issues){
   if(!i||!statuses.includes(i.status)||i.status==='VALIDATED'||!bounded(i.code,100)||!bounded(i.field,4096)||!bounded(i.level,40)||i.sku!==null&&!skus.has(i.sku)||i.variantKey!==null&&!keys.has(i.variantKey)||i.blocking!==(i.status!=='WARNING')||!bounded(i.description,500)||i.missingEvidence!==null&&!bounded(i.missingEvidence,200)||!['REVIEW_WARNING','VERIFY_EVIDENCE','CORRECT_AND_REVALIDATE'].includes(i.nextAction))return null;
   issues.push({code:i.code,field:i.field,sku:i.sku,variantKey:i.variantKey,status:i.status,level:i.level,blocking:i.blocking,nextAction:i.nextAction});
  }
  const expected=statuses.find(s=>issues.some(i=>i.status===s))??'VALIDATED';
  const sentinel=key==='inventory'?'LIVE_PROVIDER_NOT_VERIFIED':key==='feed'?'FX_DRAFT_PROVIDER_COMPATIBILITY_UNVERIFIED':'FX_LISTING_COMPATIBILITY_UNVERIFIED';
  if(r.status!==expected||!issues.some(i=>i.code===sentinel||i.code==='DIAGNOSTIC_LIMIT'))return null;
  result[key]={status:entry.status,code:null,report:{status:r.status,payloadSha256:r.payloadSha256,validationSha256:r.validationSha256,contractVersion:r.contract.version,issues,blocking:true}};
 }
 return result;
}
export function payloadReviewBundleText(view){
 if(!view)return 'V4.4.3 Payload-Nachweis unbekannt. Keine Übertragung.';
 return [['Inventory',view.inventory],['Feed',view.feed],['Kategorie-CSV',view.categoryCsv]].map(([name,entry])=>name+': '+entry.status+' · '+(entry.code??entry.report.issues.slice(0,6).map(i=>[i.sku,i.variantKey,i.field,i.code].filter(Boolean).join(' / ')).join(' · '))).join(' | ')+' · Keine produktive Freigabe.';
}
