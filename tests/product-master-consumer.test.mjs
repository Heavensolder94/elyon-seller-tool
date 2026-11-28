import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptLegacyProductForSeller,
  adaptProductMasterForSeller,
  fetchCompanyOsProductMaster,
  isProductMasterV2Record,
  loadProductMasterForSeller,
  resolveProductMasterRecord,
} from "../lib/product-master-consumer.js";

const canonical = {
  schemaVersion: "elyon-product-master-v2",
  ownerSystem: "elyon_company_os",
  identity: {
    productId: "company-product-1",
    companyOsProductId: "company-product-1",
    productKey: "product-key-1",
    articleNumber: "ELY-001274",
    sku: "ELY-001274",
    supplierSku: "SUP-RED-L",
    sourceImportId: "nova-import-1",
  },
  product: {
    title: "Organizer",
    description: "Kanonische Beschreibung aus Company OS.",
    images: ["https://example.test/organizer.jpg"],
    variants: [
      { sku: "ELY-001274-01", supplierSku: "SUP-RED-L", color: "Rot" },
      { sku: "ELY-001274-02", supplierSku: "SUP-BLUE-L", color: "Blau" },
    ],
    supplier: { name: "Supplier", url: "https://supplier.example/organizer" },
  },
  workflow: { stage: "ebay_draft", status: "ebay_draft_created", reviewStatus: "approved", active: true, rejected: false },
  economics: { currency: "EUR", buyPrice: 10, shippingCost: 2, salePrice: 29.99, fees: 4.2, profit: 13.79, marginPercent: 46.0, minimumRulePassed: true, source: "company_os" },
  market: { decision: "GO", score: 88 },
  compliance: { status: "approved" },
  listing: { title: "Organizer Listing", descriptionHtml: "<p>Company OS Listing</p>", status: "draft" },
  channels: { ebay: { status: "DRAFT", sku: "ELY-001274", offerId: "offer-1274", listingId: null, listingUrl: null, publishedAt: null, withdrawn: false } },
  timestamps: { createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z" },
};

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
  };
}

test("v2 adapter preserves canonical identity, economics, supplier SKU and eBay channel state", () => {
  const product = adaptProductMasterForSeller(canonical);
  assert.equal(product.articleNumber, "ELY-001274");
  assert.equal(product.sku, "ELY-001274");
  assert.equal(product.supplierSku, "SUP-RED-L");
  assert.equal(product.pricing.salePrice, 29.99);
  assert.equal(product.pricing.profit, 13.79);
  assert.equal(product.pricing.calculationSource, "company_os");
  assert.equal(product.channels.ebay.offerId, "offer-1274");
  assert.equal(product.channels.ebay.status, "DRAFT");
  assert.equal(product.listing.offerId, "offer-1274");
  assert.equal(product.variants[0].sku, "ELY-001274-01");
  assert.equal(product.variants[0].supplierSku, "SUP-RED-L");
  assert.equal(product.sellerView.role, "consumer");
});

test("raw imports and records without a permanent Elyon identity never become seller products", () => {
  assert.equal(isProductMasterV2Record({ schemaVersion: "elyon-product-master-v2", identity: { sourceImportId: "nova-raw" } }), false);
  assert.equal(adaptProductMasterForSeller({ schemaVersion: "elyon-product-master-v2", identity: { sku: "SUP-123" }, product: {} }), null);
});

test("legacy v1 data remains readable only as an explicitly labeled compatibility view", () => {
  const product = adaptLegacyProductForSeller({
    id: "legacy-product-1",
    articleNumber: "ELY-001274",
    sku: "ELY-001274",
    supplierSku: "SUP-RED-L",
    title: "Legacy Organizer",
    pricing: { buyPrice: 10, salePrice: 29.99 },
  });
  assert.equal(product.articleNumber, "ELY-001274");
  assert.equal(product.supplierSku, "SUP-RED-L");
  assert.equal(product.sellerView.role, "compatibility");
  assert.equal(product.sellerView.sourceOfTruth, "legacy_seller_product_master");
});

test("Company OS fetch uses the read-only v2 endpoint and sync code without issuing a write", async () => {
  const calls = [];
  const result = await fetchCompanyOsProductMaster({
    env: { ELYON_COMPANY_OS_URL: "https://company-os.example", COMPANY_OS_SYNC_CODE: "sync-secret" },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return response({ ok: true, products: [canonical], contract: { sellerToolRole: "consumer" } });
    },
  });
  assert.equal(result.records.length, 1);
  assert.match(calls[0].url, /\/api\/product-master-v2$/);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.headers["X-Elyon-Sync-Code"], "sync-secret");
  assert.equal(calls[0].init.body, undefined);
});

test("same Company OS identity updates one consumer view without generating a new Elyon ID", async () => {
  const updated = { ...canonical, product: { ...canonical.product, title: "Organizer aktualisiert" } };
  const first = await loadProductMasterForSeller({
    env: { COMPANY_OS_SYNC_CODE: "sync-secret" },
    fetchImpl: async () => response({ ok: true, products: [canonical] }),
    readCache: async () => [],
    writeCache: async () => ({ persisted: false, mode: "test" }),
  });
  const second = await loadProductMasterForSeller({
    env: { COMPANY_OS_SYNC_CODE: "sync-secret" },
    fetchImpl: async () => response({ ok: true, products: [updated] }),
    readCache: async () => [],
    writeCache: async () => ({ persisted: false, mode: "test" }),
  });
  assert.equal(first.products[0].articleNumber, "ELY-001274");
  assert.equal(second.products[0].articleNumber, "ELY-001274");
  assert.equal(second.products[0].id, "company-product-1");
  assert.equal(second.products[0].title, "Organizer aktualisiert");
});

test("temporary Company OS outage falls back to a visibly stale v2 cache without deleting it", async () => {
  const result = await loadProductMasterForSeller({
    env: { COMPANY_OS_SYNC_CODE: "sync-secret" },
    fetchImpl: async () => response({ ok: false, error: "upstream_unavailable", message: "temporarily unavailable" }, 503),
    readCache: async () => [canonical],
  });
  assert.equal(result.freshness, "stale");
  assert.equal(result.source, "company_os_product_master_v2_cache");
  assert.equal(result.products[0].articleNumber, "ELY-001274");
  assert.equal(result.products[0].sellerView.freshness, "stale");
});

test("successful empty Company OS snapshots replace the v2 cache", async () => {
  const writes = [];
  const empty = await loadProductMasterForSeller({
    env: { COMPANY_OS_SYNC_CODE: "sync-secret" },
    fetchImpl: async () => response({ ok: true, products: [] }),
    readCache: async () => [canonical],
    writeCache: async (records) => {
      writes.push(records);
      return { persisted: true, mode: "test" };
    },
  });
  assert.deepEqual(empty.products, []);
  assert.deepEqual(writes, [[]]);

  await assert.rejects(
    () => loadProductMasterForSeller({
      env: { COMPANY_OS_SYNC_CODE: "sync-secret" },
      fetchImpl: async () => response({ ok: false, error: "upstream_unavailable" }, 503),
      readCache: async () => writes.at(-1),
      readLegacy: async () => [],
    }),
    (error) => error.code === "upstream_unavailable",
  );
});

test("Company OS review stages never become final Seller approval", () => {
  for (const stage of ["product_review", "market_review", "review"]) {
    const product = adaptProductMasterForSeller({
      ...canonical,
      workflow: { stage, status: "pending_review", active: true, rejected: false },
      channels: { ebay: { status: "NOT_STARTED", withdrawn: false } },
    });
    assert.equal(product.readiness.state, "needs_review");
    assert.equal(product.approval.companyOsApproved, false);
  }
});

test("order/listing identity resolution is deterministic and never uses title matching", () => {
  assert.equal(resolveProductMasterRecord([canonical], { listingId: "offer-1274" }), canonical);
  assert.equal(resolveProductMasterRecord([canonical], { offerId: "offer-1274" }), canonical);
  assert.equal(resolveProductMasterRecord([canonical], { sku: "SUP-RED-L" }), canonical);
  assert.equal(resolveProductMasterRecord([canonical], { sku: "ELY-001274-02" }), canonical);
  assert.equal(resolveProductMasterRecord([canonical], { title: "Organizer" }), null);
});

test("ambiguous supplier SKUs never select an arbitrary Elyon product", () => {
  const other = structuredClone(canonical);
  other.identity = {
    ...other.identity,
    productId: "company-product-2",
    companyOsProductId: "company-product-2",
    articleNumber: "ELY-001275",
    sku: "ELY-001275",
  };
  other.product = { ...other.product, title: "Other Organizer" };
  assert.equal(resolveProductMasterRecord([canonical, other], { supplierSku: "SUP-RED-L" }), null);
});

test("ambiguous eBay listing IDs never select an arbitrary Elyon product", () => {
  const first = structuredClone(canonical);
  const second = structuredClone(canonical);
  first.channels.ebay.listingId = "listing-conflict";
  second.identity = {
    ...second.identity,
    productId: "company-product-2",
    companyOsProductId: "company-product-2",
    articleNumber: "ELY-001275",
    sku: "ELY-001275",
  };
  second.channels.ebay.listingId = "listing-conflict";
  assert.equal(resolveProductMasterRecord([first, second], { listingId: "listing-conflict" }), null);
});

test("conflicting identity fields never override each other by precedence", () => {
  const first = structuredClone(canonical);
  const second = structuredClone(canonical);
  second.identity = {
    ...second.identity,
    productId: "company-product-2",
    companyOsProductId: "company-product-2",
    articleNumber: "ELY-001275",
    sku: "ELY-001275",
  };
  second.channels.ebay.offerId = "offer-1275";
  assert.equal(resolveProductMasterRecord([first, second], {
    sku: "ELY-001274",
    offerId: "offer-1275",
  }), null);
});

test("withdrawn Company OS channel state remains visible to the Seller consumer", () => {
  const withdrawn = {
    ...canonical,
    channels: { ebay: { ...canonical.channels.ebay, status: "LIVE", withdrawn: true, offerId: "offer-1274" } },
  };
  const product = adaptProductMasterForSeller(withdrawn);
  assert.equal(product.channels.ebay.withdrawn, true);
  assert.equal(product.channels.ebay.status, "WITHDRAWN");
  assert.equal(product.listing.status, "WITHDRAWN");
  assert.equal(product.approval.companyOsApproved, false);
});

test("canonical structured option and SKU image refs survive Seller Tool projection and cached reload", async()=>{
 const red="https://example.test/red.jpg",side="https://example.test/side.jpg";
 const record=structuredClone(canonical);
 record.product.variantGroups=[{id:"color",name:"Farbe",options:[{value:"Rot",image:red,imageUrls:[red,side,"javascript:alert(1)"],variantImageStatus:"detected",variantImageSource:"supplier_option"},{value:"Blau",image:red,imageUrls:[red],variantImageStatus:"manual_removed",variantImageSource:"company_os_manual"}]}];
 record.product.variantCombinations=[{sku:"SUP-RED-L",selections:{Farbe:"Rot"},image:red,imageUrls:[red,side],variantImageStatus:"detected",variantImageSource:"supplier_sku"}];
 const product=adaptProductMasterForSeller(record);
 assert.deepEqual(product.variantGroups[0].options[0].imageUrls,[red,side]);
 assert.deepEqual(product.variantGroups[0].options[1].imageUrls,[]);
 assert.deepEqual(product.logistics.variantCombinations[0].imageUrls,[red,side]);
 assert.equal(product.variantCombinations[0].supplierSku,"SUP-RED-L");
 assert.equal(product.articleNumber,canonical.identity.articleNumber);
 const loaded=await loadProductMasterForSeller({env:{COMPANY_OS_SYNC_CODE:"sync-secret"},fetchImpl:async()=>response({ok:false},503),readCache:async()=>[record]});
 assert.equal(loaded.freshness,"stale");
 assert.deepEqual(loaded.products[0].product.variantCombinations[0].imageUrls,[red,side]);
});

test('V4.3 explicit Seller Tool review uses exact Company OS identity and rejects authority flags',async()=>{
 const {fetchCompanyOsAdvancedListingReview}=await import('../lib/product-master-consumer.js');
 const id='product_fixture',env={ELYON_COMPANY_OS_URL:'https://fixture.invalid',ELYON_COMPANY_OS_SYNC_CODE:'fixture-sync'};
 const result={schemaVersion:'elyon-advanced-listing-review-v4.3',request:{targetKind:'product',targetId:id},projectionSha256:'a'.repeat(64),route:'REVIEW_REQUIRED',issues:[],executionAuthorized:false,publishAuthorized:false,feedAuthorized:false,readyForExport:false,gpsrCompliant:false,uploadVerified:false,releaseEligible:false};
 const fetchImpl=async(url,opts)=>{assert.equal(url.searchParams.get('advancedReview'),'1');assert.equal(url.searchParams.get('targetId'),id);assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');return new Response(JSON.stringify(result));};
 assert.deepEqual(await fetchCompanyOsAdvancedListingReview({productId:id,env,fetchImpl}),result);
 await assert.rejects(fetchCompanyOsAdvancedListingReview({productId:id,env,fetchImpl:async()=>new Response(JSON.stringify({...result,publishAuthorized:true}))}));
 await assert.rejects(fetchCompanyOsAdvancedListingReview({productId:id,env,fetchImpl:async()=>new Response(JSON.stringify({...result,request:{targetKind:'product',targetId:'other'}}))}));
});

test('V4.3.3 accepts nested read-only identifier results, rejects nested authority',async()=>{
 const {identifierReviewSummary}=await import('../lib/product-master-consumer.js');
 const identifiers={requirements:{status:'CURRENT',rules:{ean:{requirement:'REQUIRED'}}},rows:[{variantKey:'sku:1',scope:'VARIANT',results:{ean:{state:'MISSING'}}}],issues:[{code:'IDENTIFIER_REQUIRED_MISSING',field:'identifiers.ean',variantKey:'sku:1'}],manualReviewRequired:true,productionVerified:false,executionAuthorized:false,csv:{status:'FORMAT_UNVERIFIED',executionAuthorized:false,uploadVerified:false,issues:[]},inventory:{status:'IDENTIFIER_REVIEW_REQUIRED',executionAuthorized:false,transportCompatibilityVerified:false,productionVerified:false,issues:[]}};
 const result=identifierReviewSummary({identifiers});
 assert.equal(result.rules.ean.requirement,'REQUIRED');assert.equal(result.rows[0].results.ean.state,'MISSING');assert.equal(result.executionAuthorized,false);
 assert.throws(()=>identifierReviewSummary({identifiers:{...identifiers,csv:{...identifiers.csv,uploadVerified:true}}}));
 assert.equal(identifierReviewSummary({}).status,'UNKNOWN');
});

test('V4.3.4 CSV readiness is additive and never grants upload or fallback',async()=>{
 const {csvReadinessSummary}=await import('../lib/product-master-consumer.js');
 const csvReadiness={schemaOrigin:'DYNAMIC_DERIVED',offlineReviewAvailable:true,structurallyValid:true,formatCompatibility:'UNVERIFIED',uploadCompatibility:'UNKNOWN',manualReviewRequired:true,executionAuthorized:false,blockingIssues:[]};
 const review={csvReadiness,csv:{executionAuthorized:false,uploadVerified:false,readyForOfflineReview:true},automaticFallbackAllowed:false,processingPaths:{operative:'BLOCKED'}};
 assert.equal(csvReadinessSummary(review).offlineReviewAvailable,true);
 assert.equal(csvReadinessSummary({}).schemaOrigin,'UNKNOWN');
 assert.throws(()=>csvReadinessSummary({...review,csv:{...review.csv,uploadVerified:true}}));
 assert.throws(()=>csvReadinessSummary({...review,automaticFallbackAllowed:true}));
 assert.throws(()=>csvReadinessSummary({...review,csvReadiness:{...csvReadiness,executionAuthorized:true}}));
});

test('oversize canonical variant source is explicit, not a clipped 250-row source',()=>{
 const source=structuredClone(canonical);
 source.product.variantCombinations=Array.from({length:251},(_,i)=>({sku:'ELY-001274-'+i,selections:{Farbe:'Wert'+i}}));
 const p=adaptProductMasterForSeller(source);
 assert.equal(p.variantCapacity.status,'CAPACITY_EXCEEDED');
 assert.equal(p.variantCapacity.observedCombinationCount,251);
 assert.equal(p.variantCombinations.length,0);
 assert.equal(p.raw.product.variantCombinations.length,251);
 assert.equal(p.approval.companyOsApproved,false);
 assert.equal(p.approval.automaticListingAllowed,false);
});
test('V4.3.5 variant report preserves diagnostics and rejects authority',async()=>{
 const {variantReadinessSummary}=await import('../lib/product-master-consumer.js');
 const counts=Object.fromEntries(['storedCombinationCount','projectedCombinationCount','reportedRowCount','availableCount','unavailableCount','availabilityUnknownCount','economicsBoundCount','economicsBlockedCount','eligibleForReviewCount','explicitSelectionCount','selectionUnverifiedCount'].map(k=>[k,0]));
 const variantReadiness={...counts,schemaVersion:'elyon-variant-readiness-v4.3.5',capacity:{status:'WITHIN_EXISTING_LIMIT',executionAuthorized:false,sourceTotalVerified:false},limits:{executionAuthorized:false,transportVerified:false},rows:[],suggestedVariantKeys:[],manualReviewRequired:true,automaticSelectionApplied:false,transportVerified:false,productionVerified:false,executionAuthorized:false};
 assert.equal(variantReadinessSummary({variantReadiness}).status,'WITHIN_EXISTING_LIMIT');
 assert.equal(variantReadinessSummary({}).status,'UNKNOWN');
 assert.throws(()=>variantReadinessSummary({variantReadiness:{...variantReadiness,automaticSelectionApplied:true}}));
 assert.throws(()=>variantReadinessSummary({variantReadiness:{...variantReadiness,transportVerified:true}}));
});

test('250 internal variants are preserved by Seller Tool, but offer compatibility stays under review',()=>{
 const source=structuredClone(canonical);
 source.product.variantCombinations=Array.from({length:250},(_,i)=>({sku:'ELY-001274-'+String(i+1).padStart(2,'0'),supplierSku:'supplier-'+i,selections:{Farbe:'F'+i%10,Größe:'G'+Math.floor(i/10)},purchasePrice:12,stock:3,imageUrls:['https://fixture.invalid/'+i+'.jpg'],variantImageSource:'supplier_sku',variantImageStatus:'detected'}));
 const p=adaptProductMasterForSeller(source);
 assert.equal(p.variantCombinations.length,250);
 assert.deepEqual(p.variantCombinations.map(v=>v.sku),source.product.variantCombinations.map(v=>v.sku));
 assert.equal(p.variantCombinations[249].supplierSku,'supplier-249');
 assert.equal(p.approval.companyOsApproved,false);
 assert.equal(p.approval.automaticListingAllowed,false);
});

test('manual subset report is a read-only diagnostic bound to exact selected canonical rows',async()=>{
 const {variantReadinessSummary}=await import('../lib/product-master-consumer.js');
 const rows=[{variantKey:'a',sku:'ELY-001274-01',selected:true,executionAuthorized:false},{variantKey:'b',sku:'ELY-001274-02',selected:true,executionAuthorized:false},{variantKey:'c',sku:'ELY-001274-03',selected:false,executionAuthorized:false}];
 const counts=Object.fromEntries(['storedCombinationCount','projectedCombinationCount','reportedRowCount','availableCount','unavailableCount','availabilityUnknownCount','economicsBoundCount','economicsBlockedCount','eligibleForReviewCount','explicitSelectionCount','selectionUnverifiedCount'].map(k=>[k,0]));
 Object.assign(counts,{storedCombinationCount:3,projectedCombinationCount:3,reportedRowCount:3,explicitSelectionCount:2});
 const variantReadiness={...counts,schemaVersion:'elyon-variant-readiness-v4.3.5',capacity:{status:'WITHIN_EXISTING_LIMIT',executionAuthorized:false,sourceTotalVerified:false},limits:{executionAuthorized:false,transportVerified:false},rows,suggestedVariantKeys:[],manualReviewRequired:true,automaticSelectionApplied:false,transportVerified:false,productionVerified:false,executionAuthorized:false};
 const selectedOfferReview={status:'STRUCTURAL_SUBSET_REVIEW',source:'saved_company_os_manual',sourceCount:3,selectedCount:2,excludedCount:1,selectedKeys:['a','b'],issues:[],csv:{roundtripVerified:true,rows:[{CustomLabel:'ELY-001274'},{CustomLabel:rows[0].sku},{CustomLabel:rows[1].sku}],executionAuthorized:false,uploadVerified:false,readyForOfflineReview:false},inventory:{executionAuthorized:false,identifierCompatibilityVerified:false,variantSKUs:rows.slice(0,2).map(v=>v.sku),items:rows.slice(0,2).map(v=>({sku:v.sku}))},automaticSelectionApplied:false,manualReviewRequired:true,executionAuthorized:false,uploadVerified:false,transportVerified:false};
 const review={variantReadiness,selectedOfferReview},r=variantReadinessSummary(review);
 assert.equal(r.selectedOfferReview.selectedCount,2);assert.equal(r.selectedOfferReview.csvRoundtripVerified,true);assert.equal(r.selectedOfferReview.executionAuthorized,false);
 assert.throws(()=>variantReadinessSummary({...review,selectedOfferReview:{...selectedOfferReview,selectedKeys:['a','c']}}));
 assert.throws(()=>variantReadinessSummary({...review,selectedOfferReview:{...selectedOfferReview,csv:{...selectedOfferReview.csv,readyForOfflineReview:true}}}));
 assert.throws(()=>variantReadinessSummary({...review,selectedOfferReview:{...selectedOfferReview,inventory:{...selectedOfferReview.inventory,variantSKUs:[rows[0].sku,rows[2].sku]}}}));
});

test('V4.4 transport contract reports only read-only preparation and rejects unsafe or cross-bound data',async()=>{
 const {transportReadinessSummary}=await import('../lib/product-master-consumer.js');
 const projectionSha256='a'.repeat(64),categoryId='15687',sku='ELY-001274';
 const t={schemaVersion:'elyon-transport-readiness-v4.4',mode:'READ_ONLY_PREPARATION',phase:'A_OFFLINE',action:'CREATE_UNPUBLISHED_OFFER',status:'REVIEW_REQUIRED',candidate:'INVENTORY_SINGLE_REVIEW',identity:{articleNumber:sku},marketplace:'EBAY_DE',categoryId,projectionSha256,sourceCombinationCount:0,selectedSkus:[sku],selectedVariantKeys:[],expectedExternalResult:'UNPUBLISHED_OFFER',manualReviewRequired:true,accountReadiness:'UNVERIFIED',blockers:['REGULATORY_EVIDENCE_REVIEW'],reviewBindingSha256:'b'.repeat(64),payloadSha256:'c'.repeat(64),plannedOperations:{preflight:[],draft:[{method:'POST',operationId:'createOffer',resource:'/sell/inventory/v1/offer',write:true}],readback:[]},storedExternalReferences:null,inventoryPreview:{status:'STRUCTURAL_PAYLOAD_PREVIEW_ONLY',regulatoryPayloadComplete:false,officialFullSchemaValidated:false,executionAuthorized:false,inventoryPayload:{condition:'NEW'},offerPayload:{sku,categoryId,marketplaceId:'EBAY_DE'}},feed:{offlineCsvNeverUpload:true,sellerHubDraftVerified:false,fxDraft:'ACCOUNT_BLOCKED_BAF_ERROR_5',fxListing:'FORMAT_AND_ACCOUNT_UNVERIFIED'},media:{privateStorageVerified:false,documentIds:[]}};
 for(const k of ['executionAuthorized','operationalEnabled','liveVerified','accountVerified','oauthVerified','uploadVerified','fallbackAllowed','publishAuthorized','feedAuthorized','readyForExport','releaseEligible','automaticFallbackAllowed','liveTestApproved','approvalVerified','externalStateVerified','retryAllowed'])t[k]=false;
 const review={projectionSha256,categoryId,inventory:{items:[{sku}]},transportReadiness:t};
 const x=transportReadinessSummary(review);assert.equal(x.candidate,'INVENTORY_SINGLE_REVIEW');assert.equal(x.structuralInventoryPreviewAvailable,true);assert.equal(x.inventoryPreview,undefined);assert.equal(x.executionAuthorized,false);
 assert.equal(transportReadinessSummary({}).status,'UNKNOWN');
 for(const patch of [{executionAuthorized:true},{approvalVerified:true},{projectionSha256:'d'.repeat(64)},{selectedSkus:['OTHER']},{feed:{...t.feed,sellerHubDraftVerified:true}},{plannedOperations:{...t.plannedOperations,draft:[{method:'POST',operationId:'publishOffer',resource:'/sell/inventory/v1/offer/{id}/publish',write:true}]}},{media:{...t.media,documentIds:['fixture']}}])assert.throws(()=>transportReadinessSummary({...review,transportReadiness:{...t,...patch}}),{code:'invalid_transport_readiness_contract'});
});

test('V4.4 reservation diagnostics remain historical and cannot authorize execution',async()=>{
 const {inventoryReservationSummary}=await import('../lib/product-master-consumer.js');
 const articleNumber='ELY-000123',productId='product-1';
 const x={schemaVersion:'elyon-inventory-reservation-status-v4.4',productId,articleNumber,status:'UNPUBLISHED_OFFER_VERIFIED',taskId:'12345678-1234-4234-8234-123456789abc',payloadSha256:'a'.repeat(64),sourceRevisionSha256:'b'.repeat(64),categoryId:'123',skus:[articleNumber],observedOfferIds:['offer-1'],executionAuthorized:false,publishAuthorized:false,automaticRetryAllowed:false,externalStateVerified:false,sellerHubDraftVerified:false};
 const review={request:{targetId:productId},transportReadiness:{identity:{articleNumber}},inventoryReservation:x};
 const summary=inventoryReservationSummary(review);
 assert.equal(summary.status,x.status);assert.equal(summary.historicalEvidenceOnly,true);assert.equal(summary.externalStateVerified,false);
 assert.equal(inventoryReservationSummary({}).status,'UNKNOWN');
 for(const patch of [{productId:'foreign'},{articleNumber:'ELY-999999'},{executionAuthorized:true},{externalStateVerified:true},{automaticRetryAllowed:true},{status:'SUBMITTING'},{observedOfferIds:[]}]){
  assert.throws(()=>inventoryReservationSummary({...review,inventoryReservation:{...x,...patch}}),{code:'invalid_inventory_reservation_contract'});
 }
});

test('V4.4 approval preparation binds exact product and plan and rejects purported execution grants',async()=>{
 const {transportReadinessSummary}=await import('../lib/product-master-consumer.js');
 const projectionSha256='a'.repeat(64),categoryId='15687',sku='ELY-001274',productId='product-1',reviewBindingSha256='b'.repeat(64);
 const t={schemaVersion:'elyon-transport-readiness-v4.4',mode:'READ_ONLY_PREPARATION',phase:'A_OFFLINE',action:'CREATE_UNPUBLISHED_OFFER',status:'REVIEW_REQUIRED',candidate:'INVENTORY_SINGLE_REVIEW',identity:{articleNumber:sku,productId},marketplace:'EBAY_DE',categoryId,projectionSha256,sourceCombinationCount:0,selectedSkus:[sku],selectedVariantKeys:[],expectedExternalResult:'UNPUBLISHED_OFFER',manualReviewRequired:true,accountReadiness:'UNVERIFIED',blockers:[],reviewBindingSha256,payloadSha256:'c'.repeat(64),plannedOperations:{preflight:[],draft:[{method:'POST',operationId:'createOffer',resource:'/sell/inventory/v1/offer',write:true}],readback:[]},storedExternalReferences:null,inventoryPreview:{status:'STRUCTURAL_PAYLOAD_PREVIEW_ONLY',regulatoryPayloadComplete:false,officialFullSchemaValidated:false,executionAuthorized:false,inventoryPayload:{condition:'NEW'},offerPayload:{sku,categoryId,marketplaceId:'EBAY_DE'}},feed:{offlineCsvNeverUpload:true,sellerHubDraftVerified:false,fxDraft:'ACCOUNT_BLOCKED_BAF_ERROR_5',fxListing:'FORMAT_AND_ACCOUNT_UNVERIFIED'},media:{privateStorageVerified:false,documentIds:[]}};
 for(const k of ['executionAuthorized','operationalEnabled','liveVerified','accountVerified','oauthVerified','uploadVerified','fallbackAllowed','publishAuthorized','feedAuthorized','readyForExport','releaseEligible','automaticFallbackAllowed','liveTestApproved','approvalVerified','externalStateVerified','retryAllowed'])t[k]=false;
 const a={status:'BLOCKED',productId,articleNumber:sku,productRevision:2,productUpdatedAt:null,listingRevision:null,listingUpdatedAt:null,projectionSha256,reviewBindingSha256,requestPlanSha256:'d'.repeat(64),environment:'production',marketplace:'EBAY_DE',transport:'INVENTORY',action:t.action,selectedSkus:[sku],approvalId:null,approvalPersisted:false,executionAuthorized:false,publishAuthorized:false,confirmationAllowed:false};
 const review={projectionSha256,categoryId,inventory:{items:[{sku}]},transportReadiness:{...t,approvalPreparation:a}};
 assert.equal(transportReadinessSummary(review).approvalPreparation.requestPlanSha256,a.requestPlanSha256);
 for(const patch of [{productId:'other'},{selectedSkus:['OTHER']},{reviewBindingSha256:'e'.repeat(64)},{requestPlanSha256:'bad'},{approvalId:'fake'},{executionAuthorized:true},{confirmationAllowed:true},{approvalPersisted:true}])assert.throws(()=>transportReadinessSummary({...review,transportReadiness:{...t,approvalPreparation:{...a,...patch}}}),{code:'invalid_transport_readiness_contract'});
});

test('V4.4.1 read-only approval boundary never authorizes Seller Tool or Jarvis',async()=>{
 const {draftApprovalStatusSummary,draftApprovalReviewText}=await import('../lib/product-master-consumer.js');
 const {assertSellerDraftTransportActivated}=await import('../lib/ebay-draft-approval-boundary.js');
 assert.throws(assertSellerDraftTransportActivated,{code:'v441_transport_activation_blocked'});
 const identity={productId:'product-1',articleNumber:'ELY-123456'},reviewBindingSha256='a'.repeat(64),requestPlanSha256='b'.repeat(64),selectedSkus=[identity.articleNumber];
 const approvalStatus={schemaVersion:'elyon-draft-approval-v4.4.1',status:'BLOCKED',approvalId:null,approvalPersisted:false,...identity,productRevision:2,listingRevision:3,selectedSkus,transport:'INVENTORY',action:'CREATE_UNPUBLISHED_OFFER',reviewBindingSha256,requestPlanSha256,expiresAtMs:null,transportReservationId:null,auditRef:null,blockers:['PRODUCTIVE_APPROVAL_DISABLED'],executionAuthorized:false,publishAuthorized:false,automaticApprovalAllowed:false,liveEnabled:false};
 const transportReadiness={identity,reviewBindingSha256,selectedSkus,approvalPreparation:{requestPlanSha256,productRevision:2,listingRevision:3},approvalStatus};
 assert.equal(draftApprovalStatusSummary({transportReadiness}).status,'BLOCKED');assert.equal(draftApprovalStatusSummary({}).status,'UNKNOWN');
 const enriched={...approvalStatus,issuerType:'MANUAL',riskClass:'STANDARD_REVIEW'};
 const summary=draftApprovalStatusSummary({transportReadiness:{...transportReadiness,approvalStatus:enriched}});
 assert.equal(summary.issuerType,'MANUAL');assert.equal(summary.riskClass,'STANDARD_REVIEW');assert.equal(summary.expiresAtMs,null);assert.match(draftApprovalReviewText(summary),/Listingrevision: 3/);
 assert.throws(()=>draftApprovalStatusSummary({transportReadiness:{...transportReadiness,approvalStatus:{...enriched,issuerType:'RULE'}}}),{code:'invalid_draft_approval_status'});
 assert.throws(()=>draftApprovalStatusSummary({transportReadiness:{...transportReadiness,approvalStatus:{...enriched,riskClass:'ELEVATED_REVIEW'}}}),{code:'invalid_draft_approval_status'});
 for(const patch of [{status:'APPROVED'},{approvalId:'fake'},{approvalPersisted:true},{executionAuthorized:true},{publishAuthorized:true},{liveEnabled:true},{productId:'other'},{selectedSkus:['other']},{productRevision:4}])assert.throws(()=>draftApprovalStatusSummary({transportReadiness:{...transportReadiness,approvalStatus:{...approvalStatus,...patch}}}),{code:'invalid_draft_approval_status'});
});

test("Supplier Intelligence is carried from the canonical product as a read-only observation",()=>{
 const evidence={schemaVersion:"elyon-supplier-intelligence-v1",source:"aliexpress",productId:"123",status:"observed",sellerBusiness:{companyName:"Seller",registeredAddress:"Business address",registrationNumber:"001",vatNumber:"002",businessLicenseNumber:"003",shopId:"00123",captureMethod:"manual_image_ocr",source:"aliexpress_credential_image_manual_ocr",ocrConfidence:85,reviewStatus:"manual_review_required",verified:false},comparison:{status:"review_required",verified:false}};
 const result=adaptProductMasterForSeller({...canonical,product:{...canonical.product,supplierIntelligence:evidence}});
 assert.deepEqual(result.supplierIntelligence,evidence);
 assert.equal(result.listing.autonomousPostingAllowed,false);
 assert.equal(result.approval.automaticListingAllowed,false);
 assert.equal(adaptProductMasterForSeller(canonical).supplierIntelligence,null);
});
