import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createHash } from 'node:crypto';

// Render only verified, complete invoice snapshots. Unsupported glyphs fail
// closed: replacing a legal name or item description would change the invoice.
export async function renderInvoiceOriginalPdf(invoice) {
  if (!invoice?.invoiceNumber || invoice.taxMode !== 'small_business' || !invoice.seller?.taxId || !invoice.buyer?.name || !Array.isArray(invoice.lineItems) || !invoice.lineItems.length) throw new Error('Unvollständiger Rechnungssnapshot.');
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(`Rechnung ${invoice.invoiceNumber}`);
  pdf.setCreator('ELYON SellerTool');
  let page = pdf.addPage([595.28, 841.89]);
  let y = 800;
  const line = (value, { strong = false, size = 10 } = {}) => {
    const font = strong ? bold : regular;
    for (const paragraph of String(value ?? '').split(/\r?\n/)) {
      let current = '';
      for (const word of paragraph.split(/\s+/)) {
        const candidate = current ? current + ' ' + word : word;
        if (font.widthOfTextAtSize(candidate, size) > 500 && current) { draw(current); current = word; }
        else current = candidate;
        if (font.widthOfTextAtSize(current, size) > 500) throw new Error('Rechnungsangabe zu lang für die PDF-Darstellung.');
      }
      draw(current);
    }
    function draw(value) {
      if (y < 48) { page = pdf.addPage([595.28, 841.89]); y = 800; }
      page.drawText(value, { x: 48, y, font, size, color: rgb(0.08, 0.12, 0.17) }); y -= size + 6;
    }
  };
  const amount = value => `${Number(value).toFixed(2).replace('.', ',')} EUR`;
  const address = person => [person.name, person.addressLine1, person.addressLine2, [person.postalCode, person.city].filter(Boolean).join(' '), person.country === 'DE' ? 'Deutschland' : person.country].filter(Boolean);
  const cancellation = invoice.documentKind === 'cancellation';
  line(cancellation ? 'Stornorechnung' : 'Rechnung', { strong: true, size: 18 });
  if (cancellation) { line(`Storno zu Rechnung: ${invoice.originalInvoiceNumber}`); line(`Stornogrund: ${invoice.cancellationReason}`); }
  if (invoice.documentKind === 'replacement') { line(`Ersatz für Rechnung: ${invoice.originalInvoiceNumber}`); line(`Stornorechnung: ${invoice.cancellationInvoiceNumber}`); }
  line(`Rechnungsnummer: ${invoice.invoiceNumber}`);
  line(`Ausstellungsdatum: ${new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin' }).format(new Date(invoice.issuedAt))}`);
  line('Verkäufer', { strong: true }); address(invoice.seller).forEach(value => line(value));
  line(`Steuerliche Identifikation: ${invoice.seller.taxId}`);
  line('Rechnungsempfänger', { strong: true }); address(invoice.buyer).forEach(value => line(value));
  line(`eBay-Bestellung: ${invoice.orderId}`);
  line('Positionen', { strong: true });
  for (const item of invoice.lineItems) line(`${item.title} | Menge: ${item.quantity} | Betrag: ${amount(item.total)}`);
  if (invoice.shipping) line(`Versand: ${amount(invoice.shipping)}`);
  if (invoice.discount) line(`Rabatt: ${cancellation ? '+' : '-'}${amount(Math.abs(invoice.discount))}`);
  line(`Gesamtbetrag: ${amount(invoice.total)}`, { strong: true, size: 13 });
  line(invoice.note);
  const bytes = Buffer.from(await pdf.save());
  return { base64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
}

export function verifyInvoiceOriginalPdf(record) {
  if (!record?.pdfBase64 || !/^[a-f0-9]{64}$/.test(String(record.pdfSha256 || ''))) return false;
  const bytes = Buffer.from(record.pdfBase64, 'base64');
  return bytes.subarray(0, 5).toString() === '%PDF-' && createHash('sha256').update(bytes).digest('hex') === record.pdfSha256;
}

// A supplementary correction is its own document and does not reproduce a new
// invoice or change monetary amounts. Each value is supplied by the user.
export async function renderInvoiceCorrectionPdf(correction) {
  if (!correction?.documentNumber || !correction?.originalInvoiceNumber || !correction?.seller?.name || !correction?.buyer?.name || !correction?.fieldLabel || !correction?.newValue) throw new Error('Unvollständige Rechnungsberichtigung.');
  const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const page=pdf.addPage([595.28,841.89]);let y=800;
  function line(value,strong=false) {
    const face=strong?bold:font;let row='';
    for(const word of String(value).split(/\s+/)){const candidate=row?row+' '+word:word;if(face.widthOfTextAtSize(candidate,10)>490&&row){page.drawText(row,{x:48,y,font:face,size:10});y-=18;row=word;}else row=candidate;if(face.widthOfTextAtSize(row,10)>490)throw new Error('Angabe zu lang.');}
    if(y<55)throw new Error('Berichtigung zu lang.');page.drawText(row,{x:48,y,font:face,size:10});y-=18;
  }
  pdf.setTitle('Rechnungsberichtigung '+correction.originalInvoiceNumber);
  line('Rechnungsberichtigung',true);line('Berichtigungsbeleg: '+correction.documentNumber);line('Zu Rechnung: '+correction.originalInvoiceNumber);
  line('Ausgestellt am: '+new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin'}).format(new Date(correction.issuedAt)));
  line('Rechnungsaussteller: '+correction.seller.name);
  for(const value of [correction.seller.addressLine1,[correction.seller.postalCode,correction.seller.city].filter(Boolean).join(' '),correction.seller.country,correction.seller.taxId ? 'Steuerliche Identifikation: '+correction.seller.taxId : ''])if(value)line(value);
  line('Rechnungsempfänger: '+correction.buyer.name);
  for(const value of [correction.buyer.addressLine1,correction.buyer.addressLine2,[correction.buyer.postalCode,correction.buyer.city].filter(Boolean).join(' '),correction.buyer.country])if(value)line(value);
  line('Berichtigte Angabe: '+correction.fieldLabel,true);
  if(correction.field==='singleLineAmount')line('Betroffene Einzelposition: '+correction.itemTitle);
  line('Bisher: '+correction.oldValue+(correction.field==='singleLineAmount'?' EUR':''));line('Berichtigt: '+correction.newValue+(correction.field==='singleLineAmount'?' EUR':''));
  line('Grund: '+correction.reason);line('Dieses Dokument ergänzt die oben genannte Rechnung. Alle übrigen Angaben bleiben unverändert.');
  const bytes=Buffer.from(await pdf.save());return {base64:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length};
}
