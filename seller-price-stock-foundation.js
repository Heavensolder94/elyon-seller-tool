import { createPriceStockIndex, buildPriceStockSnapshot } from "./seller-price-stock-foundation-core.js";

import { mountPriceStockReview, clearPriceStockReviews, reconcilePriceStockReviews } from "./seller-price-stock-review.js";

const PANEL="elyon-price-stock-foundation";
const labels={IDENTITY_CONFLICT:"Identität ungeklärt",EVIDENCE_MISSING:"Nachweise fehlen",DATA_STALE:"Daten veraltet",UNKNOWN:"Kein bestätigter Angebotsabgleich",OFFER_ORIGIN_UNKNOWN:"Angebotsherkunft unbekannt",SUPPLIER_UNAVAILABLE:"Lieferant nicht verfügbar",STOCK_REVIEW_REQUIRED:"Bestand prüfen",PRICE_REVIEW_REQUIRED:"Währung / Preis prüfen"};
const statuses={ACTIVE:"Aktiv bestätigt",PUBLISHED:"Veröffentlicht (Inventory)",DRAFT:"Entwurf",UNKNOWN:"Unbekannt"};
const origins={inventory:"Inventory API",seller_hub_feed:"Seller-Hub-Feed (Historie)",unknown:"Ursprung unbekannt"};
const money=(value,currency)=>value===null||value===undefined?"Unbekannt":currency?value.toLocaleString("de-DE",{style:"currency",currency}):value.toLocaleString("de-DE")+" · Währung offen";
const count=value=>value===null||value===undefined?"Unbekannt":String(value);
const date=value=>value?new Date(value).toLocaleString("de-DE"):"Zeitpunkt unbekannt";
const auth=()=>window.ElyonSellerAuth?.isAuthenticated?.()===true;
let index=null;
function node(tag,text,className){
 const n=document.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n;
}
function metric(grid,label,value,description){
 const item=node("div",null,"elyon-ps-metric");item.append(node("small",label),node("strong",value),node("span",description));grid.append(item);
}
function installStyles(){
 if(document.getElementById("elyon-price-stock-foundation-style"))return;
 const s=node("style");s.id="elyon-price-stock-foundation-style";s.textContent=
 '.elyon-price-stock-foundation{grid-column:1/-1;min-width:0;padding:14px;border-radius:14px;border:1px solid rgba(148,163,184,.2);background:rgba(2,6,23,.25)}'+
 '.elyon-price-stock-foundation h3{margin:0 0 5px;font-size:15px}.elyon-price-stock-foundation h4{font-size:13px;margin:12px 0 6px;overflow-wrap:anywhere}'+
 '.elyon-ps-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px;margin:8px 0}'+
 '.elyon-ps-metric{min-width:0;display:grid;gap:4px;padding:8px;border:1px solid rgba(148,163,184,.14);border-radius:10px;overflow-wrap:anywhere}'+
 '.elyon-ps-metric small,.elyon-ps-metric span,.elyon-ps-note{font-size:11px;color:inherit;opacity:.8;line-height:1.45;overflow-wrap:anywhere}'+
 '.elyon-ps-metric strong{font-size:14px}.elyon-ps-status{display:flex;flex-wrap:wrap;gap:5px}.elyon-ps-status .pill{font-size:11px;white-space:normal}'+
 '.elyon-ps-row+.elyon-ps-row{border-top:1px solid rgba(148,163,184,.15);padding-top:8px;margin-top:8px}';
 document.head.append(s);
}
function fill(panel,model){
 panel.replaceChildren();
 panel.append(node("h3","Preis & Bestand"),node("p","Nur Übersicht · keine automatische Preis- oder Bestandsänderung.","elyon-ps-note"));
 panel.append(node("p","eBay-Abgleich: "+date(model.syncedAt)+" · "+model.environment+" · Kontozuordnung nicht verifiziert","elyon-ps-note"));
 if(!model.syncedAt)panel.append(node("p","Noch kein Angebotsabgleich verfügbar. Nutze die vorhandene Listing-Status-Aktualisierung im Dashboard.","elyon-ps-note"));
 const economic=model.economics;
 for(const row of model.rows){
  const section=node("section",null,"elyon-ps-row");
  if(model.rows.length>1||row.label)section.append(node("h4",[row.sku||"SKU fehlt",row.label].filter(Boolean).join(" · ")));
  const price=row.supplierPrice, supply=row.supplierStock, offer=row.offer, grid=node("div",null,"elyon-ps-grid");
  const source=price.provenance==="stored_verified"?"Gespeichert bestätigt (nicht live geprüft)":price.provenance==="unverified"?"Gespeichert · unbestätigt":"Kein Einkaufsnachweis";
  metric(grid,"Lieferanten-EK",money(price.amount,price.currency),source+(price.source?" · "+price.source:"")+" · "+date(price.capturedAt));
  metric(grid,"eBay-VK",money(offer?.price,offer?.currency),offer?origins[offer.origin]+" · "+date(offer.capturedAt):"Kein eindeutig zugeordnetes Angebot");
  metric(grid,"Lieferantenbestand",count(supply.quantity), (supply.available===true?"Verfügbar":supply.available===false?"Nicht verfügbar":"Verfügbarkeit unbekannt")+" · "+date(supply.capturedAt));
  metric(grid,"eBay-Bestand",count(offer?.quantity),offer?statuses[offer.status]||"Unbekannt":"Kein bestätigter Abgleich");
  section.append(grid);
  if(price.amazonReference.amount!==null)section.append(node("p","Amazon-Retail-Referenz: "+money(price.amazonReference.amount,price.amazonReference.currency)+" · kein Einkaufsnachweis · "+date(price.amazonReference.capturedAt),"elyon-ps-note"));
  const ids=[row.sku&&"SKU "+row.sku,row.supplierVariantId&&"Lieferantenvariante "+row.supplierVariantId,offer?.listingId&&"Listing "+offer.listingId,offer?.offerId&&"Offer "+offer.offerId,offer?.marketplace&&offer.marketplace].filter(Boolean);
  if(ids.length)section.append(node("p",ids.join(" · "),"elyon-ps-note"));
  const status=node("div",null,"elyon-ps-status");
  for(const code of row.statuses)status.append(node("span",labels[code]||code,"pill"));
  if(!row.statuses.length)status.append(node("span","Keine Auffälligkeit in vorhandenen Daten · keine Freigabe","pill"));
  section.append(status);mountPriceStockReview(section,model,row);panel.append(section);
 }
 if(economic.source==="company_os_saved"&&(economic.profit!==null||economic.margin!==null)){
  panel.append(node("p","Gespeicherte Company-OS-Kalkulation (kein aktueller Gewinnnachweis): Gewinn "+money(economic.profit,economic.currency)+" · Marge "+(economic.margin===null?"unbekannt":economic.margin.toLocaleString("de-DE")+" %")+(economic.savedSalePrice!==null?" · kalkulierter VK "+money(economic.savedSalePrice,economic.currency):""),"elyon-ps-note"));
 }
}
export function prepare(products){
 if(!auth()){index=null;return;}
 index=createPriceStockIndex(products,window.__elyonPriceStockSellerState,{environment:"production"});
 const projections=new Map();
 reconcilePriceStockReviews(change=>{
  const owners=index.owners.get(change.sku);
  if(owners?.length!==1)return null;
  const product=owners[0];
  if(!projections.has(product))projections.set(product,buildPriceStockSnapshot(product,index));
  return projections.get(product);
 });
}
export function renderCard(card,product,expanded){
 let panel=card.querySelector(":scope > ."+PANEL);
 if(!expanded||!product||!auth()||!index){panel?.remove();return;}
 const model=buildPriceStockSnapshot(product,index);
 const signature=JSON.stringify(model);
 if(panel?.dataset.priceStockSignature===signature)return;
 installStyles();
 if(!panel){panel=node("section",null,PANEL);card.insertBefore(panel,[...card.children].find(n=>n.classList.contains("actions"))||null);}
 panel.dataset.priceStockSignature=signature;fill(panel,model);
}
if(typeof window!=="undefined"){
 window.ElyonPriceStockFoundation=Object.freeze({prepare,renderCard});
 window.addEventListener("elyon:seller-auth-ready",event=>{
  if(event.detail?.authenticated!==true){clearPriceStockReviews();index=null;document.querySelectorAll("."+PANEL).forEach(panel=>panel.remove());}
 });
}
