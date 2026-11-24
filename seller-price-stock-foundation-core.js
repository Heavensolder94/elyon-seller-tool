// Read-only Product Master projection. No I/O, mutations, calculation or approvals.
import { extractPriceProvenance } from "./seller-price-provenance-core.js";
const obj=v=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
const arr=v=>Array.isArray(v)?v:[];
const id=v=>typeof v==="string"&&v.length<=220&&v.trim()===v&&!/[\u0000-\u001f\u007f]/.test(v)&&v?v:null;
const firstId=(...v)=>v.map(id).find(Boolean)??null;
const currency=v=>typeof v==="string"&&/^[A-Z]{3}$/.test(v)?v:null;
export function amount(v,{signed=false,zero=false}={}){
  if(typeof v!=="number"&&(typeof v!=="string"||!/^-?\d+(?:[.,]\d{1,2})?$/.test(v)))return null;
  const n=typeof v==="number"?v:Number(v.replace(",","."));
  return Number.isFinite(n)&&Math.abs(n)<=1e9&&(signed||n>=0)&&(zero||n!==0)?n:null;
}
export function stock(v){
  if(typeof v!=="number"&&(typeof v!=="string"||!/^\d+$/.test(v)))return null;
  const n=Number(v);return Number.isSafeInteger(n)&&n>=0?n:null;
}
const firstValue=(fn,...values)=>values.map(v=>fn(v)).find(v=>v!==null)??null;
const stamp=v=>typeof v==="string"&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v))?v:null;
// Local review thresholds, not eBay or supplier SLA. No timestamp invented.
export const REVIEW_MAX_AGE_MS=24*60*60*1000;
function freshness(at,now){return !stamp(at)||!Number.isFinite(now)||Date.parse(at)>now?"unknown":now-Date.parse(at)>REVIEW_MAX_AGE_MS?"stale":"recent";}
function layers(p){
 const raw=obj(p.rawServerProduct||p.raw||p);
 return [raw,obj(raw.raw),obj(raw.product),p].filter((v,i,a)=>a.indexOf(v)===i);
}
function field(records,keys,parse){
 for(const record of records)for(const key of keys){const value=parse(record[key]);if(value!==null)return {value,record,field:key};}
 return {value:null,record:{},field:null};
}
function storedPrice(records,variant=false){
 const explicit=records.find(r=>r.meta?.reviewOnly===true||r.reviewOnly===true);
 const fact=records.map(r=>obj(r.economicsFacts?.purchase)).find(f=>amount(f.amount)!==null&&id(f.source));
 const reference=field(records.flatMap(r=>[obj(r.meta),r]),["amazonReferencePrice"],amount);
 const amazonReference={amount:reference.value,currency:currency(reference.record.amazonReferenceCurrency)||null,
  capturedAt:stamp(reference.record.amazonReferenceCapturedAt),source:reference.field?"amazon_retail_reference":null};
 const direct=field(records,variant?["supplierPrice","purchasePrice","costPrice","buyPrice"]:["supplierPrice","purchasePrice","costPrice","buyPrice","sourcePrice"],amount);
 const projected=field(records.flatMap(r=>[obj(r.economics),obj(r.pricing)]),["buyPrice","purchasePrice"],amount);
 const chosen=fact?{value:amount(fact.amount),record:fact,field:"economicsFacts.purchase"}:direct.value!==null?direct:projected;
 const r=chosen.record;
 const observedReference=amazonReference.amount!==null&&chosen.value===amazonReference.amount;
 const recordedVerified=Boolean(fact?.status==="verified"||(!fact&&direct.value!==null&&direct.record.supplierContractVerified===true&&(direct.record.supplierCostVerified===true||direct.record.meta?.supplierCostVerified===true)));
 const blockedReference=(!recordedVerified&&(explicit||observedReference))||/amazon.*(?:reference|retail)|(?:reference|retail).*amazon/i.test(String(fact?.source||r.priceSource||""));
 const value=blockedReference?null:chosen.value;
 const curr=currency(r.costCurrency||r.supplierCurrency||r.currency)|| (fact?firstValue(currency,...records.map(v=>v.costCurrency||v.supplierCurrency)):null);
 return {amount:value,currency:curr,source:value===null?null:(id(fact?.source)||chosen.field),
  provenance:value===null?"missing":recordedVerified?"stored_verified":"unverified",
  capturedAt:stamp(r.checkedAt||r.capturedAt||r.observedAt||r.supplierPriceCapturedAt),amazonReference,
  authenticated:false};
}
function supplierStock(records,variant=false){
 const explicit=field(records,variant?["supplierStock","stock","warehouseInventoryNum"]:["supplierStock","warehouseInventoryNum"],stock);
 const availDirect=field(records,variant?["supplierAvailable","available"]:["supplierAvailable"],v=>typeof v==="boolean"?v:null);
 const avail=availDirect.field?availDirect:field(records.map(r=>obj(r.supplier)),["available"],v=>typeof v==="boolean"?v:null);
 // Only supplier-scoped values; generic product inventory is never eBay evidence.
 const scoped=records.map(r=>obj(r.supplier));
 const observed=explicit.value!==null?explicit:field(scoped,["stock","supplierStock"],stock);
 const source=observed.field?observed:avail;
 const r=source.record;
 const conflict=(observed.value===0&&avail.value===true)||(observed.value>0&&avail.value===false);
 return {quantity:observed.value,available:conflict?null:avail.value??(observed.value===null?null:observed.value>0),
  source:source.field,capturedAt:stamp(r.supplierStockCapturedAt||r.stockCapturedAt||r.availabilityCapturedAt||r.checkedAt),
  conflict,authenticated:false};
}
export function productOfferIdentity(p){
 const records=layers(p), root=records[0], identity=obj(root.identity), channel=obj(root.channels?.ebay||p.channels?.ebay), listing=obj(root.listing||p.listing);
 const productId=firstId(root.productId,identity.productId,p.productId);
 const companyOsProductId=firstId(root.companyOsProductId,identity.companyOsProductId,p.companyOsProductId);
 const sku=firstId(identity.articleNumber,root.articleNumber,p.articleNumber,channel.sku,listing.ebaySku,root.ebaySku,p.ebaySku,((listing.listingId||listing.ebayItemId||listing.offerId)?listing.sku:null));
 const parentSkus=[identity.articleNumber,root.articleNumber,p.articleNumber,channel.sku,listing.sku].map(id).filter(Boolean);
 const listingIds=[channel.listingId,listing.listingId,listing.ebayItemId,p.ebayItemId,p.listingId].map(id).filter(Boolean);
 const offerIds=[channel.offerId,listing.offerId,p.offerId].map(id).filter(Boolean);
 return {productId,companyOsProductId,masterId:firstId(p.sellerToolMasterProductId,p.id,root.id),articleNumber:firstId(identity.articleNumber,root.articleNumber,p.articleNumber),
  sku,supplierId:firstId(root.supplier?.id,p.supplierId,p.supplier?.id),supplierProductId:firstId(root.supplierProductId,p.supplierProductId),
  supplierSku:firstId(identity.supplierSku,root.supplierSku,p.supplierSku),listingId:listingIds[0]??null,offerId:offerIds[0]??null,
  groupKey:firstId(channel.inventoryItemGroupKey,listing.inventoryItemGroupKey),environment:firstId(channel.environment,listing.environment),
  accountId:firstId(channel.ebayAccountId,listing.ebayAccountId),workspaceId:firstId(root.workspaceId,p.workspaceId),
  conflict:[parentSkus,listingIds,offerIds].some(v=>new Set(v).size>1)};
}
function variants(p){
 const rs=layers(p), root=rs[0], channel=obj(root.channels?.ebay||p.channels?.ebay);
 const combinations=rs.map(r=>r.variantCombinations).find(v=>arr(v).length);
 const rows=arr(combinations||rs.map(r=>r.variants).find(v=>arr(v).length));
 const registered=new Set(arr(channel.variantSkus).map(id).filter(Boolean));
 const result=rows.slice(0,100).map(v=>({record:obj(v),sku:firstId(v.ebaySku,v.variantSku,(/^ELY-\d{6,}-\d{2,}$/i.test(v.sku||"")||registered.has(v.sku))?v.sku:null),supplierVariantId:firstId(v.supplierVariantId,v.supplierSku,v.supplierSkuId,v.skuId),
  listingId:firstId(v.listingId,v.ebayItemId),offerId:id(v.offerId),label:Object.values(obj(v.selections||v.attributes)).filter(x=>typeof x==="string").join(" / "),
  image:v.variantImageStatus==="manual_removed"?null:firstId(v.image,...arr(v.imageUrls))}));
 // A registered eBay variant can survive removal of the supplier combination.
 for(const sku of arr(channel.variantSkus).slice(0,100).map(id).filter(Boolean))if(!result.some(v=>v.sku===sku))result.push({record:{},sku,supplierVariantId:null,listingId:null,offerId:null,label:"Lieferantenkombination fehlt",image:null});
 return result;
}
const add=(map,key,value)=>{if(key){if(!map.has(key))map.set(key,[]);map.get(key).push(value);}};
export function createPriceStockIndex(products,snapshot,{environment="production",accountId=null}={}){
 const owners=new Map(), bySku=new Map(), byListing=new Map(), byOffer=new Map(), productIds=new Map();
 for(const p of arr(products)){
  const i=productOfferIdentity(p);add(productIds,i.masterId,p);
  for(const sku of new Set([i.sku,...variants(p).map(v=>v.sku)].filter(Boolean)))add(owners,sku,p);
 }
 const usable=snapshot?.ok===true&&snapshot.environment===environment&&
   ["ebay_seller_state","ebay_inventory_api"].includes(snapshot.source)&&(!accountId||snapshot.accountId===accountId);
 if(usable){
  const inventory=snapshot.source==="ebay_inventory_api"?snapshot.items:
   snapshot.inventoryOffers?.environment===environment&&!snapshot.inventoryOffers?.error? snapshot.inventoryOffers.items:[];
  const append=(row,kind)=>{
   const r=obj(row), e=obj(r.priceStockEvidence), scope=e.environment||snapshot.environment;
   if(scope!==environment||r.environment&&r.environment!==environment||r.accountId&&r.accountId!==snapshot.accountId)return;
   const item={sku:id(Object.hasOwn(e,"sku")?e.sku:r.sku),listingId:id(r.listingId),offerId:id(r.offerId),groupKey:id(r.inventoryItemGroupKey),
    status:kind==="active"?"ACTIVE":r.status==="PUBLISHED"?"PUBLISHED":r.status==="UNPUBLISHED"?"DRAFT":"UNKNOWN",
    kind,marketplace:id(e.marketplaceId),currency:currency(e.currency),price:amount(e.price),quantity:stock(e.quantity),
    capturedAt:kind==="inventory"?stamp(snapshot.inventoryOffers?.syncedAt||snapshot.syncedAt):stamp(snapshot.syncedAt),
    origin:kind==="inventory"?"inventory":kind==="feed"?"seller_hub_feed":"unknown"};
   if(kind==="feed"){item.marketplace=null;item.currency=currency(r.currency);item.price=amount(r.price);item.quantity=null;item.capturedAt=stamp(r.feedStatusCheckedAt);}
   add(bySku,item.sku,item);add(byListing,item.listingId,item);add(byOffer,item.offerId,item);
  };
  for(const row of arr(inventory))append(row,"inventory");
  if(snapshot.source==="ebay_seller_state"){
   for(const row of arr(snapshot.activeListings)){
    const observations=arr(row.priceStockVariants);
    if(observations.length){for(const observation of observations)append({...row,sku:observation.sku,priceStockEvidence:observation},"active");}
    else append(row,"active");
   }
   for(const row of arr(snapshot.draftItems))if(row.source==="elyon_seller_hub_feed")append(row,"feed");
  }
 }
 return {owners,bySku,byListing,byOffer,productIds,usable,environment,accountId,scopeAuthenticated:false,syncedAt:usable?stamp(snapshot.syncedAt):null};
}
function resolve(target,identity,index,product){
 if(identity.conflict||index.productIds.get(identity.masterId)?.length>1||index.owners.get(target.sku)?.length>1)return {state:"IDENTITY_CONFLICT",offer:null};
 if(!target.sku||!identity.masterId)return {state:"EVIDENCE_MISSING",offer:null};
 if(identity.environment&&identity.environment!==index.environment||identity.accountId&&identity.accountId!==index.accountId)return {state:"IDENTITY_CONFLICT",offer:null};
 if(!index.usable)return {state:"UNKNOWN",offer:null};
 const rows=index.bySku.get(target.sku)||[];
 const candidates=rows.filter(r=>r.marketplace==="EBAY_DE"||r.marketplace===null);
 if(target.offerId&&index.byOffer.has(target.offerId)&&index.byOffer.get(target.offerId).some(r=>r.sku!==target.sku))return {state:"IDENTITY_CONFLICT",offer:null};
 if(target.listingId&&index.byListing.has(target.listingId)&&!index.byListing.get(target.listingId).some(r=>r.sku===target.sku))return {state:"IDENTITY_CONFLICT",offer:null};
 if(!candidates.length)return {state:rows.length?"IDENTITY_CONFLICT":"UNKNOWN",offer:null};
 const inv=candidates.filter(r=>r.kind==="inventory"), active=candidates.filter(r=>r.kind==="active"), feed=candidates.filter(r=>r.kind==="feed");
 if(inv.length>1||active.length>1||feed.length>1)return {state:"IDENTITY_CONFLICT",offer:null};
 const a=active[0],i=inv[0],f=feed[0];
 if(a&&i&&(!a.listingId||!i.listingId||a.listingId!==i.listingId||i.status!=="PUBLISHED")||f&&(a||i))return {state:"IDENTITY_CONFLICT",offer:null};
 const row=i||a||f;
 if((target.listingId&&row.listingId!==target.listingId)||(target.offerId&&row.offerId!==target.offerId)||
   (identity.groupKey&&row.groupKey&&identity.groupKey!==row.groupKey))return {state:"IDENTITY_CONFLICT",offer:null};
 if(a&&i&&a.price!==null&&i.price!==null&&a.currency===i.currency&&a.price!==i.price)return {state:"IDENTITY_CONFLICT",offer:null};
 const offer={...row,status:a?"ACTIVE":row.status,origin:a&&i?"inventory":row.origin};
 return {state:offer.origin==="unknown"?"OFFER_ORIGIN_UNKNOWN":"MATCHED",offer};
}
export function buildPriceStockSnapshot(product,index,{now=Date.now()}={}){
 const p=obj(product),identity=productOfferIdentity(p), records=layers(p), root=records[0], vs=variants(p);
 const seen=new Set(), duplicates=new Set();
 for(const v of vs){if(v.sku&&seen.has(v.sku))duplicates.add(v.sku);seen.add(v.sku);}
 const targets=vs.length?vs:[{record:root,sku:identity.sku,listingId:identity.listingId,offerId:identity.offerId,label:"",image:null,supplierVariantId:null}];
 const rows=targets.map(t=>{
  const vf=vs.length&&t.sku?records.map(r=>obj(r.variantEconomicsFacts)[t.sku]).find(v=>v&&typeof v==="object"):null;
  const supplier=vs.length?[vf?{...t.record,economicsFacts:vf}:t.record]:records;
  const price=storedPrice(supplier,!!vs.length), supply=supplierStock(supplier,!!vs.length);
  const link=duplicates.has(t.sku)?{state:"IDENTITY_CONFLICT",offer:null}:resolve(t,identity,index,p);
  const offer=link.offer;
  const status=new Set();
  if(link.state!=="MATCHED")status.add(link.state);
  if(price.amount===null||!price.currency||price.provenance!=="stored_verified"||supply.quantity===null||!offer||offer.quantity===null||offer.price===null||!offer.currency||!offer.marketplace)status.add("EVIDENCE_MISSING");
  if(supply.available===false)status.add("SUPPLIER_UNAVAILABLE");
  if(supply.conflict)status.add("STOCK_REVIEW_REQUIRED");
  if(supply.quantity!==null&&offer?.quantity!==null&&offer?.quantity!==undefined&&offer.quantity>supply.quantity)status.add("STOCK_REVIEW_REQUIRED");
  if(price.currency&&offer?.currency&&price.currency!==offer.currency)status.add("PRICE_REVIEW_REQUIRED");
  if(offer&&offer.kind==="feed")status.add("EVIDENCE_MISSING");
  const ages={price:freshness(price.capturedAt,now),supplier:freshness(supply.capturedAt,now),offer:freshness(offer?.capturedAt,now)};
  if(Object.values(ages).includes("stale")||root.sellerView?.freshness==="stale"||p.sellerView?.freshness==="stale")status.add("DATA_STALE");
  if(Object.values(ages).includes("unknown"))status.add("EVIDENCE_MISSING");
  return {sku:t.sku,supplierVariantId:t.supplierVariantId,label:t.label,image:t.image,supplierPrice:price,supplierStock:supply,offer,identityStatus:link.state,statuses:[...status],ages};
 });
 // Existing provenance helper only for the saved price path; never compute profit.
 const provenance=extractPriceProvenance(p);
 const economics=obj(root.economics), canonical=root.schemaVersion==="elyon-product-master-v2"||root.sourceOfTruth==="company_os_canonical_state";
 const economicsView={source:canonical?"company_os_saved":"unverified",currency:currency(economics.currency),
  savedSalePrice:canonical?amount(economics.salePrice):provenance.finalSalePrice,
  shippingCost:canonical?amount(economics.shippingCost,{zero:true}):null,fees:canonical?amount(economics.fees,{zero:true}):null,
  profit:canonical?amount(economics.profit,{signed:true,zero:true}):null,margin:canonical?amount(economics.marginPercent,{signed:true,zero:true}):null,
  ruleRevision:canonical&&Number.isSafeInteger(economics.ruleRevision)?economics.ruleRevision:null,
  minimumRulePassed:canonical&&typeof economics.minimumRulePassed==="boolean"?economics.minimumRulePassed:null,
  binding:false};
 return {schemaVersion:"elyon-price-stock-read-v2.1",identity,rows,economics:economicsView,
  syncedAt:index.syncedAt,environment:index.environment,accountId:index.accountId,scopeAuthenticated:false,
  templateId:"ebay.de.price-quantity",action:"Revise",readOnly:true,executionAuthorized:false,evidenceAuthenticated:false,
  operationalEnabled:false,uploadVerified:false};
}
