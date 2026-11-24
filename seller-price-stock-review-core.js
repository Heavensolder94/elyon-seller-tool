import { amount, stock } from './seller-price-stock-foundation-core.js';
export const SCHEMA='elyon-price-stock-proposal-v2.2';
const active=o=>o&&['ACTIVE','PUBLISHED'].includes(o.status);
const decimal=v=>{const n=amount(v);return n!==null&&n>0&&n<=9999999&&Math.round(n*100)/100===n?n.toFixed(2):null;};
export function suggestChange(model,row){
 const o=row.offer,s=row.supplierStock, reasons=[];
 let price=null,quantity=null;
 if(!active(o)||row.identityStatus==='IDENTITY_CONFLICT')return {price,quantity,reasons:['Kein eindeutig zugeordnetes aktives Angebot.']};
 if(row.ages.supplier==='recent'&&s.quantity!==null&&o.quantity!==null&&!s.conflict&&s.quantity<o.quantity)
  {quantity=String(s.quantity);reasons.push('Lieferantenbestand unter Angebotsbestand – Reduzierung prüfen.');}
 else if(row.ages.supplier!=='recent'||s.quantity===null)reasons.push('Lieferantenbestand oder Aktualität fehlt.');
 else if(s.available===false)reasons.push('Lieferantenverfügbarkeit prüfen.');
 else reasons.push('Keine automatische Bestandserhöhung.');
 if(row.ages.price!=='recent'||row.supplierPrice.provenance!=='stored_verified')reasons.push('Einkaufsgrundlage aktualisieren oder prüfen.');
 if(o.currency!=='EUR'||row.supplierPrice.currency!=='EUR')reasons.push('Währung / Einkaufsnachweis offen.');
 // Parent saved price must never be copied into a variant.
 const saved=model.economics.savedSalePrice;
 if(model.rows.length===1&&row.sku===model.identity.sku&&model.economics.source==='company_os_saved'&&model.economics.currency==='EUR'&&o.currency==='EUR'&&o.price!==null&&decimal(saved)&&Number(saved)!==o.price){
  price=decimal(saved);reasons.push('Gespeicherter Company-OS-VK weicht vom Angebot ab – Preis prüfen.');
 }
 if(model.economics.minimumRulePassed===false)reasons.push('Gespeicherte Mindestregel möglicherweise unterschritten.');
 return {price,quantity,reasons};
}
export function makeReviewChange(model,row,{price='',quantity=''}={}){
 const o=row.offer;
 if(!active(o)||row.identityStatus==='IDENTITY_CONFLICT'||!row.sku||!model.identity.articleNumber||
    model.environment!=='production'||o.marketplace!=='EBAY_DE'||o.currency!=='EUR')throw Error('Angebotsidentität oder Währung nicht eindeutig.');
 if(price!==''&&!decimal(price))throw Error('Gültigen positiven Preis mit höchstens zwei Nachkommastellen eingeben.');
 if(quantity!==''&&(stock(quantity)===null||stock(quantity)>999999999))throw Error('Gültigen ganzzahligen Bestand eingeben.');
 const p=price===''?null:decimal(price),q=quantity===''?null:String(stock(quantity));
 const currentPrice=decimal(o.price),currentQuantity=o.quantity===null?null:String(o.quantity);
 const changedPrice=p!==null&&p!==currentPrice?p:null;
 const changedQuantity=q!==null&&q!==currentQuantity?q:null;
 if(changedQuantity!==null&&(currentQuantity===null||Number(changedQuantity)>Number(currentQuantity)))throw Error('Bestandserhöhung oder unbekannter Ist-Bestand erfordert verifizierte Nachweise.');
 if(changedQuantity!==null&&(row.ages.supplier!=='recent'||row.supplierStock.quantity===null||row.supplierStock.conflict||Number(changedQuantity)>row.supplierStock.quantity))throw Error('Aktuellen Lieferantenbestand prüfen.');
 if(changedPrice===null&&changedQuantity===null)throw Error('Keine Änderung ausgewählt.');
 return {articleNumber:model.identity.articleNumber,sku:row.sku,listingId:o.listingId,offerId:o.offerId,
  environment:model.environment,marketplace:o.marketplace,currency:o.currency,origin:['inventory','trading'].includes(o.origin)?o.origin:'unknown',
  currentPrice,currentQuantity,price:changedPrice,quantity:changedQuantity};
}
export function reviewKey(c){return c.articleNumber+'|'+c.sku;}
export function buildReviewRequest(changes){
 if(!Array.isArray(changes)||changes.length<1||changes.length>50)throw Error('1 bis 50 Änderungen auswählen.');
 const seen=new Set(),offers=new Set();
 for(const c of changes){
  const key=reviewKey(c);
  if(seen.has(key)||c.offerId&&offers.has(c.offerId))throw Error('Doppeltes Zielangebot.');
  seen.add(key);if(c.offerId)offers.add(c.offerId);
 }
 return {schemaVersion:SCHEMA,changes};
}
