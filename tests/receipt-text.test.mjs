import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractReceiptTextSuggestions } from '../lib/receipt-text.js';
import { recognizePdfIsolated } from '../lib/receipt-pdf-isolated.js';

test('extracts only explicitly labelled PDF-text fields and never infers payment',()=>{
 const p=extractReceiptTextSuggestions('Lieferant: Beispiel GmbH\nRechnungsnummer: R-123\nBestellnummer: B-456\nRechnungsdatum: 20.11.2026\nGesamtbetrag: 12,50 EUR');
 assert.equal(p.supplier,'Beispiel GmbH');assert.equal(p.invoiceReference,'R-123');assert.equal(p.orderReference,'B-456');assert.equal(p.documentDate,'2026-11-20');assert.equal(p.amount,'12.50');assert.equal(p.currency,'EUR');assert.equal('paymentDate' in p,false);
});
test('leaves conflicting, incomplete, negative or unsupported values empty',()=>{
 const p=extractReceiptTextSuggestions('Rechnungsnummer: R-123\nRechnungsnummer: R-456\nRechnungsdatum: 2026-02-30\nGesamtbetrag: 12,50 EUR\nGesamtbetrag: USD 13.00');
 assert.equal(p.invoiceReference,'');assert.equal(p.documentDate,'');assert.equal(p.amount,'');assert.ok(p.warnings.length>=3);
 for(const line of ['Zahlbetrag: -12,50 EUR','Gesamtbetrag: 1.234,50 EUR','Total Due: 14.00 USD'])assert.equal(extractReceiptTextSuggestions(line).amount,'');
 assert.equal(extractReceiptTextSuggestions('Lieferant: Firma A\nVerkäufer: Firma B').supplier,'');
 assert.equal(extractReceiptTextSuggestions('Temu Amazon').supplier,'');
 assert.throws(()=>extractReceiptTextSuggestions('x'.repeat(200001)));
});
test('isolated processor extracts selectable text from a normal PDF without changing its bytes',async()=>{
 const pdf=await PDFDocument.create();const page=pdf.addPage();const font=await pdf.embedFont(StandardFonts.Helvetica);
 page.drawText('Rechnungsnummer: R-123',{x:50,y:700,size:12,font});page.drawText('Gesamtbetrag: 12,50 EUR',{x:50,y:675,size:12,font});
 const bytes=Buffer.from(await pdf.save());const base64=bytes.toString('base64');const p=await recognizePdfIsolated(base64);
 assert.equal(p.invoiceReference,'R-123');assert.equal(p.amount,'12.50');assert.equal(p.currency,'EUR');assert.equal(bytes.toString('base64'),base64);
});
test('PDFs with no selectable text or too many pages require manual review',async()=>{
 const empty=await PDFDocument.create();empty.addPage();await assert.rejects(recognizePdfIsolated(Buffer.from(await empty.save()).toString('base64')));
 const many=await PDFDocument.create();for(let i=0;i<11;i++)many.addPage();await assert.rejects(recognizePdfIsolated(Buffer.from(await many.save()).toString('base64')));
});
