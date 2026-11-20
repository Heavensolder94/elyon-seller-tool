import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { renderInvoiceOriginalPdf, verifyInvoiceOriginalPdf } from '../lib/invoice-original-pdf.js';
const invoice = { invoiceNumber:'ELYON-2026-00001', taxMode:'small_business', issuedAt:'2026-11-20T12:00:00Z', orderId:'123-456', seller:{name:'Muster GmbH',addressLine1:'Straße 1',postalCode:'12345',city:'Lemgo',country:'DE',taxId:'TEST'},buyer:{name:'Erika Muster',addressLine1:'Weg 3',postalCode:'54321',city:'Berlin',country:'DE'},lineItems:[{title:'Beispiel',quantity:2,total:20}],shipping:2,discount:0,total:22,note:'Steuerbefreiung für Kleinunternehmer gemäß § 19 UStG.' };
test('PDF bytes can be reloaded and integrity validation rejects changes', async () => {
 const result = await renderInvoiceOriginalPdf(invoice);
 const bytes=Buffer.from(result.base64,'base64');
 assert.equal((await PDFDocument.load(bytes)).getPageCount(),1);
 assert.equal(verifyInvoiceOriginalPdf({pdfBase64:result.base64,pdfSha256:result.sha256}),true);
 bytes[bytes.length-1]^=1;
 assert.equal(verifyInvoiceOriginalPdf({pdfBase64:bytes.toString('base64'),pdfSha256:result.sha256}),false);
});
test('unsupported glyphs never silently change customer names', async () => {
 await assert.rejects(renderInvoiceOriginalPdf({...invoice,buyer:{...invoice.buyer,name:'例子'}}));
});
