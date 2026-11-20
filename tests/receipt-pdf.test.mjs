import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {extractStructuredReceiptFromPdf} from '../lib/receipt-pdf.js';
const xml=`<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:a="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:b="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><b:ID>PDF-42</b:ID><b:DocumentCurrencyCode>EUR</b:DocumentCurrencyCode><a:LegalMonetaryTotal><b:PayableAmount currencyID="EUR">10.00</b:PayableAmount></a:LegalMonetaryTotal></Invoice>`;
async function pdfWith(names){const pdf=await PDFDocument.create();pdf.addPage();for(const name of names)await pdf.attach(Buffer.from(xml),name,{mimeType:'application/xml'});return new Uint8Array(await pdf.save());}
test('extracts a single structured attachment without changing original bytes',async()=>{const bytes=await pdfWith(['factur-x.xml']);const before=Buffer.from(bytes);const p=await extractStructuredReceiptFromPdf(bytes);assert.equal(p.invoiceReference,'PDF-42');assert.equal(p.amount,'10.00');assert.deepEqual(Buffer.from(bytes),before);});
test('missing or ambiguous XML and invalid PDFs fail closed',async()=>{await assert.rejects(extractStructuredReceiptFromPdf(await pdfWith([])));await assert.rejects(extractStructuredReceiptFromPdf(await pdfWith(['first.xml','second.xml'])));await assert.rejects(extractStructuredReceiptFromPdf(Buffer.from('not a pdf')));});
