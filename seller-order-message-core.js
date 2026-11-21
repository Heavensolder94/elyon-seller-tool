// ELYON transactional customer message templates. No email marketing or external links.
export const DEFAULT_ORDER_THANK_YOU = `Guten Tag {Kundenname},

vielen Dank für Ihre Bestellung bei {Shopname}!

Anbei erhalten Sie die Rechnung {Rechnungsnummer} zu Ihrer eBay-Bestellung {Bestellnummer} als PDF.

Bei Fragen zu Ihrer Bestellung können Sie uns gerne direkt über eBay kontaktieren.

Freundliche Grüße
Ihr {Shopname}-Team`;

export const ORDER_MESSAGE_TOKENS = Object.freeze([
  "Kundenname", "Bestellnummer", "Rechnungsnummer", "Shopname",
]);
const str = (value) => String(value ?? "");
export function validateThankYouTemplate(raw) {
  const template = str(raw).replace(/\r\n?/g,"\n").trim();
  const errors=[];
  if (template.length < 35 || template.length > 1700) errors.push("Nachrichtenvorlage muss 35–1700 Zeichen haben.");
  const tokens=[...template.matchAll(/\{([^{}]+)\}/g)].map(match=>match[1]);
  for(const token of tokens) if(!ORDER_MESSAGE_TOKENS.includes(token)) errors.push("Unbekannter Platzhalter: {"+token+"}");
  if (/https?:\/\/|www\.|mailto:/i.test(template)) errors.push("Keine externen Links in der transaktionalen Nachricht.");
  if (/<[^>]+>/.test(template)) errors.push("Keine HTML-Tags in eBay-Nachrichten.");
  return { ok:errors.length===0,template,errors };
}
export function renderOrderThankYou(raw, { buyerName, orderId, invoiceNumber, shopName } = {}) {
  const v=validateThankYouTemplate(raw);
  if(!v.ok) return {ok:false,text:"",errors:v.errors};
  const values={
    Kundenname:str(buyerName).trim() || "liebe Kundin, lieber Kunde",
    Bestellnummer:str(orderId).trim(),
    Rechnungsnummer:str(invoiceNumber).trim(),
    Shopname:str(shopName).trim() || "ELYON",
  };
  if(!values.Bestellnummer || !values.Rechnungsnummer) return {
    ok:false,text:"",errors:["Die Rechnung muss einer gültigen eBay-Bestellung zugeordnet sein."] };
  const result=v.template.replace(/\{(Kundenname|Bestellnummer|Rechnungsnummer|Shopname)\}/g,
    (_,token)=>values[token]);
  if(result.length>2000) return {ok:false,text:"",errors:["Nachricht ist nach Personalisierung zu lang (maximal 2000 Zeichen)."]};
  return {ok:true,text:result,errors:[]};
}
