import { xml2js } from 'xml-js';
const NS = { invoice:'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2', credit:'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2', cbc:'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2', cac:'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2' };

// Read only a small UBL subset; unknown or ambiguous values stay empty and
// all suggestions require user review. No payment date or booking is inferred.
export function extractUblReceipt(xml) {
 if (typeof xml !== 'string' || Buffer.byteLength(xml, 'utf8') > 1000000 || !xml.trim()) throw new Error('XML fehlt oder überschreitet 1 MB.');
 if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('XML mit DTD oder Entitäten wird nicht verarbeitet.');
 let parsed;try {parsed=xml2js(xml,{compact:false,ignoreComment:true,ignoreInstruction:true});}catch{throw new Error('Ungültiges XML.');}
 const roots=(parsed.elements||[]).filter(x=>x.type==='element');if(roots.length!==1)throw new Error('Ein einzelnes UBL-Dokument wird benötigt.');
 function enrich(node,parent={}) {
  const namespaces={...parent};for(const [key,value] of Object.entries(node.attributes||{})){if(key==='xmlns')namespaces['']=value;else if(key.startsWith('xmlns:'))namespaces[key.slice(6)]=value;}
  const parts=node.name.split(':');const prefix=parts.length===2?parts[0]:'';return {node,local:parts.at(-1),ns:namespaces[prefix]||'',namespaces};
 }
 const root=enrich(roots[0]);const type=root.local==='Invoice'&&root.ns===NS.invoice?'supplier_invoice':root.local==='CreditNote'&&root.ns===NS.credit?'supplier_credit':'';
 if(!type)throw new Error('Nur UBL-Rechnungen und UBL-Gutschriften werden erkannt.');
 const children=(item,ns,name)=>(item.node.elements||[]).filter(x=>x.type==='element').map(x=>enrich(x,item.namespaces)).filter(x=>x.ns===ns&&x.local===name);
 const one=(items)=>items.length===1?items[0]:null;
 const value=item=>item?String((item.node.elements||[]).filter(x=>x.type==='text'||x.type==='cdata').map(x=>x.text||x.cdata||'').join('')).trim().slice(0,300):'';
 const get=(item,ns,name)=>value(one(children(item,ns,name)));
 const groups=(start,paths)=>paths.reduce((nodes,[ns,name])=>nodes.flatMap(n=>children(n,ns,name)),[start]);
 const singleValue=(start,paths)=>value(one(groups(start,paths)));
 const legal=singleValue(root,[[NS.cac,'AccountingSupplierParty'],[NS.cac,'Party'],[NS.cac,'PartyLegalEntity'],[NS.cbc,'RegistrationName']]);
 const trade=singleValue(root,[[NS.cac,'AccountingSupplierParty'],[NS.cac,'Party'],[NS.cac,'PartyName'],[NS.cbc,'Name']]);
 const warnings=[];const supplier=legal&&trade&&legal!==trade?'':legal||trade;
 if(legal&&trade&&legal!==trade)warnings.push('Lieferantenname ist mehrdeutig; bitte im Original prüfen.');
 const moneyNode=one(groups(root,[[NS.cac,'LegalMonetaryTotal'],[NS.cbc,'PayableAmount']]));
 const currency=get(root,NS.cbc,'DocumentCurrencyCode').toUpperCase();let amount=value(moneyNode);
 if(!/^[A-Z]{3}$/.test(currency)||!/^\d{1,9}(?:\.\d{1,2})?$/.test(amount)||String(moneyNode?.node?.attributes?.currencyID||'').toUpperCase()!==currency){amount='';warnings.push('Zahlbetrag oder Währung ist nicht eindeutig.');}
 let documentDate=get(root,NS.cbc,'IssueDate');if(documentDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(documentDate)||Number.isNaN(Date.parse(documentDate))||new Date(documentDate).toISOString().slice(0,10)!==documentDate)){documentDate='';warnings.push('Belegdatum ist ungültig.');}
 return {documentType:type,supplier,invoiceReference:get(root,NS.cbc,'ID'),orderReference:singleValue(root,[[NS.cac,'OrderReference'],[NS.cbc,'ID']]),documentDate,amount,currency,warnings};
}
