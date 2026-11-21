// Pure validation for explicit Nova -> SellerTool order handoff. Never guesses the
// recipient eBay order, never writes finance and never creates supplier purchases.
const str=value=>String(value??"").trim();
const suppliers=Object.freeze({temu:"Temu",aliexpress:"AliExpress",amazon:"Amazon",cj:"CJ Dropshipping"});
export function validateSupplierOrderHandoff(raw,{supplierSuggestion=null,existingOperation={}}={}){
  const errors=[];
  let data;
  try{data=typeof raw==="string"?JSON.parse(raw):raw;}catch{return {ok:false,errors:["Kein gültiges JSON aus ELYON Nova."]};}
  if(!data||typeof data!=="object"||Array.isArray(data))
    return {ok:false,errors:["Ungültiger Importinhalt."]};
  if(data.schema!=="elyon-supplier-order-capture/v1" || data.source!=="elyon_nova_manual_capture" || data.verified!==false)
    errors.push("Kein gültiger manueller ELYON-Nova-Lieferantenauftrag.");
  const supplierName=suppliers[data.supplierId];
  if(!supplierName || str(data.supplierName)!==supplierName)errors.push("Lieferant nicht eindeutig.");
  const orderNo=str(data.supplierOrderId);
  if(!/^[A-Za-z0-9-]{7,80}$/.test(orderNo))errors.push("Lieferanten-Bestellnummer ungültig.");
  const sku=str(data.supplierSku);
  if(sku.length>160 || /[\x00-\x1f\x7f]/.test(sku))errors.push("Lieferanten-SKU ungültig.");
  const saved=str(existingOperation.supplierName);
  const suggested=str(supplierSuggestion?.supplierName);
  if(saved && supplierName && saved.toLocaleLowerCase("de-DE")!==supplierName.toLocaleLowerCase("de-DE"))
    errors.push("Bereits gespeicherter Lieferant weicht ab.");
  if(suggested && supplierName && suggested.toLocaleLowerCase("de-DE")!==supplierName.toLocaleLowerCase("de-DE"))
    errors.push("Company-OS-Lieferant weicht ab.");
  const savedOrderNo=str(existingOperation.supplierOrderId);
  if(savedOrderNo && savedOrderNo!==orderNo)
    errors.push("Eine andere Lieferanten-Bestellnummer ist bereits gespeichert.");
  const expectedSkus=(supplierSuggestion?.references||[]).map(r=>str(r.supplierSku)).filter(Boolean);
  if(sku && expectedSkus.length && !expectedSkus.includes(sku))
    errors.push("Lieferanten-SKU stimmt nicht mit Company OS überein.");
  const savedSku=str(existingOperation.supplierProductRef);
  if(sku && savedSku && sku!==savedSku)
    errors.push("Die gespeicherte Lieferanten-Artikelreferenz weicht ab.");
  return {ok:errors.length===0,errors,values:{supplierName, supplierOrderId:orderNo,
    supplierProductRef:sku||savedSku||""},requiresExplicitConfirmation:true};
}
