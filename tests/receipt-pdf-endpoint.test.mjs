import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../internal/finance/index.js';
import { PDFDocument } from 'pdf-lib';
test('PDF receipt recognition rejects invalid PDF in isolated worker',async()=>{
 const old=process.env.ELYON_SELLER_ACCESS_TOKEN;process.env.ELYON_SELLER_ACCESS_TOKEN='synthetic-test';
 const req={method:'POST',query:{action:'recognize-pdf-receipt'},headers:{host:'localhost','x-elyon-seller-token':'synthetic-test'},body:{base64:'JVBERi0='}};
 const res={setHeader(){return this},status(code){this.code=code;return this},json(body){this.body=body;return this}};
 try{await handler(req,res);assert.equal(res.code,422);assert.equal(res.body.error,'receipt_pdf_unavailable');}finally{old===undefined?delete process.env.ELYON_SELLER_ACCESS_TOKEN:process.env.ELYON_SELLER_ACCESS_TOKEN=old}
});

test('authenticated PDF endpoint returns suggestions only for bounded structured input',async()=>{
 const old=process.env.ELYON_SELLER_ACCESS_TOKEN;process.env.ELYON_SELLER_ACCESS_TOKEN='synthetic-test';
 const pdf=await PDFDocument.create();pdf.addPage();await pdf.attach(Buffer.from('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:b="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><b:ID>TEST-123</b:ID></Invoice>'),'invoice.xml');
 const req={method:'POST',query:{action:'recognize-pdf-receipt'},headers:{host:'localhost','x-elyon-seller-token':'synthetic-test'},body:{base64:Buffer.from(await pdf.save()).toString('base64')}};
 const res={setHeader(){return this},status(code){this.code=code;return this},json(body){this.body=body;return this}};
 try{await handler(req,res);assert.equal(res.code,200);assert.equal(res.body.proposal.invoiceReference,'TEST-123');assert.equal('paymentDate' in res.body.proposal,false);}finally{old===undefined?delete process.env.ELYON_SELLER_ACCESS_TOKEN:process.env.ELYON_SELLER_ACCESS_TOKEN=old}
});
