import {canonicalRecoveryView,canonicalRecoveryText} from './ebay-canonical-recovery-view.js';
import {payloadReviewBundleView,payloadReviewBundleText} from './ebay-payload-review-view.js';
import { readProductMasterList, writeProductMasterList } from "./product-master-store.js";
import { normalizeProduct } from "./product-master-active.js";

export const PRODUCT_MASTER_V2_SCHEMA = "elyon-product-master-v2";
export const PRODUCT_MASTER_V2_CACHE_KEY = "elyon_product_master_v2_cache";
export const DEFAULT_COMPANY_OS_URL = "https://elyon-company-os.vercel.app";

const ARTICLE_NUMBER_PATTERN = /^ELY-\d{6,}$/i;
const VARIANT_SKU_PATTERN = /^ELY-\d{6,}-\d{2,}$/i;

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, max = 2000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstText(...values) {
  for (const value of values.flat(Infinity)) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return "";
}

function validArticleNumber(value) {
  const candidate = text(value).toUpperCase();
  return ARTICLE_NUMBER_PATTERN.test(candidate) ? candidate : "";
}

function validVariantSku(value) {
  const candidate = text(value).toUpperCase();
  return VARIANT_SKU_PATTERN.test(candidate) ? candidate : "";
}

function canonicalIdentity(record = {}) {
  const identity = object(record.identity || record);
  const articleNumber = validArticleNumber(
    identity.articleNumber || identity.elyonArticleNumber || identity.sku,
  );
  return {
    productId: text(identity.productId),
    companyOsProductId: text(identity.companyOsProductId),
    productKey: text(identity.productKey),
    articleNumber,
    sku: articleNumber || text(identity.sku),
    supplierSku: text(identity.supplierSku),
    sourceImportId: text(identity.sourceImportId),
  };
}

function variantView(variant, articleNumber) {
  const source = object(variant);
  const sku = text(source.sku);
  const supplierSku = firstText(
    source.supplierSku,
    source.supplierSkuId,
    source.skuId,
    sku && !validVariantSku(sku) ? sku : "",
  );
  return {
    ...source,
    ...(sku ? { sku } : {}),
    ...(supplierSku ? { supplierSku } : {}),
    ...(articleNumber ? { articleNumber } : {}),
  };
}

function variantImageRecord(record) {
  const source=object(record);
  if(!Object.hasOwn(source,"imageUrls")&&!source.variantImageStatus)return record;
  const refs=[];
  if(source.variantImageStatus!=="manual_removed"){
    for(const value of [source.image,...array(source.imageUrls)].slice(0,24)){
      if(typeof value!=="string"||value.length>2048)continue;
      try{const url=new URL(value);if(url.protocol!=="https:"||url.username||url.password)continue;url.hash="";if(!refs.includes(url.href))refs.push(url.href);if(refs.length===8)break;}catch{}
    }
  }
  return {...source,image:refs[0]||null,imageUrls:refs};
}
function structuredVariantView(product,articleNumber){
  const rawGroups=array(product.variantGroups),rawCombinations=array(product.variantCombinations),sourceCapacity=product.variantCapacity;
  const observed=Math.max(rawCombinations.length,Number.isSafeInteger(sourceCapacity?.observedCombinationCount)?sourceCapacity.observedCombinationCount:0);
  const exceeded=observed>250||sourceCapacity?.status==='CAPACITY_EXCEEDED'||rawGroups.length>12||rawGroups.some(g=>array(g.options).length>80);
  const capacity={status:exceeded?'CAPACITY_EXCEEDED':sourceCapacity?.status==='BOUNDARY_UNVERIFIED'||rawCombinations.length===250?'BOUNDARY_UNVERIFIED':'WITHIN_EXISTING_LIMIT',observedCombinationCount:observed,receivedCombinationCount:rawCombinations.length,sourceTotalVerified:false,executionAuthorized:false};
  // Never return a clipped offer candidate. Raw canonical record remains a
  // read-only source; oversized projection needs a separate canonical review.
  const groups=exceeded?[]:rawGroups.map(group=>({...group,options:array(group.options).map(variantImageRecord)}));
  const combinations=exceeded?[]:rawCombinations.map(row=>variantImageRecord(variantView(row,articleNumber)));
  return {variantGroups:groups,variantCombinations:combinations,variantCapacity:capacity};
}

function compatibilityReadiness(workflow, channel) {
  const current = object(workflow);
  const stage = text(current.stage).toLowerCase();
  if (current.rejected === true || current.active === false) {
    return { state: "not_ready", score: 0, blockers: ["Company OS hat das Produkt abgelehnt oder deaktiviert."], warnings: [] };
  }
  if (["product_review", "market_review", "review"].includes(stage)) {
    return { state: "needs_review", score: 50, blockers: [], warnings: ["Produkt befindet sich noch im Company-OS-Workflow."] };
  }
  if (["DRAFT", "LIVE"].includes(text(channel.status).toUpperCase())) {
    return { state: "ready_for_manual_listing", score: 100, blockers: [], warnings: [] };
  }
  return { state: "needs_review", score: 60, blockers: [], warnings: ["Company-OS-Listingstatus muss noch geprüft werden."] };
}

function ebayChannelView(channel, articleNumber) {
  const source = object(channel);
  const status = text(source.status).toUpperCase();
  const withdrawn = source.withdrawn === true || /WITHDRAWN|ZURÜCKGEZOGEN/.test(status);
  return {
    ...source,
    ...(withdrawn ? { status: "WITHDRAWN", withdrawn: true } : {}),
    sku: articleNumber,
  };
}

function sellerView(record, meta = {}) {
  const source = object(record);
  const identity = canonicalIdentity(source);
  if (!identity.articleNumber) return null;

  const product = object(source.product);
  const supplier = object(product.supplier);
  const economics = object(source.economics);
  const listing = object(source.listing);
  const workflow = object(source.workflow);
  const market = object(source.market);
  const compliance = object(source.compliance);
  const channel = ebayChannelView(source.channels?.ebay, identity.articleNumber);
  const variants = array(product.variants).map((variant) => variantImageRecord(variantView(variant, identity.articleNumber)));
  const structure=structuredVariantView(product,identity.articleNumber);
  const images = array(product.images).map((value) => text(value, 2500)).filter(Boolean);
  const readiness = (structure.variantCapacity.status==='CAPACITY_EXCEEDED'||structure.variantCombinations.length>100)?{state:'needs_review',score:0,blockers:['Variantenkapazität oder Angebotsgrenze prüfen; keine operative Freigabe aus der Variantenübersicht.'],warnings:[]}:compatibilityReadiness(workflow, channel);

  const pricing = {
    currency: firstText(economics.currency, "EUR") || "EUR",
    buyPrice: numberOrNull(economics.buyPrice),
    shippingCost: numberOrNull(economics.shippingCost),
    salePrice: numberOrNull(economics.salePrice),
    estimatedFees: numberOrNull(economics.fees),
    profit: numberOrNull(economics.profit),
    marginPercent: numberOrNull(economics.marginPercent),
    minimumRulePassed: economics.minimumRulePassed ?? null,
    calculationSource: "company_os",
    source: "company_os",
  };
  const listingView = {
    ...listing,
    title: text(listing.title),
    descriptionHtml: text(listing.descriptionHtml, 20000),
    images: array(listing.images).length ? array(listing.images) : images,
    sku: identity.articleNumber,
    articleNumber: identity.articleNumber,
    offerId: text(channel.offerId) || null,
    ebayItemId: text(channel.listingId) || null,
    listingId: text(channel.listingId) || null,
    status: text(channel.status || listing.status || "not_started"),
    autonomousPostingAllowed: false,
    manualApprovalRequired: true,
  };

  return {
    schemaVersion: PRODUCT_MASTER_V2_SCHEMA,
    source: "elyon_company_os",
    sourceSystem: "elyon_company_os",
    ownerSystem: "elyon_company_os",
    sourceOfTruth: "company_os_canonical_state",
    id: identity.productId || identity.companyOsProductId || identity.articleNumber,
    productId: identity.productId,
    companyOsProductId: identity.companyOsProductId,
    productKey: identity.productKey,
    sourceImportId: identity.sourceImportId,
    articleNumber: identity.articleNumber,
    sku: identity.articleNumber,
    supplierSku: identity.supplierSku || null,
    identity: {
      ...identity,
      source: text(source.identity?.source || "elyon_company_os_article_registry_v1"),
    },
    title: text(product.title) || "Unbenanntes Produkt",
    description: text(product.description, 20000),
    images,
    variants,
    ...structure,
    product: {
      ...product,
      title: text(product.title) || "Unbenanntes Produkt",
      description: text(product.description, 20000),
      images,
      variants,
      ...structure,
      supplier: { ...supplier },
    },
    supplier: { ...supplier },
    economics: { ...economics },
    pricing,
    market: { ...market },
    compliance: { ...compliance },
    workflow: { ...workflow },
    listing: listingView,
    channels: { ebay: channel },
    logistics: { variants, ...structure },
    readiness,
    approval: {
      companyOsApproved: readiness.state === "ready_for_manual_listing",
      manualListingRequired: true,
      automaticListingAllowed: false,
    },
    status: text(workflow.status || listingView.status || "new"),
    raw: source,
    rawServerProduct: source,
    sellerView: {
      role: "consumer",
      sourceOfTruth: "company_os_canonical_state",
      freshness: text(meta.freshness || "fresh"),
      cachedAt: text(meta.cachedAt),
    },
    createdAt: text(source.timestamps?.createdAt),
    updatedAt: text(source.timestamps?.updatedAt),
  };
}

export function isProductMasterV2Record(record = {}) {
  const identity = canonicalIdentity(record);
  return text(record.schemaVersion) === PRODUCT_MASTER_V2_SCHEMA && Boolean(identity.articleNumber);
}

export function adaptProductMasterForSeller(record, options = {}) {
  if (!isProductMasterV2Record(record)) return null;
  return sellerView(record, options);
}

export function adaptLegacyProductForSeller(record, options = {}) {
  const normalized = normalizeProduct(record);
  if (!validArticleNumber(normalized.articleNumber || normalized.sku)) return null;
  return {
    ...normalized,
    schemaVersion: "elyon-seller-legacy-compatibility-v1",
    source: "elyon_company_os_legacy_compatibility",
    ownerSystem: "elyon_company_os",
    sellerView: {
      role: "compatibility",
      sourceOfTruth: "legacy_seller_product_master",
      freshness: text(options.freshness || "stale"),
      cachedAt: text(options.cachedAt),
    },
    rawServerProduct: record,
  };
}

function identityValues(record = {}) {
  const identity = canonicalIdentity(record);
  const channel = object(record.channels?.ebay || record.listing);
  const variants = array(record.product?.variants || record.variants);
  const variantValues = variants.flatMap((variant) => {
    const current = object(variant);
    return [
      current.articleNumber,
      current.sku,
      current.productId,
      current.companyOsProductId,
      current.productKey,
      current.supplierSku,
      current.supplierSkuId,
      current.skuId,
    ];
  });
  return new Set([
    identity.articleNumber,
    identity.sku,
    identity.productId,
    identity.companyOsProductId,
    identity.productKey,
    identity.sourceImportId,
    identity.supplierSku,
    text(channel.offerId),
    text(channel.listingId || channel.ebayItemId),
    ...array(record.channels?.ebay?.variantSkus),
    ...array(record.channels?.ebay?.offerIds),
    ...variantValues,
  ].filter(Boolean).map((value) => value.toUpperCase()));
}

export function resolveProductMasterRecord(records = [], candidate = {}) {
  const wanted = object(candidate);
  const candidates = [
    wanted.articleNumber,
    wanted.elyonArticleNumber,
    wanted.sku,
    wanted.offerId,
    wanted.listingId,
    wanted.productId,
    wanted.companyOsProductId,
    wanted.productKey,
    wanted.sourceImportId,
    wanted.supplierSku,
  ].map((value) => text(value).toUpperCase()).filter(Boolean);
  let resolved = null;
  for (const value of candidates) {
    const matches = array(records).filter((record) => identityValues(record).has(value));
    if (matches.length === 1) {
      if (resolved && resolved !== matches[0]) return null;
      resolved = matches[0];
      continue;
    }
    if (matches.length > 1) return null;
  }
  return resolved;
}

function errorWith(code, message, status = 503, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  Object.assign(error, details);
  return error;
}

function companyOsUrl(env = process.env) {
  return text(env.ELYON_COMPANY_OS_URL || env.COMPANY_OS_URL || DEFAULT_COMPANY_OS_URL, 1000);
}

function companyOsSyncCode(env = process.env) {
  return text(env.ELYON_COMPANY_OS_SYNC_CODE || env.COMPANY_OS_SYNC_CODE, 500);
}

// Additive V4.3.3 evidence: keep old V4.3 servers review-only, and reject
// any nested grant of execution or upload verification from a newer server.
export function identifierReviewSummary(review){
 const identifiers=review?.identifiers;
 if(!identifiers)return {status:'UNKNOWN',manualReviewRequired:true,issues:[],productionVerified:false,executionAuthorized:false};
 if(identifiers.executionAuthorized!==false||identifiers.productionVerified!==false||identifiers.manualReviewRequired!==true||
    (identifiers.csv&&(identifiers.csv.executionAuthorized!==false||identifiers.csv.uploadVerified!==false))||
    (identifiers.inventory&&(identifiers.inventory.executionAuthorized!==false||identifiers.inventory.transportCompatibilityVerified!==false||identifiers.inventory.productionVerified!==false))||
    !Array.isArray(identifiers.issues)||!Array.isArray(identifiers.rows))
    throw errorWith('invalid_identifier_review_contract','Ungültiger Kennzeichnungs-Prüfvertrag.',502);
 const issues=[...identifiers.issues,...array(identifiers.csv?.issues),...array(identifiers.inventory?.issues)].slice(0,500).map(i=>({code:text(i.code,120),field:text(i.field,220),variantKey:i.variantKey??null}));
 return {status:identifiers.requirements?.status??'UNKNOWN',rules:identifiers.requirements?.rules??{},manualReviewRequired:true,issues,rows:identifiers.rows.map(r=>({variantKey:r.variantKey,scope:r.scope,results:r.results})),csvStatus:identifiers.csv?.status??'UNKNOWN',inventoryStatus:identifiers.inventory?.status??'UNKNOWN',productionVerified:false,executionAuthorized:false};
}
// Additive offline CSV evidence; older Company OS remains compatible.
export function csvReadinessSummary(review){
 const r=review?.csvReadiness,c=review?.csv;
 const unknown={schemaOrigin:'UNKNOWN',offlineReviewAvailable:false,structurallyValid:false,formatCompatibility:'UNVERIFIED',uploadCompatibility:'UNKNOWN',manualReviewRequired:true,executionAuthorized:false,blockingIssues:[]};
 if(!r)return unknown;
 if(r.executionAuthorized!==false||r.manualReviewRequired!==true||r.formatCompatibility!=='UNVERIFIED'||r.uploadCompatibility!=='UNKNOWN'||!Array.isArray(r.blockingIssues)||!['UNKNOWN','REGISTERED_ORIGINAL','DYNAMIC_DERIVED'].includes(r.schemaOrigin)||typeof r.offlineReviewAvailable!=='boolean'||typeof r.structurallyValid!=='boolean'||review.automaticFallbackAllowed!==false||review.processingPaths?.operative!=='BLOCKED'||!c||c.executionAuthorized!==false||c.uploadVerified!==false||c.readyForOfflineReview!==r.offlineReviewAvailable||(r.offlineReviewAvailable&&!r.structurallyValid))
  throw errorWith('invalid_csv_review_contract','Ungültiger CSV-Prüfvertrag.',502);
 return {...unknown,schemaOrigin:r.schemaOrigin,offlineReviewAvailable:r.offlineReviewAvailable,structurallyValid:r.structurallyValid,columnCount:r.columnCount??null,rowCount:r.rowCount??0,variantCount:r.variantCount??0,categoryTreeVersion:r.categoryTreeVersion??null,blockingIssues:r.blockingIssues.slice(0,500).map(i=>({code:text(i.code,120),field:text(i.field,220),variantKey:i.variantKey??null}))};
}
// V4.3.5 additive diagnostic contract; no authority or implicit selection.
export function variantReadinessSummary(review){
 const r=review?.variantReadiness;
 const unknown={status:'UNKNOWN',manualReviewRequired:true,automaticSelectionApplied:false,transportVerified:false,productionVerified:false,executionAuthorized:false};
 if(!r)return unknown;
 if(r.schemaVersion!=='elyon-variant-readiness-v4.3.5'||r.executionAuthorized!==false||r.productionVerified!==false||r.transportVerified!==false||r.manualReviewRequired!==true||r.automaticSelectionApplied!==false||r.capacity?.executionAuthorized!==false||r.capacity?.sourceTotalVerified!==false||r.limits?.executionAuthorized!==false||r.limits?.transportVerified!==false||!Array.isArray(r.rows)||r.rows.length>250||r.rows.some(v=>v.executionAuthorized!==false)||!Array.isArray(r.suggestedVariantKeys)||r.suggestedVariantKeys.length>250)throw errorWith('invalid_variant_readiness_contract','Ungültiger Varianten-Prüfvertrag.',502);
 const fields=['storedCombinationCount','projectedCombinationCount','reportedRowCount','availableCount','unavailableCount','availabilityUnknownCount','economicsBoundCount','economicsBlockedCount','eligibleForReviewCount','explicitSelectionCount','selectionUnverifiedCount'];
 if(fields.some(k=>!Number.isSafeInteger(r[k])||r[k]<0)||r.reportedRowCount!==r.rows.length||r.reportedRowCount>r.projectedCombinationCount||r.suggestedVariantKeys.some(key=>!r.rows.some(v=>v.variantKey===key&&v.eligibleForReview===true&&v.selected!==false)))throw errorWith('invalid_variant_readiness_contract','Ungültige Variantenanzahl oder Auswahl.',502);
 const candidateKeys=r.technicalCandidateKeys??[];
 if(!Array.isArray(candidateKeys)||candidateKeys.length>250||candidateKeys.some(key=>!r.rows.some(v=>v.variantKey===key&&v.technicalReviewCandidate===true&&v.selected!==false)))throw errorWith('invalid_variant_readiness_contract','Ungültige technische Varianten-Vorschläge.',502);
 const subset=review.selectedOfferReview;
 let selectedOfferReview=null;
 if(subset){
  const c=subset.csv,inv=subset.inventory;
  const invalid=()=>{throw errorWith('invalid_variant_subset_contract','Ungültige gespeicherte Varianten-Teilmengenauswahl.',502);};
  if(subset.source!=='saved_company_os_manual'||!['BLOCKED_MANUAL_SELECTION','STRUCTURAL_SUBSET_REVIEW','MANUAL_SUBSET_REVIEW_REQUIRED'].includes(subset.status)||subset.executionAuthorized!==false||subset.transportVerified!==false||subset.uploadVerified!==false||subset.automaticSelectionApplied!==false||subset.manualReviewRequired!==true||!c||c.executionAuthorized!==false||c.uploadVerified!==false||c.readyForOfflineReview!==false||!Array.isArray(c.rows)||c.rows.length>101||c.csvBase64!=null||c.filename!=null||!Array.isArray(subset.issues)||!Array.isArray(subset.selectedKeys)||subset.selectedKeys.length>250||subset.sourceCount!==r.projectedCombinationCount||subset.selectedCount!==subset.selectedKeys.length||!Number.isSafeInteger(subset.excludedCount)||subset.excludedCount<0||subset.selectedCount+subset.excludedCount>subset.sourceCount)invalid();
  if(new Set(subset.selectedKeys).size!==subset.selectedKeys.length||subset.selectedKeys.some(key=>!r.rows.some(v=>v.variantKey===key&&v.selected===true)))invalid();
  const selectedSkus=subset.selectedKeys.map(key=>r.rows.find(v=>v.variantKey===key).sku);
  const sameSkus=values=>Array.isArray(values)&&values.length===selectedSkus.length&&values.every((sku,i)=>sku===selectedSkus[i]);
  if(c.rows.length&&(!sameSkus(c.rows.slice(1).map(row=>row.CustomLabel))||c.rows.some(row=>row.Action||Object.keys(row).some(k=>k.startsWith('*Action')&&row[k]))))invalid();
  if(inv&&(inv.executionAuthorized!==false||inv.identifierCompatibilityVerified!==false||!sameSkus(inv.variantSKUs)||!Array.isArray(inv.items)||!sameSkus(inv.items.map(v=>v.sku))||inv.items.some(v=>v.gtin!=null||v.mpn!=null)))invalid();
  if(subset.status==='BLOCKED_MANUAL_SELECTION'&&(c.rows.length||inv||c.roundtripVerified===true))invalid();
  if((c.rows.length||inv)&&(subset.selectedCount<2||subset.selectedCount>100))invalid();
  selectedOfferReview={status:subset.status,sourceCount:subset.sourceCount,selectedCount:subset.selectedCount,excludedCount:subset.excludedCount,selectedKeys:subset.selectedKeys,csvRoundtripVerified:c.roundtripVerified===true,inventoryStructuralCandidate:!!inv,issues:subset.issues.slice(0,500).map(i=>({code:text(i.code,120),field:text(i.field,220),variantKey:i.variantKey??null})),manualReviewRequired:true,transportVerified:false,executionAuthorized:false};
 }
 return {...unknown,status:r.capacity.status,capacity:r.capacity,limits:r.limits,counts:Object.fromEntries(fields.map(k=>[k,r[k]])),rowsComplete:r.rowsComplete===true,allRowsReviewed:r.allRowsReviewed===true,rows:r.rows,suggestedVariantKeys:r.suggestedVariantKeys,technicalCandidateKeys:candidateKeys,technicalCandidatesRequireRegulatoryReview:true,selectedOfferReview};
}
// V4.4 is additive: older Company OS remains review-only. No transport commands,
// raw request bodies or new authorization can be consumed by the Seller Tool.
// V4.4.3 optional diagnostic contract, never transport authority. Older producers
// remain review-only; a present but inconsistent result is rejected.
export function payloadValidationSummary(review){
 const t=review?.transportReadiness,v=t?.payloadValidation;
 if(v==null)return null;
 const fail=()=>{throw errorWith('invalid_payload_validation_contract','Ungültiger V4.4.3-Payload-Prüfvertrag.',502);};
 const statuses=['VALIDATED','WARNING','INVALID','INCOMPLETE','UNSUPPORTED','UNVERIFIED','BLOCKED'];
 const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
 const bounded=(x,max)=>typeof x==='string'&&x.length<=max&&!/[\x00-\x1f\x7f]/.test(x);
 const locks=['executionAuthorized','publishAuthorized','feedAuthorized','externalStateVerified','uploadVerified','automaticRetryAllowed'];
 if(v.schemaVersion!=='elyon-payload-validation-v4.4.3'||v.transport!=='INVENTORY'||v.scope!=='EXACT_CANONICAL_JSON'||v.ruleRevision!=='4.4.3.1'||v.contract?.source!=='sell_inventory_v1_oas3.json'||v.contract?.version!=='1.18.5'||v.contract?.sourceSha256!=='a99b7026ba541ff9d3fc6548e901f7005dbcc1602f638fe4d4aa2f95e4266b7e'||!hash(v.payloadSha256)||!hash(v.validationSha256)||v.payloadSha256!==t.approvalPreparation?.requestPlanSha256||v.officialFullSchemaValidated!==false||locks.some(k=>v[k]!==false)||!statuses.includes(v.status)||!Array.isArray(v.issues)||v.issues.length>200||v.blocking!==true||!v.issues.some(i=>i?.code==='LIVE_PROVIDER_NOT_VERIFIED'&&i.status==='UNVERIFIED')&&!v.issues.some(i=>i?.code==='DIAGNOSTIC_LIMIT'&&i.status==='BLOCKED'))fail();
 const issues=v.issues.map(i=>{
  if(!i||!statuses.includes(i.status)||i.status==='VALIDATED'||!bounded(i.code,100)||!bounded(i.level,40)||!bounded(i.field,4096)||i.sku!==null&&!t.selectedSkus?.includes(i.sku)||i.variantKey!==null&&!t.selectedVariantKeys?.includes(i.variantKey)||i.blocking!==(i.status!=='WARNING')||!bounded(i.description,500)||i.missingEvidence!==null&&!bounded(i.missingEvidence,200)||!['REVIEW_WARNING','VERIFY_EVIDENCE','CORRECT_AND_REVALIDATE'].includes(i.nextAction))fail();
  return {code:i.code,level:i.level,field:i.field,sku:i.sku,variantKey:i.variantKey,status:i.status,blocking:i.blocking,nextAction:i.nextAction};
 });
 const expected=['INVALID','BLOCKED','UNSUPPORTED','INCOMPLETE','UNVERIFIED','WARNING'].find(s=>issues.some(i=>i.status===s))??'VALIDATED';
 if(v.status!==expected||v.nextAction!=='REVIEW_VALIDATION_ISSUES')fail();
 return {schemaVersion:v.schemaVersion,status:v.status,ruleRevision:v.ruleRevision,contractVersion:v.contract.version,payloadSha256:v.payloadSha256,validationSha256:v.validationSha256,issues,blocking:true,...Object.fromEntries(locks.map(k=>[k,false]))};
}
export function payloadValidationReviewText(v){
 if(!v)return 'Payload-Validierung nicht verfügbar; keine Freigabe.';
 return 'Payload-Prüfung: '+v.status+' · API '+v.contractVersion+' · '+v.issues.slice(0,10).map(i=>[i.sku,i.field,i.code].filter(Boolean).join(' / ')).join(' · ')+' · Keine produktive Freigabe.';
}

export function payloadReviewBundleSummary(review){
 if(review?.payloadReviews==null)return null;
 const view=payloadReviewBundleView(review.payloadReviews,review);
 if(!view)throw errorWith('invalid_payload_review_bundle','Ungültiger V4.4.3-Payload-Prüfvertrag.',502);
 return view;
}
export function transportReadinessSummary(review){
 const t=review?.transportReadiness;
 const unknown={status:'UNKNOWN',candidate:null,manualReviewRequired:true,executionAuthorized:false,publishAuthorized:false,liveTestApproved:false,externalStateVerified:false,automaticFallbackAllowed:false};
 if(!t)return unknown;
 const fail=()=>{throw errorWith('invalid_transport_readiness_contract','Ungültiger Transport-Prüfvertrag.',502);};
 const flags=['executionAuthorized','operationalEnabled','liveVerified','accountVerified','oauthVerified','uploadVerified','fallbackAllowed','publishAuthorized','feedAuthorized','readyForExport','releaseEligible','automaticFallbackAllowed','liveTestApproved','approvalVerified','externalStateVerified','retryAllowed'];
 const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
 if(t.schemaVersion!=='elyon-transport-readiness-v4.4'||t.mode!=='READ_ONLY_PREPARATION'||t.phase!=='A_OFFLINE'||t.action!=='CREATE_UNPUBLISHED_OFFER'||flags.some(k=>t[k]!==false)||t.manualReviewRequired!==true||t.accountReadiness!=='UNVERIFIED'||t.projectionSha256!==review.projectionSha256||t.categoryId!==review.categoryId||t.marketplace!=='EBAY_DE'||!['BLOCKED','REVIEW_REQUIRED','RECONCILIATION_REQUIRED'].includes(t.status)||![null,'INVENTORY_SINGLE_REVIEW','INVENTORY_VARIANT_REVIEW','OFFLINE_CSV_REVIEW'].includes(t.candidate)||!Array.isArray(t.blockers)||t.blockers.length>550||t.blockers.some(x=>typeof x!=='string'||x.length>200)||!Array.isArray(t.selectedSkus)||t.selectedSkus.length>250||!Array.isArray(t.selectedVariantKeys)||t.selectedVariantKeys.length>250||!Number.isSafeInteger(t.sourceCombinationCount)||t.sourceCombinationCount<0||t.sourceCombinationCount>250||!t.feed||t.feed.offlineCsvNeverUpload!==true||t.feed.sellerHubDraftVerified!==false||t.feed.fxDraft!=='ACCOUNT_BLOCKED_BAF_ERROR_5'||t.feed.fxListing!=='FORMAT_AND_ACCOUNT_UNVERIFIED'||!t.media||t.media.privateStorageVerified!==false||!Array.isArray(t.media.documentIds)||t.media.documentIds.length||t.storedExternalReferences&&t.storedExternalReferences.verified!==false)fail();
 if(t.reviewBindingSha256!==null&&!hash(t.reviewBindingSha256)||t.payloadSha256!==null&&!hash(t.payloadSha256))fail();
 const allowed={
  preflight:new Set(['GET|getFulfillmentPolicies|/sell/account/v1/fulfillment_policy','GET|getPaymentPolicies|/sell/account/v1/payment_policy','GET|getReturnPolicies|/sell/account/v1/return_policy','GET|getInventoryLocations|/sell/inventory/v1/location','GET|getInventoryItem|/sell/inventory/v1/inventory_item/{sku}','GET|getOffers|/sell/inventory/v1/offer']),
  draft:new Set(['PUT|createOrReplaceInventoryItem|/sell/inventory/v1/inventory_item/{sku}','POST|createOffer|/sell/inventory/v1/offer','PUT|createOrReplaceInventoryItemGroup|/sell/inventory/v1/inventory_item_group/{groupKey}']),
  readback:new Set(['GET|getOffer|/sell/inventory/v1/offer/{offerId}','GET|getInventoryItem|/sell/inventory/v1/inventory_item/{sku}','GET|getInventoryItemGroup|/sell/inventory/v1/inventory_item_group/{groupKey}'])
 };
 for(const [k,permitted] of Object.entries(allowed)){
  const ops=t.plannedOperations?.[k];
  if(!Array.isArray(ops)||ops.length>permitted.size||ops.some(o=>!permitted.has([o?.method,o?.operationId,o?.resource].join('|'))||o.write!==(o.method!=='GET')))fail();
 }
 const preview=t.inventoryPreview;
 const a=t.approvalPreparation;
 if(a!=null){
  if(!preview||a.status!=='BLOCKED'||a.productId!==t.identity?.productId||a.articleNumber!==t.identity?.articleNumber||a.projectionSha256!==t.projectionSha256||a.reviewBindingSha256!==t.reviewBindingSha256||!hash(a.requestPlanSha256)||a.environment!=='production'||a.marketplace!==t.marketplace||a.transport!=='INVENTORY'||a.action!==t.action||a.approvalId!==null||['approvalPersisted','executionAuthorized','publishAuthorized','confirmationAllowed'].some(k=>a[k]!==false)||!Array.isArray(a.selectedSkus)||a.selectedSkus.length!==t.selectedSkus.length||a.selectedSkus.some((s,i)=>s!==t.selectedSkus[i])||![a.productRevision,a.listingRevision].every(v=>v===null||Number.isSafeInteger(v)&&v>=0)||![a.productUpdatedAt,a.listingUpdatedAt].every(v=>v===null||typeof v==='string'&&Number.isFinite(Date.parse(v))))fail();
 }
 if(preview){
  if(t.candidate!=='INVENTORY_SINGLE_REVIEW'||t.selectedSkus.length!==1||!hash(t.payloadSha256)||preview.status!=='STRUCTURAL_PAYLOAD_PREVIEW_ONLY'||preview.regulatoryPayloadComplete!==false||preview.officialFullSchemaValidated!==false||preview.executionAuthorized!==false||preview.offerPayload?.sku!==t.selectedSkus[0]||preview.offerPayload?.categoryId!==t.categoryId||preview.offerPayload?.marketplaceId!==t.marketplace||preview.inventoryPayload?.condition!=='NEW')fail();
 }
 if(t.status==='RECONCILIATION_REQUIRED'&&(!t.storedExternalReferences||t.candidate!==null||t.plannedOperations.draft.length)||['OFFLINE_CSV_REVIEW',null].includes(t.candidate)&&t.plannedOperations.draft.length)fail();
 if(t.candidate==='INVENTORY_SINGLE_REVIEW'&&(t.sourceCombinationCount!==0||t.selectedSkus.length!==1||t.selectedSkus[0]!==t.identity?.articleNumber||t.selectedVariantKeys.length||t.expectedExternalResult!=='UNPUBLISHED_OFFER'||review.inventory?.items?.[0]?.sku!==t.selectedSkus[0]))fail();
 if(t.candidate==='INVENTORY_VARIANT_REVIEW'){
  const rows=review.variantReadiness?.rows??[],source=review.selectedOfferReview?.inventory??review.inventory;
  if(t.selectedSkus.length<2||t.selectedSkus.length>100||t.selectedSkus.length!==t.selectedVariantKeys.length||new Set(t.selectedSkus).size!==t.selectedSkus.length||new Set(t.selectedVariantKeys).size!==t.selectedVariantKeys.length||t.expectedExternalResult!=='UNPUBLISHED_OFFERS_AND_INVENTORY_ITEM_GROUP'||t.selectedVariantKeys.some((k,i)=>!rows.some(v=>v.variantKey===k&&v.sku===t.selectedSkus[i]))||source?.items?.length!==t.selectedSkus.length||source.items.some((v,i)=>v.sku!==t.selectedSkus[i]))fail();
 }
 return {...unknown,payloadValidation:payloadValidationSummary(review),payloadReviews:payloadReviewBundleSummary(review),status:t.status,candidate:t.candidate,expectedExternalResult:t.expectedExternalResult,categoryId:t.categoryId,projectionSha256:t.projectionSha256,reviewBindingSha256:t.reviewBindingSha256,payloadSha256:t.payloadSha256,sourceCombinationCount:t.sourceCombinationCount,selectedCount:t.selectedSkus.length,selectedSkus:t.selectedSkus,blockers:t.blockers,structuralInventoryPreviewAvailable:!!preview,approvalPreparation:a?{status:a.status,productRevision:a.productRevision,listingRevision:a.listingRevision,requestPlanSha256:a.requestPlanSha256,reviewBindingSha256:a.reviewBindingSha256,approvalPersisted:false,executionAuthorized:false,publishAuthorized:false,confirmationAllowed:false}:null,storedExternalReferences:t.storedExternalReferences,feed:t.feed,media:t.media};
}
// Historical Company OS reservation evidence, never a new external identity or authority.
export function inventoryReservationSummary(review){
 const x=review?.inventoryReservation;
 const unknown={status:'UNKNOWN',taskId:null,executionAuthorized:false,publishAuthorized:false,automaticRetryAllowed:false,externalStateVerified:false,sellerHubDraftVerified:false};
 if(!x)return unknown;
 const fail=()=>{throw errorWith('invalid_inventory_reservation_contract','Ungültiger Inventory-Reservierungsvertrag.',502);};
 const statuses=['UNAVAILABLE','IDENTITY_UNRESOLVED','NO_LOCAL_RESERVATION','IDENTITY_CONFLICT','SUBMITTING','RECONCILIATION_REQUIRED','UNPUBLISHED_OFFER_VERIFIED'];
 const bound=['SUBMITTING','RECONCILIATION_REQUIRED','UNPUBLISHED_OFFER_VERIFIED'].includes(x.status);
 const id=v=>typeof v==='string'&&v.length>0&&v.length<=220&&v===v.trim()&&!/[\x00-\x1f\x7f]/.test(v);
 const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 const flags=['executionAuthorized','publishAuthorized','automaticRetryAllowed','externalStateVerified','sellerHubDraftVerified'];
 if(x.schemaVersion!=='elyon-inventory-reservation-status-v4.4'||!statuses.includes(x.status)||flags.some(k=>x[k]!==false)||x.productId!==review.request?.targetId||!/^ELY-\d{6,}$/.test(x.articleNumber??'')||review.transportReadiness?.identity?.articleNumber!==x.articleNumber||!Array.isArray(x.skus)||x.skus.length>100||x.skus.some(s=>!id(s))||new Set(x.skus.map(s=>s.toUpperCase())).size!==x.skus.length||!Array.isArray(x.observedOfferIds)||x.observedOfferIds.some(s=>!id(s))||new Set(x.observedOfferIds).size!==x.observedOfferIds.length)fail();
 if(bound){if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x.taskId??'')||!hash(x.payloadSha256)||!hash(x.sourceRevisionSha256)||!id(x.categoryId)||!x.skus.length)fail();}
 else if(x.taskId!==null||x.payloadSha256!==null||x.sourceRevisionSha256!==null||x.categoryId!==null||x.skus.length)fail();
 if(x.status==='UNPUBLISHED_OFFER_VERIFIED'?x.observedOfferIds.length!==x.skus.length:x.observedOfferIds.length!==0)fail();
 return {...unknown,status:x.status,taskId:x.taskId,articleNumber:x.articleNumber,categoryId:x.categoryId,payloadSha256:x.payloadSha256,sourceRevisionSha256:x.sourceRevisionSha256,skus:x.skus,observedOfferIds:x.observedOfferIds,historicalEvidenceOnly:true,manualReviewRequired:bound||x.status!=='NO_LOCAL_RESERVATION'};
}

// Optional additive V4.4.2 projection. This is historical, not a transport
// journal or a command. Independently correlate with existing reservation.
export function recoveryPreparationSummary(review){
 const x=review?.recoveryPreparation;if(x==null&&review?.canonicalRecovery==null)return null;
 const fail=()=>{throw errorWith('invalid_recovery_preparation_contract','Ungültiger V4.4.2-Recovery-Vertrag.',502);};
 const identity=review.transportReadiness?.identity,legacy=inventoryReservationSummary(review);
 const canonical=review.canonicalRecovery==null?null:canonicalRecoveryView(review.canonicalRecovery,identity);
 if(!x||review.canonicalRecovery!=null&&(!canonical||canonical.productId!==review.request?.targetId))fail();
 const flags=['executionAuthorized','publishAuthorized','automaticRetryAllowed','reservationReleaseAllowed','externalStateVerified','sellerHubDraftVerified'];
 const held=['SUBMITTING','RECONCILIATION_REQUIRED','UNPUBLISHED_OFFER_VERIFIED'].includes(legacy.status);
 const expectedStatus=held?(legacy.status==='UNPUBLISHED_OFFER_VERIFIED'?'MANUAL_REVIEW_REQUIRED':'RECONCILIATION_REQUIRED'):'BLOCKED';
 const expectedReservation=held?'HELD':legacy.status==='NO_LOCAL_RESERVATION'?'NO_LOCAL_RESERVATION':'UNKNOWN';
 const nextAction=held?'RECONCILE_READ_ONLY':expectedReservation==='NO_LOCAL_RESERVATION'?'REVIEW_TRANSPORT_DISABLED':'MANUAL_REVIEW';
 const equal=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
 if(x.schemaVersion!=='elyon-recovery-review-v4.4.2'||x.productId!==identity?.productId||x.productId!==review.request?.targetId||x.articleNumber!==identity?.articleNumber||x.canonicalJournalAvailable!==false||flags.some(k=>x[k]!==false)||x.status!==expectedStatus||x.reservationState!==expectedReservation||x.legacyStatus!==legacy.status||x.taskId!==(held?legacy.taskId:null)||!equal(x.skus,held?legacy.skus:[])||!equal(x.historicalOfferIds,held?legacy.observedOfferIds:[])||x.lastConfirmedOperation!==null||x.auditRef!==null||x.nextAction!==nextAction||!equal(x.missingEvidence,['CANONICAL_APPROVAL_JOURNAL_UNAVAILABLE','EXTERNAL_STATE_UNVERIFIED']))fail();
 let feedRecovery=null;
 if(x.feedRecovery!=null){
  const f=x.feedRecovery,refs=review.transportReadiness?.storedExternalReferences||{};
  const id=v=>typeof v==='string'&&v.length>0&&v.length<=220&&v===v.trim()&&!/[\x00-\x1f\x7f]/.test(v);
  const taskId=id(refs.feedTaskId)?refs.feedTaskId:null,feedState=id(refs.feedState)&&refs.feedState.length<=80?refs.feedState:null,referenceConflict=refs.feedReferenceConflict===true;
  const present=!!(taskId||feedState||referenceConflict);
  if(f.schemaVersion!=='elyon-feed-recovery-review-v4.4.2'||f.taskId!==taskId||f.feedState!==feedState||f.referenceConflict!==referenceConflict||f.canonicalJournalAvailable!==false||flags.some(k=>f[k]!==false)||f.status!==(present?'MANUAL_REVIEW_REQUIRED':'UNKNOWN')||f.nextAction!==(present?'RECONCILE_READ_ONLY':'REVIEW_TRANSPORT_DISABLED')||!equal(f.missingEvidence,['CANONICAL_APPROVAL_JOURNAL_UNAVAILABLE','EXACT_CSV_AND_ACCOUNT_BINDING_UNVERIFIED','SELLER_HUB_VISIBILITY_UNVERIFIED']))fail();
  feedRecovery={schemaVersion:f.schemaVersion,taskId,feedState,referenceConflict,status:f.status,canonicalJournalAvailable:false,nextAction:f.nextAction,missingEvidence:f.missingEvidence,...Object.fromEntries(flags.map(k=>[k,false]))};
 }
 return {schemaVersion:x.schemaVersion,productId:x.productId,articleNumber:x.articleNumber,status:x.status,reservationState:x.reservationState,legacyStatus:x.legacyStatus,taskId:x.taskId,skus:x.skus,historicalOfferIds:x.historicalOfferIds,canonicalJournalAvailable:false,lastConfirmedOperation:null,auditRef:null,nextAction:x.nextAction,missingEvidence:x.missingEvidence,...(feedRecovery?{feedRecovery}:{}),...(canonical?{canonicalRecovery:canonical}:{}),...Object.fromEntries(flags.map(k=>[k,false]))};
}
export function recoveryPreparationText(x){
 if(!x)return 'Recovery-Nachweis nicht verfügbar. Keine Übertragung.';
 if(x.canonicalJournalAvailable!==false||['executionAuthorized','publishAuthorized','automaticRetryAllowed','reservationReleaseAllowed','externalStateVerified','sellerHubDraftVerified'].some(k=>x[k]!==false))return 'Recovery-Nachweis unbekannt. Keine Übertragung.';
 const status=x.status==='RECONCILIATION_REQUIRED'?'Abgleich erforderlich':x.status==='MANUAL_REVIEW_REQUIRED'?'Historische Offer-Identität manuell prüfen':'Recovery blockiert';
 return 'V4.4.2: '+status+' · Reservierung: '+x.reservationState+' · SKUs: '+(x.skus.slice(0,5).map(v=>v.slice(0,50)).join(', ')||'keine')+' · Historische Offer-IDs: '+(x.historicalOfferIds.slice(0,5).map(v=>v.slice(0,50)).join(', ')||'keine')+' · Kanonischer Nachweis fehlt. Keine Übertragung oder automatische Wiederholung.'+(x.feedRecovery?.status==='MANUAL_REVIEW_REQUIRED'?' Historischer Feed: '+(x.feedRecovery.feedState||'unbekannt')+' / Task '+(x.feedRecovery.taskId||'unbekannt')+' – Draft nicht verifiziert.':'')+(x.canonicalRecovery!=null?' '+canonicalRecoveryText(x.canonicalRecovery,x):'');
}

export function draftApprovalStatusSummary(review){
 const t=review?.transportReadiness,x=t?.approvalStatus;
 const base={status:'UNKNOWN',approvalId:null,executionAuthorized:false,publishAuthorized:false,automaticApprovalAllowed:false,liveEnabled:false};
 const recovery=recoveryPreparationSummary(review);
 if(!x)return {...base,...(recovery?{recoveryPreparation:recovery}:{})};
 const fail=()=>{throw errorWith('invalid_draft_approval_status','Ungültiger V4.4.1-Freigabevertrag.',502);};
 const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 if(x.schemaVersion!=='elyon-draft-approval-v4.4.1'||x.status!=='BLOCKED'||x.approvalId!==null||x.approvalPersisted!==false||x.productId!==t.identity?.productId||x.articleNumber!==t.identity?.articleNumber||x.action!=='CREATE_UNPUBLISHED_OFFER'||x.reviewBindingSha256!==t.reviewBindingSha256||x.requestPlanSha256!==(t.approvalPreparation?.requestPlanSha256??null)||![null,'INVENTORY'].includes(x.transport)||x.expiresAtMs!==null||x.transportReservationId!==null||x.auditRef!==null||['executionAuthorized','publishAuthorized','automaticApprovalAllowed','liveEnabled'].some(k=>x[k]!==false)||!Array.isArray(t.selectedSkus)||!Array.isArray(x.selectedSkus)||x.selectedSkus.length!==t.selectedSkus.length||x.selectedSkus.some((s,i)=>s!==t.selectedSkus[i])||!Array.isArray(x.blockers)||x.blockers.length>102||!x.blockers.includes('PRODUCTIVE_APPROVAL_DISABLED')||x.blockers.some(v=>typeof v!=='string'||v.length>200)||x.requestPlanSha256!==null&&!hash(x.requestPlanSha256))fail();
 if(x.productRevision!==(t.approvalPreparation?.productRevision??null)||x.listingRevision!==(t.approvalPreparation?.listingRevision??null))fail();
 if(review.request?.targetId&&x.productId!==review.request.targetId)fail();
 // Optional additive fields support deploying this read-only consumer before
 // or after the Company OS producer without promoting old metadata to authority.
 const expectedRisk=x.selectedSkus.length>1?'ELEVATED_REVIEW':'STANDARD_REVIEW';
 if(Object.hasOwn(x,'issuerType')&&x.issuerType!=='MANUAL'||Object.hasOwn(x,'riskClass')&&x.riskClass!==expectedRisk)fail();
 return {...base,...(t.payloadValidation!=null?{payloadValidation:payloadValidationSummary(review)}:{}),...(review.payloadReviews!=null?{payloadReviews:payloadReviewBundleSummary(review)}:{}),status:x.status,productRevision:x.productRevision,listingRevision:x.listingRevision,transport:x.transport,selectedSkus:x.selectedSkus,action:x.action,blockers:x.blockers,requestPlanSha256:x.requestPlanSha256,issuerType:x.issuerType??null,riskClass:x.riskClass??null,expiresAtMs:null,auditRef:null,...(recovery?{recoveryPreparation:recovery}:{})};
}

export function draftApprovalReviewText(summary){
 if(summary?.status!=='BLOCKED'||summary.executionAuthorized!==false||summary.publishAuthorized!==false||summary.automaticApprovalAllowed!==false||summary.liveEnabled!==false)return 'Operative Freigabe unbekannt. Keine Übertragung.';
 return ['Operative Freigabe blockiert','Produktrevision: '+(summary.productRevision??'unbekannt'),'Listingrevision: '+(summary.listingRevision??'unbekannt'),'Transport: '+(summary.transport??'offen'),'Risikoklasse: '+(summary.riskClass??'unbekannt'),'Aktion: unveröffentlichtes Offer erstellen','SKUs: '+(summary.selectedSkus.slice(0,10).join(', ')||'keine'),'Gültigkeit: keine Freigabe','Audit: keine Freigabe-ID','Blockierungsgründe: '+summary.blockers.slice(0,8).join(', ')].join(' · ')+'. '+recoveryPreparationText(summary.recoveryPreparation)+(summary.payloadReviews?' '+payloadReviewBundleText(summary.payloadReviews):summary.payloadValidation?' '+payloadValidationReviewText(summary.payloadValidation):'');
}

// Explicit V4.3/V4.4 read; no cached fallback or write, no draft/publication authority.
export async function fetchCompanyOsAdvancedListingReview(options = {}) {
  const env=options.env||process.env,syncCode=companyOsSyncCode(env);
  const id=options.productId;
  if(typeof id!=="string"||id!==id.trim()||!id||id.length>220||/[\x00-\x1f\x7f]/.test(id))throw errorWith("invalid_advanced_review_target","Ungültige Produktidentität.",422);
  if(!syncCode)throw errorWith("company_os_sync_code_missing","Company OS Sync-Code fehlt.",503);
  const url=new URL("/api/product-master-v2",companyOsUrl(env));
  if(url.protocol!=="https:"||url.username||url.password)throw errorWith("company_os_url_invalid","Company-OS-URL ist ungültig.",503);
  url.searchParams.set("advancedReview","1");url.searchParams.set("targetKind","product");url.searchParams.set("targetId",id);
  const response=await (options.fetchImpl||fetch)(url,{method:"GET",headers:{Accept:"application/json","X-Elyon-Sync-Code":syncCode},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw errorWith("advanced_review_unavailable","V4.3-Prüfung in Company OS nicht verfügbar.",503);
  const payload=await response.json();
  if(payload?.schemaVersion!=="elyon-advanced-listing-review-v4.3"||payload.request?.targetKind!=="product"||payload.request?.targetId!==id||typeof payload.projectionSha256!=="string"||!/^[a-f0-9]{64}$/.test(payload.projectionSha256)||!["REVIEW_REQUIRED"].includes(payload.route)||!Array.isArray(payload.issues)||["executionAuthorized","publishAuthorized","feedAuthorized","readyForExport","gpsrCompliant","uploadVerified","releaseEligible"].some(k=>payload[k]!==false))throw errorWith("invalid_advanced_review_contract","Ungültiger V4.3-Prüfvertrag.",502);
  identifierReviewSummary(payload);
  csvReadinessSummary(payload);
  variantReadinessSummary(payload);
  transportReadinessSummary(payload);
  inventoryReservationSummary(payload);
  draftApprovalStatusSummary(payload);
  return payload;
}

export async function fetchCompanyOsProductMaster(options = {}) {
  const env = options.env || process.env;
  const syncCode = companyOsSyncCode(env);
  if (!syncCode) {
    throw errorWith(
      "company_os_sync_code_missing",
      "Company OS Product Master v2 ist nicht konfiguriert: Sync-Code fehlt.",
      503,
    );
  }

  let url;
  try {
    url = new URL("/api/product-master-v2", companyOsUrl(env));
  } catch {
    throw errorWith("company_os_url_invalid", "Company-OS-URL ist ungültig.", 503);
  }
  const identity = text(options.identity, 240);
  if (identity) url.searchParams.set("id", identity);
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Elyon-Sync-Code": syncCode,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw errorWith(
      text(payload?.error) || `company_os_product_master_http_${response.status}`,
      text(payload?.message) || "Company OS Product Master v2 konnte nicht geladen werden.",
      response.status || 503,
    );
  }
  const records = identity ? (payload.product ? [payload.product] : []) : array(payload.products);
  return {
    payload,
    records,
    fetchedAt: new Date().toISOString(),
  };
}

async function readCache(options = {}) {
  if (options.readCache) return options.readCache();
  return readProductMasterList(PRODUCT_MASTER_V2_CACHE_KEY, options.redisOptions);
}

async function writeCache(records, options = {}) {
  if (options.writeCache) return options.writeCache(records);
  return writeProductMasterList(PRODUCT_MASTER_V2_CACHE_KEY, records, options.redisOptions);
}

function productViews(records, adapter, meta) {
  return array(records).map((record) => adapter(record, meta)).filter(Boolean);
}

export async function loadProductMasterForSeller(options = {}) {
  const identity = text(options.identity, 240);
  let remoteError = null;
  try {
    const remote = await fetchCompanyOsProductMaster({ ...options, identity });
    const products = productViews(remote.records, adaptProductMasterForSeller, { freshness: "fresh" });
    if (identity && !products.length) {
      throw errorWith("product_master_record_not_found", "Kein Product-Master-Datensatz für diese Identität gefunden.", 404);
    }
    let cacheStatus = { persisted: false, mode: "cache_unavailable" };
    if (!identity) {
      try {
        cacheStatus = await writeCache(remote.records, options);
      } catch {
        cacheStatus = { persisted: false, mode: "cache_write_failed" };
      }
    }
    return {
      products,
      source: "company_os_product_master_v2",
      freshness: "fresh",
      generatedAt: text(remote.payload?.generatedAt),
      cacheStatus,
      contract: remote.payload?.contract || null,
      safety: remote.payload?.safety || { projectionOnly: true, createsIdentity: false, publishesToEbay: false, createsOrders: false },
    };
  } catch (error) {
    remoteError = error;
    if (Number(error?.status) === 404) throw error;
  }

  const cached = await readCache(options).catch(() => []);
  const cachedProducts = productViews(cached, adaptProductMasterForSeller, { freshness: "stale" });
  if (identity) {
    const match = resolveProductMasterRecord(cached, { id: identity, articleNumber: identity, sku: identity, offerId: identity, listingId: identity, productId: identity });
    const product = match ? adaptProductMasterForSeller(match, { freshness: "stale" }) : null;
    if (product) {
      return {
        products: [product],
        source: "company_os_product_master_v2_cache",
        freshness: "stale",
        cacheStatus: { persisted: true, mode: "read_only_cache" },
        staleReason: text(remoteError?.code || remoteError?.message),
        safety: { projectionOnly: true, createsIdentity: false, publishesToEbay: false, createsOrders: false },
      };
    }
  } else if (cachedProducts.length) {
    return {
      products: cachedProducts,
      source: "company_os_product_master_v2_cache",
      freshness: "stale",
      cacheStatus: { persisted: true, mode: "read_only_cache" },
      staleReason: text(remoteError?.code || remoteError?.message),
      safety: { projectionOnly: true, createsIdentity: false, publishesToEbay: false, createsOrders: false },
    };
  }

  const legacy = await (options.readLegacy || (() => readProductMasterList("elyon_products", options.redisOptions)))().catch(() => []);
  const legacyProducts = array(legacy).map((record) => adaptLegacyProductForSeller(record, { freshness: "stale" })).filter(Boolean);
  if (identity) {
    const match = resolveProductMasterRecord(legacyProducts, { id: identity, articleNumber: identity, sku: identity, offerId: identity, listingId: identity, productId: identity });
    if (match) {
      return {
        products: [match],
        source: "legacy_seller_product_master_compatibility",
        freshness: "stale",
        cacheStatus: { persisted: false, mode: "legacy_compatibility" },
        staleReason: text(remoteError?.code || remoteError?.message),
        safety: { projectionOnly: true, createsIdentity: false, publishesToEbay: false, createsOrders: false },
      };
    }
  } else if (legacyProducts.length) {
    return {
      products: legacyProducts,
      source: "legacy_seller_product_master_compatibility",
      freshness: "stale",
      cacheStatus: { persisted: false, mode: "legacy_compatibility" },
      staleReason: text(remoteError?.code || remoteError?.message),
      safety: { projectionOnly: true, createsIdentity: false, publishesToEbay: false, createsOrders: false },
    };
  }

  throw remoteError || errorWith("product_master_unavailable", "Product Master v2 ist nicht erreichbar.", 503);
}

export function productMasterSummary(products = []) {
  const list = array(products);
  return {
    total: list.length,
    fresh: list.filter((product) => product.sellerView?.freshness === "fresh").length,
    stale: list.filter((product) => product.sellerView?.freshness === "stale").length,
    ebayDrafts: list.filter((product) => text(product.channels?.ebay?.status).toUpperCase() === "DRAFT").length,
    ebayLive: list.filter((product) => text(product.channels?.ebay?.status).toUpperCase() === "LIVE").length,
  };
}

export function productMasterIdentityValues(record = {}) {
  return identityValues(record);
}
