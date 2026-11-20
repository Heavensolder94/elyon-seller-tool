import test from 'node:test';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { renderInvoiceCorrectionPdf } from '../lib/invoice-original-pdf.js';

test('correction PDF references the original and does not negate other correction documents',async()=>{
 const correction={documentNumber:'B-100',originalInvoiceNumber:'R-100',issuedAt:'2026-11-20T12:00:00Z',seller:{name:'Firma Beispiel',addressLine1:'Testweg 1',postalCode:'12345',city:'Stadt',country:'DE',taxId:'TEST'},buyer:{name:'Max Beispiel',addressLine1:'Musterweg 2',postalCode:'54321',city:'Stadt',country:'DE'},fieldLabel:'Empfängerort',oldValue:'Stadt',newValue:'Neustadt',reason:'Adresse korrigieren'};
 const pdf=await renderInvoiceCorrectionPdf(correction);
 const loading=getDocument({data:new Uint8Array(Buffer.from(pdf.base64,'base64')),isEvalSupported:false,useSystemFonts:false});const doc=await loading.promise;
 try{const page=await doc.getPage(1);const content=await page.getTextContent();const text=content.items.map(item=>item.str||'').join(' ');
  assert.match(text,/Zu Rechnung: R-100/);assert.match(text,/Berichtigungsbeleg: B-100/);assert.match(text,/Weitere bestehende Berichtigungen sind gesondert zu beachten/);assert.doesNotMatch(text,/Alle übrigen Angaben bleiben unverändert/);
 }finally{await doc.destroy();}
});
