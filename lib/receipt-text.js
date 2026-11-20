// Conservative suggestions from selectable PDF text. No OCR, tax validation,
// supplier identity inference, payment-date inference or automatic booking.
export function extractReceiptTextSuggestions(text) {
 if(typeof text!=='string'||text.length>200000)throw new Error('Belegtext ist zu lang.');
 const lines=text.split(/\r?\n/).map(line=>line.replace(/[\t ]+/g,' ').trim()).filter(Boolean);
 const unique=(values)=>{const matches=[...new Set(values.filter(Boolean))];return matches.length===1?matches[0]:'';};
 const collect=(pattern)=>lines.flatMap(line=>{const match=line.match(pattern);return match?[match[1].trim()]:[];});
 const supplierLines=lines.filter(line=>/^(?:Lieferant|Verkäufer|Supplier|Seller)\s*:/i.test(line));
 const supplierValues=collect(/^(?:Lieferant|Verkäufer|Supplier|Seller)\s*:\s*([^<>|\r\n]{2,100})$/i);
 const supplier=supplierLines.length===supplierValues.length?unique(supplierValues):'';
 const reference='([A-Za-z0-9][A-Za-z0-9._/\\-]{2,79})';
 const invoiceLines=lines.filter(line=>/^(?:Rechnungsnummer|Rechnungs-Nr\.?|Invoice Number|Invoice No\.?)\s*[:#]/i.test(line));
 const invoiceValues=collect(new RegExp('^(?:Rechnungsnummer|Rechnungs-Nr\\.?|Invoice Number|Invoice No\\.?)\\s*[:#]\\s*'+reference+'$','i'));
 const invoiceReference=invoiceLines.length===invoiceValues.length?unique(invoiceValues):'';
 const orderLines=lines.filter(line=>/^(?:Bestellnummer|Bestell-Nr\.?|Order Number|Order No\.?)\s*[:#]/i.test(line));
 const orderValues=collect(new RegExp('^(?:Bestellnummer|Bestell-Nr\\.?|Order Number|Order No\\.?)\\s*[:#]\\s*'+reference+'$','i'));
 const orderReference=orderLines.length===orderValues.length?unique(orderValues):'';
 const dateLines=lines.filter(line=>/^(?:Rechnungsdatum|Belegdatum|Invoice Date)\s*:/i.test(line));
 const rawDates=collect(/^(?:Rechnungsdatum|Belegdatum|Invoice Date)\s*:\s*(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})$/i);
 const normalizedDates=rawDates.map(value=>{const m=value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);const iso=m?`${m[3]}-${m[2]}-${m[1]}`:value;return !Number.isNaN(Date.parse(iso))&&new Date(iso).toISOString().slice(0,10)===iso?iso:'';});
 const documentDate=dateLines.length===rawDates.length&&normalizedDates.every(Boolean)?unique(normalizedDates):'';
 const totalLines=lines.filter(line=>/^(?:Gesamtbetrag|Rechnungsbetrag|Zahlbetrag|Amount Due|Total Due)\s*:/i.test(line));
 const totals=collect(/^(?:Gesamtbetrag|Rechnungsbetrag|Zahlbetrag|Amount Due|Total Due)\s*:\s*((?:EUR|USD|GBP|CNY|CHF|€)\s*\d{1,9}(?:[.,]\d{2})|\d{1,9}(?:[.,]\d{2})\s*(?:EUR|USD|GBP|CNY|CHF|€))$/i);
 const pairs=totals.map(value=>{const number=value.match(/\d{1,9}[.,]\d{2}/),code=value.match(/EUR|USD|GBP|CNY|CHF|€/i);return number&&code?`${code[0]==='€'?'EUR':code[0].toUpperCase()}|${number[0].replace(',','.')}`:'';});
 const pair=totalLines.length===totals.length?unique(pairs):'';
 const [currency='',amount='']=pair?pair.split('|'):[];
 const warnings=['Angaben stammen aus lesbarem PDF-Text und sind anhand des Originalbelegs zu prüfen; keine OCR und keine steuerliche Validierung.'];
 if(dateLines.length&&!documentDate)warnings.push('Belegdatum ist ungültig oder mehrdeutig.');
 if(totalLines.length&&!amount)warnings.push('Zahlbetrag ist nicht eindeutig oder die Währung wird nicht unterstützt.');
 return {supplier,invoiceReference,orderReference,documentDate,amount,currency,warnings};
}
