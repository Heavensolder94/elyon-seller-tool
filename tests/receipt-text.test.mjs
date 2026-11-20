import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { extractReceiptTextSuggestions } from '../lib/receipt-text.js';
import { recognizePdfIsolated } from '../lib/receipt-pdf-isolated.js';
import { reconcileReceiptMoneySuggestion, recognizeImageText } from '../seller-finance.js';

test('device text detection is optional, orders recognized text and closes bounded image resources',async()=>{
 let closed=0;const bitmap={width:100,height:100,close(){closed++}};
 class Detector {async detect(){return [{rawValue:'Gesamtbetrag: 12,50 EUR',boundingBox:{y:40,x:0}},{rawValue:'Rechnungsnummer: R-123',boundingBox:{y:10,x:0}}]}}
 assert.equal(await recognizeImageText({type:'image/jpeg'},Detector,async()=>bitmap),'Rechnungsnummer: R-123\nGesamtbetrag: 12,50 EUR');assert.equal(closed,1);
 assert.equal(await recognizeImageText({type:'application/pdf'},Detector,async()=>bitmap),'');
 assert.equal(await recognizeImageText({type:'image/jpeg'},null,async()=>bitmap),'');
 await assert.rejects(recognizeImageText({type:'image/png'},Detector,async()=>({...bitmap,width:200000})));assert.equal(closed,2);
});

test('extracts only explicitly labelled PDF-text fields and never infers payment',()=>{
 const p=extractReceiptTextSuggestions('Lieferant: Beispiel GmbH\nRechnungsnummer: R-123\nBestellnummer: B-456\nRechnungsdatum: 20.11.2026\nGesamtbetrag: 12,50 EUR');
 assert.equal(p.supplier,'Beispiel GmbH');assert.equal(p.invoiceReference,'R-123');assert.equal(p.orderReference,'B-456');assert.equal(p.documentDate,'2026-11-20');assert.equal(p.amount,'12.50');assert.equal(p.currency,'EUR');assert.equal('paymentDate' in p,false);
});
test('leaves conflicting, incomplete, negative or unsupported values empty',()=>{
 const p=extractReceiptTextSuggestions('Rechnungsnummer: R-123\nRechnungsnummer: R-456\nRechnungsdatum: 2026-02-30\nGesamtbetrag: 12,50 EUR\nGesamtbetrag: USD 13.00');
 assert.equal(p.invoiceReference,'');assert.equal(p.documentDate,'');assert.equal(p.amount,'');assert.ok(p.warnings.length>=3);
 for(const line of ['Zahlbetrag: -12,50 EUR','Gesamtbetrag: 1.234,50 EUR','Total Due: $14.00','Total Due: 14 JPY'])assert.equal(extractReceiptTextSuggestions(line).amount,'');
 assert.equal(extractReceiptTextSuggestions('Lieferant: Firma A\nVerkäufer: Firma B').supplier,'');
 assert.equal(extractReceiptTextSuggestions('Temu Amazon').supplier,'');
 assert.throws(()=>extractReceiptTextSuggestions('x'.repeat(200001)));
});
test('explicit currency codes remain unchanged, while ambiguous or conflicting totals stay empty',()=>{
 for(const [line,currency,amount] of [['Total Due: USD 14.00','USD','14.00'],['Zahlbetrag: 19,20 CHF','CHF','19.20'],['Amount Due: CNY 7.90','CNY','7.90'],['Gesamtbetrag: 11.30 GBP','GBP','11.30'],['Gesamtbetrag: € 1,50','EUR','1.50']]){
  const p=extractReceiptTextSuggestions(line);assert.equal(p.currency,currency);assert.equal(p.amount,amount);assert.equal('paymentDate' in p,false);
 }
 const conflict=extractReceiptTextSuggestions('Gesamtbetrag: 14.00 EUR\nTotal Due: 14.00 USD');assert.equal(conflict.currency,'');assert.equal(conflict.amount,'');
});
test('extracted amounts never combine with a conflicting existing currency or amount',()=>{
 const proposed={amount:'14.00',currency:'USD'};
 assert.deepEqual(reconcileReceiptMoneySuggestion(proposed,'',''),{amount:'14.00',currency:'USD',conflict:false});
 assert.deepEqual(reconcileReceiptMoneySuggestion(proposed,'','EUR'),{amount:'',currency:'',conflict:true});
 assert.deepEqual(reconcileReceiptMoneySuggestion(proposed,'13.00',''),{amount:'',currency:'',conflict:true});
 assert.deepEqual(reconcileReceiptMoneySuggestion(proposed,'14,00',''),{amount:'',currency:'USD',conflict:false});
 assert.deepEqual(reconcileReceiptMoneySuggestion(proposed,'','usd'),{amount:'14.00',currency:'',conflict:false});
 assert.deepEqual(reconcileReceiptMoneySuggestion({amount:'',currency:'USD'},'',''),{amount:'',currency:'',conflict:false});
});
test('isolated processor extracts selectable text from a normal PDF without changing its bytes',async()=>{
 const pdf=await PDFDocument.create();const page=pdf.addPage();const font=await pdf.embedFont(StandardFonts.Helvetica);
 page.drawText('Rechnungsnummer: R-123',{x:50,y:700,size:12,font});page.drawText('Gesamtbetrag: 12,50 EUR',{x:50,y:675,size:12,font});
 const bytes=Buffer.from(await pdf.save());const base64=bytes.toString('base64');const p=await recognizePdfIsolated(base64);
 assert.equal(p.invoiceReference,'R-123');assert.equal(p.amount,'12.50');assert.equal(p.currency,'EUR');assert.equal(bytes.toString('base64'),base64);
});
test('a selectable-text PDF preserves an explicit foreign currency without conversion',async()=>{
 const pdf=await PDFDocument.create(),page=pdf.addPage(),font=await pdf.embedFont(StandardFonts.Helvetica);
 page.drawText('Total Due: USD 14.00',{x:50,y:700,size:12,font});const result=await recognizePdfIsolated(Buffer.from(await pdf.save()).toString('base64'));
 assert.equal(result.currency,'USD');assert.equal(result.amount,'14.00');
});
test('PDFs with no selectable text or too many pages require manual review',async()=>{
 const empty=await PDFDocument.create();empty.addPage();await assert.rejects(recognizePdfIsolated(Buffer.from(await empty.save()).toString('base64')));
 const many=await PDFDocument.create();for(let i=0;i<11;i++)many.addPage();await assert.rejects(recognizePdfIsolated(Buffer.from(await many.save()).toString('base64')));
});
