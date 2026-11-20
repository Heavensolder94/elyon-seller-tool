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
 const children=(item,ns,name)=>(item.node.elements||[]).filter(x=>x.type==='element').map(x=>enrich(x,item.namespaces)).filter(x=>x.ns===ns&&x.local===name);
 const one=(items)=>items.length===1?items[0]:null;
 const value=item=>item?String((item.node.elements||[]).filter(x=>x.type==='text'||x.type==='cdata').map(x=>x.text||x.cdata||'').join('')).trim().slice(0,300):'';
 const get=(item,ns,name)=>value(one(children(item,ns,name)));
 const groups=(start,paths)=>paths.reduce((nodes,[ns,name])=>nodes.flatMap(n=>children(n,ns,name)),[start]);
 const singleValue=(start,paths)=>value(one(groups(start,paths)));
 const CII='urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100';
 const RAM='urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100';
 const UDT='urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100';
 if(root.local==='CrossIndustryInvoice' && root.ns===CII){
  const header=one(children(root,CII,'ExchangedDocument'));
  const code=header?get(header,RAM,'TypeCode'):'';
  const documentType=code==='380'?'supplier_invoice':code==='381'?'supplier_credit':'';
  if(!documentType)throw new Error('CII-Belegtyp ist keine eindeutig erkannte Rechnung oder Gutschrift.');
  const trx=one(children(root,CII,'SupplyChainTradeTransaction'));
  if(!header||!trx)throw new Error('CII-Kopfdaten sind nicht eindeutig.');
  const supplier=singleValue(trx,[[RAM,'ApplicableHeaderTradeAgreement'],[RAM,'SellerTradeParty'],[RAM,'Name']]);
  const orderReference=singleValue(trx,[[RAM,'ApplicableHeaderTradeAgreement'],[RAM,'BuyerOrderReferencedDocument'],[RAM,'IssuerAssignedID']]);
  const currency=singleValue(trx,[[RAM,'ApplicableHeaderTradeSettlement'],[RAM,'InvoiceCurrencyCode']]).toUpperCase();
  let amount=singleValue(trx,[[RAM,'ApplicableHeaderTradeSettlement'],[RAM,'SpecifiedTradeSettlementHeaderMonetarySummation'],[RAM,'DuePayableAmount']]);
  const warnings=[];
  if(!/^[A-Z]{3}$/.test(currency)||!/^\d{1,9}(?:\.\d{1,2})?$/.test(amount)){amount='';warnings.push('Zahlbetrag oder Währung ist nicht eindeutig oder negativ.');}
  const dateNode=one(groups(header,[[RAM,'IssueDateTime'],[UDT,'DateTimeString']]));
  const rawDate=value(dateNode);let documentDate='';
  if(dateNode && String(dateNode.node.attributes?.format||'')==='102' && /^\d{8}$/.test(rawDate)) {
    const candidate=rawDate.slice(0,4)+'-'+rawDate.slice(4,6)+'-'+rawDate.slice(6,8);
    if(!Number.isNaN(Date.parse(candidate)) && new Date(candidate).toISOString().slice(0,10)===candidate) documentDate=candidate;
  }
  if(!documentDate)warnings.push('Belegdatum ist nicht eindeutig.');
  return {documentType,supplier,invoiceReference:get(header,RAM,'ID'),orderReference,documentDate,amount,currency,warnings};
 }
 if(!type)throw new Error('Nur UBL- oder CII-Rechnungen und Gutschriften werden erkannt.');
 const legal=singleValue(root,[[NS.cac,'AccountingSupplierParty'],[NS.cac,'Party'],[NS.cac,'PartyLegalEntity'],[NS.cbc,'RegistrationName']]);
 const trade=singleValue(root,[[NS.cac,'AccountingSupplierParty'],[NS.cac,'Party'],[NS.cac,'PartyName'],[NS.cbc,'Name']]);
 const warnings=[];const supplier=legal&&trade&&legal!==trade?'':legal||trade;
 if(legal&&trade&&legal!==trade)warnings.push('Lieferantenname ist mehrdeutig; bitte im Original prüfen.');
 const moneyNode=one(groups(root,[[NS.cac,'LegalMonetaryTotal'],[NS.cbc,'PayableAmount']]));
 const currency=get(root,NS.cbc,'DocumentCurrencyCode').toUpperCase();let amount=value(moneyNode);
 if(!/^[A-Z]{3}$/.test(currency)||!/^\d{1,9}(?:\.\d{1,2})?$/.test(amount)||String(moneyNode?.node?.attributes?.currencyID||'').toUpperCase()!==currency){amount='';warnings.push('Zahlbetrag oder Währung ist nicht eindeutig.');}
 let documentDate=get(root,NS.cbc,'IssueDate');if(documentDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(documentDate)||Number.isNaN(Date.parse(documentDate))||new Date(documentDate).toISOString().slice(0,10)!==documentDate)){documentDate='';warnings.push('Belegdatum ist ungültig.');}
 // LineExtensionAmount is not necessarily the gross amount. Offer lines only
 // when every value is unambiguous and their sum equals the payable total.
 const lines=children(root,NS.cac,type==='supplier_credit'?'CreditNoteLine':'InvoiceLine');
 let lineItems=[];
 if(lines.length && lines.length<=100 && amount){
  const proposed=lines.map(line=>{
   const title=singleValue(line,[[NS.cac,'Item'],[NS.cbc,'Name']]);
   const quantity=get(line,NS.cbc,type==='supplier_credit'?'CreditedQuantity':'InvoicedQuantity');
   const node=one(children(line,NS.cbc,'LineExtensionAmount'));const valueAmount=value(node);
   if(!title||title.length>200||/[|\r\n]/.test(title)||!/^\d{1,6}(?:\.0+)?$/.test(quantity)||Number(quantity)<1||Number(quantity)>999999||!/^\d{1,9}(?:\.\d{1,2})?$/.test(valueAmount)||String(node?.node?.attributes?.currencyID||'').toUpperCase()!==currency)return null;
   return {title,quantity:Number(quantity),amount:valueAmount};
  });
  const cents=x=>{const [whole,decimal='']=x.split('.');return Number(whole)*100+Number((decimal+'00').slice(0,2));};
  if(proposed.every(Boolean)&&proposed.reduce((sum,line)=>sum+cents(line.amount),0)===cents(amount))lineItems=proposed;
  else warnings.push('Positionen sind mehrdeutig oder stimmen nicht mit dem Zahlbetrag überein; bitte manuell prüfen.');
 } else if(lines.length)warnings.push('Positionen konnten nicht eindeutig vorgeschlagen werden; bitte manuell prüfen.');
 return {documentType:type,supplier,invoiceReference:get(root,NS.cbc,'ID'),orderReference:singleValue(root,[[NS.cac,'OrderReference'],[NS.cbc,'ID']]),documentDate,amount,currency,lineItems,warnings};
}
